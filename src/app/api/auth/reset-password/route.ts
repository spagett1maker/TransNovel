import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  verifyPasswordResetToken,
  deletePasswordResetToken,
} from "@/lib/tokens";

const resetPasswordSchema = z.object({
  token: z.string().min(1, "토큰이 필요합니다."),
  password: z
    .string()
    .min(8, "비밀번호는 8자 이상이어야 합니다.")
    .regex(
      /^(?=.*[a-zA-Z])(?=.*\d)/,
      "비밀번호는 영문과 숫자를 포함해야 합니다."
    ),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = resetPasswordSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { token, password } = result.data;

    // 토큰 검증
    const email = await verifyPasswordResetToken(token);

    if (!email) {
      return NextResponse.json(
        { error: "유효하지 않거나 만료된 토큰입니다." },
        { status: 400 }
      );
    }

    // 비밀번호 해시
    const hashedPassword = await hash(password, 12);

    // 비밀번호 업데이트
    await db.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    // 사용한 토큰 삭제
    await deletePasswordResetToken(token);

    return NextResponse.json({
      message: "비밀번호가 변경되었습니다.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "비밀번호 변경에 실패했습니다." },
      { status: 500 }
    );
  }
}
