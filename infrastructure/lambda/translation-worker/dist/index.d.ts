/**
 * TransNovel Translation Worker Lambda
 *
 * Processes translation jobs from SQS queue.
 * Connects to DB via RDS Proxy for connection pooling at scale.
 */
import { SQSEvent, SQSBatchResponse } from "aws-lambda";
/**
 * Main Lambda handler
 * Returns SQSBatchResponse for partial failure reporting.
 * Each message is processed independently - one failure won't block others.
 */
export declare const handler: (event: SQSEvent) => Promise<SQSBatchResponse>;
//# sourceMappingURL=index.d.ts.map