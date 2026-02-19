import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "@/test-utils/mock-db";
import { mockGetServerSession, sessions } from "@/test-utils/mock-auth";
import { buildWork, buildChapter } from "@/test-utils/factories";
import { createRequest, parseResponse } from "@/test-utils/request-helper";

// Mock 설정
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@prisma/client", () => ({
  Prisma: { JsonNull: "DbNull" },
  WorkStatus: {
    REGISTERED: "REGISTERED",
    BIBLE_CONFIRMED: "BIBLE_CONFIRMED",
    TRANSLATING: "TRANSLATING",
    TRANSLATED: "TRANSLATED",
  },
}));

// translation-manager mock (vi.hoisted로 호이스팅 문제 해결)
const { mockTranslationManager } = vi.hoisted(() => ({
  mockTranslationManager: {
    createJob: vi.fn(),
    startJob: vi.fn(),
    completeJob: vi.fn(),
    failJob: vi.fn(),
    startChapter: vi.fn(),
    completeChapter: vi.fn(),
    failChapter: vi.fn(),
    checkAndPause: vi.fn(),
    updateChunkProgress: vi.fn(),
  },
}));
vi.mock("@/lib/translation-manager", () => ({
  translationManager: mockTranslationManager,
}));

vi.mock("@/lib/translation-logger", () => ({
  translationLogger: {
    logJobStart: vi.fn(),
    logChapterStart: vi.fn(),
    logChapterComplete: vi.fn(),
    logChapterFailed: vi.fn(),
    logJobComplete: vi.fn(),
    logJobFailed: vi.fn(),
    saveJobHistory: vi.fn(),
  },
}));

vi.mock("@/lib/gemini", () => ({
  translateChapter: vi.fn(),
  TranslationError: class TranslationError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

// SQS queue mock
vi.mock("@/lib/queue", () => ({
  enqueueBatchTranslation: vi.fn().mockResolvedValue(undefined),
  isQueueEnabled: vi.fn().mockReturnValue(true),
}));

import { POST } from "../route";

describe("POST /api/translation", () => {
  beforeEach(() => {
    resetMockDb();
    mockGetServerSession.mockReset();
    mockTranslationManager.createJob.mockReset();
  });

  it("미인증 시 401을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/translation", {
      method: "POST",
      body: { workId: "work-1", chapterNumbers: [1] },
    });
    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(401);
  });

  it("rate limit 초과 시 429를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.activeTranslationJob.count.mockResolvedValue(5); // 5개 이상

    const req = createRequest("http://localhost:3000/api/translation", {
      method: "POST",
      body: { workId: "work-1", chapterNumbers: [1] },
    });
    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(429);
  });

  it("잘못된 입력 시 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.activeTranslationJob.count.mockResolvedValue(0);

    const req = createRequest("http://localhost:3000/api/translation", {
      method: "POST",
      body: { workId: "work-1", chapterNumbers: [] }, // 빈 배열
    });
    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("workId 누락 시 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.activeTranslationJob.count.mockResolvedValue(0);

    const req = createRequest("http://localhost:3000/api/translation", {
      method: "POST",
      body: { chapterNumbers: [1] }, // workId 없음
    });
    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("잘못된 챕터 번호(음수) 시 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.activeTranslationJob.count.mockResolvedValue(0);

    const req = createRequest("http://localhost:3000/api/translation", {
      method: "POST",
      body: { workId: "work-1", chapterNumbers: [-1, 0.5] },
    });
    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("작품이 존재하지 않으면 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.activeTranslationJob.count.mockResolvedValue(0);
    mockDb.work.findUnique.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/translation", {
      method: "POST",
      body: { workId: "nonexistent", chapterNumbers: [1] },
    });
    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("설정집이 null이면 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.activeTranslationJob.count.mockResolvedValue(0);
    mockDb.work.findUnique.mockResolvedValue(
      buildWork({
        authorId: "author-1",
        status: "BIBLE_CONFIRMED",
        settingBible: null,
        glossary: [],
      })
    );

    const req = createRequest("http://localhost:3000/api/translation", {
      method: "POST",
      body: { workId: "work-1", chapterNumbers: [1] },
    });
    const res = await POST(req);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.code).toBe("BIBLE_NOT_CONFIRMED");
  });

  it("번역 가능한 챕터가 없으면 400을 반환한다 (이미 번역 완료)", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.activeTranslationJob.count.mockResolvedValue(0);
    mockDb.work.findUnique.mockResolvedValue(
      buildWork({
        authorId: "author-1",
        status: "BIBLE_CONFIRMED",
        settingBible: { status: "CONFIRMED", characters: [], terms: [] },
        glossary: [],
      })
    );
    mockDb.chapter.findMany
      .mockResolvedValueOnce([]) // 번역 가능 챕터 없음
      .mockResolvedValueOnce([{ number: 1, status: "TRANSLATED" }]); // 실제 상태 조회

    const req = createRequest("http://localhost:3000/api/translation", {
      method: "POST",
      body: { workId: "work-1", chapterNumbers: [1] },
    });
    const res = await POST(req);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.error).toContain("번역할 회차가 없습니다");
  });

  it("권한 없는 작품 시 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.activeTranslationJob.count.mockResolvedValue(0);
    mockDb.work.findUnique.mockResolvedValue(
      buildWork({ authorId: "other-author" })
    );

    const req = createRequest("http://localhost:3000/api/translation", {
      method: "POST",
      body: { workId: "work-1", chapterNumbers: [1] },
    });
    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("작품 상태 오류 시 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.activeTranslationJob.count.mockResolvedValue(0);
    mockDb.work.findUnique.mockResolvedValue(
      buildWork({
        authorId: "author-1",
        status: "COMPLETED", // COMPLETED에서는 TRANSLATING으로 전이 불가
        settingBible: { status: "CONFIRMED", characters: [], terms: [] },
        glossary: [],
      })
    );

    const req = createRequest("http://localhost:3000/api/translation", {
      method: "POST",
      body: { workId: "work-1", chapterNumbers: [1] },
    });
    const res = await POST(req);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.code).toBe("INVALID_WORK_STATUS");
  });

  it("설정집 미확정 시 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.activeTranslationJob.count.mockResolvedValue(0);
    mockDb.work.findUnique.mockResolvedValue(
      buildWork({
        authorId: "author-1",
        status: "BIBLE_CONFIRMED",
        settingBible: { status: "DRAFT", characters: [], terms: [] },
        glossary: [],
      })
    );

    const req = createRequest("http://localhost:3000/api/translation", {
      method: "POST",
      body: { workId: "work-1", chapterNumbers: [1] },
    });
    const res = await POST(req);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.code).toBe("BIBLE_NOT_CONFIRMED");
  });

  it("중복 작업 시 409를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.activeTranslationJob.count.mockResolvedValue(0);
    mockDb.work.findUnique.mockResolvedValue(
      buildWork({
        authorId: "author-1",
        status: "BIBLE_CONFIRMED",
        settingBible: { status: "CONFIRMED", characters: [], terms: [] },
        glossary: [],
      })
    );

    const chapters = [
      buildChapter({ id: "ch-1", number: 1, originalContent: "내용" }),
    ];
    mockDb.chapter.findMany.mockResolvedValue(chapters);
    mockDb.chapter.updateMany.mockResolvedValue({ count: 0 });
    mockTranslationManager.createJob.mockResolvedValue(null); // 중복 — null 반환

    const req = createRequest("http://localhost:3000/api/translation", {
      method: "POST",
      body: { workId: "work-1", chapterNumbers: [1] },
    });
    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(409);
  });

  it("정상 시작 시 jobId를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.activeTranslationJob.count.mockResolvedValue(0);
    mockDb.work.findUnique.mockResolvedValue(
      buildWork({
        authorId: "author-1",
        status: "BIBLE_CONFIRMED",
        settingBible: { status: "CONFIRMED", characters: [], terms: [] },
        glossary: [],
      })
    );
    const chapters = [
      buildChapter({ id: "ch-1", number: 1, originalContent: "내용" }),
    ];
    mockDb.chapter.findMany.mockResolvedValue(chapters);
    mockDb.chapter.updateMany.mockResolvedValue({ count: 0 });
    mockTranslationManager.createJob.mockResolvedValue("job-123");

    const req = createRequest("http://localhost:3000/api/translation", {
      method: "POST",
      body: { workId: "work-1", chapterNumbers: [1] },
    });
    const res = await POST(req);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.jobId).toBe("job-123");
    expect(body.totalChapters).toBe(1);
  });
});
