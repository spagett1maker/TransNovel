"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface RetranslateDialogProps {
  workId: string;
  chapterNumber: number;
  /** 현재 상태 - EDITED/APPROVED는 재번역 불가 */
  chapterStatus: string;
  /** 재번역 완료 후 콜백 */
  onComplete?: () => void;
}

export function RetranslateDialog({
  workId,
  chapterNumber,
  chapterStatus,
  onComplete,
}: RetranslateDialogProps) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isDisabled = ["EDITED", "APPROVED"].includes(chapterStatus);
  const isNotTranslated = ["PENDING", "TRANSLATING"].includes(chapterStatus);

  const handleRetranslate = useCallback(async () => {
    if (!feedback.trim()) {
      toast.error("피드백을 입력해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/works/${workId}/chapters/${chapterNumber}/retranslate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feedback: feedback.trim(),
            selectedText: selectedText.trim() || undefined,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "재번역에 실패했습니다.");
      }

      toast.success(`${chapterNumber}화 재번역이 완료되었습니다.`);
      setOpen(false);
      setFeedback("");
      setSelectedText("");
      onComplete?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "재번역에 실패했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  }, [workId, chapterNumber, feedback, selectedText, onComplete]);

  if (isDisabled || isNotTranslated) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          재번역
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{chapterNumber}화 재번역</DialogTitle>
          <DialogDescription>
            피드백을 입력하면 AI가 해당 내용을 반영하여 번역을 개선합니다.
            설정집의 재번역 프롬프트가 적용됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="feedback">
              피드백 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="feedback"
              placeholder={"수정하고 싶은 부분을 설명해주세요.\n\n예시:\n- 말투를 좀 더 격식체로 바꿔주세요\n- \"검기\"를 \"검강\"으로 통일해주세요\n- 전체적으로 문장을 더 자연스럽게 다듬어주세요"}
              className="min-h-[120px]"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="selectedText">
              특정 구간 (선택)
            </Label>
            <Textarea
              id="selectedText"
              placeholder="특정 문장이나 단락만 수정하고 싶으면 해당 텍스트를 붙여넣으세요. 비워두면 전체 번역이 개선됩니다."
              className="min-h-[80px]"
              value={selectedText}
              onChange={(e) => setSelectedText(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              비워두면 전체 번역문에 피드백이 적용됩니다
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            취소
          </Button>
          <Button
            onClick={handleRetranslate}
            disabled={isLoading || !feedback.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                재번역 중...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                재번역 실행
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
