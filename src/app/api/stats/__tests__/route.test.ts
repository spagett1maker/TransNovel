import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "@/test-utils/mock-db";
import { mockGetServerSession, sessions } from "@/test-utils/mock-auth";
import { createRequest, parseResponse } from "@/test-utils/request-helper";

// Mock 설정
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@prisma/client", () => ({
  UserRole: { AUTHOR: "AUTHOR", EDITOR: "EDITOR", ADMIN: "ADMIN" },
}));

import { GET } from "../route";

describe("GET /api/stats", () => {
  beforeEach(() => {
    resetMockDb();
    mockGetServerSession.mockReset();
  });

  it("미인증 시 401을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/stats");
    const res = await GET(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(401);
  });

  it("AUTHOR 필터로 통계를 조회한다 (200)", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);

    mockDb.chapter.groupBy.mockResolvedValue([
      { status: "PENDING", _count: 5 },
      { status: "TRANSLATED", _count: 3 },
    ]);
    mockDb.work.findMany.mockResolvedValue([
      {
        id: "w1",
        titleKo: "작품1",
        _count: { chapters: 10 },
        chapters: [
          { status: "PENDING" },
          { status: "TRANSLATED" },
          { status: "EDITED" },
        ],
      },
    ]);
    mockDb.chapter.findMany.mockResolvedValue([
      { status: "TRANSLATED", updatedAt: new Date() },
    ]);
    mockDb.chapter.count
      .mockResolvedValueOnce(10) // totalChapters
      .mockResolvedValueOnce(3); // translatedChapters

    const req = createRequest("http://localhost:3000/api/stats?period=30d");
    const res = await GET(req);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.statusBreakdown).toBeDefined();
    expect(body.workStats).toBeDefined();
    expect(body.timeSeries).toBeDefined();
    expect(body.summary).toBeDefined();

    const summary = body.summary as Record<string, unknown>;
    expect(summary.totalChapters).toBe(10);
    expect(summary.translatedChapters).toBe(3);

    // AUTHOR는 authorId 필터 사용
    expect(mockDb.chapter.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { work: { authorId: "author-1" } },
      })
    );
  });

  it("EDITOR 필터로 통계를 조회한다 (200)", async () => {
    mockGetServerSession.mockResolvedValue(sessions.editor);

    mockDb.chapter.groupBy.mockResolvedValue([]);
    mockDb.work.findMany.mockResolvedValue([]);
    mockDb.chapter.findMany.mockResolvedValue([]);
    mockDb.chapter.count.mockResolvedValue(0);

    const req = createRequest("http://localhost:3000/api/stats");
    const res = await GET(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(200);

    // EDITOR는 editorId 필터 사용
    expect(mockDb.chapter.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { work: { editorId: "editor-1" } },
      })
    );
  });

  it("기간 파라미터를 처리한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);

    mockDb.chapter.groupBy.mockResolvedValue([]);
    mockDb.work.findMany.mockResolvedValue([]);
    mockDb.chapter.findMany.mockResolvedValue([]);
    mockDb.chapter.count.mockResolvedValue(0);

    const req = createRequest("http://localhost:3000/api/stats?period=7d");
    const res = await GET(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
  });

  it("90d 기간 파라미터를 처리한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.chapter.groupBy.mockResolvedValue([]);
    mockDb.work.findMany.mockResolvedValue([]);
    mockDb.chapter.findMany.mockResolvedValue([]);
    mockDb.chapter.count.mockResolvedValue(0);

    const req = createRequest("http://localhost:3000/api/stats?period=90d");
    const res = await GET(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
  });

  it("1y 기간 파라미터를 처리한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.chapter.groupBy.mockResolvedValue([]);
    mockDb.work.findMany.mockResolvedValue([]);
    mockDb.chapter.findMany.mockResolvedValue([]);
    mockDb.chapter.count.mockResolvedValue(0);

    const req = createRequest("http://localhost:3000/api/stats?period=1y");
    const res = await GET(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
  });

  it("잘못된 기간 시 기본값 30d로 처리한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.chapter.groupBy.mockResolvedValue([]);
    mockDb.work.findMany.mockResolvedValue([]);
    mockDb.chapter.findMany.mockResolvedValue([]);
    mockDb.chapter.count.mockResolvedValue(0);

    const req = createRequest("http://localhost:3000/api/stats?period=invalid");
    const res = await GET(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
  });

  it("긴 작품명을 20자로 잘라낸다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.chapter.groupBy.mockResolvedValue([]);
    mockDb.work.findMany.mockResolvedValue([
      {
        id: "w1",
        titleKo: "이것은매우길고긴작품제목입니다스물자이상입니다반드시잘려야합니다",
        _count: { chapters: 5 },
        chapters: [{ status: "TRANSLATED" }],
      },
    ]);
    mockDb.chapter.findMany.mockResolvedValue([]);
    mockDb.chapter.count.mockResolvedValue(0);

    const req = createRequest("http://localhost:3000/api/stats");
    const res = await GET(req);
    const { body } = await parseResponse(res);

    const workStats = body.workStats as Array<Record<string, unknown>>;
    expect(workStats[0].title).toMatch(/\.\.\.$/);
    expect((workStats[0].title as string).length).toBeLessThanOrEqual(23); // 20 + "..."
  });

  it("챕터가 0개인 작품의 completionRate는 0이다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.chapter.groupBy.mockResolvedValue([]);
    mockDb.work.findMany.mockResolvedValue([
      {
        id: "w1",
        titleKo: "빈 작품",
        _count: { chapters: 0 },
        chapters: [],
      },
    ]);
    mockDb.chapter.findMany.mockResolvedValue([]);
    mockDb.chapter.count.mockResolvedValue(0);

    const req = createRequest("http://localhost:3000/api/stats");
    const res = await GET(req);
    const { body } = await parseResponse(res);

    const workStats = body.workStats as Array<Record<string, unknown>>;
    expect(workStats[0].completionRate).toBe(0);
  });

  it("totalChapters가 0이면 summary.completionRate는 0이다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.chapter.groupBy.mockResolvedValue([]);
    mockDb.work.findMany.mockResolvedValue([]);
    mockDb.chapter.findMany.mockResolvedValue([]);
    mockDb.chapter.count.mockResolvedValue(0);

    const req = createRequest("http://localhost:3000/api/stats");
    const res = await GET(req);
    const { body } = await parseResponse(res);

    const summary = body.summary as Record<string, unknown>;
    expect(summary.completionRate).toBe(0);
  });

  it("응답 구조를 검증한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);

    mockDb.chapter.groupBy.mockResolvedValue([
      { status: "PENDING", _count: 2 },
    ]);
    mockDb.work.findMany.mockResolvedValue([]);
    mockDb.chapter.findMany.mockResolvedValue([]);
    mockDb.chapter.count.mockResolvedValue(0);

    const req = createRequest("http://localhost:3000/api/stats");
    const res = await GET(req);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);

    // statusBreakdown에 label이 포함되어야 한다
    const breakdown = body.statusBreakdown as Array<Record<string, unknown>>;
    expect(breakdown[0]).toHaveProperty("status");
    expect(breakdown[0]).toHaveProperty("label");
    expect(breakdown[0]).toHaveProperty("count");

    // summary에 필수 필드
    const summary = body.summary as Record<string, unknown>;
    expect(summary).toHaveProperty("totalChapters");
    expect(summary).toHaveProperty("translatedChapters");
    expect(summary).toHaveProperty("completionRate");
    expect(summary).toHaveProperty("recentActivity");
    expect(summary).toHaveProperty("worksCount");
  });
});
