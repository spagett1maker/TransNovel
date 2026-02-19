/**
 * TransNovel Translation Worker Lambda
 *
 * Processes translation jobs from SQS queue.
 * Connects to DB via RDS Proxy for connection pooling at scale.
 */
import { SQSHandler } from "aws-lambda";
/**
 * Main Lambda handler
 */
export declare const handler: SQSHandler;
//# sourceMappingURL=index.d.ts.map