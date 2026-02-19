/**
 * AWS Secrets Manager helper for Lambda
 */
export interface DatabaseSecrets {
    DATABASE_URL: string;
    DIRECT_URL: string;
}
/**
 * Get secret from Secrets Manager with caching
 */
export declare function getSecrets<T>(secretArn: string): Promise<T>;
//# sourceMappingURL=secrets.d.ts.map