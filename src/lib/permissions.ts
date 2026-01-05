import { ChapterStatus, UserRole } from "@prisma/client";

// 역할별 허용 상태 전이 정의
const STATUS_TRANSITIONS: Record<
  UserRole,
  {
    from: ChapterStatus[];
    to: ChapterStatus[];
  }
> = {
  AUTHOR: {
    from: [ChapterStatus.PENDING],
    to: [ChapterStatus.TRANSLATING, ChapterStatus.TRANSLATED],
  },
  EDITOR: {
    from: [ChapterStatus.TRANSLATED, ChapterStatus.REVIEWING, ChapterStatus.EDITED],
    to: [ChapterStatus.REVIEWING, ChapterStatus.EDITED, ChapterStatus.APPROVED],
  },
  ADMIN: {
    from: Object.values(ChapterStatus),
    to: Object.values(ChapterStatus),
  },
};

// 유효한 상태 전이 맵 (현재 상태 → 다음 가능 상태들)
const VALID_TRANSITIONS: Record<ChapterStatus, ChapterStatus[]> = {
  [ChapterStatus.PENDING]: [ChapterStatus.TRANSLATING],
  [ChapterStatus.TRANSLATING]: [ChapterStatus.TRANSLATED, ChapterStatus.PENDING],
  [ChapterStatus.TRANSLATED]: [ChapterStatus.REVIEWING],
  [ChapterStatus.REVIEWING]: [ChapterStatus.EDITED, ChapterStatus.TRANSLATED],
  [ChapterStatus.EDITED]: [ChapterStatus.APPROVED, ChapterStatus.REVIEWING],
  [ChapterStatus.APPROVED]: [],
};

/**
 * 사용자가 특정 상태 전이를 수행할 수 있는지 확인
 */
export function canTransitionStatus(
  role: UserRole,
  currentStatus: ChapterStatus,
  newStatus: ChapterStatus
): boolean {
  // ADMIN은 모든 전이 가능
  if (role === UserRole.ADMIN) {
    return true;
  }

  const permissions = STATUS_TRANSITIONS[role];
  if (!permissions) {
    return false;
  }

  // 1. 역할이 현재 상태에서 전이할 권한이 있는지
  const canTransitionFrom = permissions.from.includes(currentStatus);

  // 2. 역할이 목표 상태로 전이할 권한이 있는지
  const canTransitionTo = permissions.to.includes(newStatus);

  // 3. 상태 전이가 유효한지 (순서에 맞는지)
  const isValidTransition = VALID_TRANSITIONS[currentStatus]?.includes(newStatus);

  return canTransitionFrom && canTransitionTo && isValidTransition;
}

/**
 * 사용자가 작품에 접근할 수 있는지 확인
 */
export function canAccessWork(
  userId: string,
  role: UserRole,
  work: { authorId: string; editorId?: string | null }
): boolean {
  // ADMIN은 모든 작품 접근 가능
  if (role === UserRole.ADMIN) {
    return true;
  }

  // AUTHOR는 자신의 작품만 접근 가능
  if (role === UserRole.AUTHOR) {
    return work.authorId === userId;
  }

  // EDITOR는 자신에게 할당된 작품만 접근 가능
  if (role === UserRole.EDITOR) {
    return work.editorId === userId;
  }

  return false;
}

/**
 * 사용자가 작품을 수정할 수 있는지 확인
 */
export function canEditWork(
  userId: string,
  role: UserRole,
  work: { authorId: string }
): boolean {
  // ADMIN과 AUTHOR만 작품 정보 수정 가능
  if (role === UserRole.ADMIN) {
    return true;
  }

  if (role === UserRole.AUTHOR) {
    return work.authorId === userId;
  }

  return false;
}

/**
 * 사용자가 번역을 실행할 수 있는지 확인
 */
export function canTranslate(
  userId: string,
  role: UserRole,
  work: { authorId: string }
): boolean {
  // AUTHOR와 ADMIN만 번역 실행 가능
  if (role === UserRole.ADMIN) {
    return true;
  }

  if (role === UserRole.AUTHOR) {
    return work.authorId === userId;
  }

  return false;
}

/**
 * 사용자가 회차를 검토/승인할 수 있는지 확인
 */
export function canReviewChapter(
  userId: string,
  role: UserRole,
  work: { editorId?: string | null }
): boolean {
  // EDITOR와 ADMIN만 검토 가능
  if (role === UserRole.ADMIN) {
    return true;
  }

  if (role === UserRole.EDITOR) {
    return work.editorId === userId;
  }

  return false;
}

/**
 * 사용자가 작품에 윤문가를 할당할 수 있는지 확인
 */
export function canAssignEditor(
  userId: string,
  role: UserRole,
  work: { authorId: string }
): boolean {
  // AUTHOR(작품 소유자)와 ADMIN만 윤문가 할당 가능
  if (role === UserRole.ADMIN) {
    return true;
  }

  if (role === UserRole.AUTHOR) {
    return work.authorId === userId;
  }

  return false;
}

/**
 * 역할별 사용 가능한 다음 상태 목록 반환
 */
export function getAvailableNextStatuses(
  role: UserRole,
  currentStatus: ChapterStatus
): ChapterStatus[] {
  const validNextStatuses = VALID_TRANSITIONS[currentStatus] || [];

  if (role === UserRole.ADMIN) {
    return validNextStatuses;
  }

  const permissions = STATUS_TRANSITIONS[role];
  if (!permissions) {
    return [];
  }

  return validNextStatuses.filter(
    (status) =>
      permissions.from.includes(currentStatus) && permissions.to.includes(status)
  );
}

/**
 * 역할 표시 이름 반환
 */
export function getRoleDisplayName(role: UserRole): string {
  const names: Record<UserRole, string> = {
    AUTHOR: "작가",
    EDITOR: "윤문가",
    ADMIN: "관리자",
  };
  return names[role] || role;
}

/**
 * 상태 표시 이름 반환
 */
export function getStatusDisplayName(status: ChapterStatus): string {
  const names: Record<ChapterStatus, string> = {
    PENDING: "대기",
    TRANSLATING: "번역 중",
    TRANSLATED: "번역 완료",
    REVIEWING: "검토 중",
    EDITED: "수정 완료",
    APPROVED: "승인됨",
  };
  return names[status] || status;
}
