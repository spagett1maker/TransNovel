# TransNovel 프로덕션 분석 보고서

> 분석일: 2026-03-08
> 대상: 설정집 생성 + 번역 파이프라인 + 인프라
> 기준: 100+ 동시 사용자 가용성/안정성

---

## 종합 점수: 6.5/10

| 영역 | 점수 | 상태 |
|------|------|------|
| 커넥션 풀링 | 9/10 | Ready |
| Lambda/SQS 아키텍처 | 9/10 | Ready |
| 보안 헤더 & 인증 | 8/10 | Ready |
| API Rate Limiting | 8/10 | Ready |
| API 페이지네이션 | 7/10 | 인덱스 보강 필요 |
| 메모리 관리 | 6/10 | 모니터링 필요 |
| 쿼리 최적화 | 5/10 | 리팩터링 필요 |
| DB 인덱스 | 4/10 | 심각한 갭 |
| 에러 복구 | 3/10 | 재시도 메커니즘 부재 |

---

## CRITICAL (배포 차단 — 5건)

### C1. SSE Stream 작업 삭제 Race Condition
- **파일**: `src/lib/translation-manager.ts:504`
- **문제**: 사용자가 모달 닫으면서 DELETE 호출 → Lambda가 completedChapters 업데이트 중 레코드 삭제 → 데이터 유실
- **수정**: Soft-delete 또는 optimistic locking 도입

### C2. RateLimiter 큐 무한 증가 (OOM)
- **파일**: `src/lib/gemini/resilience.ts:129`
- **문제**: pendingQueue에 크기 제한 없음 → Gemini API 다운 시 큐가 10K+까지 증가 → Lambda OOM
- **수정**: maxQueueSize 추가, 초과 시 429 반환

### C3. 설정집 generate 엔드포인트 maxDuration 미설정
- **파일**: `src/app/api/works/[id]/setting-bible/generate/route.ts`
- **문제**: maxDuration 없음 → Vercel 기본 30초 타임아웃 → SQS 큐잉 중 타임아웃 시 일부만 큐잉되고 job FAILED
- **수정**: `export const maxDuration = 300;` 추가

### C4. 설정집 배치 레벨 재시도 메커니즘 부재
- **파일**: Lambda bible-worker
- **문제**: 배치 실패 → SQS 5회 재시도 → DLQ → job이 IN_PROGRESS 영구 고착, 사용자 재시도/취소 UI 없음
- **수정**: DLQ 처리 Lambda + 재시도 API 엔드포인트 구현

### C5. DB 인덱스 심각한 누락
- **파일**: `prisma/schema.prisma`
- **문제**:
  - Chapter: `workId + status + number` 복합 인덱스 없음
  - Character: `bibleId + isConfirmed` 인덱스 없음
  - SettingTerm: `bibleId + category` 인덱스 없음
- **수정**: 복합 인덱스 추가

---

## HIGH (높은 영향 — 7건)

### H1. 번역 재시도 폭발
- **파일**: `src/lib/gemini/translate.ts:611` + `:208`
- **문제**: 이중 재시도 → 청크당 최대 45회 API 호출. 30청크 챕터면 1,350회 호출로 전체 키 소진 가능
- **수정**: 글로벌 재시도 예산 또는 재시도 레이어 통합

### H2. Lambda Prisma 커넥션 타임아웃 미설정
- **파일**: `infrastructure/lambda/translation-worker/src/index.ts:25-38`
- **문제**: RDS Proxy idle timeout(5분) 이후 커넥션 끊김 → 다음 Lambda 호출 시 connection closed 에러
- **수정**: connection_timeout 및 idle refresh 로직 추가

### H3. SSE 클라이언트 연결 해제 시 Lambda 작업 미중단
- **파일**: `src/app/api/translation/stream/route.ts:351`
- **문제**: 브라우저 닫아도 Lambda는 계속 번역 → 재접속 시 이중 작업 경쟁
- **수정**: CANCEL 상태 구현, Lambda에서 상태 폴링

### H4. 설정집 완료 Race Condition
- **파일**: Lambda bible-worker (completion check)
- **문제**: 여러 Lambda가 동시에 currentBatchIndex >= totalBatches 감지 → 중복 COMPLETED 전환
- **수정**: atomic updateMany with status 조건

### H5. Work 상세 API N+1 패턴
- **파일**: `src/app/api/works/[id]/route.ts:27`
- **문제**: 챕터 1000개 전부 로드 → 요청당 ~1MB → 100명 시 100MB 스파이크
- **수정**: 챕터 필드 select 최소화, status별 필터링

### H6. 대형 챕터 Lambda 타임아웃 초과
- **파일**: `src/lib/gemini/translate.ts:312`
- **문제**: 19만자 챕터 → 24청크 × 최대 540초 = 3.6시간 → Lambda 15분 타임아웃 → TRANSLATING 영구 고착
- **수정**: translateChapter에 withTimeout 래핑

### H7. Circuit Breaker 상태가 SSE에 전파 안 됨
- **파일**: `src/lib/gemini/resilience.ts` + `stream/route.ts`
- **문제**: Gemini 장애 시 사용자가 5분간 "진행 중" 화면만 봄
- **수정**: circuit breaker 상태를 SSE 폴링에서 체크

---

## MEDIUM (중간 영향 — 8건)

### M1. 번역 API 요청 크기 제한 없음
- **파일**: `src/app/api/translation/route.ts:5-14`
- **문제**: 10,000 챕터까지 허용 → DB + SQS 폭주
- **수정**: max 100 챕터로 제한

### M2. 완료/실패 작업 자동 정리 없음
- **파일**: `src/lib/translation-manager.ts:679`
- **문제**: cleanupOldJobs 정의만 되고 호출 안 됨 → activeTranslationJob 테이블 무한 증가
- **수정**: cron 또는 startup 시 호출

### M3. SSE 폴링 DB 부하
- **파일**: `src/app/api/translation/stream/route.ts:13`
- **문제**: 3초마다 DB 조회, 100 작업 시 33 QPS
- **수정**: 1초 TTL 캐시 도입

### M4. 설정집 확인 시 120초 트랜잭션
- **파일**: `src/app/api/works/[id]/setting-bible/confirm/route.ts:56`
- **문제**: 용어집 동기화 중 테이블 잠금 → 다른 사용자 쿼리 대기
- **수정**: UPSERT 또는 비동기 처리

### M5. 대량 findMany (캐릭터/용어 5000+건)
- **파일**: `src/lib/bible-batch-processor.ts:67`
- **문제**: 일괄 메모리 로드 → 대형 작품에서 메모리 스파이크
- **수정**: 100건 단위 청킹

### M6. 다운로드 시 챕터 순차 조회
- **파일**: `src/app/api/works/[id]/download/route.ts:164`
- **문제**: N+1 쿼리 패턴 → 200챕터 시 200회 DB 조회
- **수정**: findMany + in 쿼리로 일괄 조회

### M7. JSON 컬럼 GIN 인덱스 없음
- **파일**: `prisma/schema.prisma`
- **문제**: chaptersProgress, batchPlan 검색 시 풀 스캔
- **수정**: PostgreSQL GIN 인덱스 추가

### M8. 토큰 사용량/비용 추적 없음
- **문제**: 작품당 토큰 소비, 월간 비용 가시성 제로
- **수정**: 배치별 토큰 로깅 + 비용 대시보드

---

## 아키텍처 강점

- SQS Fan-Out 병렬 처리 (번역/설정집 모두 배치 단위 독립 처리)
- RDS Proxy: 450 사용 가능 커넥션, Lambda 5개 제한
- Atomic 진행 추적: `{ increment: 1 }` 패턴
- API 키 순환: 배치별 키 로테이션
- 보안: middleware 인증, SSRF 차단, CSP 헤더

---

## 수정 우선순위

### Phase 1: 즉시 수정 (배포 전) — DONE
- [x] C5: DB 인덱스 추가 (7개 복합 인덱스)
- [x] C3: generate/route.ts maxDuration 추가
- [x] C2: RateLimiter 큐 크기 제한 (MAX_QUEUE_SIZE=1000)
- [x] M1: 번역 API 챕터 수 제한 (10000→200)
- [x] H2: Lambda Prisma 커넥션 타임아웃 (4분 유휴 리프레시 + connect_timeout=30)

### Phase 2: Sprint 1 — DONE
- [x] C1: Job soft-delete 도입 (CANCELLED 상태 + 히스토리 저장)
- [x] H1: 이중 재시도 레이어 통합 (45회→12회/청크)
- [x] H7: SSE에 circuit breaker 상태 반영 (OPEN 시 즉시 알림)
- [x] H6: 대형 챕터 withTimeout 래핑 (12분 타임아웃)
- [x] C4: 설정집 배치 고착 작업 자동 실패 처리 (30분 타임아웃)

### Phase 3: Sprint 2 — DONE
- [x] M2: 작업 자동 정리 (lazy cleanup 패턴 — 5% 확률 자동 트리거)
- [x] M3: SSE 폴링 캐시 (1초 TTL 인메모리 캐시)
- [x] H4: 설정집 완료 atomic 처리 (updateMany + status 조건)
- [x] M6: 다운로드 N+1 최적화 (findMany 일괄 조회)
- [x] H5: Work 상세 API creators select 최적화
- [ ] M8: 토큰 사용량/비용 로깅 (추후)

### Phase 4: 64화 번역 실패 대응 — DONE
- [x] CONTENT_BLOCKED fallback: 안전 우회 프롬프트로 자동 재시도 (Lambda + Vercel)
- [x] CONTENT_BLOCKED 같은 모델 재시도 스킵 (API 호출 낭비 방지)
- [x] 에러 path에서 checkAndCompleteJob 호출 (job IN_PROGRESS 고착 방지)
- [x] CONTENT_BLOCKED retryable=true (다른 모델 fallback 허용)
