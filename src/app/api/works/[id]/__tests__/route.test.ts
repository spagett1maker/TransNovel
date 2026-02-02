import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "@/test-utils/mock-db";
import { mockGetServerSession, sessions } from "@/test-utils/mock-auth";
import { buildWork } from "@/test-utils/factories";
import { createRequest, parseResponse } from "@/test-utils/request-helper";

// Mock 설정
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
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

import { GET, PATCH, DELETE } from "../route";

// params helper (Next.js 15+ style: params is a Promise)
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/works/[id]", () => {
  beforeEach(() => {
    resetMockDb();
    mockGetServerSession.mockReset();
  });

  it("미인증 시 401을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1");
    const res = await GET(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(401);
  });

  it("없는 작품 시 404를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/nonexistent");
    const res = await GET(req, makeParams("nonexistent"));
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
  });

  it("권한 없는 작품 접근 시 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue(
      buildWork({ authorId: "other-author", editorId: null })
    );

    const req = createRequest("http://localhost:3000/api/works/work-1");
    const res = await GET(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("권한 있는 작품 조회 시 200을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    const work = buildWork({ authorId: "author-1" });
    mockDb.work.findUnique.mockResolvedValue(work);

    const req = createRequest("http://localhost:3000/api/works/work-1");
    const res = await GET(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
  });
});

describe("PATCH /api/works/[id]", () => {
  beforeEach(() => {
    resetMockDb();
    mockGetServerSession.mockReset();
  });

  it("에디터 할당 요청을 처리한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue(buildWork({ authorId: "author-1" }));
    mockDb.work.update.mockResolvedValue(buildWork({ editorId: "editor-1" }));

    const req = createRequest("http://localhost:3000/api/works/work-1", {
      method: "PATCH",
      body: { editorId: "editor-1" },
    });
    const res = await PATCH(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockDb.work.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { editorId: "editor-1" },
      })
    );
  });

  it("활성 계약 시 에디터 해제를 차단한다 (400)", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue(
      buildWork({ authorId: "author-1", editorId: "editor-1" })
    );
    mockDb.projectContract.findFirst.mockResolvedValue({ id: "contract-1" });

    const req = createRequest("http://localhost:3000/api/works/work-1", {
      method: "PATCH",
      body: { editorId: null },
    });
    const res = await PATCH(req, makeParams("work-1"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.error).toContain("계약");
  });

  it("미인증 PATCH 시 401을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1", {
      method: "PATCH",
      body: { editorId: "editor-1" },
    });
    const res = await PATCH(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(401);
  });

  it("없는 작품 PATCH 시 404를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1", {
      method: "PATCH",
      body: { editorId: "editor-1" },
    });
    const res = await PATCH(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
  });

  it("EDITOR가 에디터 할당 시도 시 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.editor);
    mockDb.work.findUnique.mockResolvedValue(buildWork({ authorId: "author-1", editorId: "editor-1" }));

    const req = createRequest("http://localhost:3000/api/works/work-1", {
      method: "PATCH",
      body: { editorId: "editor-2" },
    });
    const res = await PATCH(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("활성 계약 없을 때 에디터 해제를 허용한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue(buildWork({ authorId: "author-1", editorId: "editor-1" }));
    mockDb.projectContract.findFirst.mockResolvedValue(null);
    mockDb.work.update.mockResolvedValue(buildWork({ editorId: null }));

    const req = createRequest("http://localhost:3000/api/works/work-1", {
      method: "PATCH",
      body: { editorId: null },
    });
    const res = await PATCH(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockDb.work.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { editorId: null },
      })
    );
  });

  it("EDITOR가 작품 정보 수정 시 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.editor);
    mockDb.work.findUnique.mockResolvedValue(buildWork({ authorId: "author-1", editorId: "editor-1" }));

    const req = createRequest("http://localhost:3000/api/works/work-1", {
      method: "PATCH",
      body: {
        titleKo: "수정 시도",
        titleOriginal: "Attempt",
        publisher: "출판사",
        ageRating: "ALL",
        synopsis: "이것은 충분히 긴 줄거리입니다. 열 자 이상입니다.",
        genres: ["판타지"],
        originalStatus: "ONGOING",
        sourceLanguage: "ZH",
        creators: [{ name: "작가", role: "WRITER" }],
      },
    });
    const res = await PATCH(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("작품 정보 수정 시 creators를 재생성한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue(buildWork({ authorId: "author-1" }));
    mockDb.creator.deleteMany.mockResolvedValue({});
    mockDb.work.update.mockResolvedValue(buildWork());

    const req = createRequest("http://localhost:3000/api/works/work-1", {
      method: "PATCH",
      body: {
        titleKo: "수정 작품",
        titleOriginal: "Modified Work",
        publisher: "출판사",
        ageRating: "ALL",
        synopsis: "이것은 충분히 긴 수정 줄거리입니다. 열 자 이상입니다.",
        genres: ["로맨스"],
        originalStatus: "ONGOING",
        sourceLanguage: "ZH",
        creators: [{ name: "작가", role: "WRITER" }],
      },
    });
    const res = await PATCH(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockDb.creator.deleteMany).toHaveBeenCalled();
  });
});

describe("DELETE /api/works/[id]", () => {
  beforeEach(() => {
    resetMockDb();
    mockGetServerSession.mockReset();
  });

  it("활성 번역 작업 시 409를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue(buildWork({ authorId: "author-1" }));
    mockDb.activeTranslationJob.findFirst.mockResolvedValue({ id: "job-1" });

    const req = createRequest("http://localhost:3000/api/works/work-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(409);
  });

  it("활성 계약 시 409를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue(buildWork({ authorId: "author-1" }));
    mockDb.activeTranslationJob.findFirst.mockResolvedValue(null);
    mockDb.projectContract.findFirst.mockResolvedValue({ id: "contract-1" });

    const req = createRequest("http://localhost:3000/api/works/work-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(409);
  });

  it("미인증 DELETE 시 401을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(401);
  });

  it("없는 작품 DELETE 시 404를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
  });

  it("권한 없는 DELETE 시 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.editor);
    mockDb.work.findUnique.mockResolvedValue(buildWork({ authorId: "author-1" }));

    const req = createRequest("http://localhost:3000/api/works/work-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("정상 삭제 시 200을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue(buildWork({ authorId: "author-1" }));
    mockDb.activeTranslationJob.findFirst.mockResolvedValue(null);
    mockDb.projectContract.findFirst.mockResolvedValue(null);
    mockDb.work.delete.mockResolvedValue({});

    const req = createRequest("http://localhost:3000/api/works/work-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams("work-1"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});
