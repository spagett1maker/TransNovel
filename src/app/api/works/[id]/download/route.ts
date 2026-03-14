import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  generateTXT,
  generateDOCX,
  generateEPUB,
  generateZIP,
  type DownloadFormat,
  type ContentType,
  type ChapterContent,
} from "@/lib/download";
import { canAccessWork } from "@/lib/permissions";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: workId } = await params;

    // URL 파라미터
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") || "txt") as DownloadFormat;
    const chaptersParam = searchParams.get("chapters") || "all";
    const contentType = (searchParams.get("content") || "edited") as ContentType;

    // 작품 조회 (ePub 메타데이터 포함)
    const work = await db.work.findUnique({
      where: { id: workId },
      select: {
        id: true,
        titleKo: true,
        authorId: true,
        editorId: true,
        coverImage: true,
        synopsis: true,
        creators: {
          select: { name: true, role: true },
        },
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

    // 다운로드 최대 챕터 수 제한 (OOM 방지)
    const MAX_DOWNLOAD_CHAPTERS = 1000;

    // 메모리 최적화: 메타데이터만 먼저 조회
    const chapterMeta = await db.chapter.findMany({
      where: {
        workId,
        ...(chapterNumbers ? { number: { in: chapterNumbers } } : {}),
        status: { notIn: ["PENDING", "TRANSLATING"] },
      },
      select: {
        id: true,
        number: true,
        title: true,
        translatedTitle: true,
      },
      orderBy: { number: "asc" },
    });

    if (chapterMeta.length > MAX_DOWNLOAD_CHAPTERS) {
      return NextResponse.json(
        { error: `한 번에 최대 ${MAX_DOWNLOAD_CHAPTERS}개 회차까지 다운로드할 수 있습니다. 범위를 나눠서 다운로드해주세요.` },
        { status: 400 }
      );
    }

    if (chapterMeta.length === 0) {
      return NextResponse.json(
        { error: "다운로드할 수 있는 번역본이 없습니다." },
        { status: 400 }
      );
    }

    // 파일명에서 사용할 수 없는 문자 제거
    const safeTitle = work.titleKo.replace(/[/\\?%*:|"<>]/g, "_");

    // ePub: 항상 단일 파일 (챕터 수 무관)
    if (format === "epub") {
      const chapterContents = await db.chapter.findMany({
        where: { id: { in: chapterMeta.map((m) => m.id) } },
        select: { id: true, translatedContent: true, editedContent: true },
      });
      const contentMap = new Map(chapterContents.map((ch) => [ch.id, ch]));

      const epubChapters: ChapterContent[] = [];
      for (const meta of chapterMeta) {
        const ch = contentMap.get(meta.id);
        const content = ch
          ? contentType === "edited"
            ? ch.editedContent || ch.translatedContent
            : ch.translatedContent
          : null;
        if (!content) continue;
        epubChapters.push({ number: meta.number, title: meta.translatedTitle || meta.title, content });
      }

      if (epubChapters.length === 0) {
        return NextResponse.json(
          { error: "다운로드할 수 있는 번역본이 없습니다." },
          { status: 400 }
        );
      }

      const authorName =
        work.creators.find((c: { name: string; role: string }) => c.role === "AUTHOR")?.name ||
        work.creators[0]?.name ||
        "Unknown";

      // 커버 이미지 fetch (5초 타임아웃, 5MB 제한)
      let coverImageBuffer: Buffer | undefined;
      let coverImageMimeType: string | undefined;
      if (work.coverImage) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const coverRes = await fetch(work.coverImage, { signal: controller.signal });
          clearTimeout(timeout);
          const contentLength = parseInt(coverRes.headers.get("content-length") || "0", 10);
          if (coverRes.ok && (contentLength === 0 || contentLength < 5 * 1024 * 1024)) {
            const arrayBuf = await coverRes.arrayBuffer();
            if (arrayBuf.byteLength < 5 * 1024 * 1024) {
              coverImageBuffer = Buffer.from(arrayBuf);
              coverImageMimeType = coverRes.headers.get("content-type") || "image/jpeg";
            }
          }
        } catch {
          // 커버 이미지 fetch 실패 — 커버 없이 진행
        }
      }

      const epubBuffer = await generateEPUB(epubChapters, {
        title: work.titleKo,
        author: authorName,
        language: "ko",
        description: work.synopsis || undefined,
        coverImageBuffer,
        coverImageMimeType,
      });

      const epubFilename = `${safeTitle}_번역본.epub`;

      return new Response(new Uint8Array(epubBuffer), {
        headers: {
          "Content-Type": "application/epub+zip",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(epubFilename)}`,
        },
      });
    }

    // 단일 챕터인 경우 단일 파일로
    if (chapterMeta.length === 1) {
      const meta = chapterMeta[0];
      const ch = await db.chapter.findUnique({
        where: { id: meta.id },
        select: { translatedContent: true, editedContent: true },
      });

      const content = ch
        ? contentType === "edited"
          ? ch.editedContent || ch.translatedContent
          : ch.translatedContent
        : null;

      if (!content) {
        return NextResponse.json(
          { error: "다운로드할 수 있는 번역본이 없습니다." },
          { status: 400 }
        );
      }

      const chapter = { number: meta.number, title: meta.translatedTitle || meta.title, content };
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
    // 일괄 조회로 N+1 쿼리 최적화 (200 chaptersLimit → 1 DB 쿼리)
    const chapterContents = await db.chapter.findMany({
      where: { id: { in: chapterMeta.map((m) => m.id) } },
      select: { id: true, translatedContent: true, editedContent: true },
    });
    const contentMap = new Map(chapterContents.map((ch) => [ch.id, ch]));

    const files: Array<{ name: string; content: Buffer }> = [];

    for (const meta of chapterMeta) {
      const ch = contentMap.get(meta.id);

      const content = ch
        ? contentType === "edited"
          ? ch.editedContent || ch.translatedContent
          : ch.translatedContent
        : null;

      if (!content) continue;

      const chapter = { number: meta.number, title: meta.translatedTitle || meta.title, content };
      let buffer: Buffer;
      let ext: string;

      if (format === "docx") {
        buffer = await generateDOCX([chapter], work.titleKo);
        ext = "docx";
      } else {
        buffer = generateTXT([chapter], work.titleKo);
        ext = "txt";
      }

      const chapterLabel = meta.translatedTitle || meta.title;
      const filename = chapterLabel
        ? `${meta.number}화_${chapterLabel.replace(/[/\\?%*:|"<>]/g, "_")}.${ext}`
        : `${meta.number}화.${ext}`;

      files.push({ name: filename, content: buffer });
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "다운로드할 수 있는 번역본이 없습니다." },
        { status: 400 }
      );
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
