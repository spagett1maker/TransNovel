"use client";

import { Download, FileText, Loader2 } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface Chapter {
  number: number;
  title: string | null;
  status: string;
}

interface DownloadDialogProps {
  workId: string;
  workTitle: string;
  chapters: Chapter[];
}

type DownloadFormat = "txt" | "docx";
type ContentType = "translated" | "edited";

// 메모이제이션된 회차 아이템 컴포넌트 - O(1) 선택 조회
const ChapterItem = memo(function ChapterItem({
  chapter,
  isSelected,
  onToggle,
}: {
  chapter: Chapter;
  isSelected: boolean;
  onToggle: (number: number) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded p-1 hover:bg-muted">
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onToggle(chapter.number)}
      />
      <span className="text-sm">
        {chapter.number}화
        {chapter.title && (
          <span className="ml-1 text-muted-foreground">- {chapter.title}</span>
        )}
      </span>
    </label>
  );
});

export function DownloadDialog({
  workId,
  chapters = [],
}: DownloadDialogProps) {
  const [open, setOpen] = useState(false);
  // Set 기반 선택 상태 - O(1) 조회/추가/삭제
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(new Set());
  const [format, setFormat] = useState<DownloadFormat>("txt");
  const [contentType, setContentType] = useState<ContentType>("edited");
  const [isDownloading, setIsDownloading] = useState(false);

  // 안전하게 배열 처리
  const safeChapters = Array.isArray(chapters) ? chapters : [];

  // useMemo로 필터 결과 캐싱
  const downloadableChapters = useMemo(
    () => safeChapters.filter((c) => ["TRANSLATED", "EDITED", "APPROVED"].includes(c.status)),
    [safeChapters]
  );

  // useCallback으로 토글 함수 메모이제이션
  const toggleChapter = useCallback((number: number) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedChapters((prev) => {
      if (prev.size === downloadableChapters.length) {
        return new Set();
      } else {
        return new Set(downloadableChapters.map((c) => c.number));
      }
    });
  }, [downloadableChapters]);

  const handleDownload = async () => {
    if (selectedChapters.size === 0) return;

    setIsDownloading(true);

    try {
      const chaptersParam =
        selectedChapters.size === downloadableChapters.length
          ? "all"
          : Array.from(selectedChapters).sort((a, b) => a - b).join(",");

      const url = `/api/works/${workId}/download?format=${format}&chapters=${chaptersParam}&content=${contentType}`;

      // fetch로 다운로드하여 에러 처리
      const res = await fetch(url);
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || "다운로드에 실패했습니다");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="?(.+?)"?$/);
      const filename = filenameMatch?.[1] || `download.${format}`;

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      // 다이얼로그 닫기
      setTimeout(() => {
        setOpen(false);
        setSelectedChapters(new Set());
      }, 500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "다운로드에 실패했습니다");
    } finally {
      setIsDownloading(false);
    }
  };

  if (downloadableChapters.length === 0) {
    return (
      <Button variant="outline" disabled>
        <Download className="mr-2 h-4 w-4" />
        다운로드
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          다운로드
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>번역본 다운로드</DialogTitle>
          <DialogDescription>
            다운로드할 회차와 형식을 선택하세요
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 회차 선택 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">회차 선택</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAll}
                className="h-auto py-1 text-xs"
              >
                {selectedChapters.size === downloadableChapters.length
                  ? "전체 해제"
                  : "전체 선택"}
              </Button>
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
              {downloadableChapters.map((chapter) => (
                <ChapterItem
                  key={chapter.number}
                  chapter={chapter}
                  isSelected={selectedChapters.has(chapter.number)}
                  onToggle={toggleChapter}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedChapters.size}개 선택됨 (총{" "}
              {downloadableChapters.length}개 다운로드 가능)
            </p>
          </div>

          {/* 파일 형식 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">파일 형식</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as DownloadFormat)}
              className="flex gap-4"
            >
              <label className="flex cursor-pointer items-center gap-2">
                <RadioGroupItem value="txt" />
                <span className="text-sm">TXT (텍스트)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <RadioGroupItem value="docx" />
                <span className="text-sm">DOCX (Word)</span>
              </label>
            </RadioGroup>
          </div>

          {/* 콘텐츠 유형 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">콘텐츠 유형</Label>
            <RadioGroup
              value={contentType}
              onValueChange={(v) => setContentType(v as ContentType)}
              className="flex gap-4"
            >
              <label className="flex cursor-pointer items-center gap-2">
                <RadioGroupItem value="edited" />
                <span className="text-sm">윤문본 (우선)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <RadioGroupItem value="translated" />
                <span className="text-sm">AI 번역본</span>
              </label>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              윤문본이 없는 경우 AI 번역본이 사용됩니다
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button
            onClick={handleDownload}
            disabled={selectedChapters.size === 0 || isDownloading}
          >
            {isDownloading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                다운로드 중...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                다운로드
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
