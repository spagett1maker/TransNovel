"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, FileText, Info, Loader2, Plus, RefreshCw, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { parseChaptersFromText, type ParsedChapter } from "@/lib/chapter-parser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface BulkUploadDialogProps {
  workId: string;
  /** 이미 업로드된 회차 번호 목록 (부분 업로드 시 신규/덮어쓰기 표시용) */
  existingChapterNumbers?: number[];
  onSuccess?: () => void;
}

type Step = "input" | "preview" | "uploading" | "done";

export function BulkUploadDialog({ workId, existingChapterNumbers = [], onSuccess }: BulkUploadDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [isLoading, setIsLoading] = useState(false);
  const [rawText, setRawText] = useState("");
  const [separator, setSeparator] = useState("");
  const [startNumber, setStartNumber] = useState("");
  const [parsedChapters, setParsedChapters] = useState<ParsedChapter[]>([]);
  const [uploadResult, setUploadResult] = useState<{ created: number; updated: number } | null>(null);

  const hasExistingChapters = existingChapterNumbers.length > 0;
  const existingSet = useMemo(() => new Set(existingChapterNumbers), [existingChapterNumbers]);

  // 크기 기반 배치 분할 (Vercel 4.5MB 제한 → 3MB 타깃)
  const MAX_BATCH_BYTES = 3 * 1024 * 1024;

  function splitIntoBatches(chapters: ParsedChapter[]) {
    const batches: ParsedChapter[][] = [];
    let current: ParsedChapter[] = [];
    let currentSize = 0;

    for (const ch of chapters) {
      const chSize = ch.content.length * 3;
      if (current.length > 0 && currentSize + chSize > MAX_BATCH_BYTES) {
        batches.push(current);
        current = [];
        currentSize = 0;
      }
      current.push(ch);
      currentSize += chSize;
    }
    if (current.length > 0) batches.push(current);
    return batches;
  }

  // Step 1 → Step 2: 파싱 후 프리뷰 표시
  const handleParse = useCallback(() => {
    if (!rawText.trim()) {
      toast.error("원문을 입력해주세요.");
      return;
    }

    let parsed = parseChaptersFromText(rawText, separator || undefined);
    if (parsed.length === 0) {
      toast.error("챕터를 감지하지 못했습니다. 구분자를 지정해 보세요.");
      return;
    }

    // 시작 회차 번호 오프셋 적용
    const offset = parseInt(startNumber, 10);
    if (!isNaN(offset) && offset > 0) {
      // 파서가 1부터 번호를 매긴 경우, offset-1을 더해 원하는 시작 번호로 조정
      const firstNum = parsed[0].number;
      const delta = offset - firstNum;
      if (delta !== 0) {
        parsed = parsed.map((ch) => ({ ...ch, number: ch.number + delta }));
      }
    }

    setParsedChapters(parsed);
    setStep("preview");
  }, [rawText, separator, startNumber]);

  // Step 2 → Step 3: 확인 후 업로드 실행
  const handleUpload = async () => {
    if (parsedChapters.length === 0) return;

    setStep("uploading");
    setIsLoading(true);

    try {
      const batches = splitIntoBatches(parsedChapters);
      let totalCreated = 0;
      let totalUpdated = 0;

      for (const batch of batches) {
        const response = await fetch(`/api/works/${workId}/chapters/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapters: batch }),
        });

        let data;
        try {
          data = await response.json();
        } catch {
          throw new Error("서버 오류가 발생했습니다. 다시 시도해주세요.");
        }

        if (!response.ok) {
          throw new Error(data.error || "업로드에 실패했습니다.");
        }

        totalCreated += data.created || 0;
        totalUpdated += data.updated || 0;
      }

      setUploadResult({ created: totalCreated, updated: totalUpdated });
      setStep("done");
      router.refresh();
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "오류가 발생했습니다.");
      setStep("preview");
    } finally {
      setIsLoading(false);
    }
  };

  // 다이얼로그 닫을 때 상태 초기화
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setStep("input");
      setRawText("");
      setSeparator("");
      setStartNumber("");
      setParsedChapters([]);
      setUploadResult(null);
    }
  };

  // TXT 파일 인코딩 자동 감지 (UTF-8 → GBK 폴백)
  function decodeTextFile(buffer: ArrayBuffer): string {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      return new TextDecoder("gbk").decode(buffer);
    }
  }

  // 파일 업로드 처리
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isTxt = fileName.endsWith(".txt");
    const isDocx = fileName.endsWith(".docx");

    if (!isTxt && !isDocx) {
      toast.error("TXT 또는 DOCX 파일만 업로드 가능합니다.");
      return;
    }

    setIsLoading(true);
    try {
      if (isTxt) {
        const buffer = await file.arrayBuffer();
        const text = decodeTextFile(buffer);
        setRawText(text);
        toast.success("파일이 로드되었습니다.");
      } else if (isDocx) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`/api/works/${workId}/chapters/parse-file`, {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "파일 처리에 실패했습니다.");
        }

        setRawText(data.text);
        toast.success(`파일이 로드되었습니다. (${data.charCount.toLocaleString()}자)`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "파일 읽기에 실패했습니다.");
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
    const newCount = parsedChapters.filter((ch) => !existingSet.has(ch.number)).length;
    const overwriteCount = parsedChapters.filter((ch) => existingSet.has(ch.number)).length;
    return { totalChars, avgChars, hasWarning, newCount, overwriteCount };
  }, [parsedChapters, existingSet]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          {hasExistingChapters ? "회차 업로드" : "일괄 업로드"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "input" && "원문 업로드"}
            {step === "preview" && "분할 결과 확인"}
            {step === "uploading" && "업로드 중..."}
            {step === "done" && "업로드 완료"}
          </DialogTitle>
          <DialogDescription>
            {step === "input" && (
              hasExistingChapters
                ? "추가 회차를 업로드하거나 기존 회차를 덮어쓸 수 있습니다."
                : "원작의 전체 내용을 한 번에 업로드합니다. 챕터 구분은 자동으로 감지됩니다."
            )}
            {step === "preview" && "아래 분할 결과를 확인하세요. 문제가 있으면 돌아가서 구분자를 수정할 수 있습니다."}
            {step === "uploading" && "회차를 서버에 업로드하는 중입니다..."}
            {step === "done" && "모든 회차가 성공적으로 등록되었습니다."}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Input */}
        {step === "input" && (
          <>
            {/* 기존 회차 정보 표시 */}
            {hasExistingChapters && (
              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/40">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <p>
                    현재 <strong>{existingChapterNumbers.length}개</strong> 회차가 등록되어 있습니다
                    ({Math.min(...existingChapterNumbers)}~{Math.max(...existingChapterNumbers)}화).
                  </p>
                  <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                    같은 번호의 회차를 업로드하면 원문이 덮어쓰기됩니다. 새로운 번호는 추가됩니다.
                  </p>
                </div>
              </div>
            )}

            <Tabs defaultValue="paste">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="paste">텍스트 붙여넣기</TabsTrigger>
                <TabsTrigger value="file">파일 업로드</TabsTrigger>
              </TabsList>

              <TabsContent value="paste" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rawText">원문</Label>
                  <Textarea
                    id="rawText"
                    placeholder={
                      hasExistingChapters
                        ? "추가할 회차의 내용을 붙여넣으세요.\n\n챕터 구분이 자동 감지됩니다. 시작 회차 번호를 지정하면 원하는 위치에 배치할 수 있습니다."
                        : "원작 전체 내용을 붙여넣으세요. 챕터 구분(第X章, Chapter X, 제X화 등)이 자동으로 감지됩니다."
                    }
                    className="min-h-[250px] font-mono text-sm"
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {rawText.length.toLocaleString()}자 입력됨
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="file" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="file">파일 업로드</Label>
                  <div className="flex items-center gap-4">
                    <Input
                      id="file"
                      type="file"
                      accept=".txt,.docx"
                      onChange={handleFileUpload}
                      disabled={isLoading}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    TXT 또는 DOCX 파일을 업로드하세요 (UTF-8 인코딩 권장)
                  </p>
                </div>
                {isLoading && (
                  <div className="rounded-md bg-primary/10 p-4">
                    <p className="text-sm text-primary">
                      <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" />
                      파일을 처리하는 중...
                    </p>
                  </div>
                )}
                {rawText && !isLoading && (
                  <div className="rounded-md bg-muted p-4">
                    <p className="text-sm text-muted-foreground">
                      <FileText className="inline-block mr-2 h-4 w-4" />
                      {rawText.length.toLocaleString()}자 로드됨
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* 옵션 영역 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="separator">챕터 구분자 (선택)</Label>
                <Input
                  id="separator"
                  placeholder="자동 감지 또는 구분자 입력 (예: ----)"
                  value={separator}
                  onChange={(e) => setSeparator(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  비워두면 자동 감지 (第X章, Chapter X, 제X화 등)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="startNumber">시작 회차 번호 (선택)</Label>
                <Input
                  id="startNumber"
                  type="number"
                  min="1"
                  placeholder={hasExistingChapters ? `예: ${Math.max(...existingChapterNumbers) + 1}` : "자동 (파서 결과 사용)"}
                  value={startNumber}
                  onChange={(e) => setStartNumber(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {hasExistingChapters
                    ? "이어서 업로드 시 시작 번호를 지정하세요"
                    : "비워두면 파서가 감지한 번호 사용"
                  }
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                취소
              </Button>
              <Button onClick={handleParse} disabled={isLoading || !rawText.trim()}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                분할 미리보기
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 2: Preview */}
        {step === "preview" && (
          <>
            {/* 경고 배너: 1개만 감지된 경우 */}
            {stats?.hasWarning && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
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
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="gap-1">
                총 {parsedChapters.length}개 회차
              </Badge>
              {hasExistingChapters && stats && stats.newCount > 0 && (
                <Badge variant="default" className="gap-1 bg-emerald-600">
                  <Plus className="h-3 w-3" />
                  {stats.newCount}개 신규
                </Badge>
              )}
              {hasExistingChapters && stats && stats.overwriteCount > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <RefreshCw className="h-3 w-3" />
                  {stats.overwriteCount}개 덮어쓰기
                </Badge>
              )}
              <span className="text-muted-foreground">
                전체 {stats?.totalChars.toLocaleString()}자 · 평균 {stats?.avgChars.toLocaleString()}자/회차
              </span>
            </div>

            {/* 덮어쓰기 경고 */}
            {hasExistingChapters && stats && stats.overwriteCount > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  <strong>{stats.overwriteCount}개</strong> 회차가 이미 존재합니다. 업로드 시 해당 회차의 원문이 새 내용으로 덮어쓰기됩니다.
                </p>
              </div>
            )}

            {/* 프리뷰 목록 */}
            <div className="max-h-[300px] overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr className="border-b">
                    <th className="py-2 px-3 text-left font-medium w-16">번호</th>
                    <th className="py-2 px-3 text-left font-medium">제목</th>
                    <th className="py-2 px-3 text-right font-medium w-20">글자수</th>
                    {hasExistingChapters && (
                      <th className="py-2 px-3 text-center font-medium w-20">상태</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {parsedChapters.map((ch, idx) => {
                    const prevVolume = idx > 0 ? parsedChapters[idx - 1].volume : undefined;
                    const showVolumeHeader = ch.volume && ch.volume !== prevVolume;
                    const displayNum = ch.volumeNumber ?? ch.number;
                    const isExisting = existingSet.has(ch.number);
                    const colSpan = hasExistingChapters ? 4 : 3;

                    return (
                      <>
                        {showVolumeHeader && (
                          <tr key={`vol-${ch.number}-${idx}`} className="bg-muted/50">
                            <td colSpan={colSpan} className="py-1.5 px-3">
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
                          {hasExistingChapters && (
                            <td className="py-1.5 px-3 text-center">
                              {isExisting ? (
                                <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                  <RefreshCw className="h-3 w-3" />
                                  덮어쓰기
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                  <Plus className="h-3 w-3" />
                                  신규
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <DialogFooter className="flex-row gap-2 sm:justify-between">
              <Button variant="ghost" onClick={() => setStep("input")} className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                돌아가기
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  취소
                </Button>
                <Button onClick={handleUpload}>
                  {parsedChapters.length}개 회차 업로드
                </Button>
              </div>
            </DialogFooter>
          </>
        )}

        {/* Step 3: Uploading */}
        {step === "uploading" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {parsedChapters.length}개 회차를 업로드하는 중...
            </p>
          </div>
        )}

        {/* Step 4: Done */}
        {step === "done" && uploadResult && (
          <>
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <div className="text-center">
                <p className="text-lg font-medium">업로드 완료</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {uploadResult.created > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Plus className="h-3 w-3" />
                      {uploadResult.created}개 신규 생성
                    </span>
                  )}
                  {uploadResult.created > 0 && uploadResult.updated > 0 && " · "}
                  {uploadResult.updated > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" />
                      {uploadResult.updated}개 덮어쓰기
                    </span>
                  )}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>
                닫기
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
