"use client";

import { useState, useCallback, useEffect } from "react";
import { ChapterStatus, SnapshotType } from "@prisma/client";
import { toast } from "sonner";

export interface SnapshotAuthor {
  id: string;
  name: string;
  image: string | null;
}

export interface Snapshot {
  id: string;
  name: string | null;
  description: string | null;
  snapshotType: SnapshotType;
  status: ChapterStatus;
  triggerEvent: string | null;
  createdAt: string;
  author: SnapshotAuthor;
}

interface UseSnapshotsOptions {
  workId: string;
  chapterNum: number | undefined;
}

interface CreateSnapshotData {
  name?: string;
  description?: string;
}

export function useSnapshots({ workId, chapterNum }: UseSnapshotsOptions) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // Fetch snapshots
  const fetchSnapshots = useCallback(
    async (page = 1) => {
      if (!workId || chapterNum == null) {
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        setError(null);

        const url = `/api/works/${workId}/chapters/${chapterNum}/snapshots?page=${page}&limit=20`;
        const response = await fetch(url);

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "스냅샷을 불러오는 데 실패했습니다");
        }

        const data = await response.json();
        setSnapshots(data.data);
        setPagination(data.pagination);
      } catch (err) {
        const message = err instanceof Error ? err.message : "오류가 발생했습니다";
        setError(message);
        console.error("Error fetching snapshots:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [workId, chapterNum]
  );

  // Initial fetch
  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  // Create snapshot
  const createSnapshot = useCallback(
    async (data: CreateSnapshotData): Promise<Snapshot | null> => {
      try {
        const response = await fetch(
          `/api/works/${workId}/chapters/${chapterNum}/snapshots`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "스냅샷 생성에 실패했습니다");
        }

        const newSnapshot = await response.json();
        setSnapshots((prev) => [newSnapshot, ...prev]);
        toast.success("스냅샷이 생성되었습니다");
        return newSnapshot;
      } catch (err) {
        const message = err instanceof Error ? err.message : "오류가 발생했습니다";
        toast.error(message);
        console.error("Error creating snapshot:", err);
        return null;
      }
    },
    [workId, chapterNum]
  );

  // Delete snapshot
  const deleteSnapshot = useCallback(
    async (snapshotId: string): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/works/${workId}/chapters/${chapterNum}/snapshots/${snapshotId}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "스냅샷 삭제에 실패했습니다");
        }

        setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId));
        toast.success("스냅샷이 삭제되었습니다");
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "오류가 발생했습니다";
        toast.error(message);
        console.error("Error deleting snapshot:", err);
        return false;
      }
    },
    [workId, chapterNum]
  );

  // Restore snapshot
  const restoreSnapshot = useCallback(
    async (snapshotId: string): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/works/${workId}/chapters/${chapterNum}/snapshots/${snapshotId}/restore`,
          {
            method: "POST",
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "스냅샷 복원에 실패했습니다");
        }

        toast.success("스냅샷이 복원되었습니다");
        // Refresh snapshots to include the backup
        await fetchSnapshots();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "오류가 발생했습니다";
        toast.error(message);
        console.error("Error restoring snapshot:", err);
        return false;
      }
    },
    [workId, chapterNum, fetchSnapshots]
  );

  return {
    snapshots,
    isLoading,
    error,
    pagination,
    fetchSnapshots,
    createSnapshot,
    deleteSnapshot,
    restoreSnapshot,
  };
}
