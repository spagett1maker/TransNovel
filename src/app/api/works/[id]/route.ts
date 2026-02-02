import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessWork, canEditWork, canAssignEditor } from "@/lib/permissions";
import { workSchema } from "@/lib/validations/work";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      include: {
        creators: true,
        chapters: {
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            wordCount: true,
          },
          orderBy: { number: "asc" },
        },
        author: {
          select: { id: true, name: true },
        },
        editor: {
          select: { id: true, name: true },
        },
        _count: {
          select: { chapters: true },
        },
      },
    });

    if (!work) {
      return NextResponse.json(
        { error: "작품을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const userRole = session.user.role as UserRole;
    if (!canAccessWork(session.user.id, userRole, work)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    return NextResponse.json(work);
  } catch (error) {
    console.error("Failed to fetch work:", error);
    return NextResponse.json(
      { error: "작품 정보를 불러오는데 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const existingWork = await db.work.findUnique({
      where: { id },
    });

    if (!existingWork) {
      return NextResponse.json(
        { error: "작품을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const userRole = session.user.role as UserRole;
    const body = await req.json();

    // 윤문가 할당 요청인 경우
    if (body.editorId !== undefined) {
      if (!canAssignEditor(session.user.id, userRole, existingWork)) {
        return NextResponse.json(
          { error: "윤문가를 할당할 권한이 없습니다." },
          { status: 403 }
        );
      }

      // 에디터 해제 시 활성 계약이 있으면 차단
      if (!body.editorId) {
        const activeContract = await db.projectContract.findFirst({
          where: { workId: id, isActive: true },
          select: { id: true },
        });
        if (activeContract) {
          return NextResponse.json(
            { error: "진행 중인 계약이 있어 윤문가를 해제할 수 없습니다. 먼저 계약을 완료해주세요." },
            { status: 400 }
          );
        }
      }

      const work = await db.work.update({
        where: { id },
        data: {
          editorId: body.editorId || null,
        },
        include: {
          creators: true,
          editor: {
            select: { id: true, name: true },
          },
        },
      });

      return NextResponse.json(work);
    }

    // 일반 작품 정보 수정
    if (!canEditWork(session.user.id, userRole, existingWork)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const validatedData = workSchema.parse(body);

    // Delete existing creators and recreate
    await db.creator.deleteMany({ where: { workId: id } });

    const work = await db.work.update({
      where: { id },
      data: {
        titleKo: validatedData.titleKo,
        titleOriginal: validatedData.titleOriginal,
        publisher: validatedData.publisher,
        ageRating: validatedData.ageRating,
        synopsis: validatedData.synopsis,
        genres: validatedData.genres,
        // 원작 정보
        originalStatus: validatedData.originalStatus,
        sourceLanguage: validatedData.sourceLanguage,
        expectedChapters: validatedData.expectedChapters || null,
        // 원작 플랫폼
        platformName: validatedData.platformName || null,
        platformUrl: validatedData.platformUrl || null,
        creators: {
          create: validatedData.creators.map((creator) => ({
            name: creator.name,
            role: creator.role,
          })),
        },
      },
      include: {
        creators: true,
      },
    });

    return NextResponse.json(work);
  } catch (error) {
    console.error("Failed to update work:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "작품 수정에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const existingWork = await db.work.findUnique({
      where: { id },
    });

    if (!existingWork) {
      return NextResponse.json(
        { error: "작품을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const userRole = session.user.role as UserRole;
    if (!canEditWork(session.user.id, userRole, existingWork)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 활성 번역 작업 확인 - 진행 중인 작업이 있으면 삭제 차단
    const activeJob = await db.activeTranslationJob.findFirst({
      where: {
        workId: id,
        status: { in: ["PENDING", "IN_PROGRESS", "PAUSED"] },
      },
    });

    if (activeJob) {
      return NextResponse.json(
        { error: "번역 작업이 진행 중인 작품은 삭제할 수 없습니다. 먼저 작업을 취소해주세요." },
        { status: 409 }
      );
    }

    // 활성 계약 확인 - 진행 중인 계약이 있으면 삭제 차단
    const activeContract = await db.projectContract.findFirst({
      where: { workId: id, isActive: true },
    });

    if (activeContract) {
      return NextResponse.json(
        { error: "진행 중인 계약이 있는 작품은 삭제할 수 없습니다. 먼저 계약을 완료해주세요." },
        { status: 409 }
      );
    }

    await db.work.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete work:", error);
    return NextResponse.json(
      { error: "작품 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}
