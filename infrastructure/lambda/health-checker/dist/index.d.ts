/**
 * TransNovel Health Checker Lambda
 *
 * Monitors job health and performs cleanup tasks:
 * - Check for stale jobs (running too long)
 * - Clean up completed/failed jobs older than retention period
 * - Process DLQ messages
 * - Generate health metrics
 */
import { ScheduledHandler, SQSHandler } from "aws-lambda";
/**
 * Scheduled health check handler (EventBridge)
 */
export declare const healthCheckHandler: ScheduledHandler;
/**
 * Cleanup handler (runs less frequently)
 */
export declare const cleanupHandler: ScheduledHandler;
/**
 * DLQ processor handler
 */
export declare const dlqHandler: SQSHandler;
export declare const handler: ScheduledHandler;
//# sourceMappingURL=index.d.ts.map