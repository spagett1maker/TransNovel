import { EventEmitter } from "events";

export type TranslationJobStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED";

export type ChapterProgressStatus =
  | "PENDING"
  | "TRANSLATING"
  | "COMPLETED"
  | "FAILED";

export interface ChapterProgress {
  number: number;
  chapterId: string;
  status: ChapterProgressStatus;
  currentChunk: number;
  totalChunks: number;
  error?: string;
}

export interface TranslationJob {
  id: string;
  workId: string;
  status: TranslationJobStatus;
  chapters: ChapterProgress[];
  completedChapters: number;
  totalChapters: number;
  error?: string;
  createdAt: Date;
}

export interface ProgressEvent {
  jobId: string;
  type:
    | "job_started"
    | "chapter_started"
    | "chunk_progress"
    | "chapter_completed"
    | "chapter_failed"
    | "job_completed"
    | "job_failed";
  data: Partial<TranslationJob> & {
    chapterNumber?: number;
    currentChunk?: number;
    totalChunks?: number;
    error?: string;
  };
}

class TranslationManager {
  private jobs: Map<string, TranslationJob> = new Map();
  private emitter: EventEmitter = new EventEmitter();

  // 최대 리스너 수 증가 (동시 연결 지원)
  constructor() {
    this.emitter.setMaxListeners(100);
  }

  // 새 작업 생성
  createJob(
    workId: string,
    chapters: Array<{ number: number; id: string }>
  ): string {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const job: TranslationJob = {
      id: jobId,
      workId,
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
      createdAt: new Date(),
    };

    this.jobs.set(jobId, job);

    // 10분 후 자동 정리
    setTimeout(() => {
      this.jobs.delete(jobId);
    }, 10 * 60 * 1000);

    return jobId;
  }

  // 작업 조회
  getJob(jobId: string): TranslationJob | null {
    return this.jobs.get(jobId) || null;
  }

  // 작업 시작
  startJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = "IN_PROGRESS";
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
    const job = this.jobs.get(jobId);
    if (!job) return;

    const chapter = job.chapters.find((ch) => ch.number === chapterNumber);
    if (!chapter) return;

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

  // 청크 진행 업데이트
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

    chapter.currentChunk = currentChunk;
    chapter.totalChunks = totalChunks;

    this.emit({
      jobId,
      type: "chunk_progress",
      data: {
        chapterNumber,
        currentChunk,
        totalChunks,
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

  // 챕터 실패
  failChapter(jobId: string, chapterNumber: number, error: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const chapter = job.chapters.find((ch) => ch.number === chapterNumber);
    if (!chapter) return;

    chapter.status = "FAILED";
    chapter.error = error;

    this.emit({
      jobId,
      type: "chapter_failed",
      data: {
        chapterNumber,
        error,
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
  }

  // 이벤트 발생
  private emit(event: ProgressEvent): void {
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

// 싱글톤 인스턴스
export const translationManager = new TranslationManager();
