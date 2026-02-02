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
}));

import { GET, POST } from "../route";

describe("GET /api/works", () => {
  beforeEach(() => {
    resetMockDb();
    mockGetServerSession.mockReset();
  });

  it("미인증 시 401을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works");
    const res = await GET(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(401);
  });

  it("AUTHOR는 자기 작품만 조회한다 (200)", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    const works = [buildWork({ authorId: "author-1" })];
    mockDb.work.count.mockResolvedValue(1);
    mockDb.work.findMany.mockResolvedValue(works);

    const req = createRequest("http://localhost:3000/api/works");
    const res = await GET(req);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.works).toHaveLength(1);
    expect(mockDb.work.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { authorId: "author-1" },
      })
    );
  });

  it("EDITOR는 할당된 작품만 조회한다 (200)", async () => {
    mockGetServerSession.mockResolvedValue(sessions.editor);
    mockDb.work.count.mockResolvedValue(0);
    mockDb.work.findMany.mockResolvedValue([]);

    const req = createRequest("http://localhost:3000/api/works");
    const res = await GET(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockDb.work.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { editorId: "editor-1" },
      })
    );
  });

  it("ADMIN은 전체 작품을 조회한다 (200)", async () => {
    mockGetServerSession.mockResolvedValue(sessions.admin);
    mockDb.work.count.mockResolvedValue(0);
    mockDb.work.findMany.mockResolvedValue([]);

    const req = createRequest("http://localhost:3000/api/works");
    const res = await GET(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockDb.work.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      })
    );
  });

  it("limit이 100으로 제한된다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.count.mockResolvedValue(0);
    mockDb.work.findMany.mockResolvedValue([]);

    const req = createRequest("http://localhost:3000/api/works?limit=200");
    const res = await GET(req);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect((body.pagination as Record<string, unknown>).limit).toBe(100);
    expect(mockDb.work.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });

  it("페이지네이션 파라미터를 처리한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.count.mockResolvedValue(100);
    mockDb.work.findMany.mockResolvedValue([]);

    const req = createRequest("http://localhost:3000/api/works?page=2&limit=10");
    const res = await GET(req);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 100,
      totalPages: 10,
    });
    expect(mockDb.work.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      })
    );
  });
});

describe("POST /api/works", () => {
  beforeEach(() => {
    resetMockDb();
    mockGetServerSession.mockReset();
  });

  const validWorkBody = {
    titleKo: "테스트 작품",
    titleOriginal: "Test Work",
    publisher: "출판사",
    ageRating: "ALL",
    synopsis: "이것은 충분히 긴 줄거리입니다. 열 자 이상이어야 합니다.",
    genres: ["판타지"],
    originalStatus: "ONGOING",
    sourceLanguage: "ZH",
    creators: [{ name: "작가", role: "WRITER" }],
  };

  it("미인증 시 401을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works", {
      method: "POST",
      body: validWorkBody,
    });
    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(401);
  });

  it("EDITOR 생성 시도 시 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.editor);

    const req = createRequest("http://localhost:3000/api/works", {
      method: "POST",
      body: validWorkBody,
    });
    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("AUTHOR 정상 생성 시 201을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.user.findUnique.mockResolvedValue({ id: "author-1" });
    const createdWork = buildWork();
    mockDb.work.create.mockResolvedValue(createdWork);

    const req = createRequest("http://localhost:3000/api/works", {
      method: "POST",
      body: validWorkBody,
    });
    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(201);
    expect(mockDb.work.create).toHaveBeenCalled();
  });

  it("잘못된 body 시 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.user.findUnique.mockResolvedValue({ id: "author-1" });

    const req = createRequest("http://localhost:3000/api/works", {
      method: "POST",
      body: { titleKo: "" }, // 필수 필드 누락
    });
    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("DB에 사용자가 없으면 401을 반환한다 (세션 만료)", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.user.findUnique.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works", {
      method: "POST",
      body: validWorkBody,
    });
    const res = await POST(req);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(401);
    expect(body.error).toContain("사용자 정보를 찾을 수 없습니다");
  });

  it("ADMIN도 작품을 생성할 수 있다 (201)", async () => {
    mockGetServerSession.mockResolvedValue(sessions.admin);
    mockDb.user.findUnique.mockResolvedValue({ id: "admin-1" });
    mockDb.work.create.mockResolvedValue(buildWork());

    const req = createRequest("http://localhost:3000/api/works", {
      method: "POST",
      body: validWorkBody,
    });
    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(201);
  });
});
