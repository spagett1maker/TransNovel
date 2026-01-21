"use client";

import { Badge } from "@/components/ui/badge";
import { BibleStatus, WorkStatus } from "@prisma/client";
import { BookOpen, CheckCircle2, Loader2, FileText } from "lucide-react";

interface BibleStatusBadgeProps {
  status: BibleStatus | WorkStatus;
  showIcon?: boolean;
  size?: "sm" | "md";
}

const STATUS_CONFIG: Record<string, {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" | "pending" | "progress";
  icon: React.ReactNode;
}> = {
  // BibleStatus
  GENERATING: {
    label: "생성중",
    variant: "progress",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  DRAFT: {
    label: "검토중",
    variant: "warning",
    icon: <FileText className="h-3 w-3" />,
  },
  CONFIRMED: {
    label: "확정됨",
    variant: "success",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  // WorkStatus for bible-related states
  BIBLE_GENERATING: {
    label: "설정집 생성중",
    variant: "progress",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  BIBLE_DRAFT: {
    label: "설정집 검토중",
    variant: "warning",
    icon: <FileText className="h-3 w-3" />,
  },
  BIBLE_CONFIRMED: {
    label: "번역 준비완료",
    variant: "info",
    icon: <BookOpen className="h-3 w-3" />,
  },
};

export function BibleStatusBadge({ status, showIcon = true, size = "md" }: BibleStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    variant: "secondary" as const,
    icon: null,
  };

  return (
    <Badge
      variant={config.variant}
      className={`gap-1 ${size === "sm" ? "text-xs py-0 px-1.5" : ""}`}
    >
      {showIcon && config.icon}
      {config.label}
    </Badge>
  );
}
