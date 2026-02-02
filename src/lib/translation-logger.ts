import { LogLevel, LogCategory, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// 로그 생성 옵션 타입
interface LogOptions {
  level?: LogLevel;
  category?: LogCategory;
  jobId?: string;
  workId?: string;
  chapterId?: string;
  chapterNum?: number;
  chunkIndex?: number;
  userId?: string;
  userEmail?: string;
  errorCode?: string;
  errorStack?: string;
  metadata?: Record<string, unknown>;
  durationMs?: number;
  retryCount?: number;
  clientIp?: string;
  userAgent?: string;
}

// 작업 히스토리 생성 옵션
interface JobHistoryOptions {
  jobId: string;
  workId: string;
  workTitle: string;
  userId: string;
  userEmail?: string;
  status: "COMPLETED" | "FAILED" | "PAUSED";
  totalChapters: number;
  completedChapters: number;
  failedChapters: number;
  errorMessage?: string;
  failedChapterNums?: number[];
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
}

// 싱글톤 로거 클래스
class TranslationLogger {
  private static instance: TranslationLogger;
  private isEnabled: boolean = true;
  private batchQueue: Prisma.TranslationLogCreateInput[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_INTERVAL_MS = 2000;

  private constructor() {}

  static getInstance(): TranslationLogger {
    if (!TranslationLogger.instance) {
      TranslationLogger.instance = new TranslationLogger();
    }
    return TranslationLogger.instance;
  }

  // 로깅 활성화/비활성화
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  // 로그 생성 (배치 처리)
  async log(message: string, options: LogOptions = {}): Promise<void> {
    if (!this.isEnabled) return;

    const logEntry: Prisma.TranslationLogCreateInput = {
      level: options.level || LogLevel.INFO,
      category: options.category || LogCategory.TRANSLATION,
      message,
      jobId: options.jobId,
      workId: options.workId,
      chapterId: options.chapterId,
      chapterNum: options.chapterNum,
      chunkIndex: options.chunkIndex,
      userId: options.userId,
      userEmail: options.userEmail,
      errorCode: options.errorCode,
      errorStack: options.errorStack,
      metadata: options.metadata as Prisma.InputJsonValue,
      durationMs: options.durationMs,
      retryCount: options.retryCount,
      clientIp: options.clientIp,
      userAgent: options.userAgent,
    };

    this.batchQueue.push(logEntry);

    // 배치 크기에 도달하면 즉시 플러시
    if (this.batchQueue.length >= this.BATCH_SIZE) {
      await this.flush();
    } else if (!this.batchTimer) {
      // 타이머가 없으면 설정
      this.batchTimer = setTimeout(() => this.flush(), this.BATCH_INTERVAL_MS);
    }
  }

  // 배치 플러시
  private async flush(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.batchQueue.length === 0) return;

    const logsToInsert = [...this.batchQueue];
    this.batchQueue = [];

    try {
      await db.translationLog.createMany({
        data: logsToInsert,
      });
    } catch (error) {
      // 로깅 실패는 조용히 처리 (번역 작업에 영향 주지 않음)
      console.error("[TranslationLogger] Failed to save logs:", error);
    }
  }

  // 에러 로그 (즉시 저장)
  async error(message: string, options: LogOptions = {}): Promise<void> {
    await this.log(message, { ...options, level: LogLevel.ERROR });
    await this.flush(); // 에러는 즉시 저장
  }

  // 경고 로그
  async warn(message: string, options: LogOptions = {}): Promise<void> {
    await this.log(message, { ...options, level: LogLevel.WARN });
  }

  // 정보 로그
  async info(message: string, options: LogOptions = {}): Promise<void> {
    await this.log(message, { ...options, level: LogLevel.INFO });
  }

  // 디버그 로그
  async debug(message: string, options: LogOptions = {}): Promise<void> {
    await this.log(message, { ...options, level: LogLevel.DEBUG });
  }

  // === 전문화된 로깅 메서드 ===

  // API 호출 시작
  async logApiCallStart(
    jobId: string,
    chapterNum: number,
    chunkIndex: number,
    options: Partial<LogOptions> = {}
  ): Promise<void> {
    await this.debug(`API 호출 시작: 챕터 ${chapterNum}, 청크 ${chunkIndex}`, {
      category: LogCategory.API_CALL,
      jobId,
      chapterNum,
      chunkIndex,
      ...options,
    });
  }

  // API 호출 완료
  async logApiCallComplete(
    jobId: string,
    chapterNum: number,
    chunkIndex: number,
    durationMs: number,
    options: Partial<LogOptions> = {}
  ): Promise<void> {
    await this.info(`API 호출 완료: 챕터 ${chapterNum}, 청크 ${chunkIndex} (${durationMs}ms)`, {
      category: LogCategory.API_CALL,
      jobId,
      chapterNum,
      chunkIndex,
      durationMs,
      ...options,
    });
  }

  // API 호출 실패
  async logApiCallError(
    jobId: string,
    chapterNum: number,
    chunkIndex: number,
    errorCode: string,
    errorMessage: string,
    retryCount: number,
    options: Partial<LogOptions> = {}
  ): Promise<void> {
    await this.error(`API 호출 실패: 챕터 ${chapterNum}, 청크 ${chunkIndex} - ${errorMessage}`, {
      category: LogCategory.API_CALL,
      jobId,
      chapterNum,
      chunkIndex,
      errorCode,
      retryCount,
      metadata: { errorMessage },
      ...options,
    });
  }

  // Rate Limit 발생
  async logRateLimit(
    jobId: string,
    waitTimeMs: number,
    queueLength: number,
    options: Partial<LogOptions> = {}
  ): Promise<void> {
    await this.warn(`Rate limit 대기: ${waitTimeMs}ms (큐 대기: ${queueLength})`, {
      category: LogCategory.RATE_LIMIT,
      jobId,
      metadata: { waitTimeMs, queueLength },
      ...options,
    });
  }

  // 챕터 번역 시작
  async logChapterStart(
    jobId: string,
    workId: string,
    chapterId: string,
    chapterNum: number,
    totalChunks: number,
    options: Partial<LogOptions> = {}
  ): Promise<void> {
    await this.info(`챕터 ${chapterNum} 번역 시작 (청크 ${totalChunks}개)`, {
      category: LogCategory.CHAPTER,
      jobId,
      workId,
      chapterId,
      chapterNum,
      metadata: { totalChunks },
      ...options,
    });
  }

  // 챕터 번역 완료
  async logChapterComplete(
    jobId: string,
    chapterNum: number,
    durationMs: number,
    failedChunks: number,
    options: Partial<LogOptions> = {}
  ): Promise<void> {
    const level = failedChunks > 0 ? LogLevel.WARN : LogLevel.INFO;
    await this.log(`챕터 ${chapterNum} 완료 (${durationMs}ms, 실패 청크: ${failedChunks})`, {
      level,
      category: LogCategory.CHAPTER,
      jobId,
      chapterNum,
      durationMs,
      metadata: { failedChunks },
      ...options,
    });
  }

  // 챕터 번역 실패
  async logChapterFailed(
    jobId: string,
    chapterNum: number,
    errorCode: string,
    errorMessage: string,
    options: Partial<LogOptions> = {}
  ): Promise<void> {
    await this.error(`챕터 ${chapterNum} 실패: ${errorMessage}`, {
      category: LogCategory.CHAPTER,
      jobId,
      chapterNum,
      errorCode,
      metadata: { errorMessage },
      ...options,
    });
  }

  // 작업 시작
  async logJobStart(
    jobId: string,
    workId: string,
    workTitle: string,
    totalChapters: number,
    userId: string,
    userEmail?: string,
    options: Partial<LogOptions> = {}
  ): Promise<void> {
    await this.info(`번역 작업 시작: ${workTitle} (${totalChapters}개 챕터)`, {
      category: LogCategory.JOB,
      jobId,
      workId,
      userId,
      userEmail,
      metadata: { workTitle, totalChapters },
      ...options,
    });
  }

  // 작업 완료
  async logJobComplete(
    jobId: string,
    completedChapters: number,
    failedChapters: number,
    durationMs: number,
    options: Partial<LogOptions> = {}
  ): Promise<void> {
    const level = failedChapters > 0 ? LogLevel.WARN : LogLevel.INFO;
    await this.log(`번역 작업 완료 (성공: ${completedChapters}, 실패: ${failedChapters}, ${durationMs}ms)`, {
      level,
      category: LogCategory.JOB,
      jobId,
      durationMs,
      metadata: { completedChapters, failedChapters },
      ...options,
    });
  }

  // 작업 실패
  async logJobFailed(
    jobId: string,
    errorCode: string,
    errorMessage: string,
    options: Partial<LogOptions> = {}
  ): Promise<void> {
    await this.error(`번역 작업 실패: ${errorMessage}`, {
      category: LogCategory.JOB,
      jobId,
      errorCode,
      metadata: { errorMessage },
      ...options,
    });
  }

  // === 작업 히스토리 ===

  async saveJobHistory(options: JobHistoryOptions): Promise<void> {
    try {
      await db.translationJobHistory.upsert({
        where: { jobId: options.jobId },
        update: {
          status: options.status,
          completedChapters: options.completedChapters,
          failedChapters: options.failedChapters,
          errorMessage: options.errorMessage,
          failedChapterNums: options.failedChapterNums || [],
          completedAt: options.completedAt,
          durationMs: options.durationMs,
        },
        create: {
          jobId: options.jobId,
          workId: options.workId,
          workTitle: options.workTitle,
          userId: options.userId,
          userEmail: options.userEmail,
          status: options.status,
          totalChapters: options.totalChapters,
          completedChapters: options.completedChapters,
          failedChapters: options.failedChapters,
          errorMessage: options.errorMessage,
          failedChapterNums: options.failedChapterNums || [],
          startedAt: options.startedAt,
          completedAt: options.completedAt,
          durationMs: options.durationMs,
        },
      });
    } catch (error) {
      console.error("[TranslationLogger] Failed to save job history:", error);
    }
  }

  // === 로그 조회 메서드 ===

  async getLogs(options: {
    level?: LogLevel;
    category?: LogCategory;
    jobId?: string;
    workId?: string;
    userId?: string;
    errorCode?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  } = {}): Promise<{ logs: unknown[]; total: number; page: number; totalPages: number }> {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 50, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.TranslationLogWhereInput = {};
    if (options.level) where.level = options.level;
    if (options.category) where.category = options.category;
    if (options.jobId) where.jobId = options.jobId;
    if (options.workId) where.workId = options.workId;
    if (options.userId) where.userId = options.userId;
    if (options.errorCode) where.errorCode = options.errorCode;
    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt.gte = options.startDate;
      if (options.endDate) where.createdAt.lte = options.endDate;
    }

    const [total, logs] = await Promise.all([
      db.translationLog.count({ where }),
      db.translationLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return {
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // 에러 통계
  async getErrorStats(startDate?: Date, endDate?: Date): Promise<{
    totalErrors: number;
    byErrorCode: Record<string, number>;
    byCategory: Record<string, number>;
    recentErrors: unknown[];
  }> {
    const where: Prisma.TranslationLogWhereInput = {
      level: LogLevel.ERROR,
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [totalErrors, errorsByCode, errorsByCategory, recentErrors] = await Promise.all([
      db.translationLog.count({ where }),
      db.translationLog.groupBy({
        by: ["errorCode"],
        where,
        _count: true,
      }),
      db.translationLog.groupBy({
        by: ["category"],
        where,
        _count: true,
      }),
      db.translationLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return {
      totalErrors,
      byErrorCode: Object.fromEntries(
        errorsByCode.map((e) => [e.errorCode || "UNKNOWN", e._count])
      ),
      byCategory: Object.fromEntries(
        errorsByCategory.map((e) => [e.category, e._count])
      ),
      recentErrors,
    };
  }

  // === 로그 보존 정책 (자동 정리) ===

  /**
   * 오래된 로그를 차등 보존 기간에 따라 삭제
   * - DEBUG: 7일
   * - INFO: 30일
   * - WARN/ERROR: 90일
   * @returns 삭제된 총 레코드 수
   */
  async cleanupOldLogs(options?: {
    debugDays?: number;
    infoDays?: number;
    warnErrorDays?: number;
  }): Promise<{ deletedCount: number; details: Record<string, number> }> {
    const debugDays = options?.debugDays ?? 7;
    const infoDays = options?.infoDays ?? 30;
    const warnErrorDays = options?.warnErrorDays ?? 90;

    const now = Date.now();
    const details: Record<string, number> = {};

    try {
      // DEBUG 로그 정리
      const debugResult = await db.translationLog.deleteMany({
        where: {
          level: LogLevel.DEBUG,
          createdAt: { lt: new Date(now - debugDays * 24 * 60 * 60 * 1000) },
        },
      });
      details.DEBUG = debugResult.count;

      // INFO 로그 정리
      const infoResult = await db.translationLog.deleteMany({
        where: {
          level: LogLevel.INFO,
          createdAt: { lt: new Date(now - infoDays * 24 * 60 * 60 * 1000) },
        },
      });
      details.INFO = infoResult.count;

      // WARN 로그 정리
      const warnResult = await db.translationLog.deleteMany({
        where: {
          level: LogLevel.WARN,
          createdAt: { lt: new Date(now - warnErrorDays * 24 * 60 * 60 * 1000) },
        },
      });
      details.WARN = warnResult.count;

      // ERROR 로그 정리
      const errorResult = await db.translationLog.deleteMany({
        where: {
          level: LogLevel.ERROR,
          createdAt: { lt: new Date(now - warnErrorDays * 24 * 60 * 60 * 1000) },
        },
      });
      details.ERROR = errorResult.count;

      const deletedCount = Object.values(details).reduce((sum, n) => sum + n, 0);
      return { deletedCount, details };
    } catch (error) {
      console.error("[TranslationLogger] Failed to cleanup logs:", error);
      return { deletedCount: 0, details };
    }
  }

  /**
   * 오래된 작업 히스토리 삭제
   * @param retentionDays 보존 기간 (기본 90일)
   * @returns 삭제된 레코드 수
   */
  async cleanupOldJobHistory(retentionDays: number = 90): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const result = await db.translationJobHistory.deleteMany({
        where: {
          createdAt: { lt: cutoff },
        },
      });
      return result.count;
    } catch (error) {
      console.error("[TranslationLogger] Failed to cleanup job history:", error);
      return 0;
    }
  }

  // 작업 히스토리 조회
  async getJobHistory(options: {
    workId?: string;
    userId?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ jobs: unknown[]; total: number }> {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 50);
    const skip = (page - 1) * limit;

    const where: Prisma.TranslationJobHistoryWhereInput = {};
    if (options.workId) where.workId = options.workId;
    if (options.userId) where.userId = options.userId;
    if (options.status) where.status = options.status;

    const [total, jobs] = await Promise.all([
      db.translationJobHistory.count({ where }),
      db.translationJobHistory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return { jobs, total };
  }
}

// 싱글톤 인스턴스 export
export const translationLogger = TranslationLogger.getInstance();

// 편의 함수들
export const logError = translationLogger.error.bind(translationLogger);
export const logWarn = translationLogger.warn.bind(translationLogger);
export const logInfo = translationLogger.info.bind(translationLogger);
export const logDebug = translationLogger.debug.bind(translationLogger);
