import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, resetMockDb, mockDbTransaction } from "@/test-utils/mock-db";
import { mockGetServerSession, sessions } from "@/test-utils/mock-auth";
import { buildChapter } from "@/test-utils/factories";
import { createRequest, parseResponse } from "@/test-utils/request-helper";

// Mock 설정
vi.mock("@/lib/db", () => ({
  db: mockDb,
  dbTransaction: (...args: unknown[]) => mockDbTransaction(...args),
}));
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@prisma/client", () => ({
  ChapterStatus: {
    PENDING: "PENDING",
    TRANSLATING: "TRANSLATING",
    TRANSLATED: "TRANSLATED",
    REVIEWING: "REVIEWING",
    EDITED: "EDITED",
    APPROVED: "APPROVED",
  },
}));

import { GET, POST } from "../route";

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/works/[id]/chapters", () => {
  beforeEach(() => {
    resetMockDb();
    mockGetServerSession.mockReset();
  });

  it("미인증 시 401을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters");
    const res = await GET(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(401);
  });

  it("권한 없는 사용자 시 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "other-author" });

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters");
    const res = await GET(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("작품이 없으면 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters");
    const res = await GET(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("all=true 시 limit이 2000까지 허용된다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1" });
    mockDb.chapter.count.mockResolvedValue(0);
    mockDb.chapter.findMany.mockResolvedValue([]);

    const req = createRequest(
      "http://localhost:3000/api/works/work-1/chapters?all=true&limit=1500"
    );
    const res = await GET(req, makeParams("work-1"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect((body.pagination as Record<string, unknown>).limit).toBe(1500);
  });

  it("hasNext/hasPrev 페이지네이션 필드를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1" });
    mockDb.chapter.count.mockResolvedValue(20);
    mockDb.chapter.findMany.mockResolvedValue([]);

    const req = createRequest(
      "http://localhost:3000/api/works/work-1/chapters?page=2&limit=5"
    );
    const res = await GET(req, makeParams("work-1"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    const pagination = body.pagination as Record<string, unknown>;
    expect(pagination.hasNext).toBe(true);
    expect(pagination.hasPrev).toBe(true);
  });

  it("페이지네이션+필터로 챕터를 조회한다 (200)", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1" });

    const chapters = [buildChapter({ number: 1 }), buildChapter({ number: 2 })];
    mockDb.chapter.count.mockResolvedValue(2);
    mockDb.chapter.findMany.mockResolvedValue(chapters);

    const req = createRequest(
      "http://localhost:3000/api/works/work-1/chapters?page=1&limit=10&status=PENDING"
    );
    const res = await GET(req, makeParams("work-1"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.chapters).toHaveLength(2);
    expect(body.pagination).toBeDefined();
    expect((body.pagination as Record<string, unknown>).total).toBe(2);
  });
});

describe("POST /api/works/[id]/chapters", () => {
  beforeEach(() => {
    resetMockDb();
    mockGetServerSession.mockReset();
  });

  it("미인증 POST 시 401을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters", {
      method: "POST",
      body: { chapters: [{ number: 1, content: "내용" }] },
    });
    const res = await POST(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(401);
  });

  it("권한 없는 POST 시 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "other-author" });

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters", {
      method: "POST",
      body: { chapters: [{ number: 1, content: "내용" }] },
    });
    const res = await POST(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("chapters가 배열이 아니면 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1" });

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters", {
      method: "POST",
      body: { chapters: "not-array" },
    });
    const res = await POST(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("빈 배열 시 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1" });

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters", {
      method: "POST",
      body: { chapters: [] },
    });
    const res = await POST(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("정상 upsert 시 201을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1" });
    mockDb.chapter.count.mockResolvedValue(0);
    mockDb.chapter.findMany.mockResolvedValue([]); // 기존 챕터 없음
    mockDb.chapter.createMany.mockResolvedValue({ count: 2 });
    // $transaction은 mock-db에서 callback 방식 처리됨

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters", {
      method: "POST",
      body: {
        chapters: [
          { number: 1, title: "1화", content: "내용 1" },
          { number: 2, title: "2화", content: "내용 2" },
        ],
      },
    });
    const res = await POST(req, makeParams("work-1"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.created).toBe(2);
    expect(body.updated).toBe(0);
  });

  it("기존 챕터가 있으면 업데이트 수를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1" });
    mockDb.chapter.count.mockResolvedValue(1);
    mockDb.chapter.findMany.mockResolvedValue([{ number: 1 }]); // 1화는 이미 존재
    mockDb.chapter.createMany.mockResolvedValue({ count: 1 });
    mockDb.chapter.update.mockResolvedValue({});

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters", {
      method: "POST",
      body: {
        chapters: [
          { number: 1, title: "1화 수정", content: "수정 내용" },
          { number: 2, title: "2화", content: "새 내용" },
        ],
      },
    });
    const res = await POST(req, makeParams("work-1"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.created).toBe(1);
    expect(body.updated).toBe(1);
  });
});
