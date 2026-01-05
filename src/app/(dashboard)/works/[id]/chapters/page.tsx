"use client";

import { ArrowLeft, FileText, Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const CHAPTER_STATUS_LABELS = {
  PENDING: { label: "대기", color: "bg-gray-100 text-gray-700" },
  TRANSLATING: { label: "번역중", color: "bg-yellow-100 text-yellow-700" },
  TRANSLATED: { label: "번역완료", color: "bg-blue-100 text-blue-700" },
  REVIEWING: { label: "검토중", color: "bg-purple-100 text-purple-700" },
  EDITED: { label: "윤문완료", color: "bg-green-100 text-green-700" },
  APPROVED: { label: "승인", color: "bg-green-200 text-green-800" },
};

interface ParsedChapter {
  number: number;
  title?: string;
  content: string;
}

export default function ChaptersPage() {
  const params = useParams();
  const router = useRouter();
  const workId = params.id as string;

  const [isLoading, setIsLoading] = useState(false);
  const [rawText, setRawText] = useState("");
  const [parsedChapters, setParsedChapters] = useState<ParsedChapter[]>([]);

  const parseChapters = useCallback((text: string) => {
    const chapters: ParsedChapter[] = [];

    // 회차 구분 패턴: 제1화, 1화, 第1章, Chapter 1 등
    const chapterPattern = /(?:^|\n)(?:제?\s*(\d+)\s*[화장회편]|第\s*(\d+)\s*[章话回]|Chapter\s*(\d+))/gi;

    const matches = [...text.matchAll(chapterPattern)];

    if (matches.length === 0) {
      // 구분자가 없으면 전체를 1화로 처리
      if (text.trim()) {
        chapters.push({
          number: 1,
          content: text.trim(),
        });
      }
    } else {
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const chapterNum = parseInt(match[1] || match[2] || match[3]);
        const startIndex = match.index! + match[0].length;
        const endIndex = i < matches.length - 1 ? matches[i + 1].index! : text.length;
        const content = text.slice(startIndex, endIndex).trim();

        if (content) {
          chapters.push({
            number: chapterNum,
            content,
          });
        }
      }
    }

    setParsedChapters(chapters);
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setRawText(text);
    if (text.trim()) {
      parseChapters(text);
    } else {
      setParsedChapters([]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setRawText(text);
      parseChapters(text);
      toast.success(`파일 "${file.name}"을 불러왔습니다.`);
    } catch {
      toast.error("파일을 읽는데 실패했습니다.");
    }
  };

  const handleUpload = async () => {
    if (parsedChapters.length === 0) {
      toast.error("업로드할 회차가 없습니다.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/works/${workId}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapters: parsedChapters }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "업로드에 실패했습니다.");
      }

      const result = await response.json();
      toast.success(`${result.created}개 회차가 업로드되었습니다.`);
      router.push(`/works/${workId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "업로드에 실패했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/works/${workId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">회차 업로드</h1>
          <p className="text-gray-500">원고 파일을 업로드하세요</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input */}
        <Card>
          <CardHeader>
            <CardTitle>원고 입력</CardTitle>
            <CardDescription>
              텍스트 파일을 업로드하거나 직접 붙여넣기 하세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Button variant="outline" asChild className="flex-1">
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  파일 업로드
                  <input
                    type="file"
                    accept=".txt,.text"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </Button>
            </div>

            <Textarea
              placeholder="원고를 여기에 붙여넣기 하세요...&#10;&#10;회차 구분:&#10;- 제1화, 1화, 第1章, Chapter 1 등의 패턴을 자동 인식합니다&#10;- 구분자가 없으면 전체가 1화로 처리됩니다"
              className="min-h-[400px] font-mono text-sm"
              value={rawText}
              onChange={handleTextChange}
            />

            <p className="text-xs text-gray-500">
              지원 형식: TXT (UTF-8 인코딩 권장)
            </p>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle>파싱 결과</CardTitle>
            <CardDescription>
              {parsedChapters.length > 0
                ? `${parsedChapters.length}개 회차가 인식되었습니다`
                : "원고를 입력하면 자동으로 회차를 분리합니다"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {parsedChapters.length === 0 ? (
              <div className="py-16 text-center text-gray-500">
                <FileText className="mx-auto h-12 w-12 text-gray-300" />
                <p className="mt-2">원고를 입력해주세요</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {parsedChapters.map((chapter, index) => (
                  <div
                    key={index}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{chapter.number}화</span>
                      <Badge variant="outline">
                        {chapter.content.length.toLocaleString()}자
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-3">
                      {chapter.content.slice(0, 200)}...
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <Button variant="outline" asChild>
          <Link href={`/works/${workId}`}>취소</Link>
        </Button>
        <Button
          onClick={handleUpload}
          disabled={isLoading || parsedChapters.length === 0}
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {parsedChapters.length}개 회차 업로드
        </Button>
      </div>
    </div>
  );
}
