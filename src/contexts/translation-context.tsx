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

// 경량 작업 요약 정보 (서버와 동일한 구조)
export interface TranslationJobSummary {
  jobId: string;
  workId: string;
  workTitle: string;
  status: "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "FAILED";
  totalChapters: number;
  completedChapters: number;
  failedChapters: number;
  currentChapter?: {
    number: number;
    currentChunk: number;
    totalChunks: number;
  };
  error?: string;
  createdAt: Date;
  updatedAt?: Date; // 멈춘 작업 감지용
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
  pauseJob: (jobId: string) => Promise<boolean>;
}

const TranslationContext = createContext<TranslationContextType | undefined>(
  undefined
);

export function TranslationProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Map<string, TranslationJobSummary>>(
    new Map()
  );
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());
  const isInitializedRef = useRef(false);

  // SSE 연결 종료 함수 (먼저 선언)
  const disconnectSSE = useCallback((jobId: string) => {
    const es = eventSourcesRef.current.get(jobId);
    if (es) {
      console.log("[TranslationContext] SSE 연결 종료:", jobId);
      es.close();
      eventSourcesRef.current.delete(jobId);
    }
  }, []);

  // SSE 연결 함수
  const connectSSE = useCallback((jobId: string) => {
    if (eventSourcesRef.current.has(jobId)) {
      console.log("[TranslationContext] SSE 이미 연결됨:", jobId);
      return;
    }

    console.log("[TranslationContext] SSE 연결 시작:", jobId);
    const es = new EventSource(`/api/translation/stream?jobId=${jobId}`);
    eventSourcesRef.current.set(jobId, es);

    es.onmessage = (event) => {
      try {
        // keepalive 핑 무시
        if (event.data.startsWith(":")) return;

        const data = JSON.parse(event.data);
        console.log("[TranslationContext] SSE 이벤트:", data.type, jobId);

        setJobs((prev) => {
          const newJobs = new Map(prev);
          const job = newJobs.get(jobId);
          if (!job) return prev;

          switch (data.type) {
            case "job_started":
              newJobs.set(jobId, {
                ...job,
                status: "IN_PROGRESS",
                totalChapters: data.data.totalChapters ?? job.totalChapters,
                currentChapter: data.data.currentChapter,
              });
              break;

            case "chapter_started":
              newJobs.set(jobId, {
                ...job,
                currentChapter: {
                  number: data.data.chapterNumber,
                  currentChunk: 0,
                  totalChunks: data.data.totalChunks ?? 0,
                },
              });
              break;

            case "chunk_progress":
              newJobs.set(jobId, {
                ...job,
                currentChapter: {
                  number: data.data.chapterNumber,
                  currentChunk: data.data.currentChunk ?? 0,
                  totalChunks: data.data.totalChunks ?? job.currentChapter?.totalChunks ?? 0,
                },
              });
              break;

            case "chapter_completed":
            case "chapter_partial":
              newJobs.set(jobId, {
                ...job,
                completedChapters: data.data.completedChapters ?? job.completedChapters + 1,
                currentChapter: undefined,
              });
              break;

            case "chapter_failed":
              newJobs.set(jobId, {
                ...job,
                failedChapters: data.data.failedChapters ?? job.failedChapters + 1,
                currentChapter: undefined,
              });
              break;

            case "job_paused":
              newJobs.set(jobId, {
                ...job,
                status: "PAUSED",
                currentChapter: undefined,
              });
              break;

            case "job_completed":
              newJobs.set(jobId, {
                ...job,
                status: "COMPLETED",
                completedChapters: data.data.completedChapters ?? job.totalChapters,
                currentChapter: undefined,
              });
              break;

            case "job_failed":
              newJobs.set(jobId, {
                ...job,
                status: "FAILED",
                error: data.data.error,
                currentChapter: undefined,
              });
              break;
          }

          return newJobs;
        });

        // SSE 연결 종료는 상태 업데이트 후 수행
        if (data.type === "job_paused" || data.type === "job_completed" || data.type === "job_failed") {
          const currentEs = eventSourcesRef.current.get(jobId);
          if (currentEs) {
            console.log("[TranslationContext] SSE 연결 종료:", jobId);
            currentEs.close();
            eventSourcesRef.current.delete(jobId);
          }
        }
      } catch (e) {
        console.error("[TranslationContext] SSE 파싱 에러:", e);
      }
    };

    es.onerror = (err) => {
      console.error("[TranslationContext] SSE 에러:", jobId, err);
      // 연결 실패 시 정리
      const currentEs = eventSourcesRef.current.get(jobId);
      if (currentEs) {
        currentEs.close();
        eventSourcesRef.current.delete(jobId);
      }

      // 작업 상태를 FAILED로 업데이트 (서버에서 찾을 수 없는 경우)
      setJobs((prev) => {
        const newJobs = new Map(prev);
        const job = newJobs.get(jobId);
        if (job && (job.status === "PENDING" || job.status === "IN_PROGRESS")) {
          newJobs.set(jobId, {
            ...job,
            status: "FAILED",
            error: "연결 끊김 - 페이지를 새로고침하고 다시 시도해주세요",
          });
        }
        return newJobs;
      });
    };
  }, []);

  // 서버에서 활성 작업 복구
  const refreshJobs = useCallback(async () => {
    try {
      console.log("[TranslationContext] 서버에서 작업 목록 조회");
      const response = await fetch("/api/translation/active");
      if (!response.ok) {
        console.error("[TranslationContext] 작업 목록 조회 실패:", response.status);
        return;
      }

      const data = await response.json();
      console.log("[TranslationContext] 서버 작업:", data.jobs?.length || 0);

      if (data.jobs && Array.isArray(data.jobs)) {
        const newJobs = new Map<string, TranslationJobSummary>();
        const jobsToConnect: string[] = [];

        data.jobs.forEach(
          (job: {
            jobId: string;
            workId: string;
            workTitle: string;
            status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
            totalChapters: number;
            completedChapters: number;
            failedChapters: number;
            currentChapter?: {
              number: number;
              currentChunk: number;
              totalChunks: number;
            };
            error?: string;
            createdAt: string;
            updatedAt?: string;
          }) => {
            newJobs.set(job.jobId, {
              ...job,
              createdAt: new Date(job.createdAt),
              updatedAt: job.updatedAt ? new Date(job.updatedAt) : undefined,
            });

            // 진행 중인 작업에 대해 SSE 연결 대기 목록에 추가
            if (
              (job.status === "PENDING" || job.status === "IN_PROGRESS") &&
              !eventSourcesRef.current.has(job.jobId)
            ) {
              jobsToConnect.push(job.jobId);
            }
          }
        );

        setJobs(newJobs);

        // 상태 업데이트 후 SSE 연결
        jobsToConnect.forEach((jobId) => {
          connectSSE(jobId);
        });
      }
    } catch (error) {
      console.error("[TranslationContext] 작업 목록 조회 에러:", error);
    }
  }, [connectSSE]);

  // 초기 로드 시 서버에서 작업 복구
  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      // setTimeout으로 스케줄링하여 cascading render 방지
      const timeoutId = setTimeout(() => {
        refreshJobs();
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    // 컴포넌트 언마운트 시 모든 SSE 연결 정리
    const currentEventSources = eventSourcesRef.current;
    return () => {
      currentEventSources.forEach((es) => es.close());
      currentEventSources.clear();
    };
  }, [refreshJobs]);

  // 주기적으로 완료된 작업의 stale EventSource 정리 (메모리 누수 방지)
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const currentJobs = jobs;
      eventSourcesRef.current.forEach((es, jobId) => {
        const job = currentJobs.get(jobId);
        // 작업이 완료/실패/일시정지 상태이거나 작업이 없으면 EventSource 정리
        if (!job || job.status === "COMPLETED" || job.status === "FAILED" || job.status === "PAUSED") {
          console.log("[TranslationContext] Stale EventSource 정리:", jobId);
          es.close();
          eventSourcesRef.current.delete(jobId);
        }
      });
    }, 30000); // 30초마다 정리

    return () => clearInterval(cleanupInterval);
  }, [jobs]);

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
        createdAt: new Date(),
      };

      setJobs((prev) => {
        const newJobs = new Map(prev);
        newJobs.set(jobId, newJob);
        return newJobs;
      });

      // SSE 연결
      connectSSE(jobId);
    },
    [connectSSE]
  );

  // 특정 작업 추적 중지 (SSE만 종료, 상태는 유지)
  const stopTracking = useCallback(
    (jobId: string) => {
      console.log("[TranslationContext] 추적 중지:", jobId);
      disconnectSSE(jobId);
    },
    [disconnectSSE]
  );

  // 작업 제거 (UI에서 닫기)
  const removeJob = useCallback(
    async (jobId: string) => {
      console.log("[TranslationContext] 작업 제거:", jobId);

      // SSE 연결 종료
      disconnectSSE(jobId);

      // 로컬 상태에서 제거
      setJobs((prev) => {
        const newJobs = new Map(prev);
        newJobs.delete(jobId);
        return newJobs;
      });

      // 서버에서도 제거
      try {
        await fetch(`/api/translation/active?jobId=${jobId}`, {
          method: "DELETE",
        });
      } catch (error) {
        console.error("[TranslationContext] 서버 작업 제거 실패:", error);
      }
    },
    [disconnectSSE]
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

    // 서버에서도 제거
    await Promise.all(
      completedJobIds.map((jobId) =>
        fetch(`/api/translation/active?jobId=${jobId}`, {
          method: "DELETE",
        }).catch((error) =>
          console.error("[TranslationContext] 서버 작업 제거 실패:", jobId, error)
        )
      )
    );
  }, [jobs]);

  // jobs Map을 배열로 변환 (생성 시간순 정렬) - useMemo로 최적화
  const jobsArray = useMemo(
    () =>
      Array.from(jobs.values()).sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      ),
    [jobs]
  );

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

  // 작업 일시정지
  const pauseJob = useCallback(async (jobId: string): Promise<boolean> => {
    console.log("[TranslationContext] 일시정지 요청:", jobId);

    try {
      const response = await fetch("/api/translation/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error("[TranslationContext] 일시정지 실패:", data.error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("[TranslationContext] 일시정지 에러:", error);
      return false;
    }
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
        pauseJob,
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
