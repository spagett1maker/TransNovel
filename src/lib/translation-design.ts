// 번역 상태 디자인 토큰
// 모든 번역 관련 컴포넌트에서 일관된 스타일을 사용하기 위한 토큰

import {
  Clock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Pause,
} from "lucide-react";

export type TranslationStatusKey =
  | "idle"
  | "pending"
  | "translating"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "paused";

export type BadgeVariant =
  | "outline"
  | "pending"
  | "progress"
  | "success"
  | "warning"
  | "destructive";

export interface StatusConfig {
  variant: BadgeVariant;
  icon: typeof Clock;
  label: string;
  animated?: boolean;
  // 색상 클래스
  containerClass: string;
  iconClass: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  progressBarClass: string;
}

export const TRANSLATION_STATUS: Record<TranslationStatusKey, StatusConfig> = {
  idle: {
    variant: "pending",
    icon: Clock,
    label: "대기",
    containerClass: "border-status-pending/30 bg-status-pending/5",
    iconClass: "text-muted-foreground",
    textClass: "text-muted-foreground",
    bgClass: "bg-muted",
    borderClass: "border-border",
    progressBarClass: "[&>div]:bg-muted-foreground",
  },
  pending: {
    variant: "pending",
    icon: Clock,
    label: "대기",
    containerClass: "border-status-pending/30 bg-status-pending/5",
    iconClass: "text-muted-foreground",
    textClass: "text-muted-foreground",
    bgClass: "bg-muted",
    borderClass: "border-border",
    progressBarClass: "[&>div]:bg-muted-foreground",
  },
  translating: {
    variant: "progress",
    icon: Loader2,
    label: "번역 중",
    animated: true,
    containerClass: "border-status-progress/30 bg-status-progress/5",
    iconClass: "text-status-progress",
    textClass: "text-status-progress",
    bgClass: "bg-status-progress/10",
    borderClass: "border-status-progress/30",
    progressBarClass: "[&>div]:bg-status-progress",
  },
  completed: {
    variant: "success",
    icon: CheckCircle2,
    label: "완료",
    containerClass: "border-status-success/30 bg-status-success/5",
    iconClass: "text-status-success",
    textClass: "text-status-success",
    bgClass: "bg-status-success/10",
    borderClass: "border-status-success/30",
    progressBarClass: "[&>div]:bg-status-success",
  },
  partial: {
    variant: "warning",
    icon: AlertTriangle,
    label: "부분 완료",
    containerClass: "border-status-warning/30 bg-status-warning/5",
    iconClass: "text-status-warning",
    textClass: "text-status-warning",
    bgClass: "bg-status-warning/10",
    borderClass: "border-status-warning/30",
    progressBarClass: "[&>div]:bg-status-warning",
  },
  failed: {
    variant: "destructive",
    icon: XCircle,
    label: "실패",
    containerClass: "border-status-error/30 bg-status-error/5",
    iconClass: "text-status-error",
    textClass: "text-status-error",
    bgClass: "bg-status-error/10",
    borderClass: "border-status-error/30",
    progressBarClass: "[&>div]:bg-status-error",
  },
  cancelled: {
    variant: "pending",
    icon: XCircle,
    label: "취소됨",
    containerClass: "border-status-warning/30 bg-status-warning/5",
    iconClass: "text-status-warning",
    textClass: "text-status-warning",
    bgClass: "bg-status-warning/10",
    borderClass: "border-status-warning/30",
    progressBarClass: "[&>div]:bg-status-warning",
  },
  paused: {
    variant: "warning",
    icon: Pause,
    label: "일시정지",
    containerClass: "border-status-warning/30 bg-status-warning/5",
    iconClass: "text-status-warning",
    textClass: "text-status-warning",
    bgClass: "bg-status-warning/10",
    borderClass: "border-status-warning/30",
    progressBarClass: "[&>div]:bg-status-warning",
  },
};

// 챕터 상태 (서버 DB 상태 기반)
export type ChapterStatusKey =
  | "PENDING"
  | "TRANSLATING"
  | "TRANSLATED"
  | "REVIEWING"
  | "EDITED"
  | "APPROVED"
  | "FAILED"
  | "PARTIAL";

export interface ChapterStatusConfig {
  variant: BadgeVariant;
  icon: typeof Clock;
  label: string;
  animated?: boolean;
  containerClass: string;
}

export const CHAPTER_STATUS: Record<ChapterStatusKey, ChapterStatusConfig> = {
  PENDING: {
    variant: "pending",
    icon: Clock,
    label: "대기",
    containerClass: "border-status-pending/30 bg-status-pending/5",
  },
  TRANSLATING: {
    variant: "progress",
    icon: Loader2,
    label: "번역중",
    animated: true,
    containerClass: "border-status-progress/30 bg-status-progress/5",
  },
  TRANSLATED: {
    variant: "success",
    icon: CheckCircle2,
    label: "번역완료",
    containerClass: "border-status-success/30 bg-status-success/5",
  },
  REVIEWING: {
    variant: "warning",
    icon: AlertTriangle,
    label: "검토중",
    containerClass: "border-status-warning/30 bg-status-warning/5",
  },
  EDITED: {
    variant: "success",
    icon: CheckCircle2,
    label: "윤문완료",
    containerClass: "border-status-success/30 bg-status-success/5",
  },
  APPROVED: {
    variant: "success",
    icon: CheckCircle2,
    label: "승인",
    containerClass: "border-status-success/30 bg-status-success/5",
  },
  FAILED: {
    variant: "destructive",
    icon: XCircle,
    label: "실패",
    containerClass: "border-status-error/30 bg-status-error/5",
  },
  PARTIAL: {
    variant: "warning",
    icon: AlertTriangle,
    label: "부분완료",
    containerClass: "border-status-warning/30 bg-status-warning/5",
  },
};

// 헬퍼 함수: 상태에 따른 아이콘 렌더링 클래스 반환
export function getStatusIconClass(status: TranslationStatusKey): string {
  const config = TRANSLATION_STATUS[status];
  return config.animated ? `${config.iconClass} animate-spin` : config.iconClass;
}

// 헬퍼 함수: 상태에 따른 컨테이너 클래스 반환
export function getStatusContainerClass(status: TranslationStatusKey): string {
  return TRANSLATION_STATUS[status].containerClass;
}
