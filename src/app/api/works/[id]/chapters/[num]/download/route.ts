import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  generateTXT,
  generateDOCX,
  generateFilename,
  getMimeType,
  type DownloadFormat,
  type ContentType,
} from "@/lib/download";
import { canAccessWork } from "@/lib/permissions";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; num: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: workId, num } = await params;
    const chapterNumber = parseInt(num, 10);

    if (isNaN(chapterNumber)) {
      return NextResponse.json(
        { error: "유효하지 않은 회차 번호입니다." },
        { status: 400 }
      );
    }

    // URL 파라미터
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") || "txt") as DownloadFormat;
    const contentType = (searchParams.get("content") || "edited") as ContentType;

    // 작품 조회
    const work = await db.work.findUnique({
      where: { id: workId },
      select: {
        id: true,
        titleKo: true,
        authorId: true,
        editorId: true,
      },
    });

    if (!work) {
      return NextResponse.json(
        { error: "작품을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 권한 확인
    if (
      !canAccessWork(
        session.user.id,
        session.user.role as UserRole,
        { authorId: work.authorId, editorId: work.editorId }
      )
    ) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 챕터 조회
    const chapter = await db.chapter.findUnique({
      where: {
        workId_number: {
          workId,
          number: chapterNumber,
        },
      },
      select: {
        number: true,
        title: true,
        translatedContent: true,
        editedContent: true,
        status: true,
      },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: "회차를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 번역된 콘텐츠 확인
    const content =
      contentType === "edited"
        ? chapter.editedContent || chapter.translatedContent
        : chapter.translatedContent;

    if (!content) {
      return NextResponse.json(
        { error: "번역된 내용이 없습니다." },
        { status: 400 }
      );
    }

    // 파일 생성
    const chapterData = {
      number: chapter.number,
      title: chapter.title,
      content,
    };

    let buffer: Buffer;
    if (format === "docx") {
      buffer = await generateDOCX([chapterData], work.titleKo);
    } else {
      buffer = generateTXT([chapterData], work.titleKo);
    }

    const filename = generateFilename(work.titleKo, chapterNumber, format);
    const mimeType = getMimeType(format);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "다운로드 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
