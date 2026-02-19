"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDialogProps {
  workId: string;
  stats: {
    characters: number;
    terms: number;
    events: number;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: () => void;
}

export function ConfirmDialog({
  workId,
  stats,
  open,
  onOpenChange,
  onConfirmed,
}: ConfirmDialogProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  async function handleConfirm() {
    setIsConfirming(true);
    try {
      const response = await fetch(`/api/works/${workId}/setting-bible/confirm`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "확정에 실패했습니다.");
      }

      const result = await response.json();
      toast.success(result.message);
      onConfirmed();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "확정에 실패했습니다.");
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            설정집 확정
          </DialogTitle>
          <DialogDescription>
            설정집을 확정하면 번역을 시작할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* 요약 통계 */}
          <div className="grid grid-cols-3 gap-2 p-4 bg-muted rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-semibold">{stats.characters}</div>
              <div className="text-xs text-muted-foreground">인물</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold">{stats.terms}</div>
              <div className="text-xs text-muted-foreground">용어</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold">{stats.events}</div>
              <div className="text-xs text-muted-foreground">이벤트</div>
            </div>
          </div>

          {/* 안내 */}
          <div className="flex gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-300">
              <p className="font-medium mb-1">확정 시 처리 사항</p>
              <ul className="text-xs space-y-1 list-disc ml-4">
                <li>용어집이 자동으로 동기화됩니다</li>
                <li>번역 시 인물/용어 정보가 자동 적용됩니다</li>
                <li>확정 후에도 설정집 수정이 가능하며, 수정 후 재동기화할 수 있습니다</li>
              </ul>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleConfirm} disabled={isConfirming}>
            {isConfirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            확정하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
