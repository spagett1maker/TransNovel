"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  ReactNode,
} from "react";

// 서버에서 가져오는 작업 상태
interface ServerJobStatus {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";
  totalBatches: number;
  currentBatchIndex: number;
  analyzedChapters: number;
  errorMessage?: string | null;
  lastError?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

// 클라이언트에서 사용하는 작업 상태 (기존 인터페이스와 호환)
export interface BibleGenerationJob {
  workId: string;
  workTitle: string;
  status: "idle" | "generating" | "completed" | "failed";
  currentBatch: number;
  totalBatches: number;
  analyzedChapters: number;
  totalChapters: number;
  error?: string;
  retryCount?: number;
  stats?: {
    characters: number;
    terms: number;
    events: number;
  };
  createdAt: Date;
  progress: number; // 0-100
}

interface BibleGenerationContextType {
  jobs: BibleGenerationJob[];
  activeJobsCount: number;
  // 작업 등록 (서버에 POST 후 polling 시작)
  registerJob: (workId: string, workTitle: string, totalChapters: number) => Promise<{ jobId: string; totalBatches: number } | null>;
  // 작업 취소
  cancelGeneration: (workId: string) => Promise<void>;
  // 작업 제거 (UI에서만)
  removeJob: (workId: string) => void;
  // workId로 작업 찾기
  getJobByWorkId: (workId: string) => BibleGenerationJob | undefined;
  // polling 시작/정지
  startPolling: (workId: string, workTitle: string, totalChapters: number) => void;
  stopPolling: (workId: string) => void;

  // 하위 호환: 기존 코드가 아직 사용할 수 있도록 (no-op 또는 최소 구현)
  startGeneration: (workId: string, workTitle: string, totalChapters: number, totalBatches: number) => void;
  updateProgress: (workId: string, update: Partial<Omit<BibleGenerationJob, "workId" | "workTitle" | "createdAt">>) => void;
  completeGeneration: (workId: string, stats?: BibleGenerationJob["stats"]) => void;
  failGeneration: (workId: string, error: string) => void;
  isCancelRequested: (workId: string) => boolean;
  clearCancelRequest: (workId: string) => void;
}

const BibleGenerationContext = createContext<BibleGenerationContextType | undefined>(
  undefined
);

function mapServerStatus(status: ServerJobStatus["status"]): BibleGenerationJob["status"] {
  switch (status) {
    case "PENDING":
    case "IN_PROGRESS":
      return "generating";
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "failed";
    default:
      return "idle";
  }
}

export function BibleGenerationProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Map<string, BibleGenerationJob>>(new Map());
  const pollingIntervals = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [cancelRequests] = useState<Set<string>>(new Set());

  // Polling 시작
  const startPolling = useCallback(
    (workId: string, workTitle: string, totalChapters: number) => {
      // 이미 polling 중이면 중복 방지
      if (pollingIntervals.current.has(workId)) return;

      const poll = async () => {
        try {
          const res = await fetch(`/api/works/${workId}/setting-bible/status`);
          if (!res.ok) return;
          const data = await res.json();
          const serverJob: ServerJobStatus | null = data.job;

          if (!serverJob || serverJob.status === "CANCELLED") {
            // 작업 없거나 취소됨 → polling 정지
            stopPolling(workId);
            setJobs((prev) => {
              const next = new Map(prev);
              next.delete(workId);
              return next;
            });
            return;
          }

          const clientJob: BibleGenerationJob = {
            workId,
            workTitle,
            status: mapServerStatus(serverJob.status),
            currentBatch: serverJob.currentBatchIndex,
            totalBatches: serverJob.totalBatches,
            analyzedChapters: serverJob.analyzedChapters,
            totalChapters: data.totalChapters ?? totalChapters,
            error: serverJob.errorMessage ?? serverJob.lastError ?? undefined,
            stats: data.stats,
            createdAt: new Date(serverJob.createdAt),
            progress: serverJob.totalBatches > 0
              ? Math.round((serverJob.currentBatchIndex / serverJob.totalBatches) * 100)
              : 0,
          };

          setJobs((prev) => {
            const next = new Map(prev);
            next.set(workId, clientJob);
            return next;
          });

          // 완료 또는 실패 시 polling 정지
          if (serverJob.status === "COMPLETED" || serverJob.status === "FAILED") {
            stopPolling(workId);
          }
        } catch (err) {
          console.error("[BibleGeneration] Polling error:", err);
        }
      };

      // 즉시 1회 실행 후 3초 간격
      poll();
      const interval = setInterval(poll, 3000);
      pollingIntervals.current.set(workId, interval);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Polling 정지
  const stopPolling = useCallback((workId: string) => {
    const interval = pollingIntervals.current.get(workId);
    if (interval) {
      clearInterval(interval);
      pollingIntervals.current.delete(workId);
    }
  }, []);

  // 클린업
  useEffect(() => {
    return () => {
      pollingIntervals.current.forEach((interval) => clearInterval(interval));
      pollingIntervals.current.clear();
    };
  }, []);

  // 작업 등록 (POST → polling 시작)
  const registerJob = useCallback(
    async (workId: string, workTitle: string, totalChapters: number) => {
      try {
        const res = await fetch(`/api/works/${workId}/setting-bible/generate`, {
          method: "POST",
        });

        const data = await res.json();

        if (!res.ok) {
          // 이미 진행 중인 작업이 있으면 polling만 시작
          if (res.status === 409 && data.jobId) {
            startPolling(workId, workTitle, totalChapters);
            return { jobId: data.jobId, totalBatches: 0 };
          }
          throw new Error(data.error || "작업 생성 실패");
        }

        if (data.alreadyComplete) {
          return null;
        }

        // polling 시작
        startPolling(workId, workTitle, totalChapters);

        return {
          jobId: data.jobId as string,
          totalBatches: data.totalBatches as number,
        };
      } catch (err) {
        console.error("[BibleGeneration] registerJob error:", err);
        throw err;
      }
    },
    [startPolling]
  );

  // 작업 취소
  const cancelGeneration = useCallback(
    async (workId: string) => {
      stopPolling(workId);
      setJobs((prev) => {
        const next = new Map(prev);
        next.delete(workId);
        return next;
      });

      try {
        await fetch(`/api/works/${workId}/setting-bible/generate`, {
          method: "DELETE",
        });
      } catch (err) {
        console.error("[BibleGeneration] Cancel error:", err);
      }
    },
    [stopPolling]
  );

  // 작업 제거 (UI에서만)
  const removeJob = useCallback((workId: string) => {
    stopPolling(workId);
    setJobs((prev) => {
      const next = new Map(prev);
      next.delete(workId);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopPolling]);

  // workId로 찾기
  const getJobByWorkId = useCallback(
    (workId: string) => jobs.get(workId),
    [jobs]
  );

  // 배열 변환
  const jobsArray = useMemo(() => {
    try {
      return Array.from(jobs.values()).sort((a, b) => {
        const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
        const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
        return aTime - bTime;
      });
    } catch {
      return Array.from(jobs.values());
    }
  }, [jobs]);

  const activeJobsCount = useMemo(
    () => jobsArray.filter((job) => job.status === "generating").length,
    [jobsArray]
  );

  // 하위 호환 메서드 (no-op — 기존 코드에서 호출해도 에러 안 남)
  const startGeneration = useCallback(
    (_workId: string, _workTitle: string, _totalChapters: number, _totalBatches: number) => {},
    []
  );
  const updateProgress = useCallback(
    (_workId: string, _update: Partial<Omit<BibleGenerationJob, "workId" | "workTitle" | "createdAt">>) => {},
    []
  );
  const completeGeneration = useCallback(
    (_workId: string, _stats?: BibleGenerationJob["stats"]) => {},
    []
  );
  const failGeneration = useCallback((_workId: string, _error: string) => {}, []);
  const isCancelRequested = useCallback((_workId: string) => cancelRequests.has(_workId), [cancelRequests]);
  const clearCancelRequest = useCallback((_workId: string) => {}, []);

  return (
    <BibleGenerationContext.Provider
      value={{
        jobs: jobsArray,
        activeJobsCount,
        registerJob,
        cancelGeneration,
        removeJob,
        getJobByWorkId,
        startPolling,
        stopPolling,
        // 하위 호환
        startGeneration,
        updateProgress,
        completeGeneration,
        failGeneration,
        isCancelRequested,
        clearCancelRequest,
      }}
    >
      {children}
    </BibleGenerationContext.Provider>
  );
}

export function useBibleGeneration() {
  const context = useContext(BibleGenerationContext);
  if (context === undefined) {
    throw new Error(
      "useBibleGeneration must be used within a BibleGenerationProvider"
    );
  }
  return context;
}
