"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/translation-context";

interface DeleteWorkButtonProps {
  workId: string;
  workTitle: string;
}

export function DeleteWorkButton({ workId, workTitle }: DeleteWorkButtonProps) {
  const router = useRouter();
  const { removeJob, getJobByWorkId } = useTranslation();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/works/${workId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "삭제에 실패했습니다.");
        setIsDeleting(false);
        return;
      }

      // 관련 번역 작업 Context에서 제거 (모달 무한루프 방지)
      const existingJob = getJobByWorkId(workId);
      if (existingJob) {
        removeJob(existingJob.jobId);
      }

      router.push("/works");
      router.refresh();
    } catch {
      setError("삭제에 실패했습니다.");
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10">
          <Trash2 className="h-4 w-4 mr-2" />
          프로젝트 삭제
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>프로젝트 삭제</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{workTitle}</strong> 프로젝트를 삭제하시겠습니까?
            <br />
            모든 회차, 번역본, 용어집 데이터가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "삭제 중..." : "삭제"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
