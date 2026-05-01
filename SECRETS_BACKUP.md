# 🔐 SECRETS BACKUP — 컴퓨터 포맷 후 복원용

> ⚠️ **이 문서는 평문 시크릿을 포함한다.** Public 리포지토리에 의도적으로 올린 백업이며, 새 환경 셋업 직후 **모든 키/비밀번호를 즉시 회전**해야 한다.
>
> 작성일: 2026-05-01
> 회전 마감 권장: **포맷 후 새 컴 셋업 즉시**

---

## ※ AWS / Gemini 키는 이 파일에 없다

이 두 키는 **`LOCAL_SECRETS.md`** (gitignored, 로컬 전용) 에서 별도 관리한다. 포맷 전 USB / iCloud / 1Password에 별도 백업 필수. 또한 과거 커밋에 한 번 노출된 적이 있어 회전 권장.

---

## 0. 회전 체크리스트 (포맷 후 1순위)

새 컴에서 셋업이 끝나는 즉시 아래 키를 전부 다시 발급받고 이 파일은 마지막에 삭제(또는 리포 private 전환).

- [ ] AWS Access Key (IAM `Operator` 사용자) 신규 발급 → 기존 키 비활성/삭제
- [ ] RDS 비밀번호 변경 (`transnovel_admin`)
- [ ] Gemini API 키 (Google AI Studio) 새로 발급
- [ ] NEXTAUTH_SECRET 재생성 (`openssl rand -base64 32`)
- [ ] (사용 시) Resend API 키
- [ ] (사용 시) QStash 토큰
- [ ] Vercel 환경 변수 갱신
- [ ] Lambda 환경 변수 갱신 (Terraform tfvars 수정 후 `terraform apply`)
- [ ] AWS Secrets Manager 항목 갱신 (`transnovel/database`, `transnovel/gemini`)

---

## 1. `.env` (Vercel + 로컬)

```bash
# Database — AWS RDS PostgreSQL
DATABASE_URL=postgresql://transnovel_admin:TPOFZEORd0tFr43SeNLh2qay8UkV0Neg@transnovel-db.ctmoi6mgw62k.ap-northeast-2.rds.amazonaws.com:5432/transnovel?connection_limit=25
DIRECT_URL=postgresql://transnovel_admin:TPOFZEORd0tFr43SeNLh2qay8UkV0Neg@transnovel-db.ctmoi6mgw62k.ap-northeast-2.rds.amazonaws.com:5432/transnovel

# NextAuth.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here-generate-with-openssl-rand-base64-32

# Google OAuth (현재 미사용 — 빈 값)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Google Gemini  ── 값은 LOCAL_SECRETS.md 참조 (gitignored)
GEMINI_API_KEY=<see LOCAL_SECRETS.md>

# Vercel Cron (현재 주석 처리됨, 필요 시 사용)
# CRON_SECRET=PllI21xx8uUFNP2Y78vkAxZpEwMqMWoiN8Emv6DT9yU=

# QStash (레거시, 미사용 — AWS SQS로 마이그레이션 완료)
# USE_QSTASH=true
# QSTASH_URL=https://qstash-eu-central-1.upstash.io
# QSTASH_TOKEN=eyJVc2VySUQiOiI4N2E0MDg1YS03OTgzLTQ3ODktOWU4Ny1mZTQ3NDQwNDI5MWEiLCJQYXNzd29yZCI6IjI3MjVmOTUxZjcwNTRiNTk5ZTk5NzFmNDFmNDdjMTJkIn0=
# QSTASH_CURRENT_SIGNING_KEY=sig_7Mt4yiYovGr6AsDQtEFcNVgF51AF
# QSTASH_NEXT_SIGNING_KEY=sig_5ip5efp5tKt4Vv59m1xmiwXh6fyL

# AWS SQS
USE_AWS_SQS=true
USE_QSTASH=false
AWS_REGION=ap-northeast-2
SQS_TRANSLATION_QUEUE_URL=https://sqs.ap-northeast-2.amazonaws.com/193482297970/transnovel-translation-queue
SQS_BIBLE_QUEUE_URL=https://sqs.ap-northeast-2.amazonaws.com/193482297970/transnovel-bible-queue

# AWS 인증 (IAM 사용자 "Operator") ── 값은 LOCAL_SECRETS.md 참조 (gitignored)
AWS_ACCESS_KEY_ID=<see LOCAL_SECRETS.md>
AWS_SECRET_ACCESS_KEY=<see LOCAL_SECRETS.md>
```

## 2. `.env.local` (로컬 전용 오버라이드)

```bash
# AWS RDS 직접 연결 (프로덕션과 동일 DB)
DATABASE_URL="postgresql://transnovel_admin:TPOFZEORd0tFr43SeNLh2qay8UkV0Neg@transnovel-db.ctmoi6mgw62k.ap-northeast-2.rds.amazonaws.com:5432/transnovel?connection_limit=25"
DIRECT_URL="postgresql://transnovel_admin:TPOFZEORd0tFr43SeNLh2qay8UkV0Neg@transnovel-db.ctmoi6mgw62k.ap-northeast-2.rds.amazonaws.com:5432/transnovel"

USE_AWS_SQS=true
USE_QSTASH=false
AWS_REGION=ap-northeast-2
SQS_TRANSLATION_QUEUE_URL=https://sqs.ap-northeast-2.amazonaws.com/193482297970/transnovel-translation-queue
SQS_BIBLE_QUEUE_URL=https://sqs.ap-northeast-2.amazonaws.com/193482297970/transnovel-bible-queue

# 값은 LOCAL_SECRETS.md 참조 (gitignored)
AWS_ACCESS_KEY_ID=<see LOCAL_SECRETS.md>
AWS_SECRET_ACCESS_KEY=<see LOCAL_SECRETS.md>
```

## 3. `infrastructure/terraform/terraform.tfvars`

```hcl
# Database
db_password = "TPOFZEORd0tFr43SeNLh2qay8UkV0Neg"

# Project settings
project_name = "transnovel"
environment  = "production"
aws_region   = "ap-northeast-2"
```

## 4. `.vercel/project.json` (Vercel 프로젝트 링크)

```json
{
  "projectId": "prj_EJOqY8j2WegzouVvTLZA8oJ9c5DN",
  "orgId": "team_H0noQ4eBKI1wivB8KquKOhvq",
  "projectName": "trans-novel"
}
```

수동 복원 대신 새 컴에서는 그냥 `vercel link`로 다시 연결해도 된다.

---

## 5. AWS 인프라 식별자 (Terraform 출력 / state 참조)

| 항목 | 값 |
|------|-----|
| AWS Account ID | `193482297970` |
| Region | `ap-northeast-2` (서울) |
| RDS Endpoint | `transnovel-db.ctmoi6mgw62k.ap-northeast-2.rds.amazonaws.com:5432` |
| RDS Proxy Endpoint | `transnovel-rds-proxy.proxy-ctmoi6mgw62k.ap-northeast-2.rds.amazonaws.com` |
| DB User | `transnovel_admin` |
| DB Name | `transnovel` |
| Translation Queue | `arn:aws:sqs:ap-northeast-2:193482297970:transnovel-translation-queue` |
| Bible Queue | `arn:aws:sqs:ap-northeast-2:193482297970:transnovel-bible-queue` |
| Translation Lambda | `arn:aws:lambda:ap-northeast-2:193482297970:function:transnovel-translation-worker` |
| Bible Lambda | `arn:aws:lambda:ap-northeast-2:193482297970:function:transnovel-bible-worker` |
| Health Checker Lambda | `arn:aws:lambda:ap-northeast-2:193482297970:function:transnovel-health-checker` |
| Database Secret (Secrets Manager) | `arn:aws:secretsmanager:ap-northeast-2:193482297970:secret:transnovel/database-pB55m6` |
| Gemini Secret (Secrets Manager) | `arn:aws:secretsmanager:ap-northeast-2:193482297970:secret:transnovel/gemini-KISbzG` |
| EventBridge Rules | `transnovel-daily-metrics`, `transnovel-dlq-processor`, `transnovel-health-check`, `transnovel-stale-cleanup` |
| IAM 운영 사용자 | `arn:aws:iam::193482297970:user/Operator` |

terraform.tfstate 원본은 push protection 때문에 안 올렸다. 새 컴에서는 `terraform init` 후 backend가 설정돼 있으면 state를 다시 받아오고, 아니면 AWS 리소스를 import 하거나 백업한 tfstate 파일을 복사해 넣어야 한다.

---

## 6. (참고) Supabase — 현재 비활성

`.env`에 주석으로 남아있는 과거 Supabase URL:
```
postgresql://postgres.bmiavgupksbyebvmcbkw:Sme4593874%25@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

지금은 AWS RDS만 쓰고 있다. 필요해질 때만 다시 살릴 것.

---

## 7. 복원 순서 (포맷 후 새 컴)

```bash
# 1. 리포 클론
git clone https://github.com/spagett1maker/TransNovel.git
cd TransNovel

# 2. .env / .env.local 위 1, 2번 섹션 그대로 붙여넣기
#    (또는 SECRETS_BACKUP.md를 참고해 수동 입력)

# 3. terraform.tfvars 위 3번 섹션 그대로 붙여넣기
#    경로: infrastructure/terraform/terraform.tfvars

# 4. 의존성 설치 + DB 마이그레이션
npm install
npx prisma generate
npx prisma migrate deploy   # (또는 dev — 이미 운영 DB라 deploy)

# 5. Vercel 재연결
npm i -g vercel
vercel link    # 위 projectId/orgId 사용

# 6. Terraform (인프라 변경 작업 시에만)
cd infrastructure/terraform
terraform init
terraform plan
# state 백업이 없으면 import 하거나 새로 apply

# 7. ★ 키 회전 ★ — 이 문서 0번 체크리스트 수행
#    완료 후 이 SECRETS_BACKUP.md 삭제 또는 리포 private 전환
```
