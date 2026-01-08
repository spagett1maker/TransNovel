import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  generateTXT,
  generateDOCX,
  generateZIP,
  type DownloadFormat,
  type ContentType,
} from "@/lib/download";
import { canAccessWork } from "@/lib/permissions";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: workId } = await params;

    // URL 파라미터
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") || "txt") as DownloadFormat;
    const chaptersParam = searchParams.get("chapters") || "all";
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

    // 챕터 번호 파싱
    let chapterNumbers: number[] | undefined;
    if (chaptersParam !== "all") {
      chapterNumbers = chaptersParam
        .split(",")
        .map((n) => parseInt(n.trim(), 10))
        .filter((n) => !isNaN(n));

      if (chapterNumbers.length === 0) {
        return NextResponse.json(
          { error: "유효하지 않은 회차 번호입니다." },
          { status: 400 }
        );
      }
    }

    // 챕터 조회 (번역 완료된 것만)
    const chapters = await db.chapter.findMany({
      where: {
        workId,
        ...(chapterNumbers ? { number: { in: chapterNumbers } } : {}),
        status: { in: ["TRANSLATED", "EDITED", "APPROVED"] },
      },
      select: {
        number: true,
        title: true,
        translatedContent: true,
        editedContent: true,
      },
      orderBy: { number: "asc" },
    });

    if (chapters.length === 0) {
      return NextResponse.json(
        { error: "다운로드할 수 있는 번역본이 없습니다." },
        { status: 400 }
      );
    }

    // 콘텐츠 준비
    const chapterContents = chapters
      .map((ch) => {
        const content =
          contentType === "edited"
            ? ch.editedContent || ch.translatedContent
            : ch.translatedContent;

        if (!content) return null;

        return {
          number: ch.number,
          title: ch.title,
          content,
        };
      })
      .filter((ch): ch is NonNullable<typeof ch> => ch !== null);

    if (chapterContents.length === 0) {
      return NextResponse.json(
        { error: "다운로드할 수 있는 번역본이 없습니다." },
        { status: 400 }
      );
    }

    // 파일명에서 사용할 수 없는 문자 제거
    const safeTitle = work.titleKo.replace(/[/\\?%*:|"<>]/g, "_");

    // 단일 챕터인 경우 단일 파일로
    if (chapterContents.length === 1) {
      const chapter = chapterContents[0];
      let buffer: Buffer;
      let mimeType: string;
      let filename: string;

      if (format === "docx") {
        buffer = await generateDOCX([chapter], work.titleKo);
        mimeType =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        filename = `${safeTitle}_제${chapter.number}화.docx`;
      } else {
        buffer = generateTXT([chapter], work.titleKo);
        mimeType = "text/plain; charset=utf-8";
        filename = `${safeTitle}_제${chapter.number}화.txt`;
      }

      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }

    // 여러 챕터인 경우 ZIP으로 묶기
    const files: Array<{ name: string; content: Buffer }> = [];

    for (const chapter of chapterContents) {
      let buffer: Buffer;
      let ext: string;

      if (format === "docx") {
        buffer = await generateDOCX([chapter], work.titleKo);
        ext = "docx";
      } else {
        buffer = generateTXT([chapter], work.titleKo);
        ext = "txt";
      }

      const filename = chapter.title
        ? `${chapter.number}화_${chapter.title.replace(/[/\\?%*:|"<>]/g, "_")}.${ext}`
        : `${chapter.number}화.${ext}`;

      files.push({ name: filename, content: buffer });
    }

    const zipBuffer = await generateZIP(files);
    const zipFilename = `${safeTitle}_번역본.zip`;

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(zipFilename)}`,
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
