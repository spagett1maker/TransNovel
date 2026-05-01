# TransNovel 인수인계 문서

> 새로 합류한 개발자가 이 문서 하나만 읽고도 코드를 켜고, 무엇이 어디 있는지 알고, 다음 작업을 시작할 수 있도록 정리한 문서다.
> 작성일: 2026-05-01

---

## 0. 30초 요약

- **무엇**: 중국어/일본어/영어 웹소설을 Google Gemini로 자동 번역하고, 윤문가가 협업하여 교정하는 풀스택 웹앱.
- **스택**: Next.js 16 (App Router) + React 19 + Prisma + PostgreSQL + AWS Lambda/SQS + Google Gemini.
- **배포**: 웹은 Vercel, 워커는 AWS Lambda (Terraform 관리). DB는 Supabase 또는 AWS RDS.
- **핵심 흐름**: 작품 등록 → 챕터 업로드 → 설정집(Bible) 생성 → AI 번역 → 윤문 → 다운로드.
- **현재 상태**: 100+ 동시 사용자 대응 프로덕션 하드닝 4라운드 완료. 운영 중 버그 수정 위주.

---

## 1. 첫 5분 — 로컬에서 띄우기

```bash
# 1. 의존성
npm install

# 2. 환경 변수
cp .env.example .env
# .env 채우기:
#   DATABASE_URL, DIRECT_URL (Supabase or RDS)
#   NEXTAUTH_SECRET (openssl rand -base64 32)
#   GEMINI_API_KEY (https://aistudio.google.com)
#   RESEND_API_KEY (선택)
# Gemini 키 풀링을 쓰려면 GEMINI_API_KEY_COUNT + GEMINI_API_KEY_1..N

# 3. DB 마이그레이션
npx prisma migrate dev
npx prisma generate   # Prisma Client 타입 안 생기면 항상 이거 먼저

# 4. 개발 서버
npm run dev
```

테스트 계정 만들기:
```bash
# 회원가입 후 admin 권한 부여
npx tsx scripts/set-admin.ts your@email.com
```

---

## 2. 자주 쓰는 스크립트

| 명령 | 용도 |
|------|------|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 (`prisma generate` + `migrate deploy` 포함) |
| `npm run test` | Vitest 단위 테스트 |
| `npm run test:e2e` | Playwright E2E |
| `npm run lint` | ESLint |
| `npx prisma studio` | DB GUI |
| `npx prisma migrate dev --name X` | 새 마이그레이션 |
| `scripts/check-jobs.mjs` | 활성 번역 작업 상태 확인 |
| `scripts/retry-chapters.ts` | 실패한 챕터 일괄 재시도 |

---

## 3. 디렉토리 지도

```
TransNovel/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (auth)/               # 로그인/회원가입/비번 재설정
│   │   ├── (dashboard)/          # 인증 필요 페이지 (대시보드, 작품, 마켓플레이스, 관리자)
│   │   └── api/                  # 60+ API 엔드포인트
│   │       ├── translation/      # 번역 실행, SSE 스트림
│   │       ├── works/            # 작품 CRUD, 다운로드, 설정집
│   │       └── admin/            # 관리자 전용
│   ├── components/               # UI 컴포넌트 (ui/, editor/, layout/, …)
│   ├── lib/                      # 비즈니스 로직 (★ 가장 중요)
│   │   ├── gemini/               # Gemini 클라이언트 (5개 모듈로 분할)
│   │   ├── translation-manager.ts# 번역 작업 큐/카운터/완료 처리
│   │   ├── bible-generator.ts    # 설정집 AI 생성
│   │   ├── bible-batch-processor.ts # 설정집 배치 처리
│   │   ├── auth.ts               # NextAuth 설정
│   │   ├── permissions.ts        # RBAC
│   │   ├── chapter-parser.ts     # 챕터 자동 분리 (제N화/第N章/Chapter N)
│   │   └── validations/          # Zod 스키마
│   ├── hooks/                    # 커스텀 훅
│   ├── contexts/                 # React Context
│   └── middleware.ts             # 인증 가드 (matcher 확인 필수)
├── prisma/
│   ├── schema.prisma             # 25개 모델, 971줄
│   └── migrations/               # 21개 마이그레이션
├── infrastructure/
│   ├── terraform/                # AWS 인프라 (RDS, Lambda, SQS, VPC)
│   └── lambda/
│       ├── translation-worker/   # 번역 워커 (메인)
│       ├── bible-worker/         # 설정집 생성 워커
│       └── health-checker/       # 60분 주기 stale job 정리
├── e2e/                          # Playwright 시나리오
├── scripts/                      # 운영 스크립트 (DB 점검, 재시도 등)
└── remotion-video/               # 별도 프로젝트 (소개 영상 렌더링)
```

---

## 4. 아키텍처 핵심

### 4.1 데이터 흐름

```
[브라우저]
   ↓ HTTPS
[Next.js (Vercel)] — middleware로 인증 → API Route Handler
   ↓                ↓
[Prisma] ←—→ [PostgreSQL (Supabase or RDS)]
   ↓
[SQS Queue] ──→ [Lambda Worker] ──→ [Gemini API]
                      ↓
                    [DB 업데이트]
   ↑
[SSE Stream] ← 클라이언트가 1초 간격으로 진행률 폴링 (1s TTL 캐시)
```

### 4.2 작품 상태 머신

`REGISTERED → BIBLE_GENERATING → BIBLE_DRAFT → BIBLE_CONFIRMED → TRANSLATING → TRANSLATED → PROOFREADING → COMPLETED`

`PREPARING/ONGOING`은 호환성용 deprecated 값. 코드에서 새로 쓰지 말 것.

### 4.3 챕터 상태 머신

`PENDING → TRANSLATING → TRANSLATED → REVIEWING → EDITED → APPROVED`

### 4.4 번역 작업 (TranslationJob) 상태

`PENDING / IN_PROGRESS / COMPLETED / FAILED / CANCELLED`

- **CANCELLED는 soft-delete**다. 절대 hard delete 하지 말 것 (Lambda가 작업 중간에 레코드 못 찾으면 데이터 유실).
- Lambda 워커는 처리 시작 전에 `CANCELLED/FAILED/COMPLETED` 여부를 체크한다.

### 4.5 Gemini 모델 폴백 순서

1. **Gemini 3 Flash** (현재 기본)
2. Gemini 2.5 Flash
3. Gemini 2.0 Flash
4. Gemini 1.5 Flash

`CONTENT_BLOCKED`(폭력/비속어/성적 콘텐츠 조합)가 발생하면 안전 우회 프롬프트(`buildSafetyBypassPrompt`)로 자동 재시도. 같은 모델로는 재시도하지 않고 다음 모델로 넘어간다.

---

## 5. 주의해야 할 코드 규칙

| 규칙 | 위치 / 이유 |
|------|-------------|
| `@/lib/gemini`는 barrel re-export | `src/lib/gemini/index.ts`. `client/prompt/resilience/translate/retranslate` 5개 모듈로 분할됨 |
| 번역 카운터는 항상 `{ increment: 1 }` + `$transaction` | `translation-manager.ts`. 동시 Lambda 안전성 |
| 번역 작업 삭제는 soft-delete (CANCELLED) | hard delete 시 race condition으로 데이터 유실 |
| `getJobSummary` 1초 TTL 인메모리 캐시 | SSE 폴링 DB 부하 완화. `jobSummaryCache` 변수 |
| `maybeLazyCleanup()` 5% 확률 호출 | 번역 API 진입 시 오래된 작업 정리. cron 대체 |
| 모든 사용자 입력은 Zod 검증 | `src/lib/validations/`에 스키마 모음 |
| HTML 입력은 DOMPurify 살균 | TipTap 에디터 본문, 외부 입력 모두 |
| 챕터 다운로드는 최대 1000건 | OOM 방지 (원래 200 → 1000으로 상향) |
| 번역 한 번에 최대 챕터 수 200 | DB + SQS 폭주 방지 |
| 챕터 1건 최대 12분 타임아웃 | `withTimeout` 래핑. Lambda 15분 한계 대비 |
| 설정집 배치 stale 30분 자동 FAILED | health-checker Lambda가 60분 주기 정리 |
| `console.error` 156개 — 별도 모니터링 없음 | Sentry 등 미연동. 추후 필요 |

---

## 6. 환경 변수

`.env.example`이 단일 진실 원천. 주요 항목:

```bash
DATABASE_URL          # ?connection_limit=25 권장 (웹), Lambda는 5
DIRECT_URL            # 마이그레이션용 직접 연결
NEXTAUTH_SECRET       # 필수
NEXTAUTH_URL          # 배포 시 실제 도메인
GOOGLE_CLIENT_ID/SECRET # 선택 (현재 프론트 버튼 주석 처리됨)
GEMINI_API_KEY        # 필수, 단일 키
GEMINI_API_KEY_COUNT  # 키 풀링 시. N개면 GEMINI_API_KEY_1..N 필요
RESEND_API_KEY        # 이메일 발송
EMAIL_FROM
USE_AWS_SQS           # "true"면 SQS 워커 모드, "false"면 단일 프로세스
SQS_TRANSLATION_QUEUE_URL
SQS_BIBLE_QUEUE_URL
AWS_REGION            # 기본 ap-northeast-2
CRON_SECRET           # Vercel Cron 인증
```

`USE_QSTASH`는 레거시 옵션. AWS SQS로 마이그레이션 완료 상태.

---

## 7. 배포

### 7.1 웹 (Vercel)

- Push to `main` → Vercel 자동 배포
- `npm run build`가 `prisma generate && prisma migrate deploy && next build` 수행
- `vercel.json`에서 일부 라우트 `maxDuration: 300` 지정
- 프로젝트 환경 변수는 Vercel 대시보드에서 관리

### 7.2 Lambda 워커 (Terraform)

```bash
cd infrastructure/terraform
terraform init
terraform plan
terraform apply
```

각 Lambda 빌드:
```bash
cd infrastructure/lambda/translation-worker
npm install
npm run build       # dist/ 생성
zip -r deploy.zip dist node_modules prisma
# terraform apply가 zip을 가져감
```

**중요한 운영 설정 (PRODUCTION_CHECKLIST.md 참고)**:
- Lambda Reserved Concurrency: translation-worker / bible-worker 각 50
- RDS Proxy borrow timeout: 60s
- DATABASE_URL: 웹 `connection_limit=25`, Lambda `connection_limit=5`

---

## 8. DB 핵심 모델

`prisma/schema.prisma` (971줄, 25개 모델). 자주 만지는 것:

| 모델 | 핵심 필드 / 관계 |
|------|------------------|
| `User` | role(AUTHOR/EDITOR/ADMIN), 인증/세션 |
| `Work` | status(WorkStatus), bibleStatus, ownerId, creators[] |
| `Chapter` | workId, number, status, originalContent, translatedContent, editedContent |
| `SettingBible` | workId 1:1, characters/terms/timeline |
| `Character` `SettingTerm` `TimelineEvent` | 설정집 하위 |
| `TranslationJob` | status, totalChapters, completedChapters, chaptersProgress(JSON) |
| `BibleGenerationJob` | 설정집 생성 작업 |
| `ActiveTranslationJob` | startedAt(✱ createdAt 없음), workId 단일 활성 작업 |
| `TrackChange` `ChapterComment` `ChapterSnapshot` | 협업 교정 |
| `Listing` `Application` `Contract` `Review` | 마켓플레이스 |
| `UserPreference` | 에디터 배경색 / 폰트 사이즈 등 |

복합 인덱스 7개 추가됨 (`Chapter[workId,status,number]` 등). 새 쿼리 패턴 추가할 때 인덱스 확인 필수.

---

## 9. 기존 문서 지도

각자 다른 시점/관점이라 중복이 있다. 목적별로 골라 읽기:

| 문서 | 이럴 때 본다 |
|------|-------------|
| `README.md` | 가장 짧은 진입점 |
| `HANDOVER.md` | (이 문서) — 인수인계 시 첫 페이지 |
| `SERVICE_GUIDE.md` (748줄) | 화면별 사용자 플로우. UI/UX 작업 시 |
| `DEV_REPORT.md` (935줄) | 아키텍처 상세, API 명세, DB 스키마 설명 |
| `PROJECT_REPORT.md` (1731줄) | 가장 자세한 프로젝트 보고서 (초기 작성, 일부 outdated) |
| `PRODUCTION_ANALYSIS.md` | 100+ 사용자 대응 분석. 어떤 위험을 어떻게 해결했는지 |
| `PRODUCTION_CHECKLIST.md` | 프로덕션 배포 시 체크리스트 |
| `docs/DEVELOPMENT_REPORT.md` `docs/DEVELOPMENT_REPORT_V2.1.md` | 버전별 변경 내역 |
| `docs/PRD-번역-시스템-개선.md` | 번역 시스템 개선 PRD |
| `docs/ui-consistency-audit.md` | UI 일관성 감사 결과 |
| `docs/cost-report-1.5M.{html,pdf}` | 1.5M 글자 번역 비용 보고서 |
| `PLANNING.md` | 초기 기획 |
| `TransNovel 백엔드 분할 전략 제안서.md` | 모놀리스 분할 검토 자료 |

---

## 10. 알려진 이슈 / 미완료

### 즉시 처리 가능
- Prisma Client 타입 미생성 시 `bible-batch-processor.ts`, `queue.ts`에 타입 에러. `npx prisma generate`로 해결.

### 미완 (Nice-to-have)
- **M8: 토큰 사용량 / 비용 로깅** — 현재 작품당 토큰 소비, 월간 비용 가시성 0. 배치별 토큰 로깅 + 대시보드 필요.
- **DLQ 처리 Lambda** — SQS DLQ 메시지 영구 유실됨. CloudWatch 알람 또는 재처리 Lambda 필요.
- **에러 모니터링 (Sentry 등)** — `console.error` 156곳, Vercel 로그에 묻힘.
- **JWT 토큰 리프레시** — 역할 변경 시 최대 30일까지 반영 안 됨. 짧은 만료 또는 강제 재인증 검토.
- **CASCADE DELETE** — `ChapterComment.authorId`가 RESTRICT라 사용자 삭제 시 실패. CASCADE/SET NULL로 변경 검토.

### 운영 노트
- 64화 같은 폭력+비속어+성적 콘텐츠 조합 챕터: `BLOCK_NONE`이어도 Gemini가 거부할 수 있음. CONTENT_BLOCKED fallback 자동 우회는 구현됨.
- ActiveTranslationJob에 `createdAt` 없음 → `startedAt`을 시간 기준으로 사용.
- health-checker Lambda는 60분 주기. stale job 자동 FAILED 처리.

---

## 11. 디버깅 first-aid

| 증상 | 먼저 볼 곳 |
|------|-----------|
| 번역이 멈춤 | `scripts/check-jobs.mjs` → ActiveTranslationJob의 startedAt, status |
| 챕터 IN_PROGRESS 고착 | health-checker Lambda 로그 / DB의 chaptersProgress JSON |
| Lambda 호출 자체가 안 됨 | CloudWatch Logs `/aws/lambda/transnovel-translation-worker` |
| Gemini 429 폭주 | `src/lib/gemini/resilience.ts`의 RateLimiter, Circuit Breaker |
| DB 커넥션 부족 | RDS Proxy 메트릭, DATABASE_URL의 `connection_limit` |
| 인증 실패 | `middleware.ts` matcher, NextAuth 세션 쿠키 |
| 타입 에러 갑자기 | `npx prisma generate` 먼저 |
| 챕터 파싱 결과 이상 | `src/lib/chapter-parser.ts` (최근 번호 추출 버그 수정함) |

---

## 12. 새로 들어온 사람의 첫 일주일 추천

1. **1일차**: 로컬 띄우고, 회원가입 → 작품 생성 → 챕터 1~3개 업로드 → 설정집 생성 → 번역 → 다운로드 한 사이클 직접 돌려본다.
2. **2일차**: `prisma/schema.prisma`와 `src/lib/translation-manager.ts` 정독.
3. **3일차**: `infrastructure/terraform/`와 Lambda 워커 코드 (`translation-worker/src/index.ts`) 읽기.
4. **4일차**: `PRODUCTION_ANALYSIS.md`의 Critical/High 항목 읽고 어디가 어떻게 해결됐는지 코드 확인.
5. **5일차**: 작은 버그 하나 골라 수정 → PR. 최근 커밋 메시지 톤 따라가면 됨.

---

## 13. 연락처 / 컨벤션

- 커밋 메시지: `feat:` `fix:` `refactor:` `docs:` 접두어 + 한국어 본문이 주된 패턴.
- PR 단위는 보통 단일 기능/버그. 큰 변경은 분할.
- 코드 코멘트는 최소화. 왜 그렇게 짰는지(WHY)만 적기.
