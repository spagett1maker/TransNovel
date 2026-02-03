"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";

// 경량 작업 요약 정보 (서버와 동일한 구조)
// 챕터 단위 진행률만 추적 (청크 없음)
export interface TranslationJobSummary {
  jobId: string;
  workId: string;
  workTitle: string;
  status: "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "FAILED";
  totalChapters: number;
  completedChapters: number;
  failedChapters: number;
  failedChapterNums: number[]; // 실패한 챕터 번호 목록
  currentChapter?: {
    number: number;
    currentChunk?: number;
    totalChunks?: number;
  };
  error?: string;
  createdAt: Date;
  updatedAt?: Date; // 멈춘 작업 감지용
  // 계산된 진행률 (0-100) - 모든 UI에서 동일한 값 사용
  progress: number;
}

// 진행률 계산 헬퍼 함수
function calculateProgress(completedChapters: number, totalChapters: number): number {
  if (totalChapters === 0) return 0;
  return Math.round((completedChapters / totalChapters) * 100);
}

interface TranslationContextType {
  jobs: TranslationJobSummary[];
  activeJobsCount: number;
  startTracking: (
    jobId: string,
    workId: string,
    workTitle: string,
    totalChapters: number
  ) => void;
  stopTracking: (jobId: string) => void;
  removeJob: (jobId: string) => void;
  removeAllCompleted: () => void;
  refreshJobs: () => Promise<void>;
  getJobByWorkId: (workId: string) => TranslationJobSummary | undefined;
  cancelJob: (workId: string) => Promise<boolean>;
  // 클라이언트 측 번역 상태 업데이트 (translate/page.tsx에서 사용)
  updateClientProgress: (
    workId: string,
    workTitle: string,
    progress: {
      status: "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "FAILED";
      totalChapters: number;
      completedChapters: number;
      failedChapters: number;
      currentChapter?: {
        number: number;
      };
      error?: string;
    }
  ) => void;
  removeClientJob: (workId: string) => void;
}

const TranslationContext = createContext<TranslationContextType | undefined>(
  undefined
);

// 폴링 간격 (3초)
const POLLING_INTERVAL_MS = 3000;

export function TranslationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Map<string, TranslationJobSummary>>(
    new Map()
  );
  const isInitializedRef = useRef(false);

  // 폴링 중인 workId 추적
  const pollingWorkIdsRef = useRef<Set<string>>(new Set());
  const pollingIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // workId에 대한 폴링 중지
  const stopPolling = useCallback((workId: string) => {
    const intervalId = pollingIntervalsRef.current.get(workId);
    if (intervalId) {
      clearInterval(intervalId);
      pollingIntervalsRef.current.delete(workId);
    }
    pollingWorkIdsRef.current.delete(workId);
    console.log("[TranslationContext] 폴링 중지:", workId);
  }, []);

  // 단일 작업 상태 조회 및 업데이트
  const fetchJobStatus = useCallback(async (workId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/works/${workId}/translate/job`);
      if (!response.ok) {
        if (response.status === 401) {
          console.log("[TranslationContext] 세션 미설정");
          return false;
        }
        if (response.status === 403) {
          // 권한 없음 - 폴링 중지
          return false;
        }
        return true; // 다른 에러는 계속 폴링
      }

      const data = await response.json();
      const serverJob = data.activeJob;

      if (!serverJob) {
        // 활성 작업이 없으면 최근 완료/실패 작업 확인
        if (data.recentJob) {
          setJobs((prev) => {
            const newJobs = new Map(prev);
            const existingJob = Array.from(prev.values()).find(j => j.workId === workId);
            if (existingJob) {
              newJobs.set(existingJob.jobId, {
                ...existingJob,
                status: data.recentJob.status,
                completedChapters: data.recentJob.completedChapters ?? existingJob.completedChapters,
                failedChapters: data.recentJob.failedChapters ?? existingJob.failedChapters,
                failedChapterNums: data.recentJob.failedChapterNums ?? [],
                error: data.recentJob.errorMessage,
                progress: calculateProgress(
                  data.recentJob.completedChapters ?? existingJob.completedChapters,
                  existingJob.totalChapters
                ),
              });
            }
            return newJobs;
          });
          router.refresh();
        }
        return false; // 폴링 중지
      }

      // 작업 상태 업데이트
      setJobs((prev) => {
        const newJobs = new Map(prev);
        const existingJob = Array.from(prev.values()).find(j => j.workId === workId);

        const updatedJob: TranslationJobSummary = {
          jobId: serverJob.jobId,
          workId,
          workTitle: existingJob?.workTitle || "",
          status: serverJob.status,
          totalChapters: serverJob.totalChapters,
          completedChapters: serverJob.completedChapters,
          failedChapters: serverJob.failedChapters,
          failedChapterNums: serverJob.failedChapterNums ?? [],
          error: serverJob.errorMessage || serverJob.lastError,
          createdAt: existingJob?.createdAt || new Date(serverJob.startedAt || Date.now()),
          updatedAt: new Date(serverJob.updatedAt),
          progress: calculateProgress(serverJob.completedChapters, serverJob.totalChapters),
        };

        newJobs.set(serverJob.jobId, updatedJob);
        return newJobs;
      });

      // 터미널 상태면 폴링 중지
      if (serverJob.status === "COMPLETED" || serverJob.status === "FAILED" || serverJob.status === "CANCELLED") {
        router.refresh();
        return false;
      }

      return true; // 계속 폴링
    } catch (error) {
      console.error("[TranslationContext] 작업 상태 조회 에러:", error);
      return true; // 네트워크 오류 시 계속 폴링
    }
  }, [router]);

  // workId에 대한 폴링 시작
  const startPolling = useCallback((workId: string) => {
    if (pollingWorkIdsRef.current.has(workId)) {
      console.log("[TranslationContext] 이미 폴링 중:", workId);
      return;
    }

    console.log("[TranslationContext] 폴링 시작:", workId);
    pollingWorkIdsRef.current.add(workId);

    // 즉시 한 번 조회
    fetchJobStatus(workId).then((shouldContinue) => {
      if (!shouldContinue) {
        stopPolling(workId);
        return;
      }

      // 폴링 인터벌 설정
      const intervalId = setInterval(async () => {
        const shouldContinue = await fetchJobStatus(workId);
        if (!shouldContinue) {
          stopPolling(workId);
        }
      }, POLLING_INTERVAL_MS);

      pollingIntervalsRef.current.set(workId, intervalId);
    });
  }, [fetchJobStatus, stopPolling]);

  // 서버에서 활성 작업 복구 (초기화 시)
  const refreshJobs = useCallback(async () => {
    try {
      console.log("[TranslationContext] 서버에서 작업 목록 조회");
      const response = await fetch("/api/translation/active");
      if (!response.ok) {
        if (response.status === 401) {
          console.log("[TranslationContext] 세션 미설정, 작업 목록 조회 스킵");
        }
        return;
      }

      const data = await response.json();
      console.log("[TranslationContext] 서버 작업:", data.jobs?.length || 0);

      if (data.jobs && Array.isArray(data.jobs)) {
        const newJobs = new Map<string, TranslationJobSummary>();

        data.jobs.forEach(
          (job: {
            jobId: string;
            workId: string;
            workTitle: string;
            status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
            totalChapters: number;
            completedChapters: number;
            failedChapters: number;
            failedChapterNums?: number[];
            error?: string;
            createdAt: string;
            updatedAt?: string;
          }) => {
            newJobs.set(job.jobId, {
              ...job,
              failedChapterNums: job.failedChapterNums ?? [],
              createdAt: new Date(job.createdAt),
              updatedAt: job.updatedAt ? new Date(job.updatedAt) : undefined,
              progress: calculateProgress(job.completedChapters, job.totalChapters),
            });

            // 진행 중인 작업에 대해 폴링 시작
            if (job.status === "PENDING" || job.status === "IN_PROGRESS") {
              startPolling(job.workId);
            }
          }
        );

        setJobs(newJobs);
      }
    } catch (error) {
      console.error("[TranslationContext] 작업 목록 조회 에러:", error);
    }
  }, [startPolling]);

  // 초기 로드 시 서버에서 작업 복구
  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      const timeoutId = setTimeout(() => {
        refreshJobs();
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    // 컴포넌트 언마운트 시 모든 폴링 정리
    const currentIntervals = pollingIntervalsRef.current;
    return () => {
      currentIntervals.forEach((intervalId) => clearInterval(intervalId));
      currentIntervals.clear();
      pollingWorkIdsRef.current.clear();
    };
  }, [refreshJobs]);

  // 새 작업 추적 시작
  const startTracking = useCallback(
    (jobId: string, workId: string, workTitle: string, totalChapters: number) => {
      console.log("[TranslationContext] 추적 시작:", {
        jobId,
        workId,
        workTitle,
        totalChapters,
      });

      const newJob: TranslationJobSummary = {
        jobId,
        workId,
        workTitle,
        status: "PENDING",
        totalChapters,
        completedChapters: 0,
        failedChapters: 0,
        failedChapterNums: [],
        createdAt: new Date(),
        progress: 0,
      };

      setJobs((prev) => {
        const newJobs = new Map(prev);
        newJobs.set(jobId, newJob);
        return newJobs;
      });

      // 폴링 시작
      startPolling(workId);
    },
    [startPolling]
  );

  // 특정 작업 추적 중지
  const stopTracking = useCallback(
    (jobId: string) => {
      console.log("[TranslationContext] 추적 중지:", jobId);
      // jobId로 workId 찾기
      const job = Array.from(jobs.values()).find(j => j.jobId === jobId);
      if (job) {
        stopPolling(job.workId);
      }
    },
    [jobs, stopPolling]
  );

  // 작업 제거 (UI에서 닫기)
  const removeJob = useCallback(
    async (jobId: string) => {
      console.log("[TranslationContext] 작업 제거:", jobId);

      // jobId로 workId 찾기
      const job = Array.from(jobs.values()).find(j => j.jobId === jobId);
      if (job) {
        stopPolling(job.workId);
      }

      // 로컬 상태에서 제거
      setJobs((prev) => {
        const newJobs = new Map(prev);
        newJobs.delete(jobId);
        return newJobs;
      });
    },
    [jobs, stopPolling]
  );

  // 완료된 작업 모두 제거
  const removeAllCompleted = useCallback(async () => {
    console.log("[TranslationContext] 완료된 작업 모두 제거");

    const completedJobIds: string[] = [];
    jobs.forEach((job) => {
      if (job.status === "COMPLETED" || job.status === "FAILED") {
        completedJobIds.push(job.jobId);
      }
    });

    // 로컬 상태에서 제거
    setJobs((prev) => {
      const newJobs = new Map(prev);
      completedJobIds.forEach((id) => newJobs.delete(id));
      return newJobs;
    });
  }, [jobs]);

  // jobs Map을 배열로 변환 (생성 시간순 정렬) - useMemo로 최적화
  const jobsArray = useMemo(() => {
    try {
      const arr = Array.from(jobs.values());
      return arr.sort((a, b) => {
        const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
        const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
        return aTime - bTime;
      });
    } catch (e) {
      console.error("[TranslationContext] jobsArray 정렬 오류:", e);
      return Array.from(jobs.values());
    }
  }, [jobs]);

  // 진행 중인 작업 수 - useMemo로 최적화
  const activeJobsCount = useMemo(
    () =>
      jobsArray.filter(
        (job) => job.status === "PENDING" || job.status === "IN_PROGRESS"
      ).length,
    [jobsArray]
  );

  // workId로 인덱싱된 Map - useMemo로 최적화
  const jobsByWorkId = useMemo(() => {
    const map = new Map<string, TranslationJobSummary>();
    jobsArray.forEach((job) => map.set(job.workId, job));
    return map;
  }, [jobsArray]);

  // workId로 작업 찾기 - O(1) 조회
  const getJobByWorkId = useCallback(
    (workId: string): TranslationJobSummary | undefined => {
      return jobsByWorkId.get(workId);
    },
    [jobsByWorkId]
  );

  // 작업 취소 (Cron 기반)
  const cancelJob = useCallback(async (workId: string): Promise<boolean> => {
    console.log("[TranslationContext] 취소 요청:", workId);

    try {
      const response = await fetch(`/api/works/${workId}/translate/job`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error("[TranslationContext] 취소 실패:", data.error);
        return false;
      }

      // 폴링 중지 및 상태 업데이트
      stopPolling(workId);

      setJobs((prev) => {
        const newJobs = new Map(prev);
        const job = Array.from(prev.values()).find(j => j.workId === workId);
        if (job) {
          newJobs.set(job.jobId, {
            ...job,
            status: "FAILED",
            error: "사용자에 의해 취소됨",
          });
        }
        return newJobs;
      });

      router.refresh();
      return true;
    } catch (error) {
      console.error("[TranslationContext] 취소 에러:", error);
      return false;
    }
  }, [stopPolling, router]);

  // 클라이언트 측 번역 상태 업데이트 (translate/page.tsx에서 사용)
  const updateClientProgress = useCallback(
    (
      workId: string,
      workTitle: string,
      progress: {
        status: "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "FAILED";
        totalChapters: number;
        completedChapters: number;
        failedChapters: number;
        currentChapter?: {
          number: number;
        };
        error?: string;
      }
    ) => {
      // 클라이언트 측 번역은 "client-" prefix로 구분
      const jobId = `client-${workId}`;

      setJobs((prev) => {
        const newJobs = new Map(prev);
        const existingJob = newJobs.get(jobId);

        newJobs.set(jobId, {
          jobId,
          workId,
          workTitle,
          status: progress.status,
          totalChapters: progress.totalChapters,
          completedChapters: progress.completedChapters,
          failedChapters: progress.failedChapters,
          failedChapterNums: existingJob?.failedChapterNums ?? [],
          currentChapter: progress.currentChapter,
          error: progress.error,
          createdAt: existingJob?.createdAt || new Date(),
          updatedAt: new Date(),
          progress: calculateProgress(progress.completedChapters, progress.totalChapters),
        });

        return newJobs;
      });
    },
    []
  );

  // 클라이언트 측 번역 작업 제거
  const removeClientJob = useCallback((workId: string) => {
    const jobId = `client-${workId}`;
    setJobs((prev) => {
      const newJobs = new Map(prev);
      newJobs.delete(jobId);
      return newJobs;
    });
  }, []);

  return (
    <TranslationContext.Provider
      value={{
        jobs: jobsArray,
        activeJobsCount,
        startTracking,
        stopTracking,
        removeJob,
        removeAllCompleted,
        refreshJobs,
        getJobByWorkId,
        cancelJob,
        updateClientProgress,
        removeClientJob,
      }}
    >
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (context === undefined) {
    throw new Error("useTranslation must be used within a TranslationProvider");
  }
  return context;
}
