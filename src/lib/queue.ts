import { SQSClient, SendMessageCommand, SendMessageBatchCommand } from "@aws-sdk/client-sqs";

// ===========================================
// AWS SQS Queue Configuration
// ===========================================

const AWS_REGION = process.env.AWS_REGION || "ap-northeast-2";
const SQS_TRANSLATION_QUEUE_URL = process.env.SQS_TRANSLATION_QUEUE_URL;
const SQS_BIBLE_QUEUE_URL = process.env.SQS_BIBLE_QUEUE_URL;

// 조건부 로깅
const isDev = process.env.NODE_ENV === "development";
const log = (...args: unknown[]) => {
  if (isDev) console.log("[Queue]", ...args);
};
const logError = (...args: unknown[]) => {
  console.error("[Queue]", ...args);
};

// SQS 활성화 여부 확인
export function isQueueEnabled(): boolean {
  return !!SQS_TRANSLATION_QUEUE_URL;
}

// ===========================================
// AWS SQS 클라이언트
// ===========================================

let sqsClient: SQSClient | null = null;

function getSqsClient(): SQSClient {
  if (!sqsClient) {
    sqsClient = new SQSClient({ region: AWS_REGION });
    log("AWS SQS 클라이언트 초기화됨");
  }
  return sqsClient;
}

// ===========================================
// 번역 작업 큐잉
// ===========================================

export interface TranslationChapterPayload {
  jobId: string;
  workId: string;
  chapterId: string;
  chapterNumber: number;
  userId: string;
  userEmail?: string;
}

/**
 * 개별 챕터 번역 작업을 SQS에 추가
 */
export async function enqueueTranslationChapter(
  payload: TranslationChapterPayload,
  options?: { delay?: number; keyIndex?: number }
): Promise<string> {
  if (!SQS_TRANSLATION_QUEUE_URL) {
    throw new Error("SQS_TRANSLATION_QUEUE_URL이 설정되지 않았습니다.");
  }

  const client = getSqsClient();

  // SQS 메시지에 keyIndex 추가 (API 키 로테이션용)
  const sqsPayload = {
    ...payload,
    keyIndex: options?.keyIndex ?? payload.chapterNumber,
  };

  log("챕터 번역 SQS 큐잉", {
    jobId: payload.jobId,
    chapterNumber: payload.chapterNumber,
    keyIndex: sqsPayload.keyIndex,
    delay: options?.delay,
  });

  const command = new SendMessageCommand({
    QueueUrl: SQS_TRANSLATION_QUEUE_URL,
    MessageBody: JSON.stringify(sqsPayload),
    DelaySeconds: options?.delay ? Math.min(Math.floor(options.delay), 900) : 0,
    MessageAttributes: {
      JobId: {
        DataType: "String",
        StringValue: payload.jobId,
      },
      ChapterNumber: {
        DataType: "Number",
        StringValue: payload.chapterNumber.toString(),
      },
    },
  });

  const response = await client.send(command);
  const messageId = response.MessageId || `sqs-${Date.now()}`;

  log("챕터 번역 SQS 큐잉 완료", {
    messageId,
    chapterNumber: payload.chapterNumber,
  });

  return messageId;
}

/**
 * 여러 챕터를 일괄 큐잉 (SendMessageBatch로 효율적 전송 + 부분 실패 검사)
 */
export async function enqueueBatchTranslation(
  jobId: string,
  workId: string,
  chapters: Array<{ id: string; number: number }>,
  userId: string,
  userEmail?: string
): Promise<void> {
  if (!SQS_TRANSLATION_QUEUE_URL) {
    throw new Error("SQS_TRANSLATION_QUEUE_URL이 설정되지 않았습니다.");
  }

  log("배치 번역 큐잉 시작", {
    jobId,
    workId,
    chaptersCount: chapters.length,
  });

  const client = getSqsClient();
  const apiKeyCount = parseInt(process.env.GEMINI_API_KEY_COUNT || "5", 10);

  // SendMessageBatch는 최대 10개/호출
  for (let i = 0; i < chapters.length; i += 10) {
    const batchEnd = Math.min(i + 10, chapters.length);
    const entries = [];

    for (let j = i; j < batchEnd; j++) {
      const chapter = chapters[j];
      const payload: TranslationChapterPayload = {
        jobId,
        workId,
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        userId,
        userEmail,
      };

      entries.push({
        Id: `ch-${chapter.number}`,
        MessageBody: JSON.stringify({ ...payload, keyIndex: j % apiKeyCount }),
        MessageAttributes: {
          JobId: {
            DataType: "String" as const,
            StringValue: jobId,
          },
          ChapterNumber: {
            DataType: "Number" as const,
            StringValue: chapter.number.toString(),
          },
        },
      });
    }

    const response = await client.send(new SendMessageBatchCommand({
      QueueUrl: SQS_TRANSLATION_QUEUE_URL,
      Entries: entries,
    }));

    if (response.Failed && response.Failed.length > 0) {
      const failedIds = response.Failed.map(f => f.Id).join(", ");
      throw new Error(`SQS 메시지 전송 부분 실패: ${failedIds}`);
    }
  }

  log("배치 번역 큐잉 완료", {
    jobId,
    totalMessages: chapters.length,
  });
}

// ===========================================
// 설정집 생성 작업 큐잉
// ===========================================

export interface BibleBatchPayload {
  jobId: string;
  workId: string;
  batchIndex: number;
  userId: string;
  userEmail?: string;
}

/**
 * 설정집 배치 분석 작업을 SQS에 추가
 */
export async function enqueueBibleBatch(
  payload: BibleBatchPayload,
  options?: { delay?: number }
): Promise<string> {
  if (!SQS_BIBLE_QUEUE_URL) {
    throw new Error("SQS_BIBLE_QUEUE_URL이 설정되지 않았습니다.");
  }

  const client = getSqsClient();

  log("설정집 배치 SQS 큐잉", {
    jobId: payload.jobId,
    batchIndex: payload.batchIndex,
    delay: options?.delay,
  });

  const command = new SendMessageCommand({
    QueueUrl: SQS_BIBLE_QUEUE_URL,
    MessageBody: JSON.stringify(payload),
    DelaySeconds: options?.delay ? Math.min(Math.floor(options.delay), 900) : 0,
    MessageAttributes: {
      JobId: {
        DataType: "String",
        StringValue: payload.jobId,
      },
      BatchIndex: {
        DataType: "Number",
        StringValue: payload.batchIndex.toString(),
      },
    },
  });

  const response = await client.send(command);
  const messageId = response.MessageId || `sqs-bible-${Date.now()}`;

  log("설정집 배치 SQS 큐잉 완료", {
    messageId,
    batchIndex: payload.batchIndex,
  });

  return messageId;
}

/**
 * 모든 설정집 배치를 한 번에 SQS에 fan-out 큐잉
 * 각 Lambda가 독립적으로 1배치를 처리하고 원자적으로 진행 추적
 */
export async function startBibleGeneration(
  jobId: string,
  workId: string,
  userId: string,
  userEmail?: string,
  totalBatches: number = 1
): Promise<void> {
  if (!SQS_BIBLE_QUEUE_URL) {
    throw new Error("SQS_BIBLE_QUEUE_URL이 설정되지 않았습니다.");
  }

  const client = getSqsClient();

  log("설정집 전체 배치 fan-out 큐잉 시작", { jobId, totalBatches });

  // SendMessageBatch는 최대 10개/호출
  for (let i = 0; i < totalBatches; i += 10) {
    const batchEnd = Math.min(i + 10, totalBatches);
    const entries = [];

    for (let j = i; j < batchEnd; j++) {
      const payload: BibleBatchPayload = {
        jobId,
        workId,
        batchIndex: j,
        userId,
        userEmail,
      };

      entries.push({
        Id: `batch-${j}`,
        MessageBody: JSON.stringify({ ...payload, keyIndex: j }),
        MessageAttributes: {
          JobId: {
            DataType: "String",
            StringValue: jobId,
          },
          BatchIndex: {
            DataType: "Number",
            StringValue: j.toString(),
          },
        },
      });
    }

    const response = await client.send(new SendMessageBatchCommand({
      QueueUrl: SQS_BIBLE_QUEUE_URL,
      Entries: entries,
    }));

    if (response.Failed && response.Failed.length > 0) {
      const failedIds = response.Failed.map(f => f.Id).join(", ");
      throw new Error(`SQS 메시지 전송 부분 실패: ${failedIds}`);
    }
  }

  log("설정집 전체 배치 fan-out 큐잉 완료", { jobId, totalBatches });
}

// ===========================================
// 전역 작업 제한
// ===========================================

// 최대 동시 활성 작업 수
const MAX_CONCURRENT_JOBS = 50;

/**
 * 활성 작업 수 확인 (큐잉 전 호출)
 * DB에서 직접 확인해야 하므로 호출자가 db를 전달
 */
export interface QueuePositionResult {
  canStart: boolean;
  position?: number;
  activeJobs?: number;
}

export function getMaxConcurrentJobs(): number {
  return MAX_CONCURRENT_JOBS;
}

log("Queue 모듈 로드됨", {
  sqsEnabled: isQueueEnabled(),
  hasSqsTranslationQueue: !!SQS_TRANSLATION_QUEUE_URL,
  hasSqsBibleQueue: !!SQS_BIBLE_QUEUE_URL,
});
