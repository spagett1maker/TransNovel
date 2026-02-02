import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

// 인증 불필요한 경로
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

const PUBLIC_API_PATHS = [
  "/api/auth",
  "/api/auth/check-email",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 정적 파일, Next.js 내부 경로 건너뛰기
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 공개 API 경로 (NextAuth 등)
  if (PUBLIC_API_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 공개 페이지
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // JWT 토큰 확인
  const token = await getToken({ req });

  // 미인증 사용자 → API는 401, 페이지는 로그인 리다이렉트
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "인증이 필요합니다" },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 어드민 전용 API
  if (pathname.startsWith("/api/admin") && token.role !== "ADMIN") {
    return NextResponse.json(
      { error: "관리자 권한이 필요합니다" },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // 정적 파일과 _next 제외한 모든 경로
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
