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
