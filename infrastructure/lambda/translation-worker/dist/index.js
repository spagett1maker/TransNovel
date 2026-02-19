"use strict";
/**
 * TransNovel Translation Worker Lambda
 *
 * Processes translation jobs from SQS queue.
 * Connects to DB via RDS Proxy for connection pooling at scale.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_1 = require("@prisma/client");
const secrets_1 = require("./secrets");
const gemini_1 = require("./gemini");
// Prisma client singleton
let prisma = null;
async function getPrismaClient() {
    if (!prisma) {
        const secrets = await (0, secrets_1.getSecrets)(process.env.DATABASE_SECRET_ARN);
        prisma = new client_1.PrismaClient({
            datasources: {
                db: {
                    url: secrets.DATABASE_URL,
                },
            },
        });
    }
    return prisma;
}
// Logging helper
function log(message, data) {
    const timestamp = new Date().toISOString();
    if (data) {
        console.log(`[${timestamp}] [Translation Worker] ${message}`, JSON.stringify(data));
    }
    else {
        console.log(`[${timestamp}] [Translation Worker] ${message}`);
    }
}
/**
 * Main Lambda handler
 */
const handler = async (event) => {
    log("Received SQS event", { recordCount: event.Records.length });
    // Process each message (batch size should be 1 for translation)
    for (const record of event.Records) {
        await processMessage(record);
    }
};
exports.handler = handler;
/**
 * Process a single SQS message
 */
async function processMessage(record) {
    const startTime = Date.now();
    let message;
    try {
        message = JSON.parse(record.body);
    }
    catch {
        log("Failed to parse message body", { body: record.body });
        // Don't throw - let message be deleted (invalid format)
        return;
    }
    const { jobId, workId, chapterId, chapterNumber, keyIndex, userId, userEmail } = message;
    log("Processing chapter", { jobId, chapterNumber, chapterId, keyIndex });
    const db = await getPrismaClient();
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
            select: { id: true, number: true, originalContent: true, status: true },
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
        const context = {
            titleKo: work.titleKo,
            genres: work.genres,
            ageRating: work.ageRating,
            synopsis: work.synopsis,
            glossary: work.glossary.map((g) => ({
                original: g.original,
                translated: g.translated,
            })),
            characters: work.settingBible?.characters.map((c) => ({
                nameOriginal: c.nameOriginal,
                nameKorean: c.nameKorean,
                role: c.role,
                speechStyle: c.speechStyle || undefined,
                personality: c.personality || undefined,
            })),
            translationGuide: work.settingBible?.translationGuide || undefined,
        };
        // 5. Get Gemini API key from pool
        const geminiSecrets = await (0, secrets_1.getSecrets)(process.env.GEMINI_SECRET_ARN);
        const keyCount = parseInt(geminiSecrets.KEY_COUNT || "1", 10);
        const keyName = `GEMINI_API_KEY_${(keyIndex % keyCount) + 1}`;
        const apiKey = geminiSecrets[keyName] || geminiSecrets.GEMINI_API_KEY_1;
        log("Using Gemini API key", { keyName, keyIndex: keyIndex % keyCount });
        // 6. Execute translation
        log("Starting translation", {
            contentLength: chapter.originalContent.length,
        });
        const translatedContent = await (0, gemini_1.translateChapter)(chapter.originalContent, context, apiKey, 5 // maxRetries
        );
        log("Translation completed", {
            originalLength: chapter.originalContent.length,
            translatedLength: translatedContent.length,
        });
        // 7. Save result
        await db.chapter.update({
            where: { id: chapterId },
            data: {
                translatedContent,
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log(`Chapter ${chapterNumber} failed`, { error: errorMessage });
        // Revert chapter status
        await db.chapter.updateMany({
            where: { id: chapterId, status: "TRANSLATING" },
            data: { status: "PENDING" },
        });
        // Update job with failure
        await updateJobProgress(db, jobId, false, true);
        // Re-throw to trigger SQS retry (via DLQ after max retries)
        throw error;
    }
}
/**
 * Update job progress counters
 */
async function updateJobProgress(db, jobId, success, failed) {
    try {
        if (success) {
            await db.activeTranslationJob.update({
                where: { jobId },
                data: { completedChapters: { increment: 1 } },
            });
        }
        if (failed) {
            await db.activeTranslationJob.update({
                where: { jobId },
                data: { failedChapters: { increment: 1 } },
            });
        }
    }
    catch (error) {
        log("Failed to update job progress", {
            jobId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
/**
 * Check if all chapters are processed and complete the job
 */
async function checkAndCompleteJob(db, jobId, workId, workTitle) {
    try {
        const job = await db.activeTranslationJob.findUnique({
            where: { jobId },
        });
        if (!job)
            return;
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
    }
    catch (error) {
        log("Failed to complete job", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
/**
 * Update work status after translation completion
 */
async function updateWorkStatus(db, workId, workTitle) {
    try {
        const chapters = await db.chapter.findMany({
            where: { workId },
            select: { status: true },
        });
        const total = chapters.length;
        const translated = chapters.filter((ch) => ["TRANSLATED", "EDITED", "APPROVED"].includes(ch.status)).length;
        if (total > 0 && translated === total) {
            await db.work.update({
                where: { id: workId },
                data: { status: "TRANSLATED" },
            });
            log("Work status updated to TRANSLATED");
            // Create auto listing draft
            await createAutoListing(db, workId, workTitle, total);
        }
    }
    catch (error) {
        log("Failed to update work status", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
/**
 * Create automatic project listing draft
 */
async function createAutoListing(db, workId, workTitle, totalChapters) {
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
        if (!work)
            return;
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
    }
    catch (error) {
        log("Failed to create auto listing", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
//# sourceMappingURL=index.js.map