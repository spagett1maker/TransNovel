import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, resetMockDb, mockDbTransaction } from "@/test-utils/mock-db";
import { mockGetServerSession, sessions } from "@/test-utils/mock-auth";
import { buildChapter, buildWork } from "@/test-utils/factories";
import { createRequest, parseResponse } from "@/test-utils/request-helper";

// Mock 설정
vi.mock("@/lib/db", () => ({
  db: mockDb,
  dbTransaction: (...args: Parameters<typeof mockDbTransaction>) => mockDbTransaction(...args),
}));
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
  SnapshotType: {
    STATUS_CHANGE: "STATUS_CHANGE",
    AUTO_SAVE: "AUTO_SAVE",
    MANUAL: "MANUAL",
  },
}));

import { GET, PATCH, DELETE } from "../route";

function makeParams(id: string, num: string) {
  return { params: Promise.resolve({ id, num }) };
}

describe("GET /api/works/[id]/chapters/[num]", () => {
  beforeEach(() => {
    resetMockDb();
    mockGetServerSession.mockReset();
  });

  it("잘못된 번호 시 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/abc");
    const res = await GET(req, makeParams("work-1", "abc"));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("음수 번호 시 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/-1");
    const res = await GET(req, makeParams("work-1", "-1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("권한 없는 접근 시 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "other-author", editorId: null });

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1");
    const res = await GET(req, makeParams("work-1", "1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("미인증 시 401을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1", editorId: null });

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1");
    const res = await GET(req, makeParams("work-1", "1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(401);
  });

  it("작품을 찾을 수 없으면 404를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1");
    const res = await GET(req, makeParams("work-1", "1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
  });

  it("존재하지 않는 챕터 시 404를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1", editorId: null });
    mockDb.chapter.findUnique.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/999");
    const res = await GET(req, makeParams("work-1", "999"));
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
  });

  it("정상 조회 시 200을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1", editorId: null });
    const chapter = buildChapter({ number: 1 });
    mockDb.chapter.findUnique.mockResolvedValue(chapter);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1");
    const res = await GET(req, makeParams("work-1", "1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
  });

  it("챕터 번호 0(프롤로그)을 허용한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1", editorId: null });
    const chapter = buildChapter({ number: 0 });
    mockDb.chapter.findUnique.mockResolvedValue(chapter);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/0");
    const res = await GET(req, makeParams("work-1", "0"));
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
  });
});

describe("PATCH /api/works/[id]/chapters/[num]", () => {
  beforeEach(() => {
    resetMockDb();
    mockGetServerSession.mockReset();
  });

  it("낙관적 잠금 충돌 시 409를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1", editorId: null });
    mockDb.chapter.findUnique.mockResolvedValue(
      buildChapter({
        status: "PENDING",
        updatedAt: new Date("2025-06-01T12:00:00Z"),
      })
    );

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1", {
      method: "PATCH",
      body: {
        title: "수정 제목",
        _updatedAt: "2025-06-01T10:00:00Z", // DB보다 이전 시간
      },
    });
    const res = await PATCH(req, makeParams("work-1", "1"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(409);
    expect(body.code).toBe("CONFLICT");
  });

  it("AUTHOR가 번역 완료 후 콘텐츠 편집 시 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1", editorId: null });
    mockDb.chapter.findUnique.mockResolvedValue(
      buildChapter({ status: "TRANSLATED" })
    );

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1", {
      method: "PATCH",
      body: { editedContent: "수정 내용" },
    });
    const res = await PATCH(req, makeParams("work-1", "1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("유효한 상태 전이를 허용한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1", editorId: null });
    mockDb.chapter.findUnique.mockResolvedValue(
      buildChapter({ id: "ch-1", status: "EDITED" })
    );

    // dbTransaction mock에서 tx로 mockDb를 전달 → tx.chapter.update 등 호출 가능
    mockDb.chapterSnapshot.create.mockResolvedValue({});
    mockDb.chapter.update.mockResolvedValue(buildChapter({ status: "APPROVED" }));
    mockDb.chapterActivity.create.mockResolvedValue({});
    mockDb.projectContract.findFirst.mockResolvedValue(null);
    mockDb.chapter.findMany.mockResolvedValue([{ status: "APPROVED" }]);
    mockDb.work.update.mockResolvedValue({});

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1", {
      method: "PATCH",
      body: { status: "APPROVED" },
    });
    const res = await PATCH(req, makeParams("work-1", "1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
  });

  it("EDITOR에게 활성 계약이 없으면 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.editor);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1", editorId: "editor-1" });
    mockDb.projectContract.findFirst.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1", {
      method: "PATCH",
      body: { editedContent: "수정 내용" },
    });
    const res = await PATCH(req, makeParams("work-1", "1"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(403);
    expect(body.error).toContain("활성 계약");
  });

  it("EDITOR가 계약 범위 밖 챕터 편집 시 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.editor);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1", editorId: "editor-1" });
    mockDb.projectContract.findFirst.mockResolvedValue({
      chapterStart: 1,
      chapterEnd: 10,
    });

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/15", {
      method: "PATCH",
      body: { editedContent: "범위 밖" },
    });
    const res = await PATCH(req, makeParams("work-1", "15"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(403);
    expect(body.error).toContain("계약 범위");
  });

  it("EDITOR가 TRANSLATED 챕터에서 편집 시 자동으로 REVIEWING 전이한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.editor);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1", editorId: "editor-1" });
    mockDb.projectContract.findFirst.mockResolvedValue({
      chapterStart: 1,
      chapterEnd: 10,
    });
    mockDb.chapter.findUnique.mockResolvedValue(
      buildChapter({ id: "ch-1", status: "TRANSLATED", editedContent: null })
    );

    // dbTransaction 내부 호출 mock
    mockDb.chapterSnapshot.create.mockResolvedValue({});
    mockDb.chapterSnapshot.findMany.mockResolvedValue([]);
    const updatedChapter = buildChapter({ status: "REVIEWING", editedContent: "윤문 내용" });
    mockDb.chapter.update.mockResolvedValue(updatedChapter);
    mockDb.chapterActivity.create.mockResolvedValue({});

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1", {
      method: "PATCH",
      body: { editedContent: "윤문 내용" },
    });
    const res = await PATCH(req, makeParams("work-1", "1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    // updateData에 status: REVIEWING이 포함되어야 함
    expect(mockDb.chapter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REVIEWING" }),
      })
    );
  });

  it("모든 챕터가 APPROVED이고 계약이 없으면 작품이 COMPLETED로 전이한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1", editorId: null });
    mockDb.chapter.findUnique.mockResolvedValue(
      buildChapter({ id: "ch-1", status: "EDITED" })
    );

    mockDb.chapterSnapshot.create.mockResolvedValue({});
    mockDb.chapter.update.mockResolvedValue(buildChapter({ status: "APPROVED" }));
    mockDb.chapterActivity.create.mockResolvedValue({});
    mockDb.projectContract.findFirst.mockResolvedValue(null); // 계약 없음
    mockDb.chapter.findMany.mockResolvedValue([
      { status: "APPROVED" },
      { status: "APPROVED" },
    ]);
    mockDb.work.update.mockResolvedValue({});

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1", {
      method: "PATCH",
      body: { status: "APPROVED" },
    });
    const res = await PATCH(req, makeParams("work-1", "1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    // work.update가 COMPLETED로 호출되어야 함
    expect(mockDb.work.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "COMPLETED" },
      })
    );
  });

  it("활성 계약이 있으면 자동 COMPLETED 전이를 스킵한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1", editorId: null });
    mockDb.chapter.findUnique.mockResolvedValue(
      buildChapter({ id: "ch-1", status: "EDITED" })
    );

    mockDb.chapterSnapshot.create.mockResolvedValue({});
    mockDb.chapter.update.mockResolvedValue(buildChapter({ status: "APPROVED" }));
    mockDb.chapterActivity.create.mockResolvedValue({});
    mockDb.projectContract.findFirst.mockResolvedValue({ chapterStart: 1, chapterEnd: 5 }); // 활성 계약 있음
    mockDb.chapter.findMany.mockResolvedValue([
      { status: "APPROVED" },
      { status: "APPROVED" },
    ]);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1", {
      method: "PATCH",
      body: { status: "APPROVED" },
    });
    const res = await PATCH(req, makeParams("work-1", "1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    // work.update는 호출되지 않아야 함 (계약 완료 플로우에서 처리)
    expect(mockDb.work.update).not.toHaveBeenCalled();
  });

  it("상태 변경 시 스냅샷을 생성한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1", editorId: null });
    mockDb.chapter.findUnique.mockResolvedValue(
      buildChapter({ id: "ch-1", status: "EDITED", translatedContent: "번역", editedContent: "윤문" })
    );

    mockDb.chapterSnapshot.create.mockResolvedValue({});
    mockDb.chapter.update.mockResolvedValue(buildChapter({ status: "APPROVED" }));
    mockDb.chapterActivity.create.mockResolvedValue({});
    mockDb.projectContract.findFirst.mockResolvedValue(null);
    mockDb.chapter.findMany.mockResolvedValue([{ status: "APPROVED" }]);
    mockDb.work.update.mockResolvedValue({});

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1", {
      method: "PATCH",
      body: { status: "APPROVED" },
    });
    const res = await PATCH(req, makeParams("work-1", "1"));

    expect(res.status).toBe(200);
    expect(mockDb.chapterSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chapterId: "ch-1",
          snapshotType: "STATUS_CHANGE",
        }),
      })
    );
  });

  it("PATCH 시 존재하지 않는 챕터에 404를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1", editorId: null });
    mockDb.chapter.findUnique.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/999", {
      method: "PATCH",
      body: { title: "수정" },
    });
    const res = await PATCH(req, makeParams("work-1", "999"));
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
  });

  it("잘못된 상태 전이를 거부한다 (403)", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1", editorId: null });
    mockDb.chapter.findUnique.mockResolvedValue(
      buildChapter({ status: "PENDING" })
    );

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1", {
      method: "PATCH",
      body: { status: "APPROVED" }, // PENDING → APPROVED는 불가
    });
    const res = await PATCH(req, makeParams("work-1", "1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });
});

describe("DELETE /api/works/[id]/chapters/[num]", () => {
  beforeEach(() => {
    resetMockDb();
    mockGetServerSession.mockReset();
  });

  it("미인증 DELETE 시 401을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams("work-1", "1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(401);
  });

  it("없는 작품 DELETE 시 404를 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams("work-1", "1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
  });

  it("잘못된 번호 DELETE 시 400을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/abc", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams("work-1", "abc"));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("권한 없는 삭제 시 403을 반환한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.editor);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1" });

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams("work-1", "1"));
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("정상 삭제 시 200과 카운트 업데이트를 수행한다", async () => {
    mockGetServerSession.mockResolvedValue(sessions.author);
    mockDb.work.findUnique.mockResolvedValue({ authorId: "author-1" });
    mockDb.chapter.delete.mockResolvedValue({});
    mockDb.chapter.count.mockResolvedValue(4);
    mockDb.work.update.mockResolvedValue({});

    const req = createRequest("http://localhost:3000/api/works/work-1/chapters/1", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams("work-1", "1"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});
