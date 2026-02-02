"use client";

import { useState } from "react";
import { SnapshotType } from "@prisma/client";
import {
  History,
  Plus,
  RotateCcw,
  Trash2,
  MoreHorizontal,
  Camera,
  Clock,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSnapshots, Snapshot } from "@/hooks/useSnapshots";
import { useEditorContext } from "../EditorProvider";
import { cn } from "@/lib/utils";

export function SnapshotPanel() {
  const { work, chapter, fetchData } = useEditorContext();
  const workId = work?.id ?? "";
  const chapterNum = chapter?.number;

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newSnapshotName, setNewSnapshotName] = useState("");
  const [newSnapshotDescription, setNewSnapshotDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [restoreDialogSnapshot, setRestoreDialogSnapshot] = useState<Snapshot | null>(
    null
  );
  const [isRestoring, setIsRestoring] = useState(false);
  const [deleteDialogSnapshot, setDeleteDialogSnapshot] = useState<Snapshot | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    snapshots,
    isLoading,
    createSnapshot,
    deleteSnapshot,
    restoreSnapshot,
  } = useSnapshots({
    workId,
    chapterNum,
  });

  const handleCreateSnapshot = async () => {
    setIsCreating(true);
    const result = await createSnapshot({
      name: newSnapshotName || undefined,
      description: newSnapshotDescription || undefined,
    });

    if (result) {
      setIsCreateDialogOpen(false);
      setNewSnapshotName("");
      setNewSnapshotDescription("");
    }
    setIsCreating(false);
  };

  const handleRestore = async () => {
    if (!restoreDialogSnapshot || isRestoring) return;

    setIsRestoring(true);
    const result = await restoreSnapshot(restoreDialogSnapshot.id);
    if (result) {
      setRestoreDialogSnapshot(null);
      // Refresh editor content
      fetchData();
    }
    setIsRestoring(false);
  };

  const handleDelete = async () => {
    if (!deleteDialogSnapshot || isDeleting) return;

    setIsDeleting(true);
    const result = await deleteSnapshot(deleteDialogSnapshot.id);
    if (result) {
      setDeleteDialogSnapshot(null);
    }
    setIsDeleting(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getSnapshotTypeLabel = (type: SnapshotType) => {
    switch (type) {
      case "MANUAL":
        return "수동";
      case "AUTO_SAVE":
        return "자동 저장";
      case "STATUS_CHANGE":
        return "상태 변경";
      case "RETRANSLATE":
        return "재번역 전";
      default:
        return type;
    }
  };

  const getSnapshotIcon = (type: SnapshotType) => {
    switch (type) {
      case "MANUAL":
        return <Camera className="h-3 w-3" />;
      case "AUTO_SAVE":
        return <Clock className="h-3 w-3" />;
      case "STATUS_CHANGE":
        return <AlertTriangle className="h-3 w-3" />;
      default:
        return <History className="h-3 w-3" />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <h3 className="font-medium text-sm">버전 히스토리</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          스냅샷을 생성하고 이전 버전으로 복원하세요
        </p>
      </div>

      {/* Snapshots List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
          </div>
        ) : snapshots.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8 px-4">
            <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>아직 스냅샷이 없습니다</p>
            <p className="text-xs mt-1">
              위의 + 버튼을 눌러 현재 상태를 저장하세요
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                className="p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded",
                          snapshot.snapshotType === "MANUAL"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {getSnapshotIcon(snapshot.snapshotType)}
                        {getSnapshotTypeLabel(snapshot.snapshotType)}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate">
                      {snapshot.name || formatDate(snapshot.createdAt)}
                    </p>
                    {snapshot.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {snapshot.description}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {snapshot.author.name} · {formatDate(snapshot.createdAt)}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setRestoreDialogSnapshot(snapshot)}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        복원
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteDialogSnapshot(snapshot)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        삭제
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Snapshot Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>스냅샷 생성</DialogTitle>
            <DialogDescription>
              현재 챕터 상태를 스냅샷으로 저장합니다
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                이름 (선택)
              </label>
              <Input
                value={newSnapshotName}
                onChange={(e) => setNewSnapshotName(e.target.value)}
                placeholder="예: 1차 윤문 완료"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                설명 (선택)
              </label>
              <Textarea
                value={newSnapshotDescription}
                onChange={(e) => setNewSnapshotDescription(e.target.value)}
                placeholder="이 스냅샷에 대한 메모..."
                className="resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              취소
            </Button>
            <Button onClick={handleCreateSnapshot} disabled={isCreating}>
              {isCreating ? "생성 중..." : "스냅샷 생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog
        open={!!restoreDialogSnapshot}
        onOpenChange={() => setRestoreDialogSnapshot(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>스냅샷 복원</DialogTitle>
            <DialogDescription>
              이 스냅샷으로 복원하시겠습니까? 현재 내용은 자동으로 백업됩니다.
              <br />
              <br />
              <span className="font-medium">
                {restoreDialogSnapshot?.name ||
                  (restoreDialogSnapshot &&
                    formatDate(restoreDialogSnapshot.createdAt))}
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreDialogSnapshot(null)} disabled={isRestoring}>취소</Button>
            <Button onClick={handleRestore} disabled={isRestoring}>
              {isRestoring ? "복원 중..." : "복원"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteDialogSnapshot}
        onOpenChange={() => setDeleteDialogSnapshot(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>스냅샷 삭제</DialogTitle>
            <DialogDescription>
              이 스냅샷을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
              <br />
              <br />
              <span className="font-medium">
                {deleteDialogSnapshot?.name ||
                  (deleteDialogSnapshot &&
                    formatDate(deleteDialogSnapshot.createdAt))}
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogSnapshot(null)} disabled={isDeleting}>취소</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
