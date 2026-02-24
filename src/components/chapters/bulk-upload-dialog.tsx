"use client";

import { FileText, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { parseChaptersFromText } from "@/lib/chapter-parser";
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
  onSuccess?: () => void;
}

export function BulkUploadDialog({ workId, onSuccess }: BulkUploadDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rawText, setRawText] = useState("");
  const [separator, setSeparator] = useState("");
  const [preview, setPreview] = useState<{ number: number; title?: string; wordCount: number }[]>([]);

  // 크기 기반 배치 분할 (Vercel 4.5MB 제한 → 3MB 타깃)
  const MAX_BATCH_BYTES = 3 * 1024 * 1024;

  function splitIntoBatches(chapters: { number: number; title?: string; content: string }[]) {
    const batches: (typeof chapters)[] = [];
    let current: typeof chapters = [];
    let currentSize = 0;

    for (const ch of chapters) {
      const chSize = ch.content.length * 3; // UTF-8 최대 3바이트/문자
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

  const handlePreview = async () => {
    if (!rawText.trim()) {
      toast.error("원문을 입력해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      // 클라이언트에서 챕터 파싱
      const parsed = parseChaptersFromText(rawText, separator || undefined);
      if (parsed.length === 0) {
        toast.error("챕터를 감지하지 못했습니다.");
        return;
      }

      setPreview(parsed.map((ch) => ({ number: ch.number, title: ch.title, wordCount: ch.content.length })));

      // 크기 기반 배치 분할 후 전송
      const batches = splitIntoBatches(parsed);
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

      toast.success(`${totalCreated + totalUpdated}개의 회차가 등록되었습니다.`);
      setOpen(false);
      router.refresh();
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // TXT 파일 인코딩 자동 감지 (UTF-8 → GBK/Big5 폴백)
  function decodeTextFile(buffer: ArrayBuffer): string {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      // UTF-8 실패 → GBK (중국어 간체) 시도
      return new TextDecoder("gbk").decode(buffer);
    }
  }

  // 파일 업로드 처리
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isTxt = fileName.endsWith('.txt');
    const isDocx = fileName.endsWith('.docx');

    if (!isTxt && !isDocx) {
      toast.error("TXT 또는 DOCX 파일만 업로드 가능합니다.");
      return;
    }

    setIsLoading(true);
    try {
      if (isTxt) {
        // TXT 파일은 클라이언트에서 직접 읽기 (인코딩 자동 감지)
        const buffer = await file.arrayBuffer();
        const text = decodeTextFile(buffer);
        setRawText(text);
        toast.success("파일이 로드되었습니다.");
      } else if (isDocx) {
        // DOCX 파일은 서버에서 파싱
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          일괄 업로드
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>원문 일괄 업로드</DialogTitle>
          <DialogDescription>
            원작의 전체 내용을 한 번에 업로드합니다. 챕터 구분은 자동으로 감지됩니다.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="paste">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="paste">텍스트 붙여넣기</TabsTrigger>
            <TabsTrigger value="file">파일 업로드</TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rawText">원문 전체</Label>
              <Textarea
                id="rawText"
                placeholder="원작 전체 내용을 붙여넣으세요. 챕터 구분(第X章, Chapter X, 제X화 등)이 자동으로 감지됩니다."
                className="min-h-[300px] font-mono text-sm"
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

        <div className="space-y-2">
          <Label htmlFor="separator">챕터 구분자 (선택)</Label>
          <Input
            id="separator"
            placeholder="자동 감지 또는 커스텀 구분자 입력 (예: ----, ====)"
            value={separator}
            onChange={(e) => setSeparator(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            비워두면 자동으로 챕터를 감지합니다 (第X章, Chapter X, 제X화 등)
          </p>
        </div>

        {preview && preview.length > 0 && (
          <div className="space-y-2">
            <Label>감지된 챕터</Label>
            <div className="max-h-[150px] overflow-y-auto rounded-md border p-2">
              {preview.map((ch) => (
                <div key={ch.number} className="flex justify-between py-1 text-sm">
                  <span>
                    {ch.number}화{ch.title && ` - ${ch.title}`}
                  </span>
                  <span className="text-muted-foreground">{ch.wordCount.toLocaleString()}자</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button onClick={handlePreview} disabled={isLoading || !rawText.trim()}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            업로드
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
