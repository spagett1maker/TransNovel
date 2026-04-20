"use client";

import { Download, FileText, FileType, BookOpen, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type DownloadFormat = "txt" | "docx" | "epub";
type ContentType = "translated" | "edited";

interface ChapterDownloadButtonProps {
  workId: string;
  chapterNumber: number;
  /** 번역 가능한 상태인지 (PENDING/TRANSLATING은 다운로드 불가) */
  disabled?: boolean;
  /** 콘텐츠 유형 (기본: edited 우선) */
  contentType?: ContentType;
  /** 버튼 크기 */
  size?: "sm" | "icon";
}

const FORMAT_CONFIG = [
  { format: "txt" as const, label: "TXT (텍스트)", icon: FileText },
  { format: "docx" as const, label: "DOCX (Word)", icon: FileType },
  { format: "epub" as const, label: "EPUB (전자책)", icon: BookOpen },
] as const;

export function ChapterDownloadButton({
  workId,
  chapterNumber,
  disabled = false,
  contentType = "edited",
  size = "icon",
}: ChapterDownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(
    async (format: DownloadFormat) => {
      setIsDownloading(true);
      try {
        const url = `/api/works/${workId}/chapters/${chapterNumber}/download?format=${format}&content=${contentType}`;
        const res = await fetch(url);

        if (!res.ok) {
          const errorData = await res.json().catch(() => null);
          throw new Error(errorData?.error || "다운로드에 실패했습니다");
        }

        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition");
        const rfc5987Match = disposition?.match(/filename\*=UTF-8''(.+?)(?:;|$)/i);
        const plainMatch = disposition?.match(/filename="?(.+?)"?(?:;|$)/);
        const filename = rfc5987Match?.[1]
          ? decodeURIComponent(rfc5987Match[1])
          : plainMatch?.[1] || `${chapterNumber}화.${format}`;

        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);

        toast.success(`${chapterNumber}화 다운로드 완료`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "다운로드에 실패했습니다"
        );
      } finally {
        setIsDownloading(false);
      }
    },
    [workId, chapterNumber, contentType]
  );

  if (disabled) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={size === "icon" ? "icon" : "sm"}
          disabled={isDownloading}
          className={size === "icon" ? "h-7 w-7" : "h-7 gap-1.5 px-2"}
          onClick={(e) => e.preventDefault()}
        >
          {isDownloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {size === "sm" && <span className="text-xs">다운로드</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs">
          {chapterNumber}화 다운로드
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {FORMAT_CONFIG.map(({ format, label, icon: Icon }) => (
          <DropdownMenuItem
            key={format}
            onClick={(e) => {
              e.stopPropagation();
              handleDownload(format);
            }}
            className="gap-2"
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
