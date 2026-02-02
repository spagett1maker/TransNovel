# TransNovel - 외주 개발 프로젝트 보고서

---

## 1. 프로젝트 개요

### 1.1 프로젝트 정보

| 항목 | 내용 |
|------|------|
| **프로젝트명** | TransNovel (트랜스노벨) |
| **프로젝트 유형** | AI 기반 소설 번역 및 교정 협업 플랫폼 |
| **버전** | 1.0.0 |
| **개발 방식** | 풀스택 웹 애플리케이션 (Single Repository) |
| **총 소스 파일** | 216개 TypeScript/TSX 파일 |
| **총 코드 라인** | 43,935줄 |
| **DB 스키마** | 885줄 (25개 모델) |

### 1.2 프로젝트 목적

TransNovel은 중국어/일본어/영어 웹소설을 한국어로 **AI 자동 번역**하고, 전문 교정자(에디터)가 **협업하여 교정**하는 올인원 플랫폼이다. 작가(원고 소유자)와 에디터를 매칭하는 **마켓플레이스** 기능까지 포함한다.

### 1.3 핵심 가치 제안

1. **Google Gemini AI 기반 자동 번역** - 세팅 바이블(용어/인물/세계관)을 활용한 문맥 인식 번역
2. **실시간 협업 교정 시스템** - TipTap 에디터 기반 트랙 체인지, 인라인 코멘트, 스냅샷 버전 관리
3. **작가-에디터 매칭 마켓플레이스** - 프로젝트 리스팅, 지원, 계약, 리뷰 시스템
4. **체계적 프로젝트 관리** - 작품 상태 머신, 챕터별 진행 추적, 관리자 대시보드

---

## 2. 기술 스택 (Tech Stack)

### 2.1 프론트엔드

| 기술 | 버전 | 용도 |
|------|------|------|
| **Next.js** | 16.1.1 | 풀스택 프레임워크 (App Router) |
| **React** | 19.2.3 | UI 라이브러리 |
| **TypeScript** | 5.x | 타입 안전성 |
| **Tailwind CSS** | 4.x | 유틸리티 CSS 프레임워크 |
| **Radix UI** | 최신 | 접근성 기반 UI 프리미티브 (11개) |
| **Shadcn/ui 패턴** | - | 26개 커스텀 UI 컴포넌트 |
| **TipTap** | 3.17.0 | 리치 텍스트 에디터 (ProseMirror 기반) |
| **React Hook Form** | 7.70.0 | 폼 상태 관리 |
| **Zod** | 4.3.5 | 런타임 스키마 검증 |
| **Zustand** | 5.0.9 | 전역 상태 관리 |
| **Recharts** | 3.6.0 | 차트/그래프 시각화 |
| **Lucide React** | 0.562.0 | 아이콘 라이브러리 |
| **next-themes** | 0.4.6 | 다크/라이트 테마 |
| **Sonner** | 2.0.7 | 토스트 알림 |
| **@tanstack/react-virtual** | 3.13.18 | 가상화 리스트 렌더링 |

### 2.2 백엔드

| 기술 | 버전 | 용도 |
|------|------|------|
| **Next.js API Routes** | 16.1.1 | RESTful API 서버 |
| **Prisma ORM** | 5.22.0 | 데이터베이스 ORM |
| **PostgreSQL** | - | 주 데이터베이스 (Supabase 호스팅) |
| **NextAuth.js** | 4.24.13 | 인증/인가 (JWT 전략) |
| **bcryptjs** | 3.0.3 | 비밀번호 해싱 (12 salt rounds) |

### 2.3 AI 및 외부 서비스

| 기술 | 버전 | 용도 |
|------|------|------|
| **Google Gemini API** | 0.24.1 | AI 번역 엔진 (2.5 Flash 우선) |
| **Resend** | 6.6.0 | 트랜잭셔널 이메일 발송 |

### 2.4 파일 처리

| 기술 | 버전 | 용도 |
|------|------|------|
| **Mammoth** | 1.11.0 | DOCX → HTML 파싱 (업로드) |
| **docx** | 9.5.1 | DOCX 파일 생성 (다운로드) |
| **Archiver** | 7.0.1 | ZIP 압축 (대량 다운로드) |
| **diff-match-patch** | 1.0.5 | 텍스트 diff 비교 |
| **isomorphic-dompurify** | 2.35.0 | HTML 살균 (XSS 방지) |

### 2.5 테스트 도구

| 기술 | 버전 | 용도 |
|------|------|------|
| **Vitest** | 4.0.18 | 단위/통합 테스트 |
| **Playwright** | 1.58.1 | E2E 테스트 |
| **Testing Library** | 16.3.2 | React 컴포넌트 테스트 |

### 2.6 인프라 및 배포

| 항목 | 내용 |
|------|------|
| **호스팅** | Vercel (서버리스) |
| **데이터베이스** | Supabase PostgreSQL |
| **커넥션 풀링** | PgBouncer (포트 6543) |
| **이미지 최적화** | Next.js Image 컴포넌트 |
| **빌드 명령어** | `prisma generate && next build` |

---

## 3. 시스템 아키텍처

### 3.1 전체 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                        클라이언트 (브라우저)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  React   │  │  TipTap  │  │ Zustand  │  │  React Hook  │   │
│  │  19 + UI │  │  Editor  │  │  Store   │  │    Form      │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       └──────────────┴─────────────┴───────────────┘           │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS / SSE
┌───────────────────────────┴─────────────────────────────────────┐
│                     Next.js 16 App Router                        │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Middleware  │  │ Server       │  │    API Route Handlers  │ │
│  │  (Auth +    │  │ Components   │  │    (60개 엔드포인트)      │ │
│  │   RBAC)     │  │ (SSR/SSG)    │  │                        │ │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬────────────┘ │
│         └────────────────┴──────────────────────┘              │
│                          │                                      │
│  ┌───────────────────────┴──────────────────────────────────┐  │
│  │                    비즈니스 로직 레이어                       │  │
│  │  ┌──────────┐ ┌──────────────┐ ┌────────────┐            │  │
│  │  │ NextAuth │ │ Translation  │ │  Setting   │            │  │
│  │  │   JWT    │ │   Manager    │ │   Bible    │            │  │
│  │  │          │ │ (Chunking,   │ │  Generator │            │  │
│  │  │          │ │  Circuit     │ │            │            │  │
│  │  │          │ │  Breaker)    │ │            │            │  │
│  │  └──────────┘ └──────────────┘ └────────────┘            │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                       외부 서비스                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Supabase    │  │  Google      │  │      Resend          │  │
│  │  PostgreSQL  │  │  Gemini API  │  │   (이메일 발송)        │  │
│  │  + PgBouncer │  │  (2.5 Flash) │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 디렉토리 구조

```
TransNovel/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # 인증 페이지 그룹 (로그인, 회원가입)
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   ├── forgot-password/
│   │   │   └── reset-password/
│   │   ├── (dashboard)/              # 보호된 대시보드 페이지 그룹
│   │   │   ├── admin/
│   │   │   ├── contracts/
│   │   │   ├── dashboard/
│   │   │   ├── editors/
│   │   │   ├── marketplace/
│   │   │   ├── my-applications/
│   │   │   ├── my-profile/
│   │   │   ├── settings/
│   │   │   └── works/
│   │   ├── api/                      # API 라우트 (60개 엔드포인트)
│   │   ├── layout.tsx                # 루트 레이아웃
│   │   └── page.tsx                  # 랜딩 페이지
│   ├── components/                   # React 컴포넌트
│   │   ├── ui/                       # 기본 UI 컴포넌트 (26개)
│   │   ├── editor/                   # 리치 텍스트 에디터 컴포넌트
│   │   ├── layout/                   # 레이아웃 (사이드바, 네비게이션)
│   │   ├── providers/                # Context Providers
│   │   ├── admin/                    # 관리자 대시보드 컴포넌트
│   │   ├── chapters/                 # 챕터 관리 컴포넌트
│   │   ├── works/                    # 작품 관리 컴포넌트
│   │   ├── translation/              # 번역 UI 컴포넌트
│   │   ├── setting-bible/            # 세팅 바이블 컴포넌트
│   │   └── download/                 # 다운로드/내보내기 컴포넌트
│   ├── hooks/                        # 커스텀 React Hooks (9개)
│   ├── lib/                          # 핵심 유틸리티 (18개 파일)
│   │   ├── auth.ts                   # NextAuth 설정
│   │   ├── db.ts                     # Prisma 클라이언트
│   │   ├── gemini.ts                 # Gemini API 클라이언트
│   │   ├── translation-manager.ts    # 번역 시스템 핵심
│   │   ├── translation-logger.ts     # 번역 로깅
│   │   ├── bible-generator.ts        # 세팅 바이블 AI 생성
│   │   ├── permissions.ts            # RBAC 권한 시스템
│   │   └── validations/              # Zod 스키마
│   └── types/                        # TypeScript 타입 정의
├── prisma/
│   └── schema.prisma                 # 데이터베이스 스키마 (885줄, 25개 모델)
├── e2e/                              # Playwright E2E 테스트
├── middleware.ts                     # Next.js 미들웨어 (인증 가드)
└── public/                           # 정적 파일
```

---

## 4. 기능 명세서

### 4.1 사용자 인증 시스템

#### 4.1.1 회원가입
- 이메일/비밀번호 기반 가입
- 역할 선택: **작가(AUTHOR)** 또는 **에디터(EDITOR)**
- 이메일 중복 확인 API (`/api/auth/check-email`)
- 이메일 인증 토큰 발송 (Resend)
- 이메일 인증 완료 처리 (`/api/auth/verify-email`)

#### 4.1.2 로그인
- 이메일/비밀번호 로그인 (bcryptjs 12 rounds)
- Google OAuth 소셜 로그인
- JWT 기반 세션 관리 (HttpOnly 쿠키)
- 세션 만료 시 자동 리프레시

#### 4.1.3 비밀번호 복구
- 비밀번호 찾기 이메일 발송 (`/api/auth/forgot-password`)
- 토큰 기반 비밀번호 재설정 (`/api/auth/reset-password`)
- 토큰 만료 시간 관리

#### 4.1.4 역할 기반 접근 제어 (RBAC)

| 권한 | AUTHOR | EDITOR | ADMIN |
|------|--------|--------|-------|
| 작품 생성 | O | X | O |
| 작품 조회 (자기 것) | O | O (배정된 것) | O (전체) |
| 작품 수정 | O (소유자) | X | O |
| 번역 실행 | O | X | O |
| 챕터 교정 | X | O | O |
| 트랙 체인지 승인 | O (EDITED 상태) | X | O |
| 에디터 배정 | O (자기 작품) | X | O |
| 관리자 대시보드 | X | X | O |
| 마켓플레이스 리스팅 | O | X | O |
| 리스팅 지원 | X | O | X |

### 4.2 작품 관리 시스템

#### 4.2.1 작품 생성 및 메타데이터
- 한국어 제목 / 원제
- 출판사, 연령등급 (ALL, 15세, 19세)
- 시놉시스, 장르 (복수 선택)
- 원작 연재 상태 (연재중/완결)
- 원작 언어 (중국어/일본어/영어/기타)
- 플랫폼명 및 URL
- 커버 이미지

#### 4.2.2 작품 상태 머신

```
REGISTERED → BIBLE_GENERATING → BIBLE_DRAFT → BIBLE_CONFIRMED
     ↓                                              ↓
     └──────────────────────────────────→ TRANSLATING
                                              ↓
                                         TRANSLATED
                                              ↓
                                        PROOFREADING
                                              ↓
                                          COMPLETED
```

#### 4.2.3 작품 다운로드
- 개별 챕터 DOCX 다운로드
- 전체 작품 ZIP 다운로드
- 원문/번역문/교정문 선택 가능

### 4.3 챕터 관리 시스템

#### 4.3.1 챕터 CRUD
- 개별 챕터 생성 (제목 + 원문 입력)
- DOCX 파일 파싱을 통한 업로드
- 대량 업로드 (ZIP 또는 복수 파일)
- 챕터 번호 자동 배정 및 수동 조정
- 챕터 삭제

#### 4.3.2 챕터 상태 머신

```
PENDING → TRANSLATING → TRANSLATED → REVIEWING → EDITED → APPROVED
```

#### 4.3.3 챕터 에디터 기능
- **TipTap 리치 텍스트 에디터**
  - 볼드, 이탤릭, 하이라이트
  - 단락 구분
  - 플레이스홀더
- **원문/번역문/교정문 3패널 뷰**
- **트랙 체인지 시스템**
  - INSERT / DELETE / REPLACE 변경 타입
  - PENDING / ACCEPTED / REJECTED 리뷰 상태
  - 변경사항 개별 수락/거부
- **인라인 코멘트**
  - 텍스트 범위 선택 후 코멘트 작성
  - 인용 텍스트 표시
  - 답글 스레드 지원
  - 해결(Resolved) 처리
- **스냅샷 (버전 관리)**
  - 수동 저장 (MANUAL)
  - 자동 저장 (AUTO_SAVE)
  - 상태 변경 시 자동 (STATUS_CHANGE)
  - 재번역 시 자동 (RETRANSLATE)
  - 스냅샷으로 복원 가능
- **활동 로그 (Activity Log)**
  - 코멘트 추가, 편집, 상태 변경 등 모든 활동 기록
  - 타임라인 형태 표시

### 4.4 AI 번역 시스템

#### 4.4.1 번역 엔진 구조

```
┌─────────────────────────────────────────────────────┐
│                 Translation Manager                  │
│  ┌───────────┐  ┌────────────┐  ┌────────────────┐ │
│  │  Chunking  │  │  Circuit   │  │   Rate Limit   │ │
│  │  System    │  │  Breaker   │  │   (5 req/min)  │ │
│  │ (500 char) │  │  Pattern   │  │                │ │
│  └───────────┘  └────────────┘  └────────────────┘ │
│  ┌───────────┐  ┌────────────┐  ┌────────────────┐ │
│  │  Fallback  │  │  DB-based  │  │   SSE Stream   │ │
│  │  Models    │  │  Job Queue │  │   (실시간)      │ │
│  └───────────┘  └────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────┘
```

#### 4.4.2 AI 모델 우선순위
1. **Gemini 2.5 Flash** (기본)
2. **Gemini 2.0 Flash** (폴백 1)
3. **Gemini 1.5 Flash** (폴백 2)

#### 4.4.3 번역 프로세스
1. 사용자가 번역할 챕터 범위 선택
2. 세팅 바이블 (캐릭터, 용어, 세계관)이 시스템 프롬프트에 주입
3. 챕터를 500자 단위 청크로 분할
4. 청크별 순차 번역 (Rate Limit: 5 req/min)
5. SSE (Server-Sent Events)로 실시간 진행률 스트리밍
6. 번역 결과 DB 저장

#### 4.4.4 안정성 기능
- **Circuit Breaker**: 연속 실패 시 자동 중단
- **재시도 로직**: 지수 백오프 (Exponential Backoff)
- **일시정지/재개**: 사용자가 번역 중 일시정지 가능
- **강제 시작**: 멈춘 작업 감지 (5분 타임아웃) 및 강제 재시작
- **부분 번역 복구**: 청크 단위 저장으로 실패 시 이어서 번역
- **에러 코드 체계**: RATE_LIMIT, API_ERROR, AUTH_ERROR, MODEL_ERROR, CONTENT_POLICY, CIRCUIT_OPEN 등

#### 4.4.5 재번역 기능
- 개별 챕터 재번역 요청
- AI 개선 번역 (기존 번역 + 피드백 기반 개선)

### 4.5 세팅 바이블 시스템

#### 4.5.1 개요
소설의 세계관, 인물, 용어를 AI가 자동 분석하여 **번역 일관성 사전**을 생성하는 시스템.

#### 4.5.2 생성 프로세스
1. 작품의 챕터들을 토큰 기반으로 최적 배치 계획 수립 (`batch-plan`)
2. 배치별 챕터 분석 (`analyze-batch`) - AI가 인물/용어/타임라인 추출
3. 분석 결과 Draft 상태로 저장
4. 사용자가 검토 후 수정/확정 (`confirm`)

#### 4.5.3 세팅 바이블 구성 요소

**캐릭터 (Character)**
- 원문 이름, 한국어 이름, 한자
- 호칭, 별칭 (배열)
- 성격, 말투
- 역할 (주인공/적대자/조연/단역)
- 설명, 관계도 (JSON)
- 첫 등장 챕터

**용어 (Setting Term)**
- 원문, 번역어
- 카테고리: 인물, 장소, 조직, 직위, 기술, 아이템, 기타
- 주석, 문맥
- 빈도, 첫 등장 챕터

**타임라인 이벤트 (Timeline Event)**
- 제목, 설명
- 시작/종료 챕터
- 유형: 플롯, 캐릭터 발전, 복선, 반전, 세계관
- 중요도
- 복선 여부 및 메모
- 관련 캐릭터 연결

#### 4.5.4 내보내기
- JSON 형식으로 전체 세팅 바이블 내보내기

### 4.6 용어집 (Glossary) 시스템

- 작품별 용어집 관리
- 원문 → 번역어 매핑
- 카테고리 분류, 메모 첨부
- 번역 시 용어집 자동 참조

### 4.7 마켓플레이스 시스템

#### 4.7.1 에디터 프로필
- 전문 프로필: 표시명, 자기소개, 포트폴리오 URL
- 전문 장르, 가능 언어 (복수)
- 가용 상태: AVAILABLE / BUSY / UNAVAILABLE
- 최대 동시 프로젝트 수
- 실적: 완료 프로젝트 수, 평균 평점, 총 리뷰 수
- 인증 여부
- **포트폴리오 아이템**: 제목, 설명, 장르, 샘플 텍스트

#### 4.7.2 프로젝트 리스팅 (구인)
- 작품 연동
- 제목, 설명, 요구사항
- 예산 범위 (최소~최대)
- 마감일
- 교정 대상 챕터 범위 (시작~끝)
- 상태: DRAFT → OPEN → CLOSED / IN_PROGRESS → COMPLETED / CANCELLED
- 조회수, 지원자 수 추적

#### 4.7.3 지원 시스템
- 에디터가 리스팅에 지원
- 제안 메시지, 견적, 예상 소요일
- 상태: PENDING → SHORTLISTED → ACCEPTED / REJECTED / WITHDRAWN
- 작가 코멘트

#### 4.7.4 계약 시스템
- 리스팅-작품-작가-에디터 연결
- 총 금액, 시작일, 예상 종료일
- 교정 대상 챕터 범위
- 활성 상태 관리

#### 4.7.5 수정 요청 (Revision Request)
- 챕터별 수정 요청
- 요청 사유, 구체적 피드백
- 상태: PENDING → IN_PROGRESS → COMPLETED / DISPUTED
- 수정 횟수 추적

#### 4.7.6 리뷰 시스템
- 프로젝트 완료 후 에디터 리뷰
- 전체 평점 (1-5)
- 세부 평점: 품질, 속도, 커뮤니케이션
- 리뷰 텍스트
- 공개/비공개 설정

### 4.8 관리자 시스템

- **대시보드 통계**: 전체 번역 작업 현황, 시스템 상태
- **번역 작업 관리**: 활성/완료/실패 작업 모니터링
- **시스템 로그**: 레벨별(DEBUG/INFO/WARN/ERROR), 카테고리별 로그 조회
- **로그 삭제**: 오래된 로그 정리

---

## 5. API 엔드포인트 명세

### 총 60개 API 엔드포인트

### 5.1 인증 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/check-email` | 이메일 중복 확인 |
| POST | `/api/auth/forgot-password` | 비밀번호 재설정 이메일 |
| POST | `/api/auth/reset-password` | 비밀번호 재설정 |
| POST | `/api/auth/resend-verification` | 인증 이메일 재발송 |
| GET | `/api/auth/verify-email?token=` | 이메일 인증 |
| * | `/api/auth/[...nextauth]` | NextAuth 동적 라우트 |

### 5.2 작품 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/works` | 작품 목록 (페이지네이션, 역할 기반) |
| POST | `/api/works` | 작품 생성 |
| GET | `/api/works/[id]` | 작품 상세 |
| PATCH | `/api/works/[id]` | 작품 수정 |
| DELETE | `/api/works/[id]` | 작품 삭제 |
| GET | `/api/works/[id]/download` | 작품 다운로드 (DOCX/ZIP) |
| GET | `/api/works/[id]/editor-reference` | 에디터용 참조 데이터 |
| GET | `/api/works/[id]/listings` | 작품 리스팅 목록 |

### 5.3 챕터 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/works/[id]/chapters` | 챕터 목록 (필터, 페이지네이션) |
| POST | `/api/works/[id]/chapters` | 챕터 생성 |
| GET | `/api/works/[id]/chapters/[num]` | 챕터 상세 |
| PATCH | `/api/works/[id]/chapters/[num]` | 챕터 수정 |
| DELETE | `/api/works/[id]/chapters/[num]` | 챕터 삭제 |
| GET | `/api/works/[id]/chapters/[num]/download` | 챕터 DOCX 다운로드 |
| POST | `/api/works/[id]/chapters/parse-file` | DOCX 파일 파싱 |
| POST | `/api/works/[id]/chapters/bulk` | 대량 챕터 임포트 |
| POST | `/api/works/[id]/chapters/[num]/retranslate` | 챕터 재번역 |
| POST | `/api/works/[id]/chapters/[num]/ai-improve` | AI 번역 개선 |
| GET | `/api/works/[id]/chapters/[num]/activity` | 활동 로그 |

### 5.4 스냅샷 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/works/[id]/chapters/[num]/snapshots` | 스냅샷 목록 |
| POST | `/api/works/[id]/chapters/[num]/snapshots` | 스냅샷 생성 |
| GET | `/api/works/[id]/chapters/[num]/snapshots/[sid]` | 스냅샷 상세 |
| DELETE | `/api/works/[id]/chapters/[num]/snapshots/[sid]` | 스냅샷 삭제 |
| POST | `/api/works/[id]/chapters/[num]/snapshots/[sid]/restore` | 스냅샷 복원 |

### 5.5 코멘트 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/works/[id]/chapters/[num]/comments` | 코멘트 목록 |
| POST | `/api/works/[id]/chapters/[num]/comments` | 코멘트 작성 |
| PATCH | `/api/works/[id]/chapters/[num]/comments/[cid]` | 코멘트 수정 |
| DELETE | `/api/works/[id]/chapters/[num]/comments/[cid]` | 코멘트 삭제 |

### 5.6 번역 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/translation` | 배치 번역 시작 |
| GET | `/api/translation/active` | 활성 번역 작업 조회 |
| DELETE | `/api/translation/active` | 번역 작업 취소 |
| POST | `/api/translation/pause` | 번역 일시정지 |
| POST | `/api/translation/resume` | 번역 재개 |
| GET | `/api/translation/stream` | SSE 진행률 스트림 |

### 5.7 세팅 바이블 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/works/[id]/setting-bible` | 세팅 바이블 상태 |
| POST | `/api/works/[id]/setting-bible` | 세팅 바이블 초기화 |
| POST | `/api/works/[id]/setting-bible/batch-plan` | 배치 계획 수립 |
| POST | `/api/works/[id]/setting-bible/analyze-batch` | 배치 분석 실행 |
| GET | `/api/works/[id]/setting-bible/status` | 생성 상태 조회 |
| GET | `/api/works/[id]/setting-bible/characters` | 캐릭터 목록 |
| POST/PATCH/DELETE | `/api/works/[id]/setting-bible/characters/[cid]` | 캐릭터 CRUD |
| GET | `/api/works/[id]/setting-bible/terms` | 용어 목록 |
| POST/PATCH/DELETE | `/api/works/[id]/setting-bible/terms/[tid]` | 용어 CRUD |
| POST | `/api/works/[id]/setting-bible/confirm` | 바이블 확정 |
| GET | `/api/works/[id]/setting-bible/export` | JSON 내보내기 |

### 5.8 용어집 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/works/[id]/glossary` | 용어집 조회 |
| POST | `/api/works/[id]/glossary` | 용어 생성/수정 |
| DELETE | `/api/works/[id]/glossary/[gid]` | 용어 삭제 |

### 5.9 마켓플레이스 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/listings` | 리스팅 목록 |
| POST | `/api/listings` | 리스팅 생성 |
| GET | `/api/listings/[id]` | 리스팅 상세 |
| PATCH | `/api/listings/[id]` | 리스팅 수정 |
| DELETE | `/api/listings/[id]` | 리스팅 삭제 |
| POST | `/api/listings/[id]/publish` | 리스팅 공개 |
| GET | `/api/listings/[id]/applications` | 지원자 목록 |
| POST | `/api/listings/[id]/applications` | 리스팅 지원 |
| GET/PATCH | `/api/listings/[id]/applications/[aid]` | 지원 관리 |

### 5.10 계약 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/contracts` | 계약 목록 |
| GET | `/api/contracts/[id]` | 계약 상세 |
| PATCH | `/api/contracts/[id]` | 계약 수정 |
| POST | `/api/contracts/[id]/review` | 리뷰 작성 |

### 5.11 에디터 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/editors` | 에디터 프로필 목록 |
| GET | `/api/editors/[id]` | 에디터 프로필 상세 |

### 5.12 사용자 프로필 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/me` | 내 프로필 |
| PATCH | `/api/me` | 프로필 수정 |
| GET | `/api/me/editor-profile` | 에디터 프로필 조회 |
| POST/PATCH | `/api/me/editor-profile` | 에디터 프로필 생성/수정 |
| GET | `/api/me/applications` | 내 지원 내역 |
| GET | `/api/me/editor-profile/portfolio` | 포트폴리오 조회 |
| POST | `/api/me/editor-profile/portfolio` | 포트폴리오 추가 |
| PATCH/DELETE | `/api/me/editor-profile/portfolio/[pid]` | 포트폴리오 관리 |

### 5.13 관리자 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/admin/jobs` | 번역 작업 목록 |
| GET | `/api/admin/logs` | 시스템 로그 |
| DELETE | `/api/admin/logs` | 로그 삭제 |
| GET | `/api/admin/stats` | 시스템 통계 |

### 5.14 공개 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/stats` | 공개 통계 |
| GET | `/api/users/editors` | 에디터 목록 |

---

## 6. 데이터베이스 설계

### 6.1 ERD 개요

총 **25개 테이블**, **885줄** Prisma 스키마

### 6.2 모델 목록 및 관계

#### 핵심 도메인

| 모델 | 설명 | 주요 관계 |
|------|------|-----------|
| **User** | 사용자 (작가/에디터/관리자) | → Works, EditingWorks, Comments, Reviews |
| **Work** | 작품 | → Chapters, Glossary, SettingBible, Listings, Contracts |
| **Chapter** | 챕터 | → Comments, Snapshots, Changes, Activities |
| **GlossaryItem** | 용어집 항목 | → Work |

#### 협업 도메인

| 모델 | 설명 | 주요 관계 |
|------|------|-----------|
| **ChapterComment** | 인라인 코멘트 | → Chapter, Author, Resolver, Parent(self) |
| **ChapterSnapshot** | 버전 스냅샷 | → Chapter, Creator |
| **ChapterChange** | 트랙 체인지 | → Chapter, Author, Reviewer |
| **ChapterActivity** | 활동 로그 | → Chapter, User |

#### 세팅 바이블 도메인

| 모델 | 설명 | 주요 관계 |
|------|------|-----------|
| **SettingBible** | 바이블 메타 | → Work, Characters, Terms, Events |
| **Character** | 등장인물 | → SettingBible |
| **SettingTerm** | 세계관 용어 | → SettingBible |
| **TimelineEvent** | 타임라인 | → SettingBible |

#### 마켓플레이스 도메인

| 모델 | 설명 | 주요 관계 |
|------|------|-----------|
| **EditorProfile** | 에디터 프로필 | → User, PortfolioItems, Applications, Reviews |
| **PortfolioItem** | 포트폴리오 | → EditorProfile |
| **ProjectListing** | 구인 리스팅 | → Work, Author, Applications, Contract |
| **ProjectApplication** | 지원 | → Listing, EditorProfile |
| **ProjectContract** | 계약 | → Listing, Work, Author, Editor, RevisionRequests |
| **ChapterRevisionRequest** | 수정 요청 | → Contract, Chapter, Requester |
| **EditorReview** | 에디터 리뷰 | → EditorProfile, Author, Work |

#### 번역 시스템

| 모델 | 설명 | 주요 관계 |
|------|------|-----------|
| **TranslationLog** | 번역 로그 | 독립 (인덱싱) |
| **ActiveTranslationJob** | 활성 번역 작업 | 독립 (작업 큐) |
| **TranslationJobHistory** | 완료된 번역 | 독립 (아카이브) |

#### 인증 도메인

| 모델 | 설명 |
|------|------|
| **Account** | OAuth 계정 연동 |
| **Session** | 세션 토큰 |
| **VerificationToken** | 이메일 인증 토큰 |
| **PasswordResetToken** | 비밀번호 재설정 토큰 |

### 6.3 주요 Enum 타입

```
UserRole:        AUTHOR | EDITOR | ADMIN
WorkStatus:      REGISTERED | BIBLE_GENERATING | BIBLE_DRAFT | BIBLE_CONFIRMED |
                 TRANSLATING | TRANSLATED | PROOFREADING | COMPLETED
ChapterStatus:   PENDING | TRANSLATING | TRANSLATED | REVIEWING | EDITED | APPROVED
AgeRating:       ALL | FIFTEEN | NINETEEN
OriginalStatus:  ONGOING | COMPLETED
SourceLanguage:  ZH | JA | EN | OTHER
CharacterRole:   PROTAGONIST | ANTAGONIST | SUPPORTING | MINOR
TermCategory:    CHARACTER | PLACE | ORGANIZATION | RANK_TITLE |
                 SKILL_TECHNIQUE | ITEM | OTHER
EventType:       PLOT | CHARACTER_DEV | FORESHADOWING | REVEAL | WORLD_BUILDING
ListingStatus:   DRAFT | OPEN | CLOSED | IN_PROGRESS | COMPLETED | CANCELLED
ApplicationStatus: PENDING | SHORTLISTED | ACCEPTED | REJECTED | WITHDRAWN
RevisionStatus:  PENDING | IN_PROGRESS | COMPLETED | DISPUTED
SnapshotType:    MANUAL | AUTO_SAVE | STATUS_CHANGE | RETRANSLATE
ChangeType:      INSERT | DELETE | REPLACE
ChangeStatus:    PENDING | ACCEPTED | REJECTED
ActivityType:    COMMENT_ADDED | EDIT_MADE | CHANGE_ACCEPTED | CHANGE_REJECTED |
                 STATUS_CHANGED | SNAPSHOT_CREATED | SNAPSHOT_RESTORED
Availability:    AVAILABLE | BUSY | UNAVAILABLE
LogLevel:        DEBUG | INFO | WARN | ERROR
LogCategory:     TRANSLATION | API_CALL | RATE_LIMIT | CHUNK | CHAPTER | JOB | SYSTEM
JobStatus:       PENDING | IN_PROGRESS | PAUSED | COMPLETED | FAILED
```

---

## 7. 페이지 라우트 맵

### 7.1 공개 페이지

| 경로 | 페이지 | 설명 |
|------|--------|------|
| `/` | 랜딩 페이지 | 서비스 소개, CTA |
| `/login` | 로그인 | 이메일/비밀번호, Google OAuth |
| `/register` | 회원가입 | 역할 선택 (작가/에디터) |
| `/forgot-password` | 비밀번호 찾기 | 이메일 입력 |
| `/reset-password` | 비밀번호 재설정 | 토큰 기반 |

### 7.2 대시보드 (인증 필요)

| 경로 | 페이지 | 접근 권한 |
|------|--------|-----------|
| `/dashboard` | 메인 대시보드 | 전체 |
| `/works` | 작품 목록 | 전체 (역할별 필터) |
| `/works/new` | 작품 생성 | AUTHOR, ADMIN |
| `/works/[id]` | 작품 상세 | 소유자, 배정 에디터, ADMIN |
| `/works/[id]/chapters` | 챕터 목록 | 위와 동일 |
| `/works/[id]/chapters/[num]` | 챕터 에디터 | 위와 동일 |
| `/works/[id]/translate` | 배치 번역 | AUTHOR, ADMIN |
| `/works/[id]/glossary` | 용어집 | 소유자, 배정 에디터, ADMIN |
| `/works/[id]/listings` | 작품 리스팅 | AUTHOR, ADMIN |
| `/works/[id]/review` | 교정 리뷰 | EDITOR, ADMIN |
| `/works/[id]/setting-bible` | 세팅 바이블 | 소유자, 배정 에디터, ADMIN |
| `/marketplace` | 마켓플레이스 | 전체 |
| `/marketplace/[id]` | 리스팅 상세 | 전체 |
| `/editors` | 에디터 목록 | 전체 |
| `/editors/[id]` | 에디터 프로필 | 전체 |
| `/contracts` | 계약 목록 | 전체 (본인 것만) |
| `/contracts/[id]` | 계약 상세 | 계약 당사자, ADMIN |
| `/my-profile` | 프로필 수정 | 전체 |
| `/my-applications` | 지원 내역 | EDITOR |
| `/settings` | 계정 설정 | 전체 |
| `/admin` | 관리자 대시보드 | ADMIN |

---

## 8. 보안 설계

### 8.1 인증 보안

| 항목 | 구현 |
|------|------|
| 비밀번호 해싱 | bcryptjs, 12 salt rounds |
| 세션 관리 | JWT in HttpOnly cookies |
| OAuth | Google OAuth 2.0 (선택적) |
| 이메일 인증 | 토큰 기반 (만료 시간 설정) |
| 비밀번호 재설정 | 토큰 기반 (만료 시간 설정) |

### 8.2 API 보안

| 항목 | 구현 |
|------|------|
| 미들웨어 인증 | 모든 보호 라우트에 JWT 검증 |
| RBAC | 역할 기반 API 접근 제어 |
| Admin 보호 | `/api/admin/*` ADMIN 역할 필수 |
| Rate Limiting | 번역 API 5 req/min (DB 기반) |
| 입력 검증 | Zod 스키마로 모든 API 입력 검증 |

### 8.3 데이터 보안

| 항목 | 구현 |
|------|------|
| XSS 방지 | isomorphic-dompurify로 HTML 살균 |
| 파일 업로드 검증 | 크기 제한 (50KB), 타입 검증 |
| DB 접근 | Prisma ORM (SQL Injection 방지) |
| 소유권 검증 | 모든 API에서 리소스 소유자 확인 |

---

## 9. 성능 최적화

### 9.1 프론트엔드 최적화

| 항목 | 구현 |
|------|------|
| 이미지 최적화 | Next.js Image 컴포넌트 (자동 WebP/AVIF) |
| 코드 분할 | Next.js App Router 자동 코드 스플리팅 |
| 차트 레이지 로딩 | Recharts 동적 임포트 |
| 가상 스크롤링 | @tanstack/react-virtual |
| SSR/SSG | Server Components 우선 렌더링 |

### 9.2 백엔드 최적화

| 항목 | 구현 |
|------|------|
| 쿼리 병렬화 | Promise.all로 독립 쿼리 병렬 실행 |
| 선택적 조회 | Prisma select/include 최소화 |
| 커넥션 풀링 | PgBouncer (포트 6543) |
| DB 트랜잭션 | 30초 타임아웃 (기본 5초 확장) |
| 재시도 로직 | 3회 지수 백오프 (DB 연결 오류) |
| 싱글톤 패턴 | Prisma Client 글로벌 싱글톤 (Hot Reload 대응) |

### 9.3 번역 시스템 최적화

| 항목 | 구현 |
|------|------|
| 청크 분할 | 500자 단위 (Vercel Hobby 타임아웃 대응) |
| 토큰 버짓 | 900K 토큰 (Gemini 1M 한도의 90%) |
| 모델 폴백 | 3단계 모델 자동 전환 |
| SSE 스트리밍 | 실시간 진행률 (폴링 없음) |
| DB 기반 작업 큐 | 서버리스 환경에서 상태 유지 |

---

## 10. 환경 변수 설정

```bash
# ============================================
# 데이터베이스 (필수)
# ============================================
DATABASE_URL="postgresql://user:password@host:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://user:password@host:5432/postgres"

# ============================================
# NextAuth.js (필수)
# ============================================
NEXTAUTH_URL="https://your-domain.com"
NEXTAUTH_SECRET="openssl rand -base64 32 로 생성"

# ============================================
# Google OAuth (선택)
# ============================================
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# ============================================
# Google Gemini AI (필수 - 번역 기능)
# ============================================
GEMINI_API_KEY="your-gemini-api-key"

# ============================================
# 이메일 서비스 (선택 - 인증 이메일)
# ============================================
RESEND_API_KEY="your-resend-api-key"
EMAIL_FROM="noreply@your-domain.com"

# ============================================
# 앱 URL (선택)
# ============================================
NEXT_PUBLIC_APP_URL="https://your-domain.com"

# ============================================
# 환경
# ============================================
NODE_ENV="production"
```

---

## 11. 개발 히스토리 (커밋 로그)

### 11.1 개발 타임라인

| 단계 | 주요 내용 | 커밋 |
|------|-----------|------|
| **Phase 1: 초기 설정** | 프로젝트 생성, 기본 세팅 | `ee88301` first commit |
| **Phase 2: UI 디자인** | Material Design 3 영감, 흑백 미니멀, android.com 스타일 재디자인 | `f725796` ~ `14b980f` |
| **Phase 3: 핵심 기능** | 프로젝트 상세, 챕터 리더, 스텝별 프로젝트 생성 | `481cb3d` ~ `888433c` |
| **Phase 4: 번역 시스템** | 클라이언트 번역, 서버 번역, SSE, 안정성 | `7b059b8` ~ `f4f1171` |
| **Phase 5: 안정화** | 에러 핸들링, Vercel 배포 대응, PgBouncer | `923ff03` ~ `b45c4ab` |
| **Phase 6: 고급 기능** | 세팅 바이블, 글로벌 인디케이터, 관리자 대시보드 | `4f7385d` ~ `ef21306` |
| **Phase 7: QA & 버그픽스** | 런타임 오류 방어, ErrorBoundary, null 체크 | `758c3c9` ~ `75803f4` |
| **Phase 8: 성능 최적화** | 쿼리 병렬화, next/image, 레이지 로딩 | `574975c` ~ `d090dd3` |
| **Phase 9: 기능 완성** | 누락 UI 추가, 계약 범위 가드, E2E 테스트 | `940a079` ~ `a2608c6` |

---

## 12. 빌드 및 실행 가이드

### 12.1 개발 환경 요구사항

- **Node.js** 20 이상
- **npm** 또는 **yarn**
- **PostgreSQL** 데이터베이스 (Supabase 권장)

### 12.2 설치 및 실행

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수 설정
cp .env.example .env
# .env 파일 편집

# 3. 데이터베이스 마이그레이션
npx prisma migrate dev

# 4. Prisma Client 생성
npx prisma generate

# 5. 개발 서버 실행
npm run dev
```

### 12.3 사용 가능한 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 (Prisma generate 포함) |
| `npm run start` | 프로덕션 서버 실행 |
| `npm run lint` | ESLint 코드 검사 |
| `npm run test` | Vitest 단위 테스트 |
| `npm run test:watch` | Vitest 워치 모드 |
| `npm run test:coverage` | 테스트 커버리지 |
| `npm run test:api` | API 통합 테스트 |
| `npm run test:e2e` | Playwright E2E 테스트 |
| `npm run test:e2e:ui` | Playwright UI 모드 |

---

## 13. 의존성 목록

### 13.1 프로덕션 의존성 (34개)

| 패키지 | 버전 | 용도 |
|--------|------|------|
| @auth/prisma-adapter | ^2.11.1 | NextAuth Prisma 어댑터 |
| @google/generative-ai | ^0.24.1 | Gemini AI SDK |
| @hookform/resolvers | ^5.2.2 | React Hook Form 리졸버 |
| @prisma/client | ^5.22.0 | Prisma ORM 클라이언트 |
| @radix-ui/react-* (11개) | 최신 | UI 프리미티브 |
| @tanstack/react-virtual | ^3.13.18 | 가상 스크롤 |
| @tiptap/* (5개) | ^3.17.0 | 리치 텍스트 에디터 |
| archiver | ^7.0.1 | ZIP 생성 |
| bcryptjs | ^3.0.3 | 비밀번호 해싱 |
| class-variance-authority | ^0.7.1 | 컴포넌트 변형 |
| clsx | ^2.1.1 | 조건부 클래스 |
| diff-match-patch | ^1.0.5 | 텍스트 diff |
| docx | ^9.5.1 | DOCX 생성 |
| isomorphic-dompurify | ^2.35.0 | HTML 살균 |
| lucide-react | ^0.562.0 | 아이콘 |
| mammoth | ^1.11.0 | DOCX 파싱 |
| next | 16.1.1 | 프레임워크 |
| next-auth | ^4.24.13 | 인증 |
| next-themes | ^0.4.6 | 테마 |
| prisma | ^5.22.0 | ORM CLI |
| react | 19.2.3 | UI 라이브러리 |
| react-dom | 19.2.3 | DOM 렌더링 |
| react-hook-form | ^7.70.0 | 폼 관리 |
| recharts | ^3.6.0 | 차트 |
| resend | ^6.6.0 | 이메일 |
| sonner | ^2.0.7 | 토스트 |
| tailwind-merge | ^3.4.0 | Tailwind 클래스 병합 |
| zod | ^4.3.5 | 스키마 검증 |
| zustand | ^5.0.9 | 상태 관리 |

### 13.2 개발 의존성 (13개)

| 패키지 | 버전 | 용도 |
|--------|------|------|
| @playwright/test | ^1.58.1 | E2E 테스트 |
| @tailwindcss/postcss | ^4 | PostCSS 플러그인 |
| @testing-library/jest-dom | ^6.9.1 | DOM 매처 |
| @testing-library/react | ^16.3.2 | React 테스트 |
| @testing-library/user-event | ^14.6.1 | 유저 이벤트 시뮬레이션 |
| @types/* (5개) | 최신 | TypeScript 타입 |
| @vitejs/plugin-react | ^5.1.2 | Vitest React 플러그인 |
| eslint | ^9 | 코드 린트 |
| eslint-config-next | 16.1.1 | Next.js ESLint |
| jsdom | ^27.4.0 | 테스트 DOM 환경 |
| tailwindcss | ^4 | CSS 프레임워크 |
| tw-animate-css | ^1.4.0 | 애니메이션 |
| typescript | ^5 | 타입스크립트 |
| vitest | ^4.0.18 | 테스트 프레임워크 |

---

## 14. 주요 설계 결정 및 트레이드오프

### 14.1 서버리스 아키텍처 선택

**결정**: Vercel 서버리스 배포
**이유**: 초기 비용 절감, 자동 스케일링, CDN 제공
**트레이드오프**:
- 함수 실행 시간 제한 → 청크 기반 번역으로 해결
- 상태 유지 불가 → DB 기반 작업 큐로 해결
- Cold Start → SSE 재연결 로직으로 대응

### 14.2 JWT vs Session 인증

**결정**: JWT 전략 (stateless)
**이유**: 서버리스 환경에서 세션 스토어 불필요, 확장성 우수
**트레이드오프**: 토큰 무효화 어려움 → DB에서 역할 변경 시 다음 요청에 반영

### 14.3 단일 리포지토리 (Monorepo)

**결정**: 프론트엔드/백엔드 통합 리포
**이유**: Next.js 풀스택 특성 활용, 타입 공유, 배포 단순화
**트레이드오프**: 대규모 팀에서 코드 충돌 가능성 → 현재 규모에서는 비이슈

### 14.4 Gemini AI 모델 선택

**결정**: Google Gemini (GPT 대신)
**이유**: 무료 티어 제공, 100만 토큰 컨텍스트, 한중일 번역 성능
**트레이드오프**: OpenAI 대비 생태계 미성숙 → 폴백 모델 체인으로 안정성 확보

### 14.5 ProseMirror 기반 에디터

**결정**: TipTap (ProseMirror wrapper)
**이유**: 리치 텍스트 편집, 트랙 체인지 구현 가능, 확장성
**트레이드오프**: 학습 곡선 높음, 번들 크기 증가 → 기능 대비 합리적

---

## 15. 프로젝트 정량 분석

### 15.1 코드 규모

| 항목 | 수치 |
|------|------|
| 총 소스 파일 | 216개 (.ts/.tsx) |
| 총 코드 라인 | 43,935줄 |
| DB 스키마 | 885줄 (25개 모델) |
| API 엔드포인트 | 60개 |
| 페이지 라우트 | 21개 |
| UI 컴포넌트 | 26개 (기본) + 기능별 다수 |
| 커스텀 Hooks | 9개 |
| 유틸리티 파일 | 18개 |
| Enum 타입 | 17개 |
| 총 커밋 | 56개 |
| 프로덕션 의존성 | 34개 |
| 개발 의존성 | 13개 |

### 15.2 기능 커버리지

| 도메인 | 기능 수 | 상태 |
|--------|---------|------|
| 인증/인가 | 7 | 완료 |
| 작품 관리 | 8 | 완료 |
| 챕터 관리 | 15 | 완료 |
| AI 번역 | 6 | 완료 |
| 세팅 바이블 | 10 | 완료 |
| 협업 (코멘트/스냅샷) | 8 | 완료 |
| 마켓플레이스 | 9 | 완료 |
| 계약/리뷰 | 4 | 완료 |
| 관리자 | 4 | 완료 |
| 사용자 프로필 | 8 | 완료 |
| **합계** | **79** | **전체 완료** |

---

## 16. 향후 확장 가능성

### 16.1 기능 확장

- 실시간 동시 편집 (WebSocket/CRDT)
- 번역 메모리 (TM) 시스템
- CAT(Computer-Assisted Translation) 도구 통합
- 결제 시스템 (Stripe/Toss) 연동
- 모바일 앱 (React Native)
- 번역 품질 자동 평가 (QA 점수)

### 16.2 인프라 확장

- Vercel Pro/Enterprise 업그레이드 (더 긴 함수 실행 시간)
- Redis 캐시 레이어 추가
- 전용 번역 워커 서비스 분리
- CDN 기반 정적 자산 최적화

---

## 17. 사용자 플로우 및 기능 사용 가이드

### 17.1 랜딩 페이지 (비로그인 사용자)

사용자가 최초 접속 시 보게 되는 화면이다.

**화면 구성:**
- 히어로 섹션: "원작의 감동을 그대로 전하다" 타이틀
- 헤더 네비게이션: `로그인` / `시작하기` 버튼
- 서비스 특징 카드 6종:
  - AI 기반 번역
  - 서지정보 시스템
  - 전문 윤문가 매칭
  - 실시간 협업
  - 다국어 지원
  - 안전한 원고 관리
- 4단계 프로세스 안내:
  1. 프로젝트 등록
  2. 설정집 생성
  3. AI 번역 실행
  4. 윤문 및 완성
- CTA 버튼으로 회원가입 유도

---

### 17.2 회원가입 플로우

**경로:** `/register`

```
[이름 입력] → [이메일 입력 (실시간 중복 확인)] → [비밀번호 설정]
     → [역할 선택: 작가 / 윤문가] → [회원가입 완료] → [로그인 페이지 이동]
```

**입력 필드:**

| 필드 | 타입 | 설명 |
|------|------|------|
| 이름 | 텍스트 | 사용자 표시명 |
| 이메일 | 텍스트 | 실시간 중복 확인 (로딩 스피너 → 체크마크/X 표시) |
| 비밀번호 | 비밀번호 | 8자 이상, 영문+숫자 |
| 비밀번호 확인 | 비밀번호 | 일치 여부 확인 |
| 역할 선택 | 카드 선택 | **작가** (원고 등록 및 번역 요청) 또는 **윤문가** (번역본 검토 및 수정) |

**역할에 따라 가입 후 볼 수 있는 메뉴가 달라진다:**

| 메뉴 | 작가 | 윤문가 |
|------|------|--------|
| 대시보드 | O | O |
| 프로젝트 | O (내 프로젝트) | O (배정된 프로젝트) |
| 윤문가 찾기 | O | X |
| 마켓플레이스 | X | O |
| 내 지원 | X | O |
| 내 프로필 | X | O |
| 계약 관리 | O | O |

---

### 17.3 로그인 플로우

**경로:** `/login`

**방법 1: 이메일/비밀번호**
- 이메일, 비밀번호 입력 후 로그인 버튼 클릭
- 성공 시 `/dashboard`로 이동

**방법 2: Google OAuth**
- "Google로 로그인" 버튼 클릭
- Google 인증 후 자동 로그인

**비밀번호 찾기 (`/forgot-password`):**
1. 이메일 입력 → "재설정 링크 받기" 클릭
2. 확인 화면: "비밀번호 재설정 링크를 발송했습니다"
3. 이메일의 링크 클릭 → `/reset-password?token=xxx`
4. 새 비밀번호 입력 → 자동으로 로그인 페이지 이동

---

### 17.4 사이드바 네비게이션

데스크톱(lg 이상)에서는 좌측 고정 사이드바, 모바일에서는 햄버거 메뉴 드로어로 표시된다.

**작가 메뉴:**
```
├── 대시보드
├── 프로젝트
├── 윤문가 찾기
├── 계약 관리
├── ──────────
├── 라이트/다크 모드 토글
└── 계정 (설정, 로그아웃)
```

**윤문가 메뉴:**
```
├── 대시보드
├── 담당 프로젝트
├── 마켓플레이스
├── 내 지원
├── 계약 관리
├── 내 프로필
├── ──────────
├── 라이트/다크 모드 토글
└── 계정 (설정, 로그아웃)
```

**관리자 메뉴:**
```
├── 대시보드
├── 프로젝트
├── 모니터링
├── ──────────
├── 라이트/다크 모드 토글
└── 계정 (설정, 로그아웃)
```

---

### 17.5 대시보드

#### 17.5.1 작가 대시보드

**상단 인사말:** "안녕하세요, {이름}님" + "번역 프로젝트를 관리하세요"

**통계 카드 (4열):**

| 카드 | 표시 내용 |
|------|-----------|
| 프로젝트 | 총 작품 수 |
| 총 회차 | 전체 챕터 수 |
| 번역 완료 | X/Y화 + 진행률 바 |
| 장르 | 내 작품 장르 (최대 3개) |

**신규 지원서 섹션:** 에디터가 내 리스팅에 지원한 내역 표시 (프로필 이미지, 이름, 작품명, "대기중" 뱃지)

**최근 프로젝트:** 최근 수정된 작품 5개 (#01~#05 넘버링, 상태 뱃지, 제목, 회차 수)

**빠른 접근:** "새 프로젝트" 버튼

#### 17.5.2 윤문가 대시보드

**상단:** 표시명 + 가용 상태 뱃지 (🟢가능 / 🟡바쁨 / 🔴불가)

**통계 카드 (4열):**

| 카드 | 표시 내용 |
|------|-----------|
| 활성 계약 | 진행 중인 계약 수 |
| 검토 대기 | 번역 완료 후 교정 대기 중인 챕터 수 |
| 지원 대기중 | 결과 대기 중인 지원서 수 |
| 평점 | 평균 평점 + 리뷰 수 |

**활성 계약:** 최근 3개 계약 (작품 커버, 제목, 작가명, 시작일)

**지원 현황:** 상태별 요약 (대기중/관심목록/수락됨/거절됨 각 건수)

---

### 17.6 작가 핵심 플로우: 프로젝트 생성 → 번역 → 교정 완료

전체 작가 워크플로우를 단계별로 설명한다. 이것이 이 플랫폼의 **메인 사용 시나리오**다.

#### Step 1: 새 프로젝트 생성 (3단계 위자드)

**경로:** `/works/new`

상단에 진행 단계 표시 (01 → 02 → 03), 뒤로 이동 자유, 앞으로는 검증 후 이동.

**1단계 - 기본 정보:**

| 필드 | 설명 | 필수 |
|------|------|------|
| 한글 작품명 | 번역될 한글 제목 | O |
| 원어 작품명 | 원작의 원어 제목 | O |
| 시놉시스 | 작품 설명 | X |
| 제작사/출판사 | 출판사 또는 권리자 | X |
| 연령등급 | 전체/12+/15+/18+ 드롭다운 | O |

**2단계 - 상세 정보:**

| 필드 | 설명 | 필수 |
|------|------|------|
| 장르 | 최대 5개 선택 (무협, 판타지, 현대판타지, 로맨스, 로맨스판타지, SF, BL, 미스터리, 라이트노벨, 기타) | O |
| 원작 언어 | 중국어/일본어/영어 드롭다운 | O |
| 연재 상태 | 연재중/완결 드롭다운 | O |
| 예상 총 회차 | 숫자 입력 | X |

**3단계 - 작가 정보:**

| 필드 | 설명 | 필수 |
|------|------|------|
| 작가 목록 | 역할(글/그림/각색) + 이름, 복수 추가 가능 | O (최소 1명) |
| 플랫폼명 | 원작 연재 플랫폼 (예: 起点中文网) | X |
| 플랫폼 URL | 원작 링크 | X |

→ "프로젝트 등록" 클릭 → 작품 상세 페이지(`/works/[id]`)로 이동

---

#### Step 2: 챕터 업로드

**경로:** `/works/[id]` → "대량 업로드" 버튼 또는 `/works/[id]/chapters`

**업로드 방법:**
1. **파일 업로드**: .txt 파일 선택 → 자동 파싱
2. **직접 붙여넣기**: 텍스트 영역에 원문 붙여넣기

**자동 챕터 분리 규칙:**
시스템이 다음 패턴을 자동 인식하여 챕터를 분리한다:
- `제1화`, `제2화`, ...
- `1화`, `2화`, ...
- `第1章`, `第2章`, ...
- `Chapter 1`, `Chapter 2`, ...

**프리뷰:**
우측에 파싱 결과 실시간 표시 (챕터 번호, 제목, 글자 수, 본문 미리보기 200자)

→ "N개 회차 업로드" 클릭 → 챕터 목록에 추가됨

---

#### Step 3: 세팅 바이블 생성

**경로:** `/works/[id]/setting-bible`

```
[설정집 생성 시작] → [AI 분석 중 (배치별 진행)] → [초안 생성 완료]
     → [인물/용어/타임라인 검토 및 수정] → [설정집 확정]
```

**3-1. 생성 시작**
- "설정집 생성 시작" 버튼 클릭 (챕터가 1개 이상 있어야 활성화)
- AI가 원문을 토큰 기반으로 배치를 나눠 순차 분석
- 진행률 바로 분석 상태 표시

**3-2. 결과 검토 (4개 탭)**

| 탭 | 내용 | 조작 |
|----|------|------|
| **인물 DB** | 이름(원문/한글), 역할, 별칭, 성격, 말투, 관계도, 첫 등장 | 검색, 역할 필터, 편집/삭제 |
| **용어집** | 원문→번역어, 카테고리, 문맥, 빈도, 첫 등장 | 검색, 카테고리 필터, 편집/삭제 |
| **타임라인** | 이벤트 제목, 챕터 범위, 유형, 중요도, 복선 여부 | 시간순 표시 |
| **번역 가이드** | AI 생성 번역 지침 텍스트 | 직접 편집 가능 |

**3-3. 확정**
- 검토 완료 후 "설정집 확정" 클릭
- 확정 후에는 노란 배너 표시: "설정집이 확정되어 수정할 수 없습니다. 번역 시 이 설정이 자동 적용됩니다."
- 필요 시 "재분석" 가능 (확정 전)

---

#### Step 4: AI 번역 실행

**경로:** `/works/[id]/translate`

**사전 조건:** 세팅 바이블이 CONFIRMED 상태여야 한다.

```
[챕터 범위 선택] → [번역 시작] → [실시간 진행 모니터링]
     → [완료/부분실패] → [실패 챕터 재시도]
```

**4-1. 챕터 선택**

| UI 요소 | 설명 |
|---------|------|
| 범위 입력 | "1-50" 또는 "1,3,5" 형식 입력 후 "적용" |
| 전체 선택/해제 | 번역 가능한 전체 챕터 토글 |
| 선택 카운트 | "N개 선택" 표시 |
| 뷰 전환 | 그리드 뷰 (컴팩트 셀) / 리스트 뷰 (상세 행) |

**그리드 뷰:** 반응형 열 (sm:5 → 2xl:20), 각 셀에 챕터 번호 + 상태 색상
**리스트 뷰:** 챕터 번호, 제목, 글자 수, 상태 표시

**범례:**
- 회색: 대기 (PENDING)
- 파란색: 번역중 (TRANSLATING)
- 초록색: 완료 (TRANSLATED)
- 파란 테두리: 선택됨

**4-2. 번역 진행 모니터링**

"번역 시작" 클릭 후 실시간 진행 화면:

| 표시 요소 | 설명 |
|-----------|------|
| 상태 아이콘 | 시계(대기) / 스피너(진행) / 체크(완료) / 일시정지 / X(실패) |
| 진행률 바 | X/Y 챕터, Z% |
| 현재 챕터 | "N화 번역 중 (X/Y 청크)" |
| 일시정지 버튼 | 번역 중 일시정지 가능 |

**4-3. 완료/실패 처리**
- 전체 성공: 모든 챕터 상태가 TRANSLATED로 변경
- 부분 실패: 실패 챕터 목록 표시 + "아래에서 실패한 회차를 재시도할 수 있습니다" 안내
- 개별 챕터 재번역 가능

**주의:** 번역은 백그라운드에서 진행되므로 다른 페이지로 이동해도 중단되지 않는다. 대시보드에서도 진행 상태 확인 가능.

---

#### Step 5: 교정(윤문) 요청

번역이 완료된 후, 에디터에게 교정을 맡기는 과정이다.

**방법 1: 마켓플레이스 리스팅 등록**
1. `/works/[id]/listings` → "새 리스팅 작성"
2. 리스팅 정보 입력:
   - 제목, 설명, 요구사항
   - 예산 범위 (최소~최대, 원화)
   - 마감일
   - 교정 대상 챕터 범위 (예: 1~100화)
3. "공개" 클릭 → 마켓플레이스에 게시
4. 에디터 지원 대기 → 대시보드에서 알림 확인

**방법 2: 직접 에디터 배정**
1. `/works/[id]` 우측 사이드바의 "담당 윤문가" 섹션
2. 드롭다운에서 에디터 선택
3. 에디터에게 작품 접근 권한 부여됨

---

#### Step 6: 챕터 에디터에서 교정 확인 및 승인

**경로:** `/works/[id]/chapters/[num]`

**화면 구성:**
- 상단: 챕터 번호/제목, 상태 뱃지, 이전/다음 내비게이션
- 에디터 영역: TipTap 기반 리치 텍스트 에디터
  - 원문 / 번역문 / 교정문 3패널
  - 트랙 체인지 표시 (삽입: 초록, 삭제: 빨강)
  - 인라인 코멘트 (텍스트 선택 후 코멘트 작성)

**작가가 할 수 있는 작업:**

| 작업 | 설명 | 가능 상태 |
|------|------|-----------|
| 원문 확인 | 원문과 번역문 비교 | 전체 상태 |
| 코멘트 작성 | 특정 텍스트 범위에 코멘트 달기 | 전체 상태 |
| 코멘트 답글 | 에디터 코멘트에 답글 | 전체 상태 |
| 코멘트 해결 | "해결됨" 처리 | 전체 상태 |
| 트랙 체인지 수락/거부 | 에디터의 변경사항 개별 승인 | EDITED, REVIEWING |
| 챕터 승인 | APPROVED 상태로 변경 | EDITED |
| 스냅샷 생성 | 현재 상태 수동 저장 | 전체 상태 |
| 스냅샷 복원 | 이전 버전으로 되돌리기 | 전체 상태 |

---

#### Step 7: 계약 완료 및 리뷰

모든 챕터가 APPROVED 상태가 되면:

1. 작품 상세 페이지 상단에 초록색 완료 배너 표시
2. "계약 완료하기" 버튼 → 계약 상세 페이지로 이동
3. 계약 완료 처리
4. 에디터 리뷰 작성 가능:
   - 전체 평점 (1~5)
   - 품질/속도/커뮤니케이션 세부 평점
   - 리뷰 텍스트
   - 공개/비공개 설정

---

### 17.7 윤문가(에디터) 핵심 플로우

#### Step 1: 에디터 프로필 설정

**경로:** `/my-profile`

프로필이 없으면 생성 폼 표시, 있으면 읽기 모드 + "수정" 버튼.

**프로필 필드:**

| 필드 | 설명 |
|------|------|
| 표시 이름 | 마켓플레이스에서 보여질 이름 |
| 자기소개 | 경력, 전문 분야, 작업 스타일 소개 |
| 전문 장르 | 뱃지 토글 (복수 선택): 무협, 판타지, 현대판타지, 로맨스 등 |
| 번역 가능 언어 | 뱃지 토글: 중국어, 일본어, 영어 |
| 포트폴리오 URL | 외부 포트폴리오 링크 |
| 가용 상태 | 🟢가능 / 🟡바쁨 / 🔴불가 |
| 최대 동시 작업 | 숫자 |

**포트폴리오 아이템:** 개별 추가/편집/삭제 가능 (제목, 장르, 설명, 샘플 텍스트)

---

#### Step 2: 마켓플레이스에서 프로젝트 찾기

**경로:** `/marketplace`

```
[검색/필터] → [리스팅 상세 확인] → [지원하기] → [결과 대기]
```

**검색/필터 옵션:**
- 키워드 검색 (프로젝트 또는 작품명)
- 장르 필터 (드롭다운)
- 정렬: 최신순 / 마감임박순

**리스팅 카드에 표시되는 정보:**
- 제목
- 작품 한글명
- 마감일 뱃지 (빨강: 마감됨/오늘마감, 회색: N일 남음)
- 설명 (2줄 미리보기)
- 챕터 범위 (예: 1-100화)
- 예산 범위 (원화)
- 지원자 수
- 언어 + 장르 뱃지

---

#### Step 3: 리스팅 지원

**경로:** `/marketplace/[id]`

리스팅 상세 확인 후 "지원하기" 클릭:

| 입력 필드 | 설명 | 필수 |
|-----------|------|------|
| 제안 메시지 | 작가에게 보내는 메시지 | X |
| 견적 | 희망 금액 | X |
| 예상 소요일 | 작업 예상 기간 | X |

→ 지원 완료 → `/my-applications`에서 상태 확인 가능

**지원 상태 흐름:** `대기중 → 관심목록 → 수락됨/거절됨`

---

#### Step 4: 교정 작업 수행

계약이 성사되면 작품이 "담당 프로젝트"에 나타난다.

**경로:** `/works/[id]/review` 또는 `/works/[id]/chapters/[num]`

**에디터가 할 수 있는 작업:**

| 작업 | 설명 |
|------|------|
| 번역문 편집 | TRANSLATED 상태 챕터의 번역문을 직접 수정 |
| 트랙 체인지 | INSERT/DELETE/REPLACE 변경사항 생성 (작가가 리뷰) |
| 코멘트 작성 | 특정 텍스트에 인라인 코멘트 |
| 코멘트 답글 | 작가 코멘트에 답변 |
| 상태 변경 | TRANSLATED → REVIEWING → EDITED |
| 스냅샷 생성 | 교정 전/후 버전 저장 |
| 용어집 참조 | `/works/[id]/glossary`에서 용어 확인 |
| 세팅 바이블 참조 | `/works/[id]/setting-bible`에서 인물/용어 확인 |

**교정 워크플로우:**
```
TRANSLATED → [에디터 교정 시작] → REVIEWING
     → [교정 완료] → EDITED
     → [작가가 트랙 체인지 확인, 코멘트 반영] → APPROVED
```

---

#### Step 5: 계약 완료 및 리뷰 수신

- 모든 챕터 APPROVED 후 작가가 계약 완료 처리
- 작가가 리뷰를 남기면 프로필에 반영 (평점, 완료 프로젝트 수 증가)

---

### 17.8 마켓플레이스 전체 플로우 (작가-에디터 매칭)

작가와 에디터의 상호작용을 시간순으로 정리한다.

```
┌──────────────────────────────────────────────────────────────────┐
│                        작가 (AUTHOR)                              │
│                                                                   │
│  1. 작품 생성 → 챕터 업로드 → 세팅 바이블 → 번역 완료              │
│  2. 리스팅 작성 (챕터 범위, 예산, 마감일)                           │
│  3. 리스팅 공개 ─────────────────────────┐                        │
│                                          ↓                        │
│                                   [마켓플레이스]                   │
│                                          ↓                        │
│  7. 지원서 확인 ←───────────── 4. 에디터가 검색/발견               │
│  8. 검토: 관심목록 추가 또는 거절  5. 리스팅 상세 확인              │
│  9. 수락 → 계약 자동 생성         6. 지원 (메시지+견적)            │
│  10. 에디터 작품 접근 권한 부여         ↑                          │
│                                          │                        │
│                                 윤문가 (EDITOR)                   │
└──────────────────────────────────────────────────────────────────┘

계약 성사 후:

작가                              에디터
  │                                  │
  │  11. 번역 완료 챕터 확인 대기     │  11. 담당 프로젝트에서 작품 확인
  │                                  │  12. TRANSLATED 챕터 교정 시작
  │  13. 트랙 체인지/코멘트 확인 ←──  │  13. 교정 완료 (EDITED 상태)
  │  14. 변경사항 수락/거부           │
  │  15. 챕터 APPROVED 처리           │
  │  16. 모든 챕터 완료 →             │
  │  17. 계약 완료 처리               │
  │  18. 에디터 리뷰 작성             │  → 프로필에 평점/리뷰 반영
  │                                  │
```

---

### 17.9 챕터 에디터 상세 기능 가이드

**경로:** `/works/[id]/chapters/[num]`

#### 17.9.1 에디터 레이아웃

```
┌─────────────────────────────────────────────────────────┐
│  ← 작품명        N화 제목   [상태뱃지]   ← 이전 N/M 다음 →  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│                   TipTap 리치 텍스트 에디터                 │
│                                                          │
│   ┌──────────┐  ┌──────────────┐  ┌──────────────┐     │
│   │  원문     │  │   번역문      │  │   교정문      │     │
│   │          │  │  (AI 번역)    │  │  (에디터 수정) │     │
│   │          │  │              │  │              │     │
│   └──────────┘  └──────────────┘  └──────────────┘     │
│                                                          │
│   [코멘트 패널]  [스냅샷 패널]  [활동 로그 패널]            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### 17.9.2 트랙 체인지 사용법

| 동작 | 결과 |
|------|------|
| 에디터가 텍스트 삽입 | 초록 배경으로 INSERT 변경 표시 |
| 에디터가 텍스트 삭제 | 빨간 취소선으로 DELETE 변경 표시 |
| 에디터가 텍스트 수정 | DELETE + INSERT 조합 (REPLACE) |
| 작가가 "수락" 클릭 | 변경사항 적용 (ACCEPTED) |
| 작가가 "거부" 클릭 | 변경사항 되돌림 (REJECTED) |

#### 17.9.3 인라인 코멘트

1. 텍스트 범위를 드래그하여 선택
2. 코멘트 버튼 클릭 (또는 팝업)
3. 코멘트 내용 입력 후 저장
4. 선택한 텍스트가 인용문으로 표시됨
5. 답글 스레드 지원
6. "해결" 버튼으로 코멘트 클로즈

#### 17.9.4 스냅샷(버전 관리)

| 스냅샷 유형 | 생성 시점 |
|-------------|-----------|
| MANUAL | 사용자가 수동으로 "스냅샷 저장" 클릭 |
| AUTO_SAVE | 시스템 자동 저장 |
| STATUS_CHANGE | 챕터 상태 변경 시 자동 |
| RETRANSLATE | 재번역 실행 시 기존 내용 자동 백업 |

스냅샷 목록에서 "복원" 클릭 시 해당 시점의 원문/번역문/교정문으로 되돌아감.

#### 17.9.5 활동 로그

모든 챕터 활동이 타임라인 형태로 기록된다:
- 코멘트 추가됨
- 편집 수행됨
- 변경사항 수락됨/거부됨
- 상태 변경됨
- 스냅샷 생성됨/복원됨

---

### 17.10 관리자 기능 가이드

**경로:** `/admin`

관리자(ADMIN) 역할만 접근 가능.

**대시보드 구성:**

| 섹션 | 내용 |
|------|------|
| 시스템 통계 | 전체 사용자 수, 작품 수, 번역 작업 수, 활성 작업 수 |
| 번역 작업 목록 | 전체 번역 작업 모니터링 (활성/완료/실패) |
| 시스템 로그 | 레벨별 (DEBUG/INFO/WARN/ERROR), 카테고리별 로그 조회 |
| 로그 관리 | 오래된 로그 삭제 기능 |

**번역 작업 모니터링:**
- 작업 ID, 작품명, 사용자, 상태
- 진행 챕터 수 / 전체 챕터 수
- 실패한 챕터 목록
- 시작 시간, 소요 시간

---

### 17.11 다운로드/내보내기 기능

**경로:** `/works/[id]` → 다운로드 버튼 또는 `/works/[id]/chapters/[num]/download`

| 다운로드 유형 | 형식 | 내용 |
|---------------|------|------|
| 개별 챕터 | DOCX | 선택한 챕터의 원문/번역문/교정문 |
| 전체 작품 | ZIP | 전체 챕터를 개별 DOCX로 묶은 압축 파일 |
| 세팅 바이블 | JSON | 인물, 용어, 타임라인 전체 데이터 |

---

### 17.12 계정 설정

**경로:** `/settings`

| 섹션 | 항목 | 설명 |
|------|------|------|
| 계정 정보 | 이메일 | 읽기 전용 (변경 불가) |
|  | 이름 | 수정 가능 |
|  | 역할 | 읽기 전용 뱃지 |
|  | 가입일 | 읽기 전용 |
| 비밀번호 변경 | 현재 비밀번호 | 이메일 가입자만 표시 |
|  | 새 비밀번호 | 8자 이상, 영문+숫자 |
|  | 비밀번호 확인 | 일치 여부 |
| OAuth 사용자 | 비밀번호 설정 | "소셜 로그인으로 가입하셨습니다" 안내 + 비밀번호 설정 가능 |

---

### 17.13 상태 뱃지 가이드

플랫폼 전체에서 사용되는 색상 코딩 상태 시스템이다.

#### 작품 상태

| 상태 | 한글 | 색상 | 의미 |
|------|------|------|------|
| REGISTERED | 등록됨 | 회색 | 작품 정보만 등록됨 |
| BIBLE_GENERATING | 설정집 생성중 | 파랑 | AI가 세팅 바이블 분석 중 |
| BIBLE_DRAFT | 설정집 초안 | 노랑 | 검토 대기 중 |
| BIBLE_CONFIRMED | 설정집 확정 | 초록 | 번역 준비 완료 |
| TRANSLATING | 번역중 | 파랑 | AI 번역 진행 중 |
| TRANSLATED | 번역완료 | 초록 | 교정 대기 |
| PROOFREADING | 윤문중 | 보라 | 에디터 교정 진행 중 |
| COMPLETED | 완료 | 초록(진) | 모든 작업 완료 |

#### 챕터 상태

| 상태 | 한글 | 색상 | 의미 |
|------|------|------|------|
| PENDING | 대기 | 회색 | 원문만 등록됨 |
| TRANSLATING | 번역중 | 파랑 | AI 번역 진행 중 |
| TRANSLATED | 번역완료 | 초록 | 교정 대기 |
| REVIEWING | 검토중 | 노랑 | 에디터 교정 진행 중 |
| EDITED | 수정완료 | 보라 | 교정 완료, 작가 확인 대기 |
| APPROVED | 승인됨 | 초록(진) | 최종 승인 |

#### 지원 상태

| 상태 | 한글 | 색상 |
|------|------|------|
| PENDING | 대기중 | 노랑 |
| SHORTLISTED | 관심목록 | 파랑 |
| ACCEPTED | 수락됨 | 초록 |
| REJECTED | 거절됨 | 빨강 |

---

*본 보고서는 TransNovel 프로젝트의 전체 구조, 기술 스택, 기능 명세, API 설계, 데이터베이스 스키마, 보안 설계, 성능 최적화, 개발 히스토리, 사용자 플로우 및 기능 사용 가이드를 포함한 개발 보고서입니다.*
