import { ChapterStatus, SnapshotType, UserRole } from "@prisma/client";
import { revalidateTag } from "next/cache";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db, dbTransaction } from "@/lib/db";
import { canAccessWork, canApplyTrackChanges, canEditChapterContent, canEditWork, canTransitionStatus, getStatusDisplayName } from "@/lib/permissions";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; num: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, num } = await params;
    const number = parseInt(num, 10);

    // NaN 또는 유효하지 않은 숫자 체크
    if (Number.isNaN(number) || number < 0) {
      return NextResponse.json({ error: "유효하지 않은 회차 번호입니다." }, { status: 400 });
    }

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      select: { authorId: true, editorId: true },
    });

    if (!work) {
      return NextResponse.json({ error: "작품을 찾을 수 없습니다." }, { status: 404 });
    }

    const userRole = session.user.role as UserRole;
    if (!canAccessWork(session.user.id, userRole, work)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const chapter = await db.chapter.findUnique({
      where: {
        workId_number: { workId: id, number },
      },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: "회차를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(chapter);
  } catch (error) {
    console.error("Failed to fetch chapter:", error);
    return NextResponse.json(
      { error: "회차 정보를 불러오는데 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; num: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, num } = await params;
    const number = parseInt(num, 10);

    // NaN 또는 유효하지 않은 숫자 체크
    if (Number.isNaN(number) || number < 0) {
      return NextResponse.json({ error: "유효하지 않은 회차 번호입니다." }, { status: 400 });
    }

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      select: { authorId: true, editorId: true },
    });

    if (!work) {
      return NextResponse.json({ error: "작품을 찾을 수 없습니다." }, { status: 404 });
    }

    const userRole = session.user.role as UserRole;
    if (!canAccessWork(session.user.id, userRole, work)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 윤문가인 경우 계약 범위 내 챕터만 편집 가능
    if (userRole === UserRole.EDITOR) {
      const contract = await db.projectContract.findFirst({
        where: { workId: id, editorId: session.user.id, isActive: true },
        select: { chapterStart: true, chapterEnd: true },
      });
      if (!contract) {
        return NextResponse.json({ error: "이 작품에 대한 활성 계약이 없습니다." }, { status: 403 });
      }
      if (
        (contract.chapterStart && number < contract.chapterStart) ||
        (contract.chapterEnd && number > contract.chapterEnd)
      ) {
        return NextResponse.json(
          { error: `계약 범위(${contract.chapterStart}~${contract.chapterEnd}화) 밖의 회차입니다.` },
          { status: 403 }
        );
      }
    }

    const body = await req.json();

    // 현재 회차 정보 가져오기
    const currentChapter = await db.chapter.findUnique({
      where: { workId_number: { workId: id, number } },
    });

    if (!currentChapter) {
      return NextResponse.json({ error: "회차를 찾을 수 없습니다." }, { status: 404 });
    }

    // 수정 추적 적용: 작가가 수락/거절 결과를 반영하는 경우
    if (body.trackChangesResult !== undefined) {
      if (!canApplyTrackChanges(userRole, currentChapter.status)) {
        return NextResponse.json(
          { error: "현재 상태에서는 수정 추적을 적용할 권한이 없습니다." },
          { status: 403 }
        );
      }
      // trackChangesResult를 editedContent로 매핑
      body.editedContent = body.trackChangesResult;
    }

    // 콘텐츠 편집 권한 체크: 작가는 윤문 진행 중/완료/승인 상태에서 편집 불가
    // (trackChangesResult로 인한 editedContent는 위에서 별도 권한 체크 완료)
    if (body.editedContent !== undefined && !body.trackChangesResult && !canEditChapterContent(userRole, currentChapter.status)) {
      return NextResponse.json(
        { error: "현재 상태에서는 콘텐츠를 편집할 권한이 없습니다." },
        { status: 403 }
      );
    }

    // 낙관적 잠금: 클라이언트가 보낸 updatedAt과 현재 DB 값 비교
    if (body._updatedAt) {
      const clientUpdatedAt = new Date(body._updatedAt).getTime();
      const dbUpdatedAt = currentChapter.updatedAt.getTime();
      if (clientUpdatedAt < dbUpdatedAt) {
        return NextResponse.json(
          { error: "다른 사용자가 이미 수정했습니다. 페이지를 새로고침한 후 다시 시도해주세요.", code: "CONFLICT" },
          { status: 409 }
        );
      }
    }

    // 상태 변경 요청이 있는 경우 권한 검증
    if (body.status && body.status !== currentChapter.status) {
      const newStatus = body.status as ChapterStatus;
      if (!canTransitionStatus(userRole, currentChapter.status, newStatus)) {
        return NextResponse.json(
          { error: `${currentChapter.status}에서 ${newStatus}로 상태를 변경할 권한이 없습니다.` },
          { status: 403 }
        );
      }
    }

    // 업데이트할 데이터 구성
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.originalContent !== undefined) {
      updateData.originalContent = body.originalContent;
      updateData.wordCount = body.originalContent.length;
    }
    if (body.translatedContent !== undefined) updateData.translatedContent = body.translatedContent;
    if (body.editedContent !== undefined) updateData.editedContent = body.editedContent;
    if (body.status !== undefined) updateData.status = body.status;

    // 자동 전환: 윤문가가 TRANSLATED 챕터에서 편집 내용만 저장하면 자동으로 REVIEWING
    let effectiveStatus: ChapterStatus | null = body.status ?? null;
    if (
      userRole === UserRole.EDITOR &&
      body.editedContent !== undefined &&
      !body.status &&
      currentChapter.status === ChapterStatus.TRANSLATED
    ) {
      updateData.status = ChapterStatus.REVIEWING;
      effectiveStatus = ChapterStatus.REVIEWING;
    }

    const isStatusChange = effectiveStatus && effectiveStatus !== currentChapter.status;

    // 내용 변경 여부 확인 (변경 없으면 스냅샷 스킵)
    const contentChanged =
      (body.editedContent !== undefined && body.editedContent !== currentChapter.editedContent) ||
      (body.translatedContent !== undefined && body.translatedContent !== currentChapter.translatedContent) ||
      (body.originalContent !== undefined && body.originalContent !== currentChapter.originalContent);

    const shouldSnapshot = isStatusChange || contentChanged;

    // 트랜잭션으로 스냅샷 + 업데이트 + 활동기록 + 자동완료를 원자적으로 실행
    const chapter = await dbTransaction(async (tx) => {
      // 1. 스냅샷 생성 (내용 변경 또는 상태 변경 시에만)
      if (shouldSnapshot) {
        await tx.chapterSnapshot.create({
          data: {
            chapterId: currentChapter.id,
            authorId: session.user.id,
            name: isStatusChange
              ? `${getStatusDisplayName(currentChapter.status)} → ${getStatusDisplayName(effectiveStatus!)}`
              : `저장 시점 백업`,
            description: isStatusChange ? `상태 변경 전 자동 저장` : `편집 내용 자동 저장`,
            snapshotType: isStatusChange ? SnapshotType.STATUS_CHANGE : SnapshotType.AUTO_SAVE,
            // 원문이 변경된 경우에만 originalContent 저장, 아니면 빈 문자열 (Chapter 테이블에서 항상 접근 가능)
            originalContent: body.originalContent !== undefined ? currentChapter.originalContent : "",
            translatedContent: currentChapter.translatedContent,
            editedContent: currentChapter.editedContent,
            status: currentChapter.status,
          },
        });

        // AUTO_SAVE 스냅샷 10개 제한 (STATUS_CHANGE, MANUAL은 보존)
        if (!isStatusChange) {
          const oldSnapshots = await tx.chapterSnapshot.findMany({
            where: {
              chapterId: currentChapter.id,
              snapshotType: SnapshotType.AUTO_SAVE,
            },
            orderBy: { createdAt: "desc" },
            skip: 10,
            select: { id: true },
          });

          if (oldSnapshots.length > 0) {
            await tx.chapterSnapshot.deleteMany({
              where: { id: { in: oldSnapshots.map((s) => s.id) } },
            });
          }
        }
      }

      // 2. 챕터 업데이트
      const updated = await tx.chapter.update({
        where: { workId_number: { workId: id, number } },
        data: updateData,
      });

      // 3. 활동 기록
      if (isStatusChange) {
        await tx.chapterActivity.create({
          data: {
            chapterId: currentChapter.id,
            actorId: session.user.id,
            activityType: "STATUS_CHANGED",
            metadata: {
              fromStatus: currentChapter.status,
              toStatus: effectiveStatus,
            },
            summary: `${session.user.name}님이 상태를 ${getStatusDisplayName(currentChapter.status)}에서 ${getStatusDisplayName(effectiveStatus!)}(으)로 변경했습니다`,
          },
        });
      } else {
        await tx.chapterActivity.create({
          data: {
            chapterId: currentChapter.id,
            actorId: session.user.id,
            activityType: "EDIT_MADE",
            metadata: {},
            summary: `${session.user.name}님이 편집 내용을 저장했습니다`,
          },
        });
      }

      // 4. 자동 완료: 활성 계약 범위 내 모든 챕터가 APPROVED이면 작품 상태를 COMPLETED로 전환
      if (effectiveStatus === ChapterStatus.APPROVED) {
        const activeContract = await tx.projectContract.findFirst({
          where: { workId: id, isActive: true },
          select: { chapterStart: true, chapterEnd: true },
        });

        // 계약이 있으면 계약 범위 내 챕터만, 없으면 전체 챕터 확인
        const chapterFilter = activeContract?.chapterStart || activeContract?.chapterEnd
          ? {
              workId: id,
              number: {
                ...(activeContract.chapterStart ? { gte: activeContract.chapterStart } : {}),
                ...(activeContract.chapterEnd ? { lte: activeContract.chapterEnd } : {}),
              },
            }
          : { workId: id };

        const relevantChapters = await tx.chapter.findMany({
          where: chapterFilter,
          select: { status: true },
        });

        const allApproved =
          relevantChapters.length > 0 &&
          relevantChapters.every((ch) => ch.status === ChapterStatus.APPROVED);

        // 활성 계약이 있으면 자동 완료 스킵 (계약 완료 플로우에서 에디터 해제/통계 갱신과 함께 처리)
        // 계약이 없는 경우에만 자동으로 COMPLETED 전환
        if (allApproved && !activeContract) {
          await tx.work.update({
            where: { id },
            data: { status: "COMPLETED" },
          });
        }
      }

      return updated;
    });

    // 상태 변경 시 캐시 무효화
    if (isStatusChange) {
      revalidateTag(`user-${session.user.id}-stats`, { expire: 0 });
      // 작가/에디터 양쪽 모두 무효화
      if (work.authorId) revalidateTag(`user-${work.authorId}-stats`, { expire: 0 });
      if (work.editorId && work.editorId !== session.user.id) {
        revalidateTag(`user-${work.editorId}-stats`, { expire: 0 });
      }
    }

    return NextResponse.json(chapter);
  } catch (error) {
    console.error("Failed to update chapter:", error);
    return NextResponse.json(
      { error: "회차 수정에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; num: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, num } = await params;
    const number = parseInt(num, 10);

    // NaN 또는 유효하지 않은 숫자 체크
    if (Number.isNaN(number) || number < 0) {
      return NextResponse.json({ error: "유효하지 않은 회차 번호입니다." }, { status: 400 });
    }

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!work) {
      return NextResponse.json({ error: "작품을 찾을 수 없습니다." }, { status: 404 });
    }

    const userRole = session.user.role as UserRole;
    if (!canEditWork(session.user.id, userRole, work)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 트랜잭션으로 삭제 + 카운트 업데이트 원자적 실행
    await dbTransaction(async (tx) => {
      await tx.chapter.delete({
        where: {
          workId_number: { workId: id, number },
        },
      });

      const totalChapters = await tx.chapter.count({ where: { workId: id } });
      await tx.work.update({
        where: { id },
        data: { totalChapters },
      });
    });

    revalidateTag(`user-${session.user.id}-stats`, { expire: 0 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete chapter:", error);
    return NextResponse.json(
      { error: "회차 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}
