"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from "react";

// 설정집 생성 작업 상태
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
  startGeneration: (
    workId: string,
    workTitle: string,
    totalChapters: number,
    batchSize: number
  ) => void;
  updateProgress: (
    workId: string,
    update: Partial<Omit<BibleGenerationJob, "workId" | "workTitle" | "createdAt">>
  ) => void;
  completeGeneration: (
    workId: string,
    stats?: BibleGenerationJob["stats"]
  ) => void;
  failGeneration: (workId: string, error: string) => void;
  removeJob: (workId: string) => void;
  cancelGeneration: (workId: string) => void;
  getJobByWorkId: (workId: string) => BibleGenerationJob | undefined;
  // 취소 요청 확인 (GenerationProgress에서 사용)
  isCancelRequested: (workId: string) => boolean;
  clearCancelRequest: (workId: string) => void;
}

const BibleGenerationContext = createContext<BibleGenerationContextType | undefined>(
  undefined
);

export function BibleGenerationProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Map<string, BibleGenerationJob>>(new Map());
  const [cancelRequests, setCancelRequests] = useState<Set<string>>(new Set());

  // 새 작업 시작
  const startGeneration = useCallback(
    (workId: string, workTitle: string, totalChapters: number, batchSize: number) => {
      console.log("[BibleGeneration] 생성 시작:", { workId, workTitle, totalChapters });

      const totalBatches = Math.ceil(totalChapters / batchSize);
      const newJob: BibleGenerationJob = {
        workId,
        workTitle,
        status: "generating",
        currentBatch: 0,
        totalBatches,
        analyzedChapters: 0,
        totalChapters,
        createdAt: new Date(),
        progress: 0,
      };

      setJobs((prev) => {
        const newJobs = new Map(prev);
        newJobs.set(workId, newJob);
        return newJobs;
      });
    },
    []
  );

  // 진행률 업데이트
  const updateProgress = useCallback(
    (
      workId: string,
      update: Partial<Omit<BibleGenerationJob, "workId" | "workTitle" | "createdAt">>
    ) => {
      setJobs((prev) => {
        const newJobs = new Map(prev);
        const job = newJobs.get(workId);
        if (!job) return prev;

        const updatedJob = { ...job, ...update };
        // 진행률 계산
        if (updatedJob.totalBatches > 0) {
          updatedJob.progress = Math.round(
            (updatedJob.currentBatch / updatedJob.totalBatches) * 100
          );
        }

        newJobs.set(workId, updatedJob);
        return newJobs;
      });
    },
    []
  );

  // 완료
  const completeGeneration = useCallback(
    (workId: string, stats?: BibleGenerationJob["stats"]) => {
      console.log("[BibleGeneration] 생성 완료:", workId);

      setJobs((prev) => {
        const newJobs = new Map(prev);
        const job = newJobs.get(workId);
        if (!job) return prev;

        newJobs.set(workId, {
          ...job,
          status: "completed",
          progress: 100,
          stats,
        });
        return newJobs;
      });
    },
    []
  );

  // 실패
  const failGeneration = useCallback((workId: string, error: string) => {
    console.log("[BibleGeneration] 생성 실패:", workId, error);

    setJobs((prev) => {
      const newJobs = new Map(prev);
      const job = newJobs.get(workId);
      if (!job) return prev;

      newJobs.set(workId, {
        ...job,
        status: "failed",
        error,
      });
      return newJobs;
    });
  }, []);

  // 작업 제거
  const removeJob = useCallback((workId: string) => {
    console.log("[BibleGeneration] 작업 제거:", workId);

    setJobs((prev) => {
      const newJobs = new Map(prev);
      newJobs.delete(workId);
      return newJobs;
    });
  }, []);

  // 작업 취소
  const cancelGeneration = useCallback((workId: string) => {
    console.log("[BibleGeneration] 생성 취소 요청:", workId);

    // 취소 요청 플래그 설정
    setCancelRequests((prev) => {
      const newSet = new Set(prev);
      newSet.add(workId);
      return newSet;
    });

    // 상태 업데이트
    setJobs((prev) => {
      const newJobs = new Map(prev);
      const job = newJobs.get(workId);
      if (!job) return prev;

      newJobs.set(workId, {
        ...job,
        status: "idle",
        error: "취소됨",
      });
      return newJobs;
    });
  }, []);

  // 취소 요청 확인
  const isCancelRequested = useCallback(
    (workId: string): boolean => {
      return cancelRequests.has(workId);
    },
    [cancelRequests]
  );

  // 취소 요청 클리어
  const clearCancelRequest = useCallback((workId: string) => {
    setCancelRequests((prev) => {
      const newSet = new Set(prev);
      newSet.delete(workId);
      return newSet;
    });
  }, []);

  // jobs Map을 배열로 변환 (안전하게)
  const jobsArray = useMemo(() => {
    try {
      const arr = Array.from(jobs.values());
      return arr.sort((a, b) => {
        const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
        const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
        return aTime - bTime;
      });
    } catch (e) {
      console.error("[BibleGeneration] jobsArray 정렬 오류:", e);
      return Array.from(jobs.values());
    }
  }, [jobs]);

  // 진행 중인 작업 수
  const activeJobsCount = useMemo(
    () => jobsArray.filter((job) => job.status === "generating").length,
    [jobsArray]
  );

  // workId로 작업 찾기
  const getJobByWorkId = useCallback(
    (workId: string): BibleGenerationJob | undefined => {
      return jobs.get(workId);
    },
    [jobs]
  );

  return (
    <BibleGenerationContext.Provider
      value={{
        jobs: jobsArray,
        activeJobsCount,
        startGeneration,
        updateProgress,
        completeGeneration,
        failGeneration,
        removeJob,
        cancelGeneration,
        getJobByWorkId,
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
