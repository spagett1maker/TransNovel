import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "@/test-utils/mock-db";
import { mockGetServerSession, sessions } from "@/test-utils/mock-auth";
import { buildGlossaryItem } from "@/test-utils/factories";
import { createRequest, parseResponse } from "@/test-utils/request-helper";

// Mock 설정
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { GET, POST } from "../route";

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/works/[id]/glossary", () => {
  beforeEach(() => {
    resetMockDb();
    mockGetServerSession.mockReset();
  });

  it("미인증 시 401을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1/glossary");
    const res = await GET(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(401);
  });

  it("권한 없는 사용자 시 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "other-author" });

    const req = createRequest("http://localhost:3000/api/works/work-1/glossary");
    const res = await GET(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("작품이 없으면 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1/glossary");
    const res = await GET(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("정상 조회 시 200을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1" });
    const items = [buildGlossaryItem(), buildGlossaryItem()];
    mockDb.glossaryItem.findMany.mockResolvedValue(items);

    const req = createRequest("http://localhost:3000/api/works/work-1/glossary");
    const res = await GET(req, makeParams("work-1"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body).toHaveLength(2);
  });
});

describe("POST /api/works/[id]/glossary", () => {
  beforeEach(() => {
    resetMockDb();
    mockGetServerSession.mockReset();
  });

  it("미인증 POST 시 401을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1/glossary", {
      method: "POST",
      body: { original: "원문", translated: "번역" },
    });
    const res = await POST(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(401);
  });

  it("권한 없는 POST 시 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "other-author" });

    const req = createRequest("http://localhost:3000/api/works/work-1/glossary", {
      method: "POST",
      body: { original: "원문", translated: "번역" },
    });
    const res = await POST(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("단일 생성 시 201을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1" });
    mockDb.glossaryItem.findUnique.mockResolvedValue(null);
    const created = buildGlossaryItem();
    mockDb.glossaryItem.create.mockResolvedValue(created);

    const req = createRequest("http://localhost:3000/api/works/work-1/glossary", {
      method: "POST",
      body: { original: "原文", translated: "원문" },
    });
    const res = await POST(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(201);
  });

  it("중복 용어 시 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1" });
    mockDb.glossaryItem.findUnique.mockResolvedValue(buildGlossaryItem());

    const req = createRequest("http://localhost:3000/api/works/work-1/glossary", {
      method: "POST",
      body: { original: "原文", translated: "원문" },
    });
    const res = await POST(req, makeParams("work-1"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.error).toContain("이미 등록된 용어");
  });

  it("벌크 생성 시 201을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1" });
    mockDb.glossaryItem.upsert.mockResolvedValue(buildGlossaryItem());

    const req = createRequest("http://localhost:3000/api/works/work-1/glossary", {
      method: "POST",
      body: {
        items: [
          { original: "용어1", translated: "번역1" },
          { original: "용어2", translated: "번역2" },
        ],
      },
    });
    const res = await POST(req, makeParams("work-1"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.created).toBe(2);
  });

  it("벌크 생성 시 잘못된 아이템이 있으면 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1" });

    const req = createRequest("http://localhost:3000/api/works/work-1/glossary", {
      method: "POST",
      body: {
        items: [
          { original: "용어1", translated: "번역1" },
          { original: "", translated: "" }, // 빈 문자열 → zod 에러
        ],
      },
    });
    const res = await POST(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("잘못된 데이터 시 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1" });

    const req = createRequest("http://localhost:3000/api/works/work-1/glossary", {
      method: "POST",
      body: { original: "", translated: "" }, // 빈 문자열은 min(1) 검증 실패
    });
    const res = await POST(req, makeParams("work-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });
});
