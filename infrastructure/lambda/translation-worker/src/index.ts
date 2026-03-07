/**
 * TransNovel Translation Worker Lambda
 *
 * Processes translation jobs from SQS queue.
 * Connects to DB via RDS Proxy for connection pooling at scale.
 */

import { SQSEvent, SQSRecord, SQSBatchResponse } from "aws-lambda";
import { PrismaClient } from "@prisma/client";
import { getSecrets, GeminiSecrets, DatabaseSecrets } from "./secrets";
import { translateChapter, TranslationContext, prependChapterTitle, extractTranslatedTitle } from "./gemini";

// Prisma client singleton
let prisma: PrismaClient | null = null;
let lastUsedAt: number = 0;

// Lambda는 짧은 수명 + 높은 동시성이므로 connection_limit을 낮게 설정
const LAMBDA_CONNECTION_LIMIT = 5;
// RDS Proxy idle timeout(5분) 전에 커넥션 리프레시 — stale connection 방지
const CONNECTION_MAX_IDLE_MS = 4 * 60 * 1000; // 4분

function ensureConnectionLimit(url: string): string {
  if (url.includes("connection_limit")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}connection_limit=${LAMBDA_CONNECTION_LIMIT}&connect_timeout=30`;
}

async function getPrismaClient(): Promise<PrismaClient> {
  // 유휴 시간이 4분 초과 시 커넥션 리프레시 (RDS Proxy idle timeout 방지)
  if (prisma && Date.now() - lastUsedAt > CONNECTION_MAX_IDLE_MS) {
    log("Connection idle > 4min, refreshing Prisma client");
    await prisma.$disconnect().catch(() => {});
    prisma = null;
  }

  if (!prisma) {
    const secrets = await getSecrets<DatabaseSecrets>(
      process.env.DATABASE_SECRET_ARN!
    );
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: ensureConnectionLimit(secrets.DATABASE_URL),
        },
      },
    });
  }

  lastUsedAt = Date.now();
  return prisma;
}

// Clean up Prisma connection when Lambda container is recycled
process.on("SIGTERM", async () => {
  log("SIGTERM received, disconnecting Prisma");
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
});

// Message payload interface
interface TranslationMessage {
  jobId: string;
  workId: string;
  chapterId: string;
  chapterNumber: number;
  keyIndex: number; // For API key rotation
  userId: string;
  userEmail?: string;
}

// Logging helper
function log(message: string, data?: object) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] [Translation Worker] ${message}`, JSON.stringify(data));
  } else {
    console.log(`[${timestamp}] [Translation Worker] ${message}`);
  }
}

/**
 * Main Lambda handler
 * Returns SQSBatchResponse for partial failure reporting.
 * Each message is processed independently - one failure won't block others.
 */
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  log("Received SQS event", { recordCount: event.Records.length });

  const results = await Promise.allSettled(
    event.Records.map(record => processMessage(record))
  );

  const batchItemFailures: Array<{ itemIdentifier: string }> = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      log("Message failed", {
        messageId: event.Records[index].messageId,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      batchItemFailures.push({
        itemIdentifier: event.Records[index].messageId,
      });
    }
  });

  log("Batch processing complete", {
    total: event.Records.length,
    succeeded: event.Records.length - batchItemFailures.length,
    failed: batchItemFailures.length,
  });

  return { batchItemFailures };
};

/**
 * Process a single SQS message
 */
async function processMessage(record: SQSRecord): Promise<void> {
  const startTime = Date.now();
  let message: TranslationMessage;

  try {
    message = JSON.parse(record.body);
  } catch {
    log("Failed to parse message body", { body: record.body });
    // Don't throw - let message be deleted (invalid format)
    return;
  }

  const { jobId, workId, chapterId, chapterNumber, keyIndex, userId, userEmail } = message;
  log("Processing chapter", { jobId, chapterNumber, chapterId, keyIndex });

  const db = await getPrismaClient();
  let workTitle = ""; // catch 블록에서도 접근 가능하도록 외부 선언

  try {
    // 1. Check job status
    const job = await db.activeTranslationJob.findUnique({
      where: { jobId },
    });

    if (!job) {
      log("Job not found, skipping", { jobId });
      return; // Message will be deleted
    }

    // Skip if job is terminated
    if (job.status === "FAILED" || job.status === "COMPLETED" || job.status === "CANCELLED") {
      log("Job already terminated, skipping", { status: job.status });
      return;
    }

    // Skip if paused
    if (job.isPauseRequested || job.status === "PAUSED") {
      log("Job is paused, skipping");
      return;
    }

    // 2. Load chapter
    const chapter = await db.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true, number: true, title: true, originalContent: true, status: true },
    });

    if (!chapter) {
      log("Chapter not found", { chapterId });
      await updateJobProgress(db, jobId, true, false);
      return;
    }

    // Skip if already translated
    if (["TRANSLATED", "EDITED", "APPROVED"].includes(chapter.status)) {
      log("Chapter already translated", { status: chapter.status });
      await updateJobProgress(db, jobId, true, false);
      return;
    }

    // 3. Atomic status change
    const updateResult = await db.chapter.updateMany({
      where: { id: chapterId, status: "PENDING" },
      data: { status: "TRANSLATING" },
    });

    if (updateResult.count === 0) {
      const currentChapter = await db.chapter.findUnique({
        where: { id: chapterId },
        select: { status: true },
      });

      if (currentChapter?.status !== "TRANSLATING") {
        log("Chapter being processed by another worker", { currentStatus: currentChapter?.status });
        return;
      }
      // If TRANSLATING, this is a retry - continue
    }

    // 4. Load translation context
    const work = await db.work.findUnique({
      where: { id: workId },
      include: {
        glossary: true,
        settingBible: {
          include: {
            characters: true,
          },
        },
      },
    });

    if (!work) {
      log("Work not found", { workId });
      await db.chapter.updateMany({
        where: { id: chapterId, status: "TRANSLATING" },
        data: { status: "PENDING" },
      });
      await updateJobProgress(db, jobId, true, false);
      return;
    }

    workTitle = work.titleKo;

    const context: TranslationContext = {
      titleKo: work.titleKo,
      genres: work.genres,
      ageRating: work.ageRating,
      synopsis: work.synopsis,
      glossary: work.glossary.map((g: { original: string; translated: string }) => ({
        original: g.original,
        translated: g.translated,
      })),
      characters: work.settingBible?.characters.map((c: { nameOriginal: string; nameKorean: string; role: string; speechStyle: string | null; personality: string | null }) => ({
        nameOriginal: c.nameOriginal,
        nameKorean: c.nameKorean,
        role: c.role,
        speechStyle: c.speechStyle || undefined,
        personality: c.personality || undefined,
      })),
      translationGuide: work.settingBible?.translationGuide || undefined,
      customSystemPrompt: work.settingBible?.customSystemPrompt || undefined,
    };

    // 5. Get Gemini API key from pool
    const geminiSecrets = await getSecrets<GeminiSecrets>(
      process.env.GEMINI_SECRET_ARN!
    );
    const keyCount = parseInt(geminiSecrets.KEY_COUNT || "1", 10);
    const keyName = `GEMINI_API_KEY_${(keyIndex % keyCount) + 1}`;
    const apiKey = geminiSecrets[keyName as keyof GeminiSecrets] || geminiSecrets.GEMINI_API_KEY_1;

    log("Using Gemini API key", { keyName, keyIndex: keyIndex % keyCount });

    // 6. Execute translation (제목 포함)
    const contentWithTitle = prependChapterTitle(chapter.originalContent, chapter.title);
    log("Starting translation", {
      contentLength: contentWithTitle.length,
      hasTitle: !!chapter.title,
    });

    // Lambda 타임아웃(15분) 전에 안전하게 실패하도록 12분 타임아웃 적용
    const CHAPTER_TIMEOUT_MS = 12 * 60 * 1000; // 12분
    const translationPromise = translateChapter(
      contentWithTitle,
      context,
      apiKey,
      2 // maxRetries (모델당 2회 × 3모델 = 최대 6회, SQS 재시도 3회와 합산)
    );

    const rawTranslated = await Promise.race([
      translationPromise,
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`챕터 번역 시간 초과 (${CHAPTER_TIMEOUT_MS / 60000}분)`)),
          CHAPTER_TIMEOUT_MS
        );
      }),
    ]);

    // 번역된 제목과 본문 분리
    const { translatedTitle, content: translatedBody } = extractTranslatedTitle(rawTranslated);

    log("Translation completed", {
      originalLength: chapter.originalContent.length,
      translatedLength: translatedBody.length,
      translatedTitle: translatedTitle || "(none)",
    });

    // 7. Save result
    await db.chapter.update({
      where: { id: chapterId },
      data: {
        translatedContent: translatedBody,
        translatedTitle: translatedTitle || undefined,
        status: "TRANSLATED",
        translationMeta: undefined,
      },
    });

    const duration = Date.now() - startTime;
    log(`Chapter ${chapterNumber} completed`, { durationMs: duration });

    // 8. Update job progress
    await updateJobProgress(db, jobId, true, false);

    // 9. Check if job is complete
    await checkAndCompleteJob(db, jobId, workId, work.titleKo);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Chapter ${chapterNumber} failed`, {
      error: errorMessage,
      chapterId,
    });

    // 재시도 가능한 에러인지 판단
    const isRetryable = errorMessage.includes("시간 초과") ||
      errorMessage.includes("TIMEOUT") ||
      errorMessage.includes("rate") ||
      errorMessage.includes("429") ||
      errorMessage.includes("503") ||
      errorMessage.includes("server") ||
      errorMessage.includes("네트워크") ||
      errorMessage.includes("connection");

    if (isRetryable) {
      // 재시도 가능: PENDING으로 되돌리고 SQS 재시도에 맡김
      await db.chapter.updateMany({
        where: { id: chapterId, status: "TRANSLATING" },
        data: { status: "PENDING" },
      });
    } else {
      // 재시도 불가능 (콘텐츠 필터링 등): PENDING으로 두되 에러 기록
      // 이렇게 하면 사용자가 재번역 시도 가능
      await db.chapter.updateMany({
        where: { id: chapterId, status: "TRANSLATING" },
        data: { status: "PENDING" },
      });
      log(`Chapter ${chapterNumber}: non-retryable error, marking as failed`, { error: errorMessage });
    }

    // Update job with failure + 에러 메시지 저장
    await updateJobProgress(db, jobId, false, true, chapterNumber, errorMessage);

    // 에러 path에서도 job 완료 여부 확인 (job 고착 방지)
    await checkAndCompleteJob(db, jobId, workId, workTitle);

    // Re-throw to trigger SQS retry (via DLQ after max retries)
    throw error;
  }
}

/**
 * Update job progress counters
 */
async function updateJobProgress(
  db: PrismaClient,
  jobId: string,
  success: boolean,
  failed: boolean,
  chapterNumber?: number,
  errorMessage?: string
): Promise<void> {
  try {
    if (success) {
      await db.activeTranslationJob.update({
        where: { jobId },
        data: { completedChapters: { increment: 1 } },
      });
    }
    if (failed) {
      // 실패 카운터 증가 + 실패한 챕터 번호와 에러 기록
      const updateData: Record<string, unknown> = {
        failedChapters: { increment: 1 },
      };
      if (chapterNumber !== undefined) {
        updateData.failedChapterNums = { push: chapterNumber };
      }
      if (errorMessage) {
        updateData.lastError = errorMessage.slice(0, 500); // 최대 500자
      }
      await db.activeTranslationJob.update({
        where: { jobId },
        data: updateData,
      });
    }
  } catch (error) {
    log("Failed to update job progress", {
      jobId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Check if all chapters are processed and complete the job
 */
async function checkAndCompleteJob(
  db: PrismaClient,
  jobId: string,
  workId: string,
  workTitle: string
): Promise<void> {
  try {
    const job = await db.activeTranslationJob.findUnique({
      where: { jobId },
    });

    if (!job) return;

    const processedCount = job.completedChapters + job.failedChapters;
    if (processedCount < job.totalChapters) {
      return; // Still processing
    }

    log("All chapters processed", {
      jobId,
      completed: job.completedChapters,
      failed: job.failedChapters,
      total: job.totalChapters,
    });

    // Update job status
    const hasFailed = job.failedChapters > 0;
    await db.activeTranslationJob.update({
      where: { jobId },
      data: {
        status: hasFailed ? "FAILED" : "COMPLETED",
        completedAt: new Date(),
        errorMessage: hasFailed
          ? `${job.failedChapters}개 회차 번역 실패`
          : null,
      },
    });

    // Update work status
    await updateWorkStatus(db, workId, workTitle);

  } catch (error) {
    log("Failed to complete job", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Update work status after translation completion
 */
async function updateWorkStatus(
  db: PrismaClient,
  workId: string,
  workTitle: string
): Promise<void> {
  try {
    const chapters = await db.chapter.findMany({
      where: { workId },
      select: { status: true },
    });

    const total = chapters.length;
    const translated = chapters.filter(
      (ch: { status: string }) => ["TRANSLATED", "EDITED", "APPROVED"].includes(ch.status)
    ).length;

    if (total > 0 && translated === total) {
      await db.work.update({
        where: { id: workId },
        data: { status: "TRANSLATED" },
      });
      log("Work status updated to TRANSLATED");

      // Create auto listing draft
      await createAutoListing(db, workId, workTitle, total);
    }
  } catch (error) {
    log("Failed to update work status", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Create automatic project listing draft
 */
async function createAutoListing(
  db: PrismaClient,
  workId: string,
  workTitle: string,
  totalChapters: number
): Promise<void> {
  try {
    const existing = await db.projectListing.findFirst({
      where: { workId },
    });

    if (existing) {
      log("Listing already exists, skipping");
      return;
    }

    const work = await db.work.findUnique({
      where: { id: workId },
      select: { authorId: true, synopsis: true, totalChapters: true },
    });

    if (!work) return;

    const hasChapter0 = await db.chapter.findUnique({
      where: { workId_number: { workId, number: 0 } },
      select: { id: true },
    });

    await db.projectListing.create({
      data: {
        workId,
        authorId: work.authorId,
        title: `[윤문 요청] ${workTitle}`,
        description: work.synopsis || `${workTitle} 작품의 윤문을 요청합니다.`,
        status: "OPEN",
        publishedAt: new Date(),
        chapterStart: hasChapter0 ? 0 : 1,
        chapterEnd: work.totalChapters || totalChapters,
      },
    });

    log(`Auto listing created: ${workTitle}`);
  } catch (error) {
    log("Failed to create auto listing", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
