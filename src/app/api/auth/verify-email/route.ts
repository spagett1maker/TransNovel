import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyEmailToken, deleteVerificationToken } from "@/lib/tokens";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.redirect(
        new URL("/login?error=invalid-token", req.url)
      );
    }

    // 토큰 검증
    const email = await verifyEmailToken(token);

    if (!email) {
      return NextResponse.redirect(
        new URL("/login?error=expired-token", req.url)
      );
    }

    // 사용자 이메일 인증 업데이트
    await db.user.update({
      where: { email },
      data: { emailVerified: new Date() },
    });

    // 사용한 토큰 삭제
    await deleteVerificationToken(token);

    // 로그인 페이지로 리다이렉트
    return NextResponse.redirect(new URL("/login?verified=true", req.url));
  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.redirect(new URL("/login?error=unknown", req.url));
  }
}
