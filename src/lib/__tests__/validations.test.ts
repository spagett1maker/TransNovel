import { describe, it, expect } from "vitest";
import { loginSchema, registerSchema } from "../validations/auth";
import { workSchema } from "../validations/work";

// ─── loginSchema ─────────────────────────────────────────
describe("loginSchema", () => {
  it("유효한 로그인 데이터를 통과시킨다", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("유효하지 않은 이메일을 거부한다", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("빈 이메일을 거부한다", () => {
    const result = loginSchema.safeParse({
      email: "",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("빈 비밀번호를 거부한다", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

// ─── registerSchema ──────────────────────────────────────
describe("registerSchema", () => {
  const validData = {
    name: "홍길동",
    email: "test@example.com",
    password: "password1",
    confirmPassword: "password1",
    role: "AUTHOR" as const,
  };

  it("유효한 가입 데이터를 통과시킨다", () => {
    const result = registerSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("이름이 2자 미만이면 거부한다", () => {
    const result = registerSchema.safeParse({ ...validData, name: "홍" });
    expect(result.success).toBe(false);
  });

  it("이름이 50자 초과이면 거부한다", () => {
    const result = registerSchema.safeParse({ ...validData, name: "가".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("비밀번호가 8자 미만이면 거부한다", () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: "pass1",
      confirmPassword: "pass1",
    });
    expect(result.success).toBe(false);
  });

  it("비밀번호에 숫자가 없으면 거부한다", () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: "passwordonly",
      confirmPassword: "passwordonly",
    });
    expect(result.success).toBe(false);
  });

  it("비밀번호에 영문이 없으면 거부한다", () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: "12345678",
      confirmPassword: "12345678",
    });
    expect(result.success).toBe(false);
  });

  it("비밀번호 확인이 일치하지 않으면 거부한다", () => {
    const result = registerSchema.safeParse({
      ...validData,
      confirmPassword: "different1",
    });
    expect(result.success).toBe(false);
  });

  it("AUTHOR 역할을 허용한다", () => {
    const result = registerSchema.safeParse({ ...validData, role: "AUTHOR" });
    expect(result.success).toBe(true);
  });

  it("EDITOR 역할을 허용한다", () => {
    const result = registerSchema.safeParse({ ...validData, role: "EDITOR" });
    expect(result.success).toBe(true);
  });

  it("ADMIN 역할을 거부한다 (회원가입 시 불가)", () => {
    const result = registerSchema.safeParse({ ...validData, role: "ADMIN" });
    expect(result.success).toBe(false);
  });
});

// ─── workSchema ──────────────────────────────────────────
describe("workSchema", () => {
  const validWork = {
    titleKo: "테스트 작품",
    titleOriginal: "Test Work",
    publisher: "테스트 출판사",
    ageRating: "ALL" as const,
    synopsis: "이것은 테스트 작품의 줄거리입니다. 충분히 길어야 합니다.",
    genres: ["판타지"],
    originalStatus: "ONGOING" as const,
    sourceLanguage: "ZH" as const,
    creators: [{ name: "작가이름", role: "WRITER" as const }],
  };

  it("유효한 작품 데이터를 통과시킨다", () => {
    const result = workSchema.safeParse(validWork);
    expect(result.success).toBe(true);
  });

  it("한글 작품명이 비어있으면 거부한다", () => {
    const result = workSchema.safeParse({ ...validWork, titleKo: "" });
    expect(result.success).toBe(false);
  });

  it("작품명이 100자 초과이면 거부한다", () => {
    const result = workSchema.safeParse({ ...validWork, titleKo: "가".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("줄거리가 10자 미만이면 거부한다", () => {
    const result = workSchema.safeParse({ ...validWork, synopsis: "짧은" });
    expect(result.success).toBe(false);
  });

  it("줄거리가 2000자 초과이면 거부한다", () => {
    const result = workSchema.safeParse({ ...validWork, synopsis: "가".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("장르가 비어있으면 거부한다", () => {
    const result = workSchema.safeParse({ ...validWork, genres: [] });
    expect(result.success).toBe(false);
  });

  it("장르가 5개 초과이면 거부한다", () => {
    const result = workSchema.safeParse({
      ...validWork,
      genres: ["판타지", "로맨스", "액션", "드라마", "스릴러", "공포"],
    });
    expect(result.success).toBe(false);
  });

  it("작가 정보가 비어있으면 거부한다", () => {
    const result = workSchema.safeParse({ ...validWork, creators: [] });
    expect(result.success).toBe(false);
  });

  it("유효하지 않은 연령등급을 거부한다", () => {
    const result = workSchema.safeParse({ ...validWork, ageRating: "INVALID" });
    expect(result.success).toBe(false);
  });

  it("유효하지 않은 원작 상태를 거부한다", () => {
    const result = workSchema.safeParse({ ...validWork, originalStatus: "INVALID" });
    expect(result.success).toBe(false);
  });

  it("유효하지 않은 원어를 거부한다", () => {
    const result = workSchema.safeParse({ ...validWork, sourceLanguage: "INVALID" });
    expect(result.success).toBe(false);
  });

  it("올바른 URL을 허용한다", () => {
    const result = workSchema.safeParse({ ...validWork, platformUrl: "https://example.com" });
    expect(result.success).toBe(true);
  });

  it("빈 URL을 허용한다", () => {
    const result = workSchema.safeParse({ ...validWork, platformUrl: "" });
    expect(result.success).toBe(true);
  });

  it("잘못된 URL을 거부한다", () => {
    const result = workSchema.safeParse({ ...validWork, platformUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });
});
