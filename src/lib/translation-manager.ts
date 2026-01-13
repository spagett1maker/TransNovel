import { EventEmitter } from "events";

// 조건부 로깅 - 프로덕션에서는 비활성화
const isDev = process.env.NODE_ENV === "development";
const log = (...args: unknown[]) => {
  if (isDev) console.log("[TranslationManager]", ...args);
};
const logError = (...args: unknown[]) => {
  console.error("[TranslationManager]", ...args);
};

export type TranslationJobStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED";

export type ChapterProgressStatus =
  | "PENDING"
  | "TRANSLATING"
  | "COMPLETED"
  | "FAILED";

export interface ChunkError {
  index: number;
  error: string;
}

export interface ChapterProgress {
  number: number;
  chapterId: string;
  status: ChapterProgressStatus;
  currentChunk: number;
  totalChunks: number;
  error?: string;
  failedChunks?: ChunkError[];
}

export interface TranslationJob {
  id: string;
  workId: string;
  workTitle: string;
  status: TranslationJobStatus;
  chapters: ChapterProgress[];
  completedChapters: number;
  totalChapters: number;
  failedChapters: number;
  error?: string;
  createdAt: Date;
  isPauseRequested?: boolean; // 일시정지 요청 플래그
}

// 클라이언트에 전송할 경량 요약 정보
export interface TranslationJobSummary {
  jobId: string;
  workId: string;
  workTitle: string;
  status: TranslationJobStatus;
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
}

export interface ProgressEvent {
  jobId: string;
  type:
    | "job_started"
    | "job_paused"
    | "job_resumed"
    | "chapter_started"
    | "chunk_progress"
    | "chunk_error"
    | "chapter_completed"
    | "chapter_partial"
    | "chapter_failed"
    | "job_completed"
    | "job_failed";
  data: Partial<TranslationJob> & {
    chapterNumber?: number;
    currentChunk?: number;
    totalChunks?: number;
    error?: string;
    chunkIndex?: number;
    failedChunks?: number[];
    currentChapter?: {
      number: number;
      currentChunk: number;
      totalChunks: number;
    };
    workTitle?: string;
  };
}

class TranslationManager {
  private jobs: Map<string, TranslationJob> = new Map();
  private emitter: EventEmitter = new EventEmitter();

  // 최대 작업 수 제한 (메모리 누수 방지)
  private readonly MAX_JOBS = 500;
  // 완료된 작업 자동 정리 시간 (5분)
  private readonly CLEANUP_DELAY_MS = 5 * 60 * 1000;
  // 청크 진행률 스로틀 간격 (100ms)
  private readonly CHUNK_THROTTLE_MS = 100;

  // 청크 진행률 스로틀링을 위한 마지막 이벤트 시간 추적
  private lastChunkEmitTime: Map<string, number> = new Map();
  // 스로틀링으로 스킵된 마지막 이벤트를 저장 (나중에 전송)
  private pendingChunkUpdates: Map<string, { chapterNumber: number; currentChunk: number; totalChunks: number }> = new Map();
  private pendingChunkTimers: Map<string, NodeJS.Timeout> = new Map();

  // 작업 생성 중인 workId 추적 (중복 생성 방지)
  private pendingWorkIds: Set<string> = new Set();

  // 최대 리스너 수 증가 (동시 연결 지원)
  constructor() {
    this.emitter.setMaxListeners(100);
  }

  // 작업 슬롯 예약 (원자적 중복 체크)
  // 성공 시 true, 이미 작업이 있으면 false 반환
  reserveJobSlot(workId: string): boolean {
    // 이미 예약 중이거나 활성 작업이 있는지 체크
    if (this.pendingWorkIds.has(workId)) {
      log("작업 슬롯 예약 실패 - 이미 예약 중:", workId);
      return false;
    }

    const existingJob = this.getActiveJobByWorkId(workId);
    if (existingJob) {
      log("작업 슬롯 예약 실패 - 활성 작업 존재:", existingJob.id);
      return false;
    }

    // 예약 성공
    this.pendingWorkIds.add(workId);
    log("작업 슬롯 예약 성공:", workId);
    return true;
  }

  // 작업 슬롯 예약 해제 (작업 생성 실패 시)
  releaseJobSlot(workId: string): void {
    this.pendingWorkIds.delete(workId);
    log("작업 슬롯 예약 해제:", workId);
  }

  // 오래된 완료/실패 작업 정리 (MAX_JOBS 초과 시)
  private trimOldJobs(): void {
    if (this.jobs.size <= this.MAX_JOBS) return;

    const completedOrFailed = Array.from(this.jobs.values())
      .filter((job) => job.status === "COMPLETED" || job.status === "FAILED")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // 가장 오래된 완료/실패 작업부터 삭제
    const toDelete = completedOrFailed.slice(
      0,
      this.jobs.size - this.MAX_JOBS
    );
    toDelete.forEach((job) => {
      log("오래된 작업 정리:", job.id);
      this.jobs.delete(job.id);
    });
  }

  // 새 작업 생성
  createJob(
    workId: string,
    workTitle: string,
    chapters: Array<{ number: number; id: string }>
  ): string {
    // 작업 생성 전 오래된 작업 정리
    this.trimOldJobs();

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    log("작업 생성:", { jobId, workId, workTitle, chapters: chapters.length });

    const job: TranslationJob = {
      id: jobId,
      workId,
      workTitle,
      status: "PENDING",
      chapters: chapters.map((ch) => ({
        number: ch.number,
        chapterId: ch.id,
        status: "PENDING",
        currentChunk: 0,
        totalChunks: 0,
      })),
      completedChapters: 0,
      totalChapters: chapters.length,
      failedChapters: 0,
      createdAt: new Date(),
    };

    this.jobs.set(jobId, job);

    // 작업 생성 완료 후 예약 슬롯 해제
    this.pendingWorkIds.delete(workId);

    return jobId;
  }

  // 작업 조회
  getJob(jobId: string): TranslationJob | null {
    const job = this.jobs.get(jobId) || null;
    log("getJob:", { jobId, found: !!job, totalJobs: this.jobs.size });
    return job;
  }

  // 작업 시작
  startJob(jobId: string): void {
    log("작업 시작:", jobId);
    const job = this.jobs.get(jobId);
    if (!job) {
      logError("작업을 찾을 수 없음:", jobId);
      return;
    }

    job.status = "IN_PROGRESS";
    log("작업 상태 변경: IN_PROGRESS");
    this.emit({
      jobId,
      type: "job_started",
      data: {
        status: job.status,
        totalChapters: job.totalChapters,
      },
    });
  }

  // 챕터 번역 시작
  startChapter(jobId: string, chapterNumber: number, totalChunks: number): void {
    log("챕터 시작:", { jobId, chapterNumber, totalChunks });
    const job = this.jobs.get(jobId);
    if (!job) {
      logError("작업을 찾을 수 없음:", jobId);
      return;
    }

    const chapter = job.chapters.find((ch) => ch.number === chapterNumber);
    if (!chapter) {
      logError("챕터를 찾을 수 없음:", chapterNumber);
      return;
    }

    chapter.status = "TRANSLATING";
    chapter.totalChunks = totalChunks;
    chapter.currentChunk = 0;

    this.emit({
      jobId,
      type: "chapter_started",
      data: {
        chapterNumber,
        totalChunks,
      },
    });
  }

  // 청크 진행 업데이트 (스로틀링 적용)
  updateChunkProgress(
    jobId: string,
    chapterNumber: number,
    currentChunk: number,
    totalChunks: number
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const chapter = job.chapters.find((ch) => ch.number === chapterNumber);
    if (!chapter) return;

    // 내부 상태는 항상 업데이트
    chapter.currentChunk = currentChunk;
    chapter.totalChunks = totalChunks;

    const throttleKey = `${jobId}:${chapterNumber}`;
    const now = Date.now();
    const lastEmit = this.lastChunkEmitTime.get(throttleKey) || 0;
    const timeSinceLastEmit = now - lastEmit;

    // 마지막 청크이거나 첫 청크인 경우 즉시 전송
    const isFirstOrLast = currentChunk === 1 || currentChunk === totalChunks;

    if (isFirstOrLast || timeSinceLastEmit >= this.CHUNK_THROTTLE_MS) {
      // 즉시 전송
      this.lastChunkEmitTime.set(throttleKey, now);

      // 대기 중인 타이머가 있으면 취소
      const existingTimer = this.pendingChunkTimers.get(throttleKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.pendingChunkTimers.delete(throttleKey);
      }
      this.pendingChunkUpdates.delete(throttleKey);

      this.emit({
        jobId,
        type: "chunk_progress",
        data: {
          chapterNumber,
          currentChunk,
          totalChunks,
        },
      });
    } else {
      // 스로틀링: 마지막 이벤트 저장하고 나중에 전송
      this.pendingChunkUpdates.set(throttleKey, { chapterNumber, currentChunk, totalChunks });

      // 이미 타이머가 있으면 재사용 (새로 만들지 않음)
      if (!this.pendingChunkTimers.has(throttleKey)) {
        const timer = setTimeout(() => {
          const pending = this.pendingChunkUpdates.get(throttleKey);
          if (pending) {
            this.lastChunkEmitTime.set(throttleKey, Date.now());
            this.emit({
              jobId,
              type: "chunk_progress",
              data: pending,
            });
            this.pendingChunkUpdates.delete(throttleKey);
          }
          this.pendingChunkTimers.delete(throttleKey);
        }, this.CHUNK_THROTTLE_MS - timeSinceLastEmit);

        this.pendingChunkTimers.set(throttleKey, timer);
      }
    }
  }

  // 청크 에러 보고
  reportChunkError(
    jobId: string,
    chapterNumber: number,
    chunkIndex: number,
    error: string
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const chapter = job.chapters.find((ch) => ch.number === chapterNumber);
    if (!chapter) return;

    if (!chapter.failedChunks) {
      chapter.failedChunks = [];
    }
    chapter.failedChunks.push({ index: chunkIndex, error });

    this.emit({
      jobId,
      type: "chunk_error",
      data: {
        chapterNumber,
        chunkIndex,
        error,
      },
    });
  }

  // 챕터 완료
  completeChapter(jobId: string, chapterNumber: number): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const chapter = job.chapters.find((ch) => ch.number === chapterNumber);
    if (!chapter) return;

    chapter.status = "COMPLETED";
    chapter.currentChunk = chapter.totalChunks;
    job.completedChapters++;

    this.emit({
      jobId,
      type: "chapter_completed",
      data: {
        chapterNumber,
        completedChapters: job.completedChapters,
        totalChapters: job.totalChapters,
      },
    });
  }

  // 챕터 부분 완료 (일부 청크 실패)
  completeChapterPartial(
    jobId: string,
    chapterNumber: number,
    failedChunkIndices: number[]
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const chapter = job.chapters.find((ch) => ch.number === chapterNumber);
    if (!chapter) return;

    chapter.status = "COMPLETED";
    chapter.currentChunk = chapter.totalChunks;
    job.completedChapters++;

    this.emit({
      jobId,
      type: "chapter_partial",
      data: {
        chapterNumber,
        completedChapters: job.completedChapters,
        totalChapters: job.totalChapters,
        failedChunks: failedChunkIndices,
      },
    });
  }

  // 챕터 실패
  failChapter(jobId: string, chapterNumber: number, error: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const chapter = job.chapters.find((ch) => ch.number === chapterNumber);
    if (!chapter) return;

    chapter.status = "FAILED";
    chapter.error = error;
    job.failedChapters++;

    this.emit({
      jobId,
      type: "chapter_failed",
      data: {
        chapterNumber,
        error,
        failedChapters: job.failedChapters,
      },
    });
  }

  // 작업 완료
  completeJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = "COMPLETED";

    this.emit({
      jobId,
      type: "job_completed",
      data: {
        status: job.status,
        completedChapters: job.completedChapters,
        totalChapters: job.totalChapters,
      },
    });

    // 완료 후 자동 정리
    setTimeout(() => {
      log("완료된 작업 자동 정리:", jobId);
      this.jobs.delete(jobId);
    }, this.CLEANUP_DELAY_MS);
  }

  // 작업 실패
  failJob(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = "FAILED";
    job.error = error;

    this.emit({
      jobId,
      type: "job_failed",
      data: {
        status: job.status,
        error,
      },
    });

    // 실패 후 자동 정리
    setTimeout(() => {
      log("실패한 작업 자동 정리:", jobId);
      this.jobs.delete(jobId);
    }, this.CLEANUP_DELAY_MS);
  }

  // 작업 요약 정보 생성
  getJobSummary(jobId: string): TranslationJobSummary | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    // 현재 번역 중인 챕터 찾기
    const translatingChapter = job.chapters.find((ch) => ch.status === "TRANSLATING");

    return {
      jobId: job.id,
      workId: job.workId,
      workTitle: job.workTitle,
      status: job.status,
      totalChapters: job.totalChapters,
      completedChapters: job.completedChapters,
      failedChapters: job.failedChapters,
      currentChapter: translatingChapter
        ? {
            number: translatingChapter.number,
            currentChunk: translatingChapter.currentChunk,
            totalChunks: translatingChapter.totalChunks,
          }
        : undefined,
      error: job.error,
      createdAt: job.createdAt,
    };
  }

  // 활성 작업 목록 조회 (PENDING 또는 IN_PROGRESS)
  getActiveJobs(): TranslationJobSummary[] {
    const activeJobs: TranslationJobSummary[] = [];

    this.jobs.forEach((job) => {
      if (job.status === "PENDING" || job.status === "IN_PROGRESS") {
        const summary = this.getJobSummary(job.id);
        if (summary) {
          activeJobs.push(summary);
        }
      }
    });

    // 생성 시간순 정렬
    activeJobs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return activeJobs;
  }

  // 특정 작품의 활성 작업 조회 (중복 작업 방지용)
  getActiveJobByWorkId(workId: string): TranslationJob | null {
    for (const job of this.jobs.values()) {
      if (job.workId === workId && (job.status === "PENDING" || job.status === "IN_PROGRESS")) {
        return job;
      }
    }
    return null;
  }

  // 모든 작업 목록 조회 (완료/실패 포함)
  getAllJobs(): TranslationJobSummary[] {
    const allJobs: TranslationJobSummary[] = [];

    this.jobs.forEach((job) => {
      const summary = this.getJobSummary(job.id);
      if (summary) {
        allJobs.push(summary);
      }
    });

    // 생성 시간순 정렬
    allJobs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return allJobs;
  }

  // 작업 삭제 (UI에서 닫기)
  removeJob(jobId: string): void {
    log("작업 삭제:", jobId);
    this.jobs.delete(jobId);
  }

  // 일시정지 요청
  pauseJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      logError("일시정지 실패 - 작업을 찾을 수 없음:", jobId);
      return false;
    }

    if (job.status !== "IN_PROGRESS") {
      log("일시정지 실패 - 진행 중인 작업만 일시정지 가능:", job.status);
      return false;
    }

    job.isPauseRequested = true;
    log("일시정지 요청됨:", jobId);

    return true;
  }

  // 일시정지 확인 및 상태 업데이트 (번역 루프에서 호출)
  checkAndPause(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.isPauseRequested) {
      job.status = "PAUSED";
      job.isPauseRequested = false;

      // 현재 번역 중인 챕터를 PENDING으로 되돌림
      const translatingChapter = job.chapters.find(
        (ch) => ch.status === "TRANSLATING"
      );
      if (translatingChapter) {
        translatingChapter.status = "PENDING";
        translatingChapter.currentChunk = 0;
      }

      this.emit({
        jobId,
        type: "job_paused",
        data: {
          status: job.status,
          completedChapters: job.completedChapters,
          totalChapters: job.totalChapters,
        },
      });

      log("작업 일시정지됨:", jobId);
      return true;
    }

    return false;
  }

  // 작업 재개를 위한 남은 챕터 번호 목록 반환
  getPendingChapterNumbers(jobId: string): number[] {
    const job = this.jobs.get(jobId);
    if (!job) return [];

    return job.chapters
      .filter((ch) => ch.status === "PENDING" || ch.status === "TRANSLATING")
      .map((ch) => ch.number);
  }

  // 일시정지된 작업인지 확인
  isPaused(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    return job?.status === "PAUSED";
  }

  // 이벤트 발생
  private emit(event: ProgressEvent): void {
    log("이벤트 발생:", event.type, event.jobId);
    this.emitter.emit(`job:${event.jobId}`, event);
  }

  // 구독
  subscribe(
    jobId: string,
    callback: (event: ProgressEvent) => void
  ): () => void {
    const eventName = `job:${jobId}`;
    this.emitter.on(eventName, callback);

    return () => {
      this.emitter.off(eventName, callback);
    };
  }
}

// globalThis를 사용하여 개발 모드에서 HMR 시에도 싱글톤 유지
const globalForTranslation = globalThis as unknown as {
  translationManager: TranslationManager | undefined;
};

export const translationManager =
  globalForTranslation.translationManager ?? new TranslationManager();

if (process.env.NODE_ENV !== "production") {
  globalForTranslation.translationManager = translationManager;
}

log("싱글톤 초기화됨, 기존 작업 수:", translationManager["jobs"].size);
