import { ChapterStatus } from "@prisma/client";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" | "pending" | "progress";

interface ChapterStatusConfig {
  label: string;
  variant: BadgeVariant;
}

export const CHAPTER_STATUS_CONFIG: Record<ChapterStatus, ChapterStatusConfig> = {
  PENDING: { label: "대기", variant: "pending" },
  TRANSLATING: { label: "번역중", variant: "progress" },
  TRANSLATED: { label: "번역완료", variant: "info" },
  REVIEWING: { label: "윤문중", variant: "warning" },
  EDITED: { label: "윤문완료", variant: "success" },
  APPROVED: { label: "작가승인", variant: "success" },
};

export function getChapterStatusConfig(status: ChapterStatus): ChapterStatusConfig {
  return CHAPTER_STATUS_CONFIG[status] || { label: status, variant: "secondary" };
}

export function getChapterStatusLabel(status: ChapterStatus): string {
  return CHAPTER_STATUS_CONFIG[status]?.label || status;
}

export function getChapterStatusVariant(status: ChapterStatus): BadgeVariant {
  return CHAPTER_STATUS_CONFIG[status]?.variant || "secondary";
}
