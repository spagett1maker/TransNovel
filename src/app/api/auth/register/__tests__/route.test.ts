import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "@/test-utils/mock-db";
import { createRequest, parseResponse } from "@/test-utils/request-helper";

// Mock 설정
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("bcryptjs", () => ({
  hash: vi.fn().mockResolvedValue("hashed-password-123"),
}));

// Prisma enum mock
vi.mock("@prisma/client", () => ({
  UserRole: { AUTHOR: "AUTHOR", EDITOR: "EDITOR", ADMIN: "ADMIN" },
}));

import { POST } from "../route";

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    resetMockDb();
  });

  const validAuthorBody = {
    name: "테스트작가",
    email: "author@test.com",
    password: "password123",
    confirmPassword: "password123",
    role: "AUTHOR",
  };

  const validEditorBody = {
    name: "테스트윤문가",
    email: "editor@test.com",
    password: "password123",
    confirmPassword: "password123",
    role: "EDITOR",
  };

  it("유효한 AUTHOR 가입 요청 시 201을 반환한다", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    mockDb.user.create.mockResolvedValue({
      id: "user-1",
      name: validAuthorBody.name,
      email: validAuthorBody.email,
    });

    const req = createRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      body: validAuthorBody,
    });

    const res = await POST(req);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.user).toEqual({
      id: "user-1",
      name: "테스트작가",
      email: "author@test.com",
    });
    expect(mockDb.editorProfile.create).not.toHaveBeenCalled();
  });

  it("EDITOR 가입 시 EditorProfile을 자동 생성한다 (201)", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    mockDb.user.create.mockResolvedValue({
      id: "user-2",
      name: validEditorBody.name,
      email: validEditorBody.email,
    });
    mockDb.editorProfile.create.mockResolvedValue({});

    const req = createRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      body: validEditorBody,
    });

    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(201);
    expect(mockDb.editorProfile.create).toHaveBeenCalledWith({
      data: {
        userId: "user-2",
        displayName: "테스트윤문가",
      },
    });
  });

  it("중복 이메일 시 400을 반환한다", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "existing-user" });

    const req = createRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      body: validAuthorBody,
    });

    const res = await POST(req);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.error).toContain("이미 등록된 이메일");
  });

  it("잘못된 이메일 형식 시 400을 반환한다", async () => {
    const req = createRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      body: { ...validAuthorBody, email: "invalid-email" },
    });

    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("짧은 비밀번호 시 400을 반환한다", async () => {
    const req = createRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      body: { ...validAuthorBody, password: "short1", confirmPassword: "short1" },
    });

    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("ADMIN 역할 시도 시 400을 반환한다", async () => {
    const req = createRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      body: { ...validAuthorBody, role: "ADMIN" },
    });

    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("비밀번호 불일치 시 400을 반환한다", async () => {
    const req = createRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      body: { ...validAuthorBody, confirmPassword: "different123" },
    });

    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("숫자 없는 비밀번호 시 400을 반환한다", async () => {
    const req = createRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      body: { ...validAuthorBody, password: "nodigitshere", confirmPassword: "nodigitshere" },
    });

    const res = await POST(req);
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("DB 에러 발생 시 500을 반환한다", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    mockDb.user.create.mockRejectedValue("unexpected-error");

    const req = createRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      body: validAuthorBody,
    });

    const res = await POST(req);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(500);
    expect(body.error).toContain("오류가 발생");
  });
});
