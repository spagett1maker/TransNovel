import { hash } from "bcryptjs";
import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { registerSchema } from "@/lib/validations/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // role은 스키마 검증만 하고, 실제로는 AUTHOR로 고정 (보안상 ADMIN 지정 차단)
    const { name, email, password } = registerSchema.parse(body);

    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "이미 등록된 이메일입니다." },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await hash(password, 12);

    // Create user - 항상 AUTHOR로 생성 (관리자 권한은 DB에서 직접 부여)
    const user = await db.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: UserRole.AUTHOR,
      },
    });

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "회원가입 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
