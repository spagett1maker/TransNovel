import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  PageBreak,
} from "docx";
import archiver from "archiver";
import { PassThrough } from "stream";

export type DownloadFormat = "txt" | "docx";
export type ContentType = "translated" | "edited";

interface ChapterContent {
  number: number;
  title: string | null;
  content: string;
}

/**
 * TXT 파일 생성
 */
export function generateTXT(
  chapters: ChapterContent[],
  workTitle: string
): Buffer {
  const lines: string[] = [];

  // 작품 제목
  lines.push(`『${workTitle}』`);
  lines.push("");
  lines.push("=".repeat(50));
  lines.push("");

  for (const chapter of chapters) {
    // 챕터 헤더
    const chapterTitle = chapter.title
      ? `${chapter.number}화 - ${chapter.title}`
      : `${chapter.number}화`;
    lines.push(chapterTitle);
    lines.push("-".repeat(30));
    lines.push("");

    // 본문
    lines.push(chapter.content);
    lines.push("");
    lines.push("");
  }

  return Buffer.from(lines.join("\n"), "utf-8");
}

/**
 * DOCX 파일 생성
 */
export async function generateDOCX(
  chapters: ChapterContent[],
  workTitle: string
): Promise<Buffer> {
  const children: Paragraph[] = [];

  // 작품 제목
  children.push(
    new Paragraph({
      text: workTitle,
      heading: HeadingLevel.TITLE,
      spacing: { after: 400 },
    })
  );

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];

    // 페이지 구분 (첫 챕터 제외)
    if (i > 0) {
      children.push(
        new Paragraph({
          children: [new PageBreak()],
        })
      );
    }

    // 챕터 제목
    const chapterTitle = chapter.title
      ? `${chapter.number}화 - ${chapter.title}`
      : `${chapter.number}화`;

    children.push(
      new Paragraph({
        text: chapterTitle,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 200, after: 200 },
      })
    );

    // 본문 (문단별로 분리)
    const paragraphs = chapter.content.split(/\n\n+/);
    for (const para of paragraphs) {
      if (para.trim()) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: para.trim() })],
            spacing: { after: 200 },
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

/**
 * ZIP 파일 생성
 */
export async function generateZIP(
  files: Array<{ name: string; content: Buffer }>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    const passThrough = new PassThrough();

    passThrough.on("data", (chunk) => chunks.push(chunk));
    passThrough.on("end", () => resolve(Buffer.concat(chunks)));
    passThrough.on("error", reject);

    archive.pipe(passThrough);

    for (const file of files) {
      archive.append(file.content, { name: file.name });
    }

    archive.finalize();
  });
}

/**
 * 파일명 생성
 */
export function generateFilename(
  workTitle: string,
  chapterNumber?: number,
  format: DownloadFormat = "txt"
): string {
  // 파일명에서 사용할 수 없는 문자 제거
  const safeTitle = workTitle.replace(/[/\\?%*:|"<>]/g, "_");

  if (chapterNumber !== undefined) {
    return `${safeTitle}_제${chapterNumber}화.${format}`;
  }

  return `${safeTitle}_번역본.${format}`;
}

/**
 * MIME 타입 반환
 */
export function getMimeType(format: DownloadFormat): string {
  switch (format) {
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "txt":
    default:
      return "text/plain; charset=utf-8";
  }
}
