import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "@/test-utils/mock-db";
import { mockGetServerSession, sessions } from "@/test-utils/mock-auth";
import { buildChapter, buildWork } from "@/test-utils/factories";

// Mock 설정
vi.mock("@/lib/db", () => ({
  db: mockDb,
}));
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@prisma/client", () => ({
  UserRole: { AUTHOR: "AUTHOR", EDITOR: "EDITOR", ADMIN: "ADMIN" },
  ChapterStatus: {
    PENDING: "PENDING",
    TRANSLATING: "TRANSLATING",
    TRANSLATED: "TRANSLATED",
    REVIEWING: "REVIEWING",
    EDITED: "EDITED",
    APPROVED: "APPROVED",
  },
}));

import { GET } from "../../download/route";

function makeParams(id: string, num: string) {
  return { params: Promise.resolve({ id, num }) };
}

function createRequest(url: string): Request {
  return new Request(url, { method: "GET" });
}

describe("GET /api/works/[id]/chapters/[num]/download", () => {
  beforeEach(() => {
    resetMockDb();
    mockGetServerSession.mockReset();
  });

  it("미인증 시 401을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1/download?format=txt");
    const res = await GET(req, makeParams("work-1", "1"));

    expect(res.status).toBe(401);
  });

  it("유효하지 않은 회차 번호 시 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/abc/download?format=txt");
    const res = await GET(req, makeParams("work-1", "abc"));

    expect(res.status).toBe(400);
  });

  it("작품을 찾을 수 없으면 404를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1/download?format=txt");
    const res = await GET(req, makeParams("work-1", "1"));

    expect(res.status).toBe(404);
  });

  it("권한 없는 접근 시 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({
      id: "work-1",
      titleKo: "테스트 작품",
      authorId: "other-user",
      editorId: null,
    });

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1/download?format=txt");
    const res = await GET(req, makeParams("work-1", "1"));

    expect(res.status).toBe(403);
  });

  it("존재하지 않는 챕터 시 404를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({
      id: "work-1",
      titleKo: "테스트 작품",
      authorId: "author-1",
      editorId: null,
    });
    mockDb.chapter.findUnique.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1/download?format=txt");
    const res = await GET(req, makeParams("work-1", "1"));

    expect(res.status).toBe(404);
  });

  it("번역된 내용이 없으면 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({
      id: "work-1",
      titleKo: "테스트 작품",
      authorId: "author-1",
      editorId: null,
    });
    mockDb.chapter.findUnique.mockResolvedValue(
      buildChapter({
        number: 1,
        translatedContent: null,
        editedContent: null,
        status: "PENDING",
      })
    );

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1/download?format=txt&content=translated");
    const res = await GET(req, makeParams("work-1", "1"));

    expect(res.status).toBe(400);
  });

  it("TXT 형식으로 한글 콘텐츠를 다운로드한다 (UTF-8 BOM 포함)", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({
      id: "work-1",
      titleKo: "무림 전사의 귀환",
      authorId: "author-1",
      editorId: null,
    });
    mockDb.chapter.findUnique.mockResolvedValue(
      buildChapter({
        number: 3,
        title: "제3화",
        translatedTitle: "강호의 새벽",
        translatedContent: "이곳은 무림의 중심, 화산파였다.\n\n검기가 허공을 가르며 새벽빛을 반사했다.",
        editedContent: null,
        status: "TRANSLATED",
      })
    );

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/3/download?format=txt&content=translated");
    const res = await GET(req, makeParams("work-1", "3"));

    expect(res.status).toBe(200);

    // Content-Type 확인
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");

    // Content-Disposition에 한글 파일명이 UTF-8 인코딩으로 포함
    const disposition = res.headers.get("Content-Disposition");
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("filename*=UTF-8''");

    // 본문 확인: UTF-8 BOM + 한글 콘텐츠
    const buffer = Buffer.from(await res.arrayBuffer());
    const text = buffer.toString("utf-8");

    // BOM 확인
    expect(text.charCodeAt(0)).toBe(0xFEFF);

    // 한글 콘텐츠 포함 확인
    expect(text).toContain("무림 전사의 귀환");
    expect(text).toContain("3화 - 강호의 새벽");
    expect(text).toContain("이곳은 무림의 중심, 화산파였다.");
    expect(text).toContain("검기가 허공을 가르며 새벽빛을 반사했다.");
  });

  it("DOCX 형식으로 다운로드한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({
      id: "work-1",
      titleKo: "테스트 작품",
      authorId: "author-1",
      editorId: null,
    });
    mockDb.chapter.findUnique.mockResolvedValue(
      buildChapter({
        number: 1,
        title: "제1화",
        translatedTitle: "시작",
        translatedContent: "번역된 내용입니다.",
        editedContent: "윤문된 내용입니다.",
        status: "EDITED",
      })
    );

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1/download?format=docx&content=edited");
    const res = await GET(req, makeParams("work-1", "1"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    const buffer = Buffer.from(await res.arrayBuffer());
    // DOCX는 ZIP 형식 → PK 시그니처 확인
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'
  });

  it("EPUB 형식으로 다운로드한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({
      id: "work-1",
      titleKo: "테스트 작품",
      authorId: "author-1",
      editorId: null,
    });
    mockDb.chapter.findUnique.mockResolvedValue(
      buildChapter({
        number: 5,
        title: "제5화",
        translatedTitle: "한글 제목",
        translatedContent: "<p>HTML 형식의 한글 본문입니다.</p><p>두 번째 문단입니다.</p>",
        editedContent: null,
        status: "TRANSLATED",
      })
    );

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/5/download?format=epub&content=translated");
    const res = await GET(req, makeParams("work-1", "5"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/epub+zip");

    const buffer = Buffer.from(await res.arrayBuffer());
    // EPUB은 ZIP 형식 → PK 시그니처 확인
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("content=edited일 때 editedContent를 우선 사용한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({
      id: "work-1",
      titleKo: "테스트 작품",
      authorId: "author-1",
      editorId: null,
    });
    mockDb.chapter.findUnique.mockResolvedValue(
      buildChapter({
        number: 1,
        title: "제1화",
        translatedTitle: null,
        translatedContent: "AI 번역본",
        editedContent: "윤문본 콘텐츠",
        status: "EDITED",
      })
    );

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1/download?format=txt&content=edited");
    const res = await GET(req, makeParams("work-1", "1"));

    expect(res.status).toBe(200);
    const buffer = Buffer.from(await res.arrayBuffer());
    const text = buffer.toString("utf-8");

    expect(text).toContain("윤문본 콘텐츠");
    expect(text).not.toContain("AI 번역본");
  });

  it("content=edited이지만 editedContent가 없으면 translatedContent로 fallback", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({
      id: "work-1",
      titleKo: "테스트 작품",
      authorId: "author-1",
      editorId: null,
    });
    mockDb.chapter.findUnique.mockResolvedValue(
      buildChapter({
        number: 1,
        title: "제1화",
        translatedTitle: null,
        translatedContent: "AI 번역본 콘텐츠",
        editedContent: null,
        status: "TRANSLATED",
      })
    );

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1/download?format=txt&content=edited");
    const res = await GET(req, makeParams("work-1", "1"));

    expect(res.status).toBe(200);
    const buffer = Buffer.from(await res.arrayBuffer());
    const text = buffer.toString("utf-8");

    expect(text).toContain("AI 번역본 콘텐츠");
  });

  it("파일명에 회차 번호가 올바르게 포함된다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({
      id: "work-1",
      titleKo: "불꽃 검사",
      authorId: "author-1",
      editorId: null,
    });
    mockDb.chapter.findUnique.mockResolvedValue(
      buildChapter({
        number: 42,
        translatedTitle: "폭풍의 시작",
        translatedContent: "내용",
        status: "TRANSLATED",
      })
    );

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/42/download?format=txt");
    const res = await GET(req, makeParams("work-1", "42"));

    expect(res.status).toBe(200);
    const disposition = res.headers.get("Content-Disposition")!;
    const filename = decodeURIComponent(disposition.match(/UTF-8''(.+)/)?.[1] || "");

    expect(filename).toContain("불꽃 검사");
    expect(filename).toContain("제42화");
    expect(filename).toMatch(/\.txt$/);
  });
});
