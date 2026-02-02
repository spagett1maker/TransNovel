import { vi } from "vitest";

// 세션 프리셋
export const sessions = {
  author: {
    user: {
      id: "author-1",
      name: "작가님",
      email: "author@test.com",
      role: "AUTHOR",
    },
    expires: "2099-01-01T00:00:00.000Z",
  },
  editor: {
    user: {
      id: "editor-1",
      name: "윤문가님",
      email: "editor@test.com",
      role: "EDITOR",
    },
    expires: "2099-01-01T00:00:00.000Z",
  },
  admin: {
    user: {
      id: "admin-1",
      name: "관리자",
      email: "admin@test.com",
      role: "ADMIN",
    },
    expires: "2099-01-01T00:00:00.000Z",
  },
  none: null,
} as const;

export type SessionPreset = keyof typeof sessions;

export const mockGetServerSession = vi.fn();
