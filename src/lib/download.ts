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

export type DownloadFormat = "txt" | "docx" | "epub";
export type ContentType = "translated" | "edited";

export interface ChapterContent {
  number: number;
  title: string | null;
  content: string;
}

export interface EPUBMetadata {
  title: string;
  author: string;
  language: string;
  description?: string;
  coverImageBuffer?: Buffer;
  coverImageMimeType?: string;
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

// ============================================
// ePub 생성
// ============================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isHtmlContent(content: string): boolean {
  return /<(?:p|br|div|span|h[1-6]|em|strong|ul|ol|li)\b/i.test(content);
}

function htmlToXhtml(html: string): string {
  return html
    // <br> → <br/> (XHTML self-closing)
    .replace(/<br\s*\/?>/gi, "<br/>")
    // 빈 <p><br/></p> → 빈 줄 (TipTap 빈 줄 패턴)
    .replace(/<p><br\/><\/p>/gi, "<p>\u00A0</p>")
    // <p>...</p> 태그 유지, 들여쓰기 추가
    .replace(/<p>/gi, "    <p>")
    .replace(/<\/p>/gi, "</p>\n")
    // 나머지 태그(strong, em 등)는 그대로 통과
    .trim();
}

function contentToXhtml(content: string): string {
  if (isHtmlContent(content)) {
    return htmlToXhtml(content);
  }

  // plain text: 문단 분리 후 <p> 래핑
  const paragraphs = content.split(/\n\n+/);
  return paragraphs
    .map((p) => p.trim())
    .filter((p) => p)
    .map((p) => `    <p>${escapeXml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function styleCss(): string {
  return `body {
  font-family: serif;
  line-height: 1.8;
  margin: 1em;
  word-break: keep-all;
}
h1 { font-size: 1.5em; margin-bottom: 1em; text-align: center; }
h2 { font-size: 1.2em; margin-top: 1.5em; margin-bottom: 0.8em; }
p { margin: 0.5em 0; text-indent: 1em; }
.title-page { text-align: center; margin-top: 30%; }
.title-page h1 { font-size: 2em; }
.title-page .author { font-size: 1.2em; color: #666; margin-top: 1em; }
.cover-image { max-width: 100%; height: auto; display: block; margin: 0 auto; }`;
}

function titlePageXhtml(
  title: string,
  author: string,
  hasCover: boolean,
  coverFilename: string
): string {
  const coverHtml = hasCover
    ? `<div><img class="cover-image" src="images/${coverFilename}" alt="표지"/></div>\n  `
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko" lang="ko">
<head>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
<div class="title-page">
  ${coverHtml}<h1>${escapeXml(title)}</h1>
  <p class="author">${escapeXml(author)}</p>
</div>
</body>
</html>`;
}

function chapterXhtml(title: string, content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko" lang="ko">
<head>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h2>${escapeXml(title)}</h2>
${contentToXhtml(content)}
</body>
</html>`;
}

function contentOpf(
  bookId: string,
  metadata: EPUBMetadata,
  chapters: ChapterContent[],
  hasCover: boolean,
  coverFilename: string
): string {
  const coverMimeType = coverFilename.endsWith(".png") ? "image/png" : "image/jpeg";
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const manifestItems = [
    `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="style" href="style.css" media-type="text/css"/>`,
    `    <item id="title-page" href="title.xhtml" media-type="application/xhtml+xml"/>`,
  ];

  if (hasCover) {
    manifestItems.push(
      `    <item id="cover-image" href="images/${coverFilename}" media-type="${coverMimeType}" properties="cover-image"/>`
    );
  }

  const spineItems = [`    <itemref idref="title-page"/>`];

  for (const chapter of chapters) {
    const padded = String(chapter.number).padStart(4, "0");
    const id = `chapter-${padded}`;
    manifestItems.push(
      `    <item id="${id}" href="chapter-${padded}.xhtml" media-type="application/xhtml+xml"/>`
    );
    spineItems.push(`    <itemref idref="${id}"/>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(bookId)}</dc:identifier>
    <dc:title>${escapeXml(metadata.title)}</dc:title>
    <dc:creator>${escapeXml(metadata.author)}</dc:creator>
    <dc:language>${metadata.language}</dc:language>
${metadata.description ? `    <dc:description>${escapeXml(metadata.description)}</dc:description>\n` : ""}\
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
${manifestItems.join("\n")}
  </manifest>
  <spine toc="ncx">
${spineItems.join("\n")}
  </spine>
</package>`;
}

function tocNcx(
  bookId: string,
  title: string,
  chapters: ChapterContent[]
): string {
  const navPoints = chapters
    .map((ch, i) => {
      const padded = String(ch.number).padStart(4, "0");
      const label = ch.title ? `${ch.number}화 - ${ch.title}` : `${ch.number}화`;
      return `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(label)}</text></navLabel>
      <content src="chapter-${padded}.xhtml"/>
    </navPoint>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(bookId)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;
}

function navXhtml(chapters: ChapterContent[]): string {
  const items = chapters
    .map((ch) => {
      const padded = String(ch.number).padStart(4, "0");
      const label = ch.title ? `${ch.number}화 - ${ch.title}` : `${ch.number}화`;
      return `      <li><a href="chapter-${padded}.xhtml">${escapeXml(label)}</a></li>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ko" lang="ko">
<head><title>목차</title></head>
<body>
<nav epub:type="toc">
  <h1>목차</h1>
  <ol>
${items}
  </ol>
</nav>
</body>
</html>`;
}

/**
 * ePub 파일 생성
 */
export async function generateEPUB(
  chapters: ChapterContent[],
  metadata: EPUBMetadata
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    const passThrough = new PassThrough();

    passThrough.on("data", (chunk) => chunks.push(chunk));
    passThrough.on("end", () => resolve(Buffer.concat(chunks)));
    passThrough.on("error", reject);

    archive.pipe(passThrough);

    const bookId = `transnovel-${Date.now()}`;

    // 1. mimetype (ePub 스펙: 첫 번째 엔트리, 비압축 필수)
    archive.append("application/epub+zip", {
      name: "mimetype",
      store: true,
    });

    // 2. META-INF/container.xml
    archive.append(containerXml(), { name: "META-INF/container.xml" });

    // 3. CSS
    archive.append(styleCss(), { name: "OEBPS/style.css" });

    // 4. 커버 이미지
    const hasCover = !!metadata.coverImageBuffer;
    const coverFilename = metadata.coverImageMimeType?.includes("png")
      ? "cover.png"
      : "cover.jpg";

    if (hasCover) {
      archive.append(metadata.coverImageBuffer!, {
        name: `OEBPS/images/${coverFilename}`,
      });
    }

    // 5. 타이틀 페이지
    archive.append(
      titlePageXhtml(metadata.title, metadata.author, hasCover, coverFilename),
      { name: "OEBPS/title.xhtml" }
    );

    // 6. 챕터 XHTML
    for (const chapter of chapters) {
      const padded = String(chapter.number).padStart(4, "0");
      const chapterTitle = chapter.title
        ? `${chapter.number}화 - ${chapter.title}`
        : `${chapter.number}화`;

      archive.append(chapterXhtml(chapterTitle, chapter.content), {
        name: `OEBPS/chapter-${padded}.xhtml`,
      });
    }

    // 7. content.opf (매니페스트 + 스파인)
    archive.append(
      contentOpf(bookId, metadata, chapters, hasCover, coverFilename),
      { name: "OEBPS/content.opf" }
    );

    // 8. toc.ncx (EPUB 2 하위호환)
    archive.append(tocNcx(bookId, metadata.title, chapters), {
      name: "OEBPS/toc.ncx",
    });

    // 9. nav.xhtml (EPUB 3 네비게이션)
    archive.append(navXhtml(chapters), { name: "OEBPS/nav.xhtml" });

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
    case "epub":
      return "application/epub+zip";
    case "txt":
    default:
      return "text/plain; charset=utf-8";
  }
}
