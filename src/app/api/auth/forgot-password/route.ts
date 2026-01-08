import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, generatePasswordResetEmail } from "@/lib/email";
import { generatePasswordResetToken } from "@/lib/tokens";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: "이메일이 필요합니다." },
        { status: 400 }
      );
    }

    // 사용자 조회
    const user = await db.user.findUnique({
      where: { email },
      select: { name: true, password: true },
    });

    // 보안: 사용자가 없어도 같은 응답 반환 (이메일 열거 방지)
    if (!user) {
      return NextResponse.json({
        message: "비밀번호 재설정 이메일을 발송했습니다.",
      });
    }

    // OAuth 사용자 (비밀번호 없음)
    if (!user.password) {
      return NextResponse.json({
        message: "비밀번호 재설정 이메일을 발송했습니다.",
      });
    }

    // 토큰 생성 및 이메일 발송
    const token = await generatePasswordResetToken(email);
    await sendEmail({
      to: email,
      subject: "[TransNovel] 비밀번호 재설정",
      html: generatePasswordResetEmail(token, user.name),
    });

    return NextResponse.json({
      message: "비밀번호 재설정 이메일을 발송했습니다.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "이메일 발송에 실패했습니다." },
      { status: 500 }
    );
  }
}
