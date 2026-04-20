"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseChaptersFromText, type ParsedChapter } from "@/lib/chapter-parser";

type Step = "input" | "preview" | "uploading";

export default function ChaptersPage() {
  const params = useParams();
  const router = useRouter();
  const workId = params.id as string;

  const [step, setStep] = useState<Step>("input");
  const [isLoading, setIsLoading] = useState(false);
  const [rawText, setRawText] = useState("");
  const [separator, setSeparator] = useState("");
  const [parsedChapters, setParsedChapters] = useState<ParsedChapter[]>([]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawText(e.target.value);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setRawText(text);
      toast.success(`파일 "${file.name}"을 불러왔습니다.`);
    } catch {
      toast.error("파일을 읽는데 실패했습니다.");
    }
  };

  // Step 1 → Step 2: 파싱 후 프리뷰
  const handleParse = useCallback(() => {
    if (!rawText.trim()) {
      toast.error("원고를 입력해주세요.");
      return;
    }

    const chapters = parseChaptersFromText(rawText, separator || undefined);
    if (chapters.length === 0) {
      toast.error("챕터를 감지하지 못했습니다. 구분자를 지정해 보세요.");
      return;
    }

    setParsedChapters(chapters);
    setStep("preview");
  }, [rawText, separator]);

  // Step 2 → Upload
  const handleUpload = async () => {
    if (parsedChapters.length === 0) return;

    setStep("uploading");
    setIsLoading(true);

    try {
      const response = await fetch(`/api/works/${workId}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapters: parsedChapters }),
      });

      if (!response.ok) {
        let message = "업로드에 실패했습니다.";
        try {
          const error = await response.json();
          message = error.error || message;
        } catch {
          if (response.status === 413) {
            message = "텍스트가 너무 큽니다. 더 적은 회차로 나눠서 업로드해주세요.";
          }
        }
        throw new Error(message);
      }

      const result = await response.json();
      toast.success(`${result.created}개 회차가 업로드되었습니다.`);
      router.push(`/works/${workId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "업로드에 실패했습니다."
      );
      setStep("preview"); // 실패 시 프리뷰로 복귀
    } finally {
      setIsLoading(false);
    }
  };

  // 프리뷰 통계
  const stats = useMemo(() => {
    if (parsedChapters.length === 0) return null;
    const totalChars = parsedChapters.reduce((sum, ch) => sum + ch.content.length, 0);
    const avgChars = Math.round(totalChars / parsedChapters.length);
    const hasWarning = parsedChapters.length === 1 && totalChars > 5000;
    return { totalChars, avgChars, hasWarning };
  }, [parsedChapters]);

  // 실시간 파싱 결과 (입력 단계에서만 사용)
  const livePreview = useMemo(() => {
    if (!rawText.trim()) return [];
    return parseChaptersFromText(rawText, separator || undefined);
  }, [rawText, separator]);

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/works/${workId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">회차 업로드</h1>
          <p className="text-muted-foreground">
            {step === "input" && "원고 파일을 업로드하세요"}
            {step === "preview" && "분할 결과를 확인하고 업로드하세요"}
            {step === "uploading" && "업로드 중..."}
          </p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 text-sm">
        <Badge variant={step === "input" ? "default" : "outline"}>1. 입력</Badge>
        <span className="text-muted-foreground">→</span>
        <Badge variant={step === "preview" ? "default" : "outline"}>2. 확인</Badge>
        <span className="text-muted-foreground">→</span>
        <Badge variant={step === "uploading" ? "default" : "outline"}>3. 업로드</Badge>
      </div>

      {/* Step 1: Input */}
      {step === "input" && (
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
                placeholder={"원고를 여기에 붙여넣기 하세요...\n\n회차 구분:\n- 第1章, 第 1 章, 제1화, Chapter 1 등의 패턴을 자동 인식합니다\n- 구분자가 없으면 전체가 1화로 처리됩니다"}
                className="min-h-[400px] font-mono text-sm"
                value={rawText}
                onChange={handleTextChange}
              />

              {/* 구분자 입력 */}
              <div className="space-y-2">
                <Label htmlFor="separator">챕터 구분자 (선택)</Label>
                <Input
                  id="separator"
                  placeholder="자동 감지 또는 커스텀 구분자 (예: ----, ====)"
                  value={separator}
                  onChange={(e) => setSeparator(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  자동 감지 실패 시 구분자를 직접 입력하세요
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Live Preview */}
          <Card>
            <CardHeader>
              <CardTitle>실시간 감지</CardTitle>
              <CardDescription>
                {livePreview.length > 0
                  ? `${livePreview.length}개 회차가 인식됨`
                  : "원고를 입력하면 자동으로 회차를 분리합니다"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {livePreview.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground/40" />
                  <p className="mt-2">원고를 입력해주세요</p>
                </div>
              ) : (
                <>
                  {/* 경고: 1개만 감지 */}
                  {livePreview.length === 1 && rawText.length > 5000 && (
                    <div className="flex items-start gap-2 mb-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-950/40">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        자동 분할이 작동하지 않았습니다. 구분자를 직접 입력해 보세요.
                      </p>
                    </div>
                  )}
                  <div className="space-y-2 max-h-[380px] overflow-y-auto">
                    {livePreview.map((chapter, index) => {
                      const prevVolume = index > 0 ? livePreview[index - 1].volume : undefined;
                      const showVolumeHeader = chapter.volume && chapter.volume !== prevVolume;
                      const displayNum = chapter.volumeNumber ?? chapter.number;

                      return (
                        <div key={index}>
                          {showVolumeHeader && (
                            <div className="text-xs font-semibold text-muted-foreground border-t pt-2 mt-2 first:border-t-0 first:mt-0">
                              {chapter.volume}
                            </div>
                          )}
                          <div className="rounded-lg border p-2.5 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">
                                {displayNum}화{chapter.title && ` - ${chapter.title}`}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {chapter.content.length.toLocaleString()}자
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {chapter.content.slice(0, 150)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: Preview/Confirm */}
      {step === "preview" && (
        <Card>
          <CardHeader>
            <CardTitle>분할 결과 확인</CardTitle>
            <CardDescription>
              아래 결과가 올바른지 확인하세요. 문제가 있으면 돌아가서 수정할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 경고 */}
            {stats?.hasWarning && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-900 dark:text-amber-100">
                    챕터가 1개만 감지되었습니다
                  </p>
                  <p className="text-amber-700 dark:text-amber-300 mt-1">
                    자동 분할이 작동하지 않았을 수 있습니다. 돌아가서 구분자를 직접 입력해 보세요.
                  </p>
                </div>
              </div>
            )}

            {/* 통계 */}
            <div className="flex items-center gap-4 text-sm">
              <Badge variant="default">
                총 {parsedChapters.length}개 회차
              </Badge>
              <span className="text-muted-foreground">
                전체 {stats?.totalChars.toLocaleString()}자 · 회차 평균 {stats?.avgChars.toLocaleString()}자
              </span>
            </div>

            {/* 테이블 */}
            <div className="max-h-[400px] overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr className="border-b">
                    <th className="py-2 px-3 text-left font-medium w-16">번호</th>
                    <th className="py-2 px-3 text-left font-medium">제목</th>
                    <th className="py-2 px-3 text-right font-medium w-20">글자수</th>
                    <th className="py-2 px-3 text-left font-medium">첫 줄 미리보기</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedChapters.map((ch, idx) => {
                    const prevVolume = idx > 0 ? parsedChapters[idx - 1].volume : undefined;
                    const showVolumeHeader = ch.volume && ch.volume !== prevVolume;
                    const displayNum = ch.volumeNumber ?? ch.number;

                    return (
                      <>
                        {showVolumeHeader && (
                          <tr key={`vol-${ch.number}`} className="bg-muted/50">
                            <td colSpan={4} className="py-1.5 px-3">
                              <span className="text-xs font-semibold">{ch.volume}</span>
                            </td>
                          </tr>
                        )}
                        <tr key={`ch-${ch.number}-${idx}`} className="border-b last:border-b-0 hover:bg-muted/30">
                          <td className="py-1.5 px-3 text-muted-foreground tabular-nums">
                            {displayNum}화
                          </td>
                          <td className="py-1.5 px-3 truncate max-w-[200px]">
                            {ch.title || <span className="text-muted-foreground">-</span>}
                          </td>
                          <td className="py-1.5 px-3 text-right text-muted-foreground tabular-nums">
                            {ch.content.length.toLocaleString()}
                          </td>
                          <td className="py-1.5 px-3 text-xs text-muted-foreground truncate max-w-[250px]">
                            {ch.content.split("\n")[0]?.slice(0, 60)}
                          </td>
                        </tr>
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Uploading */}
      {step === "uploading" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">
              {parsedChapters.length}개 회차를 업로드하는 중...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between gap-4">
        <div>
          {step === "preview" && (
            <Button variant="ghost" onClick={() => setStep("input")} className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              돌아가서 수정
            </Button>
          )}
        </div>
        <div className="flex gap-4">
          <Button variant="outline" asChild>
            <Link href={`/works/${workId}`}>취소</Link>
          </Button>
          {step === "input" && (
            <Button
              onClick={handleParse}
              disabled={!rawText.trim()}
            >
              분할 미리보기 →
            </Button>
          )}
          {step === "preview" && (
            <Button
              onClick={handleUpload}
              disabled={isLoading || parsedChapters.length === 0}
            >
              {parsedChapters.length}개 회차 업로드
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
