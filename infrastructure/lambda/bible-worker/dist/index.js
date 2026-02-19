"use strict";
/**
 * TransNovel Bible Worker Lambda
 *
 * Processes setting bible generation jobs from SQS queue.
 * Each Lambda instance processes up to 5 batches in parallel (fan-out + batch).
 * Connects to DB via RDS Proxy for connection pooling at scale.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_1 = require("@prisma/client");
const secrets_1 = require("./secrets");
const gemini_1 = require("./gemini");
// Map AI-generated category values to Prisma TermCategory enum
const TERM_CATEGORY_MAP = {
    CHARACTER: "CHARACTER", PLACE: "PLACE", ORGANIZATION: "ORGANIZATION",
    RANK_TITLE: "RANK_TITLE", SKILL_TECHNIQUE: "SKILL_TECHNIQUE", ITEM: "ITEM", OTHER: "OTHER",
    // Legacy/AI fallback mappings
    NAME: "CHARACTER", SKILL: "SKILL_TECHNIQUE", TITLE: "RANK_TITLE", EVENT: "OTHER",
};
// Map AI-generated eventType values to Prisma EventType enum
const EVENT_TYPE_MAP = {
    PLOT: "PLOT", CHARACTER_DEV: "CHARACTER_DEV", FORESHADOWING: "FORESHADOWING",
    REVEAL: "REVEAL", WORLD_BUILDING: "WORLD_BUILDING",
    // Legacy/AI fallback mappings
    FORESHADOW: "FORESHADOWING", WORLDBUILDING: "WORLD_BUILDING", CHARACTER: "CHARACTER_DEV",
};
function mapTermCategory(category) {
    return TERM_CATEGORY_MAP[category] || "OTHER";
}
function mapEventType(eventType) {
    // Handle pipe-separated values like "PLOT|CHARACTER_DEV" — take first
    const primary = eventType.includes("|") ? eventType.split("|")[0].trim() : eventType;
    return EVENT_TYPE_MAP[primary] || "PLOT";
}
// Map AI importance strings to Int (Prisma schema: importance Int)
const IMPORTANCE_MAP = {
    CRITICAL: 3, MAJOR: 2, MINOR: 1,
};
function mapImportance(importance) {
    if (typeof importance === "number")
        return importance;
    if (typeof importance === "string")
        return IMPORTANCE_MAP[importance] || 1;
    return 1;
}
// Map AI role strings to Prisma CharacterRole enum
const CHARACTER_ROLE_MAP = {
    PROTAGONIST: "PROTAGONIST", ANTAGONIST: "ANTAGONIST",
    SUPPORTING: "SUPPORTING", MINOR: "MINOR",
    MAIN: "PROTAGONIST", HERO: "PROTAGONIST", VILLAIN: "ANTAGONIST",
};
function mapCharacterRole(role) {
    return CHARACTER_ROLE_MAP[role] || "SUPPORTING";
}
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
const UPDATE_BATCH_SIZE = 20;
// Logging helper
function log(message, data) {
    const timestamp = new Date().toISOString();
    if (data) {
        console.log(`[${timestamp}] [Bible Worker] ${message}`, JSON.stringify(data));
    }
    else {
        console.log(`[${timestamp}] [Bible Worker] ${message}`);
    }
}
/**
 * Main Lambda handler
 * Processes up to 5 SQS messages in parallel (batch_size=5).
 * Returns SQSBatchResponse for partial failure reporting.
 */
const handler = async (event) => {
    log("Received SQS event", { recordCount: event.Records.length });
    const results = await Promise.allSettled(event.Records.map(record => processMessage(record)));
    const batchItemFailures = [];
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
exports.handler = handler;
/**
 * Process a single SQS message (1 batch)
 */
async function processMessage(record) {
    const startTime = Date.now();
    let message;
    try {
        message = JSON.parse(record.body);
    }
    catch {
        log("Failed to parse message body", { body: record.body });
        return;
    }
    const { jobId, workId, batchIndex, keyIndex = 0 } = message;
    log("Processing bible batch", { jobId, batchIndex, keyIndex });
    const db = await getPrismaClient();
    try {
        // 1. Check job status
        const job = await db.bibleGenerationJob.findUnique({
            where: { id: jobId },
            select: {
                id: true,
                workId: true,
                status: true,
                batchPlan: true,
                totalBatches: true,
                analyzedChapters: true,
                maxRetries: true,
            },
        });
        if (!job) {
            log("Job not found, skipping", { jobId });
            return;
        }
        // Skip if job is terminated
        if (job.status === "CANCELLED" || job.status === "FAILED" || job.status === "COMPLETED") {
            log("Job already terminated, skipping", { status: job.status });
            return;
        }
        // 2. Transition PENDING → IN_PROGRESS (idempotent with updateMany + where)
        if (job.status === "PENDING") {
            await db.bibleGenerationJob.updateMany({
                where: { id: jobId, status: "PENDING" },
                data: { status: "IN_PROGRESS", startedAt: new Date() },
            });
            await db.work.updateMany({
                where: { id: workId, status: { not: "BIBLE_GENERATING" } },
                data: { status: "BIBLE_GENERATING" },
            });
        }
        // 3. Load work metadata
        const work = await db.work.findUnique({
            where: { id: workId },
            select: {
                titleKo: true,
                genres: true,
                synopsis: true,
                sourceLanguage: true,
                settingBible: { select: { id: true } },
            },
        });
        if (!work || !work.settingBible) {
            log("Work or bible not found", { workId });
            // Don't fail the entire job from one batch - just throw for SQS retry
            throw new Error("작품 또는 설정집을 찾을 수 없습니다.");
        }
        const bibleId = work.settingBible.id;
        const fullBatchPlan = job.batchPlan;
        if (!Array.isArray(fullBatchPlan) || batchIndex >= fullBatchPlan.length) {
            log("Invalid batch index", { batchIndex, planLength: fullBatchPlan?.length });
            return; // Invalid message, let it be deleted
        }
        // 4. Get chapter numbers for this batch
        const chapterNumbers = fullBatchPlan[batchIndex];
        if (!chapterNumbers || chapterNumbers.length === 0) {
            log("Empty batch, skipping", { batchIndex });
            // Still count as completed
            await incrementAndCheckCompletion(db, jobId, fullBatchPlan);
            return;
        }
        const workInfo = {
            title: work.titleKo,
            genres: work.genres,
            synopsis: work.synopsis,
            sourceLanguage: work.sourceLanguage,
        };
        // 5. Get Gemini API key (rotate across keys)
        const geminiSecrets = await (0, secrets_1.getSecrets)(process.env.GEMINI_SECRET_ARN);
        const keyCount = parseInt(geminiSecrets.KEY_COUNT || "1", 10);
        const keyName = `GEMINI_API_KEY_${(keyIndex % keyCount) + 1}`;
        const apiKey = geminiSecrets[keyName] || geminiSecrets.GEMINI_API_KEY_1;
        log("Using Gemini API key", { keyName, keyIndex: keyIndex % keyCount });
        // 6. Process this single batch
        log("Processing batch", { batchIndex, chapterNumbers });
        const result = await processSingleBatch(db, workId, bibleId, chapterNumbers, workInfo, apiKey, job.analyzedChapters);
        const duration = Date.now() - startTime;
        log("Batch completed", {
            batchIndex,
            analyzedChapters: result.analyzedChapters,
            durationMs: duration,
        });
        // 7. Atomic increment + completion check
        await incrementAndCheckCompletion(db, jobId, fullBatchPlan);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log(`Batch ${batchIndex} failed`, { error: errorMessage });
        // Re-throw for SQS retry (maxReceiveCount=5, then DLQ)
        throw error;
    }
}
/**
 * Atomically increment completed batch count and check if job is done
 */
async function incrementAndCheckCompletion(db, jobId, fullBatchPlan) {
    // Prisma atomic increment → PostgreSQL row-level lock ensures correctness
    const updatedJob = await db.bibleGenerationJob.update({
        where: { id: jobId },
        data: { currentBatchIndex: { increment: 1 } },
        select: { currentBatchIndex: true, totalBatches: true, status: true },
    });
    log("Progress updated", {
        jobId,
        completedBatches: updatedJob.currentBatchIndex,
        totalBatches: updatedJob.totalBatches,
    });
    // Only the last Lambda to finish will see this condition
    if (updatedJob.currentBatchIndex >= updatedJob.totalBatches && updatedJob.status !== "COMPLETED") {
        const maxChapter = Math.max(...fullBatchPlan.flat());
        await db.bibleGenerationJob.update({
            where: { id: jobId },
            data: {
                status: "COMPLETED",
                completedAt: new Date(),
                analyzedChapters: maxChapter,
            },
        });
        // Update bible analyzedChapters
        const job = await db.bibleGenerationJob.findUnique({
            where: { id: jobId },
            select: { workId: true },
        });
        if (job) {
            await db.settingBible.updateMany({
                where: { workId: job.workId },
                data: { analyzedChapters: maxChapter },
            });
        }
        log("Job completed", { jobId, totalBatches: updatedJob.totalBatches, maxChapter });
    }
}
/**
 * Process a single batch of chapters
 */
async function processSingleBatch(db, workId, bibleId, chapterNumbers, workInfo, apiKey, currentAnalyzedChapters) {
    // Load chapters
    const chapters = await db.chapter.findMany({
        where: {
            workId,
            number: { in: chapterNumbers },
        },
        select: {
            number: true,
            originalContent: true,
        },
        orderBy: { number: "asc" },
    });
    if (chapters.length === 0) {
        throw new Error("분석할 회차가 없습니다.");
    }
    const chapterRange = {
        start: Math.min(...chapters.map((c) => c.number)),
        end: Math.max(...chapters.map((c) => c.number)),
    };
    const chapterContents = chapters.map((ch) => ({
        number: ch.number,
        originalContent: ch.originalContent,
    }));
    // Run AI analysis
    const analysisResult = await (0, gemini_1.analyzeBatch)(workInfo, chapterContents, chapterRange, apiKey);
    // Save results to database
    await saveAnalysisResult(db, bibleId, workId, analysisResult, chapterRange, currentAnalyzedChapters);
    return { analyzedChapters: chapterRange.end };
}
/**
 * Save analysis result to database
 */
async function saveAnalysisResult(db, bibleId, workId, result, chapterRange, currentAnalyzedChapters) {
    // 1. Characters
    const charNamesToCheck = result.characters.map((c) => c.nameOriginal).filter(Boolean);
    const existingChars = charNamesToCheck.length > 0
        ? await db.character.findMany({
            where: { bibleId, nameOriginal: { in: charNamesToCheck } },
            select: { id: true, nameOriginal: true, titles: true, aliases: true, firstAppearance: true },
        })
        : [];
    const charMap = new Map(existingChars.map((c) => [c.nameOriginal, c]));
    const maxSortOrderResult = await db.character.aggregate({
        where: { bibleId },
        _max: { sortOrder: true },
    });
    let maxSortOrder = maxSortOrderResult._max.sortOrder ?? -1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const charsToCreate = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const charsToUpdate = [];
    for (const c of result.characters) {
        if (!c.nameOriginal)
            continue;
        const existing = charMap.get(c.nameOriginal);
        if (existing) {
            charsToUpdate.push({
                id: existing.id,
                data: {
                    nameKorean: c.nameKorean,
                    nameHanja: c.nameHanja,
                    titles: [...new Set([...existing.titles, ...c.titles])],
                    aliases: [...new Set([...existing.aliases, ...c.aliases])],
                    personality: c.personality,
                    speechStyle: c.speechStyle,
                    role: mapCharacterRole(c.role),
                    description: c.description,
                    relationships: c.relationships,
                    firstAppearance: existing.firstAppearance ?? c.firstAppearance,
                },
            });
        }
        else {
            maxSortOrder++;
            charsToCreate.push({
                bibleId,
                nameOriginal: c.nameOriginal,
                nameKorean: c.nameKorean,
                nameHanja: c.nameHanja,
                titles: c.titles,
                aliases: c.aliases,
                personality: c.personality,
                speechStyle: c.speechStyle,
                role: c.role,
                description: c.description,
                relationships: c.relationships,
                firstAppearance: c.firstAppearance,
                sortOrder: maxSortOrder,
            });
        }
    }
    if (charsToCreate.length > 0) {
        await db.character.createMany({ data: charsToCreate, skipDuplicates: true });
    }
    for (let i = 0; i < charsToUpdate.length; i += UPDATE_BATCH_SIZE) {
        await Promise.all(charsToUpdate.slice(i, i + UPDATE_BATCH_SIZE).map(({ id, data }) => db.character.update({ where: { id }, data })));
    }
    // 2. Terms
    const termOriginalsToCheck = result.terms.map((t) => t.original).filter(Boolean);
    const existingTerms = termOriginalsToCheck.length > 0
        ? await db.settingTerm.findMany({
            where: { bibleId, original: { in: termOriginalsToCheck } },
            select: { id: true, original: true, firstAppearance: true },
        })
        : [];
    const termMap = new Map(existingTerms.map((t) => [t.original, t]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const termsToCreate = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const termsToUpdate = [];
    for (const t of result.terms) {
        if (!t.original)
            continue;
        const existing = termMap.get(t.original);
        if (existing) {
            termsToUpdate.push({
                id: existing.id,
                data: {
                    translated: t.translated,
                    category: mapTermCategory(t.category),
                    note: t.note,
                    context: t.context,
                    firstAppearance: existing.firstAppearance ?? t.firstAppearance,
                },
            });
        }
        else {
            termsToCreate.push({
                bibleId,
                original: t.original,
                translated: t.translated,
                category: mapTermCategory(t.category),
                note: t.note,
                context: t.context,
                firstAppearance: t.firstAppearance,
            });
        }
    }
    if (termsToCreate.length > 0) {
        await db.settingTerm.createMany({ data: termsToCreate, skipDuplicates: true });
    }
    for (let i = 0; i < termsToUpdate.length; i += UPDATE_BATCH_SIZE) {
        await Promise.all(termsToUpdate.slice(i, i + UPDATE_BATCH_SIZE).map(({ id, data }) => db.settingTerm.update({ where: { id }, data })));
    }
    // 3. Events
    const eventKeysToCheck = result.events
        .filter((e) => e.title && e.chapterStart)
        .map((e) => ({ title: e.title, chapterStart: e.chapterStart }));
    const existingEvents = eventKeysToCheck.length > 0
        ? await db.timelineEvent.findMany({
            where: {
                bibleId,
                OR: eventKeysToCheck.map((k) => ({
                    title: k.title,
                    chapterStart: k.chapterStart,
                })),
            },
            select: { id: true, title: true, chapterStart: true, involvedCharacterIds: true },
        })
        : [];
    const eventMap = new Map(existingEvents.map((e) => [`${e.title}_${e.chapterStart}`, e]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventsToCreate = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventsToUpdate = [];
    for (const e of result.events) {
        if (!e.title || !e.description)
            continue;
        const key = `${e.title}_${e.chapterStart}`;
        const existing = eventMap.get(key);
        if (existing) {
            eventsToUpdate.push({
                id: existing.id,
                data: {
                    description: e.description,
                    chapterEnd: e.chapterEnd,
                    eventType: mapEventType(e.eventType),
                    importance: mapImportance(e.importance),
                    isForeshadowing: e.isForeshadowing,
                    foreshadowNote: e.foreshadowNote,
                    involvedCharacterIds: [...new Set([
                            ...existing.involvedCharacterIds,
                            ...e.involvedCharacters,
                        ])],
                },
            });
        }
        else {
            eventsToCreate.push({
                bibleId,
                title: e.title,
                description: e.description,
                chapterStart: e.chapterStart,
                chapterEnd: e.chapterEnd,
                eventType: mapEventType(e.eventType),
                importance: mapImportance(e.importance),
                isForeshadowing: e.isForeshadowing,
                foreshadowNote: e.foreshadowNote,
                involvedCharacterIds: e.involvedCharacters,
            });
        }
    }
    if (eventsToCreate.length > 0) {
        await db.timelineEvent.createMany({ data: eventsToCreate, skipDuplicates: true });
    }
    for (let i = 0; i < eventsToUpdate.length; i += UPDATE_BATCH_SIZE) {
        await Promise.all(eventsToUpdate.slice(i, i + UPDATE_BATCH_SIZE).map(({ id, data }) => db.timelineEvent.update({ where: { id }, data })));
    }
    // 4. Update bible metadata
    const newAnalyzedChapters = Math.max(currentAnalyzedChapters, chapterRange.end);
    await db.settingBible.update({
        where: { id: bibleId },
        data: {
            status: "DRAFT",
            analyzedChapters: newAnalyzedChapters,
            ...(result.translationNotes ? { translationGuide: result.translationNotes } : {}),
            generatedAt: new Date(),
        },
    });
    await db.work.update({
        where: { id: workId },
        data: { status: "BIBLE_DRAFT" },
    });
}
//# sourceMappingURL=index.js.map