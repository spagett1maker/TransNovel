# TransNovel 셋업 가이드

> 새 컴퓨터에서 이 프로젝트를 처음 띄우는 절차. 시크릿 값은 `SECRETS_BACKUP.md` 또는 별도 보관 위치에서 가져온다.

---

## 1. 사전 요구 사항

| 도구 | 권장 버전 | 설치 |
|------|-----------|------|
| Node.js | 20.x 이상 | `brew install node@20` 또는 nvm |
| npm | 10.x | Node와 함께 |
| Git | 최신 | `brew install git` |
| Vercel CLI | 최신 | `npm i -g vercel` |
| Terraform | >= 1.5 | `brew install terraform` |
| AWS CLI | v2 | `brew install awscli` |
| psql (선택) | 14+ | `brew install libpq` |

선택:
- `gh` (GitHub CLI) — `brew install gh`
- `pnpm` 안 씀, `npm` 사용

---

## 2. 클론 & 의존성

```bash
git clone https://github.com/spagett1maker/TransNovel.git
cd TransNovel
npm install
```

`postinstall`이 `prisma generate`를 자동 실행한다. 실패하면:
```bash
npx prisma generate
```

---

## 3. 환경 변수 셋업

### 3.1 메인 앱

루트에 `.env`와 `.env.local` 생성. 값은 `SECRETS_BACKUP.md` §1, §2 참조.

```bash
# .env.example을 복사해 시작해도 됨
cp .env.example .env
# 그리고 SECRETS_BACKUP.md 값으로 채우기
```

필수 키:

| 변수 | 발급/조회 위치 |
|------|---------------|
| `DATABASE_URL` / `DIRECT_URL` | RDS 또는 Supabase. RDS면 `transnovel_admin` 비번 + endpoint |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | 로컬 `http://localhost:3000`, 운영 도메인 |
| `GEMINI_API_KEY` | `LOCAL_SECRETS.md` (gitignored) 또는 https://aistudio.google.com 신규 발급 |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `LOCAL_SECRETS.md` (gitignored) 또는 IAM `Operator` 사용자에서 신규 발급 |
| `AWS_REGION` | `ap-northeast-2` |
| `SQS_TRANSLATION_QUEUE_URL` / `SQS_BIBLE_QUEUE_URL` | Terraform output 또는 SQS 콘솔 |
| `USE_AWS_SQS` | `true` (운영 모드) |

선택 키:
- `RESEND_API_KEY`, `EMAIL_FROM` — 이메일 발송 쓸 때
- `GOOGLE_CLIENT_ID/SECRET` — Google 로그인 (현재 UI 주석 처리됨)
- `CRON_SECRET` — Vercel Cron 인증 (현재 미사용)
- `GEMINI_API_KEY_COUNT` + `GEMINI_API_KEY_1..N` — 다중 키 풀링

### 3.2 Vercel 링크

```bash
vercel link
# Project ID / Org ID는 SECRETS_BACKUP.md §4 참고
# 또는 vercel projects ls 로 trans-novel 선택
```

---

## 4. 데이터베이스

운영 DB(AWS RDS)는 이미 마이그레이션이 적용된 상태다. 새 환경에서는 코드만 동기화하면 된다.

```bash
# 현재 스키마 상태 확인
npx prisma migrate status

# 새 마이그레이션 만들기 (스키마 변경 시)
npx prisma migrate dev --name <설명>

# 운영 적용
npx prisma migrate deploy

# DB GUI
npx prisma studio
```

**주의**: `migrate dev`는 dev DB에서만. 운영 DB에는 `deploy`만.

---

## 5. 개발 서버 실행

```bash
npm run dev
# http://localhost:3000
```

Admin 계정 만들기:
```bash
# 1. http://localhost:3000/register 에서 가입
# 2. CLI로 admin 권한 부여
npx tsx scripts/set-admin.ts your@email.com
```

---

## 6. 인프라 (AWS) — 변경 작업 시에만

평소 코드만 수정할 땐 건드릴 일 없다. Lambda/RDS/SQS 변경할 때만:

```bash
cd infrastructure/terraform

# 첫 init
terraform init

# 변경 사항 확인
terraform plan -var-file="terraform.tfvars"

# 적용
terraform apply -var-file="terraform.tfvars"
```

`terraform.tfvars`는 git에 안 들어가있다 (또는 SECRETS_BACKUP에서 복원). 값은 `SECRETS_BACKUP.md` §3 참조.

state 파일(`terraform.tfstate`)은 git에 없다. 옵션:
- 백업해둔 state 파일을 그대로 복사
- 또는 S3 backend 활성화 후 원격 state 사용
- 또는 `terraform import`로 기존 리소스 다시 끌어오기

---

## 7. Lambda 워커 빌드 & 배포

각 워커는 독립 Node.js 프로젝트다.

```bash
# 번역 워커
cd infrastructure/lambda/translation-worker
npm install
npm run build           # dist/ 생성
zip -r deploy.zip dist node_modules prisma   # Terraform이 가져갈 zip

# bible-worker, health-checker도 동일 패턴
```

배포는 `terraform apply`가 zip을 감지해서 처리. 또는 `aws lambda update-function-code` 직접 호출.

---

## 8. 테스트

```bash
npm run test            # Vitest
npm run test:e2e        # Playwright (사전에 dev 서버 떠있어야 함)
npm run lint            # ESLint
```

---

## 9. 자주 쓰는 운영 스크립트

```bash
# 활성 번역 작업 상태 확인
node scripts/check-jobs.mjs

# 실패한 챕터 일괄 재시도
npx tsx scripts/retry-chapters.ts <workId>

# 사용자 admin 부여
npx tsx scripts/set-admin.ts <email>

# DB 쿼리 테스트
node scripts/test-db-query.mjs

# 부하 테스트
npx tsx scripts/load-test.ts
```

---

## 10. 트러블슈팅

| 증상 | 원인 / 해결 |
|------|-------------|
| `Prisma Client did not initialize yet` | `npx prisma generate` |
| `connection_limit exceeded` | `.env`의 `DATABASE_URL`에 `?connection_limit=25` 붙이기 |
| 번역이 IN_PROGRESS 고착 | health-checker Lambda 로그 확인 (`/aws/lambda/transnovel-health-checker`) — 60분 주기 자동 정리 |
| Gemini 429 | `src/lib/gemini/resilience.ts` 의 RateLimiter / Circuit Breaker. 키 풀링 활성화 검토 |
| AWS 인증 실패 | `aws sts get-caller-identity`로 IAM 키 확인 |
| Vercel 배포 실패 (DB 연결) | Vercel 환경 변수 갱신 후 재배포 |
| Terraform plan 차이 다수 | 누군가 콘솔에서 직접 수정한 듯. `terraform refresh` 후 비교 |

---

## 11. 다음에 읽을 문서

- `HANDOVER.md` — 인수인계 / 디렉토리 지도 / 코드 규칙
- `DEV_REPORT.md` — 아키텍처 상세
- `SERVICE_GUIDE.md` — 사용자 화면별 플로우
- `PRODUCTION_ANALYSIS.md` / `PRODUCTION_CHECKLIST.md` — 프로덕션 운영 노트
- `SECRETS_BACKUP.md` — 시크릿 값 (포맷 후 임시 백업용, 회전 후 삭제 권장)
