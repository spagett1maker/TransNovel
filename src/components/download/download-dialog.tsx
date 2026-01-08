"use client";

import { Download, FileText, Loader2 } from "lucide-react";
import { useState } from "react";

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

export function DownloadDialog({
  workId,
  workTitle,
  chapters,
}: DownloadDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedChapters, setSelectedChapters] = useState<number[]>([]);
  const [format, setFormat] = useState<DownloadFormat>("txt");
  const [contentType, setContentType] = useState<ContentType>("edited");
  const [isDownloading, setIsDownloading] = useState(false);

  // 다운로드 가능한 챕터 (번역 완료된 것만)
  const downloadableChapters = chapters.filter((c) =>
    ["TRANSLATED", "EDITED", "APPROVED"].includes(c.status)
  );

  const toggleChapter = (number: number) => {
    setSelectedChapters((prev) =>
      prev.includes(number)
        ? prev.filter((n) => n !== number)
        : [...prev, number]
    );
  };

  const selectAll = () => {
    if (selectedChapters.length === downloadableChapters.length) {
      setSelectedChapters([]);
    } else {
      setSelectedChapters(downloadableChapters.map((c) => c.number));
    }
  };

  const handleDownload = async () => {
    if (selectedChapters.length === 0) return;

    setIsDownloading(true);

    try {
      const chaptersParam =
        selectedChapters.length === downloadableChapters.length
          ? "all"
          : selectedChapters.sort((a, b) => a - b).join(",");

      const url = `/api/works/${workId}/download?format=${format}&chapters=${chaptersParam}&content=${contentType}`;

      // 다운로드 트리거
      const link = document.createElement("a");
      link.href = url;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 다이얼로그 닫기
      setTimeout(() => {
        setOpen(false);
        setSelectedChapters([]);
      }, 500);
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
                {selectedChapters.length === downloadableChapters.length
                  ? "전체 해제"
                  : "전체 선택"}
              </Button>
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
              {downloadableChapters.map((chapter) => (
                <label
                  key={chapter.number}
                  className="flex cursor-pointer items-center gap-3 rounded p-1 hover:bg-gray-50"
                >
                  <Checkbox
                    checked={selectedChapters.includes(chapter.number)}
                    onCheckedChange={() => toggleChapter(chapter.number)}
                  />
                  <span className="text-sm">
                    {chapter.number}화
                    {chapter.title && (
                      <span className="ml-1 text-gray-500">
                        - {chapter.title}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              {selectedChapters.length}개 선택됨 (총{" "}
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
            <p className="text-xs text-gray-500">
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
            disabled={selectedChapters.length === 0 || isDownloading}
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
