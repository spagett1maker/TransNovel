import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    // EDITOR 역할을 가진 사용자 목록 조회
    const editors = await db.user.findMany({
      where: { role: UserRole.EDITOR },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(editors);
  } catch (error) {
    console.error("Failed to fetch editors:", error);
    return NextResponse.json(
      { error: "윤문가 목록을 불러오는데 실패했습니다." },
      { status: 500 }
    );
  }
}
