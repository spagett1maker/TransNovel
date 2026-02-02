import { NextResponse } from "next/server";
import { hash, compare } from "bcryptjs";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/me — 현재 사용자 정보
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      image: true,
      createdAt: true,
      password: false,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Check if user has password (for showing change password form)
  const hasPassword = await db.user.findUnique({
    where: { id: session.user.id },
    select: { password: true },
  });

  return NextResponse.json({
    user: {
      ...user,
      hasPassword: !!hasPassword?.password,
    },
  });
}

// PATCH /api/me — 사용자 정보 수정
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await req.json();
  const { name, currentPassword, newPassword } = body;

  const updateData: { name?: string; password?: string } = {};

  // 이름 변경
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "이름은 2자 이상이어야 합니다." },
        { status: 400 }
      );
    }
    updateData.name = name.trim();
  }

  // 비밀번호 변경
  if (newPassword) {
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json(
        { error: "비밀번호는 8자 이상이어야 합니다." },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { password: true },
    });

    // 기존 비밀번호가 있으면 확인 필요
    if (user?.password) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "현재 비밀번호를 입력해주세요." },
          { status: 400 }
        );
      }
      const valid = await compare(currentPassword, user.password);
      if (!valid) {
        return NextResponse.json(
          { error: "현재 비밀번호가 일치하지 않습니다." },
          { status: 400 }
        );
      }
    }

    updateData.password = await hash(newPassword, 12);
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "변경할 내용이 없습니다." },
      { status: 400 }
    );
  }

  const updated = await db.user.update({
    where: { id: session.user.id },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  return NextResponse.json({ user: updated });
}
