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
// 챕터 단위 진행률만 추적 (청크 없음)
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
  pauseJob: (jobId: string) => Promise<boolean>;
  resumeJob: (jobId: string) => Promise<{ success: boolean; error?: string }>;
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

export function TranslationProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Map<string, TranslationJobSummary>>(
    new Map()
  );
  const jobsRef = useRef<Map<string, TranslationJobSummary>>(jobs);
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());
  const isInitializedRef = useRef(false);

  // jobs 상태가 변경될 때마다 ref 업데이트
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  // SSE 연결 종료 함수 (먼저 선언)
  const disconnectSSE = useCallback((jobId: string) => {
    const es = eventSourcesRef.current.get(jobId);
    if (es) {
      console.log("[TranslationContext] SSE 연결 종료:", jobId);
      es.close();
      eventSourcesRef.current.delete(jobId);
    }
  }, []);

  // SSE 재연결 시도 횟수 추적
  const reconnectAttemptsRef = useRef<Map<string, number>>(new Map());
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000; // 3초

  // SSE 연결 함수
  const connectSSE = useCallback((jobId: string, isReconnect: boolean = false) => {
    if (eventSourcesRef.current.has(jobId)) {
      console.log("[TranslationContext] SSE 이미 연결됨:", jobId);
      return;
    }

    const attempts = reconnectAttemptsRef.current.get(jobId) || 0;
    if (isReconnect) {
      console.log(`[TranslationContext] SSE 재연결 시도 (${attempts + 1}/${MAX_RECONNECT_ATTEMPTS}):`, jobId);
    } else {
      console.log("[TranslationContext] SSE 연결 시작:", jobId);
      reconnectAttemptsRef.current.set(jobId, 0); // 새 연결 시 카운터 리셋
    }

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
            case "job_started": {
              const totalChapters = data.data.totalChapters ?? job.totalChapters;
              newJobs.set(jobId, {
                ...job,
                status: "IN_PROGRESS",
                totalChapters,
                currentChapter: data.data.currentChapter
                  ? { number: data.data.currentChapter.number }
                  : undefined,
                progress: calculateProgress(job.completedChapters, totalChapters),
              });
              break;
            }

            case "chapter_started":
              newJobs.set(jobId, {
                ...job,
                currentChapter: {
                  number: data.data.chapterNumber,
                },
              });
              break;

            // chunk_progress는 더 이상 사용하지 않지만 하위 호환성을 위해 유지
            case "chunk_progress":
              // 청크 진행률은 무시하고 챕터 번호만 업데이트
              if (data.data.chapterNumber) {
                newJobs.set(jobId, {
                  ...job,
                  currentChapter: {
                    number: data.data.chapterNumber,
                  },
                });
              }
              break;

            case "chapter_completed":
            case "chapter_partial": {
              const completedChapters = data.data.completedChapters ?? job.completedChapters + 1;
              newJobs.set(jobId, {
                ...job,
                completedChapters,
                currentChapter: undefined,
                progress: calculateProgress(completedChapters, job.totalChapters),
              });
              break;
            }

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

            case "job_completed": {
              const completedChapters = data.data.completedChapters ?? job.totalChapters;
              newJobs.set(jobId, {
                ...job,
                status: "COMPLETED",
                completedChapters,
                currentChapter: undefined,
                progress: 100,
              });
              break;
            }

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

    es.onopen = () => {
      // 연결 성공 시 재연결 카운터 리셋
      console.log("[TranslationContext] SSE 연결 성공:", jobId);
      reconnectAttemptsRef.current.set(jobId, 0);
    };

    es.onerror = (err) => {
      console.error("[TranslationContext] SSE 에러:", jobId, err);

      // 연결 정리
      const currentEs = eventSourcesRef.current.get(jobId);
      if (currentEs) {
        currentEs.close();
        eventSourcesRef.current.delete(jobId);
      }

      // 현재 작업 상태 확인 (ref 사용)
      const currentJob = jobsRef.current.get(jobId);

      // 이미 완료/실패/일시정지 상태면 재연결 안함
      if (!currentJob || currentJob.status === "COMPLETED" || currentJob.status === "FAILED" || currentJob.status === "PAUSED") {
        return;
      }

      // 재연결 시도
      const attempts = reconnectAttemptsRef.current.get(jobId) || 0;
      if (attempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current.set(jobId, attempts + 1);
        console.log(`[TranslationContext] ${RECONNECT_DELAY}ms 후 재연결 예정 (${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

        setTimeout(() => {
          // 재연결 전 상태 다시 확인 (ref 사용)
          const job = jobsRef.current.get(jobId);
          if (job && (job.status === "PENDING" || job.status === "IN_PROGRESS")) {
            connectSSE(jobId, true);
          }
        }, RECONNECT_DELAY);
      } else {
        // 최대 재연결 시도 초과 - 서버에서 상태 확인 후 처리
        console.error("[TranslationContext] 최대 재연결 시도 초과, 서버 상태 확인:", jobId);
        reconnectAttemptsRef.current.delete(jobId);

        // 서버에서 실제 상태 확인
        fetch(`/api/translation/active`)
          .then(res => res.json())
          .then(data => {
            const serverJob = data.jobs?.find((j: { jobId: string }) => j.jobId === jobId);
            if (serverJob) {
              // 서버에 작업이 있으면 상태 동기화
              setJobs((prev) => {
                const newJobs = new Map(prev);
                newJobs.set(jobId, {
                  ...serverJob,
                  currentChapter: serverJob.currentChapter
                    ? { number: serverJob.currentChapter.number }
                    : undefined,
                  createdAt: new Date(serverJob.createdAt),
                  updatedAt: serverJob.updatedAt ? new Date(serverJob.updatedAt) : undefined,
                  progress: calculateProgress(serverJob.completedChapters, serverJob.totalChapters),
                });
                return newJobs;
              });

              // 진행 중이면 다시 연결 시도
              if (serverJob.status === "IN_PROGRESS" || serverJob.status === "PENDING") {
                reconnectAttemptsRef.current.set(jobId, 0);
                setTimeout(() => connectSSE(jobId, true), RECONNECT_DELAY);
              }
            } else {
              // 서버에 작업이 없으면 실패 처리
              setJobs((prev) => {
                const newJobs = new Map(prev);
                const job = newJobs.get(jobId);
                if (job) {
                  newJobs.set(jobId, {
                    ...job,
                    status: "FAILED",
                    error: "연결 끊김 - 작업을 찾을 수 없습니다",
                  });
                }
                return newJobs;
              });
            }
          })
          .catch(() => {
            // 네트워크 오류 시 일단 유지 (다음 refreshJobs에서 복구)
            console.error("[TranslationContext] 서버 상태 확인 실패");
          });
      }
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
            };
            error?: string;
            createdAt: string;
            updatedAt?: string;
          }) => {
            newJobs.set(job.jobId, {
              ...job,
              currentChapter: job.currentChapter
                ? { number: job.currentChapter.number }
                : undefined,
              createdAt: new Date(job.createdAt),
              updatedAt: job.updatedAt ? new Date(job.updatedAt) : undefined,
              progress: calculateProgress(job.completedChapters, job.totalChapters),
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
        progress: 0,
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

  // 작업 재개
  const resumeJob = useCallback(
    async (jobId: string): Promise<{ success: boolean; error?: string }> => {
      console.log("[TranslationContext] 재개 요청:", jobId);

      try {
        const response = await fetch("/api/translation/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error("[TranslationContext] 재개 실패:", data.error);
          return { success: false, error: data.error };
        }

        // 재개 성공 시 SSE 연결 시작 (기존 jobId 재사용)
        connectSSE(jobId);

        // 작업 상태를 IN_PROGRESS로 업데이트
        setJobs((prev) => {
          const newJobs = new Map(prev);
          const job = newJobs.get(jobId);
          if (job) {
            newJobs.set(jobId, {
              ...job,
              status: "IN_PROGRESS",
              totalChapters: data.totalChapters || job.totalChapters,
              progress: calculateProgress(job.completedChapters, data.totalChapters || job.totalChapters),
            });
          }
          return newJobs;
        });

        return { success: true };
      } catch (error) {
        console.error("[TranslationContext] 재개 에러:", error);
        return { success: false, error: "네트워크 오류가 발생했습니다." };
      }
    },
    [connectSSE]
  );

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
        pauseJob,
        resumeJob,
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
