/**
 * TransNovel Bible Worker Lambda
 *
 * Processes setting bible generation jobs from SQS queue.
 * Each Lambda instance processes up to 5 batches in parallel (fan-out + batch).
 * Connects to DB via RDS Proxy for connection pooling at scale.
 */
import { SQSEvent, SQSBatchResponse } from "aws-lambda";
/**
 * Main Lambda handler
 * Processes up to 5 SQS messages in parallel (batch_size=5).
 * Returns SQSBatchResponse for partial failure reporting.
 */
export declare const handler: (event: SQSEvent) => Promise<SQSBatchResponse>;
//# sourceMappingURL=index.d.ts.map