# TransNovel

AI 기반 웹소설 번역 및 교정 협업 플랫폼

## 개요

중국어 원작 웹소설을 한국어로 AI 자동 번역하고, 전문 윤문가가 협업하여 교정하는 올인원 플랫폼.

- **AI 번역**: Google Gemini 기반 문맥 인식 번역 (세팅 바이블 활용)
- **협업 교정**: 트랙 체인지, 인라인 코멘트, 스냅샷 버전 관리
- **마켓플레이스**: 작가-윤문가 매칭, 계약, 리뷰 시스템

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16, React 19, TypeScript |
| 스타일링 | Tailwind CSS 4, Radix UI, Shadcn/ui |
| 에디터 | TipTap 3 (ProseMirror) |
| 백엔드 | Prisma 5, PostgreSQL (Supabase) |
| 인증 | NextAuth.js 4 (JWT) |
| AI | Google Gemini API |
| 배포 | Vercel |

## 시작하기

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env

# DB 마이그레이션
npx prisma migrate dev

# 개발 서버
npm run dev
```

## 스크립트

```bash
npm run dev          # 개발 서버
npm run build        # 프로덕션 빌드
npm run test         # 단위 테스트
npm run test:e2e     # E2E 테스트
npm run lint         # 코드 검사
```

## 문서

- [개발 보고서](./DEV_REPORT.md) - 아키텍처, API, DB 스키마, 보안, 성능
- [서비스 가이드](./SERVICE_GUIDE.md) - 사용자 플로우, 화면별 기능 가이드
