"use strict";
/**
 * TransNovel Health Checker Lambda
 *
 * Monitors job health and performs cleanup tasks:
 * - Check for stale jobs (running too long)
 * - Clean up completed/failed jobs older than retention period
 * - Process DLQ messages
 * - Generate health metrics
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = exports.dlqHandler = exports.cleanupHandler = exports.healthCheckHandler = void 0;
const client_1 = require("@prisma/client");
const secrets_1 = require("./secrets");
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
// Configuration
const STALE_JOB_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes (500 concurrent users → longer processing)
const JOB_RETENTION_DAYS = 7;
const STALE_BIBLE_JOB_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
// Logging helper
function log(message, data) {
    const timestamp = new Date().toISOString();
    if (data) {
        console.log(`[${timestamp}] [Health Checker] ${message}`, JSON.stringify(data));
    }
    else {
        console.log(`[${timestamp}] [Health Checker] ${message}`);
    }
}
/**
 * Scheduled health check handler (EventBridge)
 */
const healthCheckHandler = async () => {
    log("Running scheduled health check");
    const db = await getPrismaClient();
    try {
        // 1. Check for stale translation jobs
        const staleTranslationJobs = await checkStaleTranslationJobs(db);
        // 2. Check for stale bible jobs
        const staleBibleJobs = await checkStaleBibleJobs(db);
        // 3. Generate metrics
        const metrics = await generateMetrics(db);
        log("Health check completed", {
            staleTranslationJobs,
            staleBibleJobs,
            metrics,
        });
    }
    catch (error) {
        log("Health check failed", {
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
};
exports.healthCheckHandler = healthCheckHandler;
/**
 * Cleanup handler (runs less frequently)
 */
const cleanupHandler = async () => {
    log("Running cleanup job");
    const db = await getPrismaClient();
    try {
        // Clean up old completed/failed jobs
        const cleanedJobs = await cleanupOldJobs(db);
        log("Cleanup completed", { cleanedJobs });
    }
    catch (error) {
        log("Cleanup failed", {
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
};
exports.cleanupHandler = cleanupHandler;
/**
 * DLQ processor handler
 */
const dlqHandler = async (event) => {
    log("Processing DLQ messages", { count: event.Records.length });
    const db = await getPrismaClient();
    for (const record of event.Records) {
        await processDlqMessage(db, record);
    }
};
exports.dlqHandler = dlqHandler;
/**
 * Check for stale translation jobs
 */
async function checkStaleTranslationJobs(db) {
    const staleThreshold = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);
    // Find jobs that have been in progress for too long
    const staleJobs = await db.activeTranslationJob.findMany({
        where: {
            status: "IN_PROGRESS",
            startedAt: { lt: staleThreshold },
        },
        select: {
            jobId: true,
            workId: true,
            totalChapters: true,
            completedChapters: true,
            failedChapters: true,
            startedAt: true,
        },
    });
    for (const job of staleJobs) {
        const processedCount = job.completedChapters + job.failedChapters;
        const progress = job.totalChapters > 0 ? processedCount / job.totalChapters : 0;
        log("Found stale translation job", {
            jobId: job.jobId,
            progress: `${(progress * 100).toFixed(1)}%`,
            startedAt: job.startedAt?.toISOString(),
        });
        // If more than 90% done, mark as complete
        if (progress >= 0.9) {
            await db.activeTranslationJob.update({
                where: { jobId: job.jobId },
                data: {
                    status: job.failedChapters > 0 ? "FAILED" : "COMPLETED",
                    completedAt: new Date(),
                    errorMessage: job.failedChapters > 0
                        ? `${job.failedChapters}개 회차 번역 실패 (타임아웃 후 자동 완료)`
                        : "타임아웃 후 자동 완료",
                },
            });
        }
        else {
            // Mark as failed
            await db.activeTranslationJob.update({
                where: { jobId: job.jobId },
                data: {
                    status: "FAILED",
                    completedAt: new Date(),
                    errorMessage: `작업 타임아웃 (진행률: ${(progress * 100).toFixed(1)}%)`,
                },
            });
        }
    }
    return staleJobs.length;
}
/**
 * Check for stale bible jobs
 */
async function checkStaleBibleJobs(db) {
    const staleThreshold = new Date(Date.now() - STALE_BIBLE_JOB_THRESHOLD_MS);
    // Find jobs that have been in progress for too long
    const staleJobs = await db.bibleGenerationJob.findMany({
        where: {
            status: "IN_PROGRESS",
            startedAt: { lt: staleThreshold },
        },
        select: {
            id: true,
            workId: true,
            totalBatches: true,
            currentBatchIndex: true,
            startedAt: true,
        },
    });
    for (const job of staleJobs) {
        const progress = job.totalBatches > 0 ? job.currentBatchIndex / job.totalBatches : 0;
        log("Found stale bible job", {
            jobId: job.id,
            progress: `${(progress * 100).toFixed(1)}%`,
            startedAt: job.startedAt?.toISOString(),
        });
        // If more than 90% done, mark as complete
        if (progress >= 0.9) {
            await db.bibleGenerationJob.update({
                where: { id: job.id },
                data: {
                    status: "COMPLETED",
                    completedAt: new Date(),
                },
            });
        }
        else {
            // Mark as failed
            await db.bibleGenerationJob.update({
                where: { id: job.id },
                data: {
                    status: "FAILED",
                    errorMessage: `작업 타임아웃 (진행률: ${(progress * 100).toFixed(1)}%)`,
                },
            });
        }
    }
    return staleJobs.length;
}
/**
 * Clean up old completed/failed jobs
 */
async function cleanupOldJobs(db) {
    const retentionThreshold = new Date(Date.now() - JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    // Clean up old translation jobs
    const deletedTranslation = await db.activeTranslationJob.deleteMany({
        where: {
            status: { in: ["COMPLETED", "FAILED", "CANCELLED"] },
            completedAt: { lt: retentionThreshold },
        },
    });
    // Clean up old bible jobs
    const deletedBible = await db.bibleGenerationJob.deleteMany({
        where: {
            status: { in: ["COMPLETED", "FAILED", "CANCELLED"] },
            completedAt: { lt: retentionThreshold },
        },
    });
    return {
        translationJobs: deletedTranslation.count,
        bibleJobs: deletedBible.count,
    };
}
/**
 * Generate health metrics
 */
async function generateMetrics(db) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [activeTranslationJobs, activeBibleJobs, pendingChapters, failedTranslationJobs, failedBibleJobs,] = await Promise.all([
        db.activeTranslationJob.count({
            where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
        }),
        db.bibleGenerationJob.count({
            where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
        }),
        db.chapter.count({
            where: { status: "PENDING" },
        }),
        db.activeTranslationJob.count({
            where: { status: "FAILED", completedAt: { gte: oneDayAgo } },
        }),
        db.bibleGenerationJob.count({
            where: { status: "FAILED", completedAt: { gte: oneDayAgo } },
        }),
    ]);
    return {
        activeTranslationJobs,
        activeBibleJobs,
        pendingChapters,
        failedJobsLast24h: failedTranslationJobs + failedBibleJobs,
    };
}
/**
 * Process DLQ message
 */
async function processDlqMessage(db, record) {
    let message;
    try {
        message = JSON.parse(record.body);
    }
    catch {
        log("Failed to parse DLQ message", { body: record.body });
        return;
    }
    log("Processing DLQ message", { message });
    // If it's a translation job message, update the chapter status
    if (message.chapterId) {
        await db.chapter.updateMany({
            where: { id: message.chapterId, status: "TRANSLATING" },
            data: { status: "PENDING" },
        });
    }
    // If it's a job message, increment failure count
    if (message.jobId) {
        // Check if it's a translation job
        const translationJob = await db.activeTranslationJob.findUnique({
            where: { jobId: message.jobId },
        });
        if (translationJob) {
            await db.activeTranslationJob.update({
                where: { jobId: message.jobId },
                data: { failedChapters: { increment: 1 } },
            });
            return;
        }
        // Check if it's a bible job
        const bibleJob = await db.bibleGenerationJob.findUnique({
            where: { id: message.jobId },
        });
        if (bibleJob) {
            const newRetryCount = bibleJob.retryCount + 1;
            if (newRetryCount >= bibleJob.maxRetries) {
                await db.bibleGenerationJob.update({
                    where: { id: message.jobId },
                    data: {
                        status: "FAILED",
                        retryCount: newRetryCount,
                        errorMessage: "DLQ 처리 후 최대 재시도 횟수 초과",
                    },
                });
            }
            else {
                await db.bibleGenerationJob.update({
                    where: { id: message.jobId },
                    data: { retryCount: newRetryCount },
                });
            }
        }
    }
}
// Export default handler for EventBridge
exports.handler = exports.healthCheckHandler;
//# sourceMappingURL=index.js.map