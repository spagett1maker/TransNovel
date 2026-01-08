import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, generateVerificationEmail } from "@/lib/email";
import { generateVerificationToken } from "@/lib/tokens";

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
      select: { name: true, emailVerified: true },
    });

    // 보안: 사용자가 없어도 같은 응답 반환
    if (!user) {
      return NextResponse.json({
        message: "인증 이메일을 발송했습니다.",
      });
    }

    // 이미 인증된 사용자
    if (user.emailVerified) {
      return NextResponse.json(
        { error: "이미 인증된 이메일입니다." },
        { status: 400 }
      );
    }

    // 토큰 생성 및 이메일 발송
    const token = await generateVerificationToken(email);
    await sendEmail({
      to: email,
      subject: "[TransNovel] 이메일 인증을 완료해주세요",
      html: generateVerificationEmail(token, user.name),
    });

    return NextResponse.json({
      message: "인증 이메일을 발송했습니다.",
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    return NextResponse.json(
      { error: "이메일 발송에 실패했습니다." },
      { status: 500 }
    );
  }
}
