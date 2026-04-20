import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: workId } = await params;

    const work = await db.work.findUnique({
      where: { id: workId },
      select: { authorId: true },
    });

    if (!work) {
      return NextResponse.json(
        { error: "작품을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 작성자만 일괄 삭제 가능
    if (work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const body = await req.json();
    const { chapterNumbers } = body;

    if (!Array.isArray(chapterNumbers) || chapterNumbers.length === 0) {
      return NextResponse.json(
        { error: "삭제할 회차 번호를 지정해주세요." },
        { status: 400 }
      );
    }

    // 최대 500개까지 일괄 삭제 허용
    if (chapterNumbers.length > 500) {
      return NextResponse.json(
        { error: "한 번에 최대 500개까지 삭제할 수 있습니다." },
        { status: 400 }
      );
    }

    // 유효성 검증: 모두 정수인지
    const validNumbers = chapterNumbers.filter(
      (n: unknown) => typeof n === "number" && Number.isInteger(n)
    );

    if (validNumbers.length === 0) {
      return NextResponse.json(
        { error: "유효한 회차 번호가 없습니다." },
        { status: 400 }
      );
    }

    // 일괄 삭제 실행
    const result = await db.chapter.deleteMany({
      where: {
        workId,
        number: { in: validNumbers },
      },
    });

    // totalChapters 업데이트
    const remainingCount = await db.chapter.count({ where: { workId } });
    await db.work.update({
      where: { id: workId },
      data: { totalChapters: remainingCount },
    });

    return NextResponse.json({
      success: true,
      deleted: result.count,
      remaining: remainingCount,
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    return NextResponse.json(
      { error: "일괄 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
