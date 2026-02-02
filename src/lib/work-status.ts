import { WorkStatus } from "@prisma/client";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" | "pending" | "progress";

interface WorkStatusConfig {
  label: string;
  variant: BadgeVariant;
}

export const WORK_STATUS_CONFIG: Record<WorkStatus, WorkStatusConfig> = {
  PREPARING: { label: "등록중", variant: "pending" },      // @deprecated
  ONGOING: { label: "번역중", variant: "progress" },       // @deprecated
  REGISTERED: { label: "등록완료", variant: "info" },
  BIBLE_GENERATING: { label: "설정집 생성중", variant: "progress" },
  BIBLE_DRAFT: { label: "설정집 검토중", variant: "warning" },
  BIBLE_CONFIRMED: { label: "번역 준비완료", variant: "info" },
  TRANSLATING: { label: "번역중", variant: "progress" },
  TRANSLATED: { label: "번역완료", variant: "info" },
  PROOFREADING: { label: "윤문중", variant: "warning" },
  COMPLETED: { label: "완료", variant: "success" },
};

export function getWorkStatusConfig(status: WorkStatus): WorkStatusConfig {
  return WORK_STATUS_CONFIG[status] || { label: status, variant: "secondary" };
}

export function getWorkStatusLabel(status: WorkStatus): string {
  return WORK_STATUS_CONFIG[status]?.label || status;
}

export function getWorkStatusVariant(status: WorkStatus): BadgeVariant {
  return WORK_STATUS_CONFIG[status]?.variant || "secondary";
}

// 프로젝트 목록 상태 탭 그룹
export const WORK_STATUS_TABS = {
  all:          { label: "전체",   statuses: null as WorkStatus[] | null },
  preparing:    { label: "준비중", statuses: ["REGISTERED", "BIBLE_GENERATING", "BIBLE_DRAFT", "BIBLE_CONFIRMED"] as WorkStatus[] },
  translating:  { label: "번역중", statuses: ["TRANSLATING", "TRANSLATED"] as WorkStatus[] },
  proofreading: { label: "윤문중", statuses: ["PROOFREADING"] as WorkStatus[] },
  completed:    { label: "완료",   statuses: ["COMPLETED"] as WorkStatus[] },
} as const;

export type WorkStatusTab = keyof typeof WORK_STATUS_TABS;

// 허용되는 상태 전이 맵
const VALID_WORK_TRANSITIONS: Record<WorkStatus, WorkStatus[]> = {
  PREPARING: ["REGISTERED"],
  ONGOING: ["TRANSLATING", "REGISTERED"], // deprecated → 정상 플로우로
  REGISTERED: ["BIBLE_GENERATING", "BIBLE_CONFIRMED"],
  BIBLE_GENERATING: ["BIBLE_DRAFT", "REGISTERED"], // 실패 시 REGISTERED로 롤백
  BIBLE_DRAFT: ["BIBLE_CONFIRMED", "BIBLE_GENERATING", "REGISTERED"],
  BIBLE_CONFIRMED: ["TRANSLATING"],
  TRANSLATING: ["TRANSLATED", "BIBLE_CONFIRMED"], // 번역 실패/일시정지 → 롤백
  TRANSLATED: ["TRANSLATING", "PROOFREADING", "COMPLETED"], // 재번역 또는 윤문 진입
  PROOFREADING: ["COMPLETED", "TRANSLATED"], // 윤문 완료 또는 계약 해지
  COMPLETED: [], // 최종 상태
};

/**
 * Work 상태 전이가 허용되는지 검증
 */
export function canTransitionWorkStatus(
  from: WorkStatus,
  to: WorkStatus
): boolean {
  if (from === to) return true;
  const allowed = VALID_WORK_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}
