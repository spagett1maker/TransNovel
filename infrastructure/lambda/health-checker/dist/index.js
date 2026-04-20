"use strict";
/**
 * TransNovel Health Checker Lambda
 *
 * Monitors job health and performs cleanup tasks:
 * - Detect and resolve zombie jobs (stuck IN_PROGRESS/PENDING)
 * - Recover orphaned chapters stuck in TRANSLATING status
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
// Lambda는 짧은 수명 + 높은 동시성이므로 connection_limit을 낮게 설정
const LAMBDA_CONNECTION_LIMIT = 5;
function ensureConnectionLimit(url) {
    if (url.includes("connection_limit"))
        return url;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}connection_limit=${LAMBDA_CONNECTION_LIMIT}`;
}
async function getPrismaClient() {
    if (!prisma) {
        const secrets = await (0, secrets_1.getSecrets)(process.env.DATABASE_SECRET_ARN);
        prisma = new client_1.PrismaClient({
            datasources: {
                db: {
                    url: ensureConnectionLimit(secrets.DATABASE_URL),
                },
            },
        });
    }
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
// Configuration
const STALE_JOB_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes
const STALE_PENDING_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes for stuck PENDING
const JOB_RETENTION_DAYS = 7;
const STALE_BIBLE_JOB_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
const STALE_BIBLE_PENDING_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes for stuck PENDING bible
const ORPHANED_CHAPTER_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes for stuck TRANSLATING chapters
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
        // 1. Check for stale translation jobs (IN_PROGRESS + PENDING)
        const staleTranslationJobs = await checkStaleTranslationJobs(db);
        // 2. Check for stale bible jobs (IN_PROGRESS + PENDING)
        const staleBibleJobs = await checkStaleBibleJobs(db);
        // 3. Recover orphaned chapters stuck in TRANSLATING with no active job
        const orphanedChapters = await recoverOrphanedChapters(db);
        // 4. Generate metrics
        const metrics = await generateMetrics(db);
        log("Health check completed", {
            staleTranslationJobs,
            staleBibleJobs,
            orphanedChapters,
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
 * Check for stale translation jobs (IN_PROGRESS that stopped progressing, and stuck PENDING)
 */
async function checkStaleTranslationJobs(db) {
    let totalRecovered = 0;
    // 1. IN_PROGRESS jobs that stopped progressing (based on updatedAt)
    const staleThreshold = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);
    const staleJobs = await db.activeTranslationJob.findMany({
        where: {
            status: "IN_PROGRESS",
            updatedAt: { lt: staleThreshold },
        },
        select: {
            jobId: true,
            workId: true,
            workTitle: true,
            totalChapters: true,
            completedChapters: true,
            failedChapters: true,
            startedAt: true,
            updatedAt: true,
        },
    });
    for (const job of staleJobs) {
        const processedCount = job.completedChapters + job.failedChapters;
        const progress = job.totalChapters > 0 ? processedCount / job.totalChapters : 0;
        log("Found stale translation job", {
            jobId: job.jobId,
            workId: job.workId,
            progress: `${(progress * 100).toFixed(1)}%`,
            startedAt: job.startedAt?.toISOString(),
            lastUpdated: job.updatedAt?.toISOString(),
        });
        const finalStatus = (progress >= 0.9 && job.failedChapters === 0) ? "COMPLETED" : "FAILED";
        // Update job status
        await db.activeTranslationJob.update({
            where: { jobId: job.jobId },
            data: {
                status: finalStatus,
                completedAt: new Date(),
                errorMessage: finalStatus === "COMPLETED"
                    ? "타임아웃 후 자동 완료"
                    : `작업 타임아웃 (진행률: ${(progress * 100).toFixed(1)}%, 실패: ${job.failedChapters}개)`,
            },
        });
        // Revert any chapters stuck in TRANSLATING back to PENDING
        const revertedChapters = await db.chapter.updateMany({
            where: { workId: job.workId, status: "TRANSLATING" },
            data: { status: "PENDING" },
        });
        if (revertedChapters.count > 0) {
            log("Reverted stuck TRANSLATING chapters", {
                jobId: job.jobId,
                count: revertedChapters.count,
            });
        }
        // Update work status
        await updateWorkStatusAfterJobEnd(db, job.workId, job.workTitle);
        totalRecovered++;
    }
    // 2. PENDING jobs that never started (stuck for 30+ minutes)
    const pendingThreshold = new Date(Date.now() - STALE_PENDING_THRESHOLD_MS);
    const stuckPendingJobs = await db.activeTranslationJob.findMany({
        where: {
            status: "PENDING",
            startedAt: { lt: pendingThreshold },
        },
        select: {
            jobId: true,
            workId: true,
            startedAt: true,
        },
    });
    for (const job of stuckPendingJobs) {
        log("Found stuck PENDING translation job", {
            jobId: job.jobId,
            createdAt: job.startedAt?.toISOString(),
        });
        await db.activeTranslationJob.update({
            where: { jobId: job.jobId },
            data: {
                status: "FAILED",
                completedAt: new Date(),
                errorMessage: "작업이 시작되지 않음 (PENDING 타임아웃)",
            },
        });
        // Revert work status
        await db.work.updateMany({
            where: { id: job.workId, status: "TRANSLATING" },
            data: { status: "BIBLE_CONFIRMED" },
        });
        totalRecovered++;
    }
    return totalRecovered;
}
/**
 * Check for stale bible jobs (IN_PROGRESS that stopped progressing, and stuck PENDING)
 */
async function checkStaleBibleJobs(db) {
    let totalRecovered = 0;
    // 1. IN_PROGRESS jobs that stopped progressing (based on updatedAt)
    const staleThreshold = new Date(Date.now() - STALE_BIBLE_JOB_THRESHOLD_MS);
    const staleJobs = await db.bibleGenerationJob.findMany({
        where: {
            status: "IN_PROGRESS",
            updatedAt: { lt: staleThreshold },
        },
        select: {
            id: true,
            workId: true,
            totalBatches: true,
            currentBatchIndex: true,
            analyzedChapters: true,
            batchPlan: true,
            startedAt: true,
            updatedAt: true,
        },
    });
    for (const job of staleJobs) {
        const progress = job.totalBatches > 0 ? job.currentBatchIndex / job.totalBatches : 0;
        log("Found stale bible job", {
            jobId: job.id,
            workId: job.workId,
            progress: `${(progress * 100).toFixed(1)}%`,
            startedAt: job.startedAt?.toISOString(),
            lastUpdated: job.updatedAt?.toISOString(),
        });
        if (progress >= 0.9) {
            // Auto-complete: use actual chapter count (not max chapter number)
            const totalChapters = await db.chapter.count({ where: { workId: job.workId } });
            await db.bibleGenerationJob.update({
                where: { id: job.id },
                data: {
                    status: "COMPLETED",
                    completedAt: new Date(),
                    analyzedChapters: totalChapters,
                },
            });
            // Update SettingBible analyzedChapters
            await db.settingBible.updateMany({
                where: { workId: job.workId },
                data: {
                    analyzedChapters: totalChapters,
                    generatedAt: new Date(),
                },
            });
            // Update Work status to BIBLE_DRAFT
            await db.work.updateMany({
                where: { id: job.workId, status: "BIBLE_GENERATING" },
                data: { status: "BIBLE_DRAFT" },
            });
            log("Auto-completed stale bible job", { jobId: job.id, totalChapters });
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
            // Revert Work status: if bible has analyzed chapters → BIBLE_DRAFT, else → REGISTERED
            const bible = await db.settingBible.findUnique({
                where: { workId: job.workId },
                select: { analyzedChapters: true },
            });
            await db.work.updateMany({
                where: { id: job.workId, status: "BIBLE_GENERATING" },
                data: {
                    status: bible && bible.analyzedChapters > 0 ? "BIBLE_DRAFT" : "REGISTERED",
                },
            });
            log("Failed stale bible job", { jobId: job.id });
        }
        totalRecovered++;
    }
    // 2. PENDING bible jobs that never started
    const pendingThreshold = new Date(Date.now() - STALE_BIBLE_PENDING_THRESHOLD_MS);
    const stuckPendingJobs = await db.bibleGenerationJob.findMany({
        where: {
            status: "PENDING",
            createdAt: { lt: pendingThreshold },
        },
        select: {
            id: true,
            workId: true,
            createdAt: true,
        },
    });
    for (const job of stuckPendingJobs) {
        log("Found stuck PENDING bible job", {
            jobId: job.id,
            createdAt: job.createdAt?.toISOString(),
        });
        await db.bibleGenerationJob.update({
            where: { id: job.id },
            data: {
                status: "FAILED",
                errorMessage: "작업이 시작되지 않음 (PENDING 타임아웃)",
            },
        });
        const bible = await db.settingBible.findUnique({
            where: { workId: job.workId },
            select: { analyzedChapters: true },
        });
        await db.work.updateMany({
            where: { id: job.workId, status: "BIBLE_GENERATING" },
            data: {
                status: bible && bible.analyzedChapters > 0 ? "BIBLE_DRAFT" : "REGISTERED",
            },
        });
        totalRecovered++;
    }
    return totalRecovered;
}
/**
 * Recover orphaned chapters stuck in TRANSLATING with no active translation job.
 * This happens when a Lambda crashes without reverting chapter status.
 */
async function recoverOrphanedChapters(db) {
    const threshold = new Date(Date.now() - ORPHANED_CHAPTER_THRESHOLD_MS);
    // Find chapters stuck in TRANSLATING whose work has no active translation job
    const orphanedChapters = await db.chapter.findMany({
        where: {
            status: "TRANSLATING",
            updatedAt: { lt: threshold },
        },
        select: {
            id: true,
            workId: true,
            number: true,
            updatedAt: true,
        },
    });
    if (orphanedChapters.length === 0)
        return 0;
    // Group by workId to batch-check active jobs
    const workIds = [...new Set(orphanedChapters.map((ch) => ch.workId))];
    const activeJobs = await db.activeTranslationJob.findMany({
        where: {
            workId: { in: workIds },
            status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        select: { workId: true },
    });
    const worksWithActiveJobs = new Set(activeJobs.map((j) => j.workId));
    // Only recover chapters whose work has NO active job
    const chaptersToRecover = orphanedChapters.filter((ch) => !worksWithActiveJobs.has(ch.workId));
    if (chaptersToRecover.length === 0)
        return 0;
    const chapterIds = chaptersToRecover.map((ch) => ch.id);
    const result = await db.chapter.updateMany({
        where: { id: { in: chapterIds }, status: "TRANSLATING" },
        data: { status: "PENDING" },
    });
    log("Recovered orphaned TRANSLATING chapters", {
        total: result.count,
        chapters: chaptersToRecover.map((ch) => ({
            workId: ch.workId,
            number: ch.number,
        })),
    });
    return result.count;
}
/**
 * Update work status after a translation job ends.
 * Checks actual chapter states to determine correct work status.
 */
async function updateWorkStatusAfterJobEnd(db, workId, workTitle) {
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
            log("Work fully translated after stale job cleanup", { workId, workTitle });
        }
        else {
            // Revert to BIBLE_CONFIRMED so user can retry
            await db.work.updateMany({
                where: { id: workId, status: "TRANSLATING" },
                data: { status: "BIBLE_CONFIRMED" },
            });
        }
    }
    catch (error) {
        log("Failed to update work status after job end", {
            workId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
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
    const [activeTranslationJobs, activeBibleJobs, pendingChapters, translatingChapters, failedTranslationJobs, failedBibleJobs,] = await Promise.all([
        db.activeTranslationJob.count({
            where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
        }),
        db.bibleGenerationJob.count({
            where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
        }),
        db.chapter.count({
            where: { status: "PENDING" },
        }),
        db.chapter.count({
            where: { status: "TRANSLATING" },
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
        translatingChapters,
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