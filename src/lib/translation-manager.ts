import { db as prisma } from "./db";
import { Prisma } from "@prisma/client";

// JSON에서 ChapterProgress 배열로 안전하게 변환
function parseChaptersProgress(json: Prisma.JsonValue | null): ChapterProgress[] {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as ChapterProgress[];
}

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
  isPauseRequested?: boolean;
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

// DB 기반 Translation Manager (서버리스 환경 지원)
class TranslationManager {
  // 새 작업 생성 (DB에 저장)
  async createJob(
    workId: string,
    workTitle: string,
    chapters: Array<{ number: number; id: string }>,
    userId: string,
    userEmail?: string
  ): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    log("작업 생성:", { jobId, workId, workTitle, chapters: chapters.length });

    const chaptersProgress: ChapterProgress[] = chapters.map((ch) => ({
      number: ch.number,
      chapterId: ch.id,
      status: "PENDING" as ChapterProgressStatus,
      currentChunk: 0,
      totalChunks: 0,
    }));

    // 기존 활성 작업이 있으면 실패 처리
    await prisma.activeTranslationJob.updateMany({
      where: {
        workId,
        status: { in: ["PENDING", "IN_PROGRESS", "PAUSED"] },
      },
      data: {
        status: "FAILED",
        errorMessage: "새 작업으로 대체됨",
      },
    });

    await prisma.activeTranslationJob.create({
      data: {
        jobId,
        workId,
        workTitle,
        userId,
        userEmail,
        status: "PENDING",
        totalChapters: chapters.length,
        completedChapters: 0,
        failedChapters: 0,
        chaptersProgress: chaptersProgress as unknown as object,
      },
    });

    return jobId;
  }

  // 작업 조회 (DB에서)
  async getJob(jobId: string): Promise<TranslationJob | null> {
    const dbJob = await prisma.activeTranslationJob.findUnique({
      where: { jobId },
    });

    if (!dbJob) {
      log("getJob: 작업을 찾을 수 없음", jobId);
      return null;
    }

    return this.dbJobToTranslationJob(dbJob);
  }

  // 작업 시작
  async startJob(jobId: string): Promise<void> {
    log("작업 시작:", jobId);

    await prisma.activeTranslationJob.update({
      where: { jobId },
      data: { status: "IN_PROGRESS" },
    });
  }

  // 챕터 번역 시작
  async startChapter(jobId: string, chapterNumber: number, totalChunks: number): Promise<void> {
    log("챕터 시작:", { jobId, chapterNumber, totalChunks });

    const dbJob = await prisma.activeTranslationJob.findUnique({
      where: { jobId },
    });
    if (!dbJob) return;

    const chapters = parseChaptersProgress(dbJob.chaptersProgress) || [];
    const chapterIndex = chapters.findIndex((ch) => ch.number === chapterNumber);
    if (chapterIndex === -1) return;

    chapters[chapterIndex].status = "TRANSLATING";
    chapters[chapterIndex].totalChunks = totalChunks;
    chapters[chapterIndex].currentChunk = 0;

    await prisma.activeTranslationJob.update({
      where: { jobId },
      data: {
        currentChapterNum: chapterNumber,
        currentChunkIndex: 0,
        totalChunks,
        chaptersProgress: chapters as unknown as object,
      },
    });
  }

  // 청크 진행 업데이트
  async updateChunkProgress(
    jobId: string,
    chapterNumber: number,
    currentChunk: number,
    totalChunks: number
  ): Promise<void> {
    const dbJob = await prisma.activeTranslationJob.findUnique({
      where: { jobId },
    });
    if (!dbJob) return;

    const chapters = parseChaptersProgress(dbJob.chaptersProgress) || [];
    const chapterIndex = chapters.findIndex((ch) => ch.number === chapterNumber);
    if (chapterIndex === -1) return;

    chapters[chapterIndex].currentChunk = currentChunk;
    chapters[chapterIndex].totalChunks = totalChunks;

    await prisma.activeTranslationJob.update({
      where: { jobId },
      data: {
        currentChunkIndex: currentChunk,
        totalChunks,
        chaptersProgress: chapters as unknown as object,
      },
    });
  }

  // 청크 에러 보고
  async reportChunkError(
    jobId: string,
    chapterNumber: number,
    chunkIndex: number,
    error: string
  ): Promise<void> {
    const dbJob = await prisma.activeTranslationJob.findUnique({
      where: { jobId },
    });
    if (!dbJob) return;

    const chapters = parseChaptersProgress(dbJob.chaptersProgress) || [];
    const chapterIndex = chapters.findIndex((ch) => ch.number === chapterNumber);
    if (chapterIndex === -1) return;

    if (!chapters[chapterIndex].failedChunks) {
      chapters[chapterIndex].failedChunks = [];
    }
    chapters[chapterIndex].failedChunks!.push({ index: chunkIndex, error });

    await prisma.activeTranslationJob.update({
      where: { jobId },
      data: {
        chaptersProgress: chapters as unknown as object,
      },
    });
  }

  // 챕터 완료
  async completeChapter(jobId: string, chapterNumber: number): Promise<void> {
    const dbJob = await prisma.activeTranslationJob.findUnique({
      where: { jobId },
    });
    if (!dbJob) return;

    const chapters = parseChaptersProgress(dbJob.chaptersProgress) || [];
    const chapterIndex = chapters.findIndex((ch) => ch.number === chapterNumber);
    if (chapterIndex === -1) return;

    chapters[chapterIndex].status = "COMPLETED";
    chapters[chapterIndex].currentChunk = chapters[chapterIndex].totalChunks;

    await prisma.activeTranslationJob.update({
      where: { jobId },
      data: {
        completedChapters: dbJob.completedChapters + 1,
        currentChapterNum: null,
        currentChunkIndex: null,
        totalChunks: null,
        chaptersProgress: chapters as unknown as object,
      },
    });
  }

  // 챕터 부분 완료 (일부 청크 실패)
  async completeChapterPartial(
    jobId: string,
    chapterNumber: number,
    _failedChunkIndices: number[]
  ): Promise<void> {
    // 부분 완료도 완료로 처리
    await this.completeChapter(jobId, chapterNumber);
  }

  // 챕터 실패
  async failChapter(jobId: string, chapterNumber: number, error: string): Promise<void> {
    const dbJob = await prisma.activeTranslationJob.findUnique({
      where: { jobId },
    });
    if (!dbJob) return;

    const chapters = parseChaptersProgress(dbJob.chaptersProgress) || [];
    const chapterIndex = chapters.findIndex((ch) => ch.number === chapterNumber);
    if (chapterIndex === -1) return;

    chapters[chapterIndex].status = "FAILED";
    chapters[chapterIndex].error = error;

    await prisma.activeTranslationJob.update({
      where: { jobId },
      data: {
        failedChapters: dbJob.failedChapters + 1,
        currentChapterNum: null,
        currentChunkIndex: null,
        totalChunks: null,
        chaptersProgress: chapters as unknown as object,
      },
    });
  }

  // 작업 완료
  async completeJob(jobId: string): Promise<void> {
    await prisma.activeTranslationJob.update({
      where: { jobId },
      data: { status: "COMPLETED" },
    });

    // 히스토리에 저장
    const dbJob = await prisma.activeTranslationJob.findUnique({
      where: { jobId },
    });
    if (dbJob) {
      await this.saveToHistory(dbJob, "COMPLETED");
    }
  }

  // 작업 실패
  async failJob(jobId: string, error: string): Promise<void> {
    await prisma.activeTranslationJob.update({
      where: { jobId },
      data: {
        status: "FAILED",
        errorMessage: error,
      },
    });

    // 히스토리에 저장
    const dbJob = await prisma.activeTranslationJob.findUnique({
      where: { jobId },
    });
    if (dbJob) {
      await this.saveToHistory(dbJob, "FAILED");
    }
  }

  // 작업 요약 정보 생성
  async getJobSummary(jobId: string): Promise<TranslationJobSummary | null> {
    const dbJob = await prisma.activeTranslationJob.findUnique({
      where: { jobId },
    });
    if (!dbJob) return null;

    const chapters = parseChaptersProgress(dbJob.chaptersProgress) || [];
    const translatingChapter = chapters.find((ch) => ch.status === "TRANSLATING");

    return {
      jobId: dbJob.jobId,
      workId: dbJob.workId,
      workTitle: dbJob.workTitle,
      status: dbJob.status as TranslationJobStatus,
      totalChapters: dbJob.totalChapters,
      completedChapters: dbJob.completedChapters,
      failedChapters: dbJob.failedChapters,
      currentChapter: translatingChapter
        ? {
            number: translatingChapter.number,
            currentChunk: translatingChapter.currentChunk,
            totalChunks: translatingChapter.totalChunks,
          }
        : undefined,
      error: dbJob.errorMessage || undefined,
      createdAt: dbJob.startedAt,
    };
  }

  // 활성 작업 목록 조회
  async getActiveJobs(): Promise<TranslationJobSummary[]> {
    const dbJobs = await prisma.activeTranslationJob.findMany({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS", "PAUSED"] },
      },
      orderBy: { startedAt: "asc" },
    });

    return dbJobs.map((dbJob) => {
      const chapters = parseChaptersProgress(dbJob.chaptersProgress) || [];
      const translatingChapter = chapters.find((ch) => ch.status === "TRANSLATING");

      return {
        jobId: dbJob.jobId,
        workId: dbJob.workId,
        workTitle: dbJob.workTitle,
        status: dbJob.status as TranslationJobStatus,
        totalChapters: dbJob.totalChapters,
        completedChapters: dbJob.completedChapters,
        failedChapters: dbJob.failedChapters,
        currentChapter: translatingChapter
          ? {
              number: translatingChapter.number,
              currentChunk: translatingChapter.currentChunk,
              totalChunks: translatingChapter.totalChunks,
            }
          : undefined,
        error: dbJob.errorMessage || undefined,
        createdAt: dbJob.startedAt,
      };
    });
  }

  // 특정 작품의 활성 작업 조회
  async getActiveJobByWorkId(workId: string): Promise<TranslationJob | null> {
    const dbJob = await prisma.activeTranslationJob.findFirst({
      where: {
        workId,
        status: { in: ["PENDING", "IN_PROGRESS", "PAUSED"] },
      },
    });

    if (!dbJob) return null;
    return this.dbJobToTranslationJob(dbJob);
  }

  // 사용자의 활성 작업 조회
  async getActiveJobsByUserId(userId: string): Promise<TranslationJobSummary[]> {
    const dbJobs = await prisma.activeTranslationJob.findMany({
      where: {
        userId,
        status: { in: ["PENDING", "IN_PROGRESS", "PAUSED"] },
      },
      orderBy: { startedAt: "desc" },
    });

    return dbJobs.map((dbJob) => {
      const chapters = parseChaptersProgress(dbJob.chaptersProgress) || [];
      const translatingChapter = chapters.find((ch) => ch.status === "TRANSLATING");

      return {
        jobId: dbJob.jobId,
        workId: dbJob.workId,
        workTitle: dbJob.workTitle,
        status: dbJob.status as TranslationJobStatus,
        totalChapters: dbJob.totalChapters,
        completedChapters: dbJob.completedChapters,
        failedChapters: dbJob.failedChapters,
        currentChapter: translatingChapter
          ? {
              number: translatingChapter.number,
              currentChunk: translatingChapter.currentChunk,
              totalChunks: translatingChapter.totalChunks,
            }
          : undefined,
        error: dbJob.errorMessage || undefined,
        createdAt: dbJob.startedAt,
      };
    });
  }

  // 모든 작업 목록 조회
  async getAllJobs(): Promise<TranslationJobSummary[]> {
    const dbJobs = await prisma.activeTranslationJob.findMany({
      orderBy: { startedAt: "desc" },
      take: 100, // 최근 100개만
    });

    return dbJobs.map((dbJob) => {
      const chapters = parseChaptersProgress(dbJob.chaptersProgress) || [];
      const translatingChapter = chapters.find((ch) => ch.status === "TRANSLATING");

      return {
        jobId: dbJob.jobId,
        workId: dbJob.workId,
        workTitle: dbJob.workTitle,
        status: dbJob.status as TranslationJobStatus,
        totalChapters: dbJob.totalChapters,
        completedChapters: dbJob.completedChapters,
        failedChapters: dbJob.failedChapters,
        currentChapter: translatingChapter
          ? {
              number: translatingChapter.number,
              currentChunk: translatingChapter.currentChunk,
              totalChunks: translatingChapter.totalChunks,
            }
          : undefined,
        error: dbJob.errorMessage || undefined,
        createdAt: dbJob.startedAt,
      };
    });
  }

  // 작업 삭제
  async removeJob(jobId: string): Promise<void> {
    log("작업 삭제:", jobId);
    await prisma.activeTranslationJob.delete({
      where: { jobId },
    }).catch(() => {
      // 이미 삭제된 경우 무시
    });
  }

  // 일시정지 요청
  async pauseJob(jobId: string): Promise<boolean> {
    const dbJob = await prisma.activeTranslationJob.findUnique({
      where: { jobId },
    });

    if (!dbJob || dbJob.status !== "IN_PROGRESS") {
      return false;
    }

    await prisma.activeTranslationJob.update({
      where: { jobId },
      data: { isPauseRequested: true },
    });

    log("일시정지 요청됨:", jobId);
    return true;
  }

  // 일시정지 확인 및 상태 업데이트
  async checkAndPause(jobId: string): Promise<boolean> {
    const dbJob = await prisma.activeTranslationJob.findUnique({
      where: { jobId },
    });

    if (!dbJob || !dbJob.isPauseRequested) return false;

    const chapters = parseChaptersProgress(dbJob.chaptersProgress) || [];
    const translatingIndex = chapters.findIndex((ch) => ch.status === "TRANSLATING");
    if (translatingIndex !== -1) {
      chapters[translatingIndex].status = "PENDING";
      chapters[translatingIndex].currentChunk = 0;
    }

    await prisma.activeTranslationJob.update({
      where: { jobId },
      data: {
        status: "PAUSED",
        isPauseRequested: false,
        chaptersProgress: chapters as unknown as object,
      },
    });

    // 히스토리에 저장
    await this.saveToHistory({ ...dbJob, status: "PAUSED" }, "PAUSED");

    log("작업 일시정지됨:", jobId);
    return true;
  }

  // 남은 챕터 번호 목록
  async getPendingChapterNumbers(jobId: string): Promise<number[]> {
    const dbJob = await prisma.activeTranslationJob.findUnique({
      where: { jobId },
    });
    if (!dbJob) return [];

    const chapters = parseChaptersProgress(dbJob.chaptersProgress) || [];
    return chapters
      .filter((ch) => ch.status === "PENDING" || ch.status === "TRANSLATING")
      .map((ch) => ch.number);
  }

  // 일시정지 상태 확인
  async isPaused(jobId: string): Promise<boolean> {
    const dbJob = await prisma.activeTranslationJob.findUnique({
      where: { jobId },
      select: { status: true },
    });
    return dbJob?.status === "PAUSED";
  }

  // 슬롯 예약 (중복 생성 방지 - DB 기반)
  async reserveJobSlot(workId: string): Promise<boolean> {
    const existing = await prisma.activeTranslationJob.findFirst({
      where: {
        workId,
        status: { in: ["PENDING", "IN_PROGRESS", "PAUSED"] },
      },
    });

    if (existing) {
      log("작업 슬롯 예약 실패 - 활성 작업 존재:", existing.jobId);
      return false;
    }

    return true;
  }

  // 슬롯 해제 (DB에서는 필요 없음, 호환성을 위해 유지)
  releaseJobSlot(_workId: string): void {
    // DB 기반에서는 작업 생성/실패 시 자동 처리됨
  }

  // DB 레코드를 TranslationJob으로 변환
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dbJobToTranslationJob(dbJob: any): TranslationJob {
    return {
      id: dbJob.jobId,
      workId: dbJob.workId,
      workTitle: dbJob.workTitle,
      status: dbJob.status as TranslationJobStatus,
      chapters: parseChaptersProgress(dbJob.chaptersProgress) || [],
      completedChapters: dbJob.completedChapters,
      totalChapters: dbJob.totalChapters,
      failedChapters: dbJob.failedChapters,
      error: dbJob.errorMessage || undefined,
      createdAt: dbJob.startedAt,
      isPauseRequested: dbJob.isPauseRequested,
    };
  }

  // 히스토리에 저장
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async saveToHistory(dbJob: any, status: string): Promise<void> {
    try {
      const chapters = parseChaptersProgress(dbJob.chaptersProgress) || [];
      const failedChapterNums = chapters
        .filter((ch) => ch.status === "FAILED")
        .map((ch) => ch.number);

      await prisma.translationJobHistory.upsert({
        where: { jobId: dbJob.jobId },
        update: {
          status,
          completedChapters: dbJob.completedChapters,
          failedChapters: dbJob.failedChapters,
          errorMessage: dbJob.errorMessage,
          failedChapterNums,
          completedAt: new Date(),
          durationMs: Date.now() - new Date(dbJob.startedAt).getTime(),
        },
        create: {
          jobId: dbJob.jobId,
          workId: dbJob.workId,
          workTitle: dbJob.workTitle,
          userId: dbJob.userId,
          userEmail: dbJob.userEmail,
          status,
          totalChapters: dbJob.totalChapters,
          completedChapters: dbJob.completedChapters,
          failedChapters: dbJob.failedChapters,
          errorMessage: dbJob.errorMessage,
          failedChapterNums,
          startedAt: dbJob.startedAt,
          completedAt: new Date(),
          durationMs: Date.now() - new Date(dbJob.startedAt).getTime(),
        },
      });
    } catch (e) {
      logError("히스토리 저장 실패:", e);
    }
  }

  // 오래된 완료/실패 작업 정리 (정기 실행용)
  async cleanupOldJobs(olderThanHours: number = 24): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    const result = await prisma.activeTranslationJob.deleteMany({
      where: {
        status: { in: ["COMPLETED", "FAILED"] },
        updatedAt: { lt: cutoff },
      },
    });

    log(`${result.count}개의 오래된 작업 정리됨`);
    return result.count;
  }
}

// 싱글톤 인스턴스
export const translationManager = new TranslationManager();

log("DB 기반 Translation Manager 초기화됨");
