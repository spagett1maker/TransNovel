/**
 * AWS Secrets Manager helper for Lambda
 */
export interface DatabaseSecrets {
    DATABASE_URL: string;
    DIRECT_URL: string;
    DB_HOST: string;
    DB_PORT: string;
    DB_NAME: string;
    DB_USER: string;
    DB_PASSWORD: string;
}
export interface GeminiSecrets {
    GEMINI_API_KEY_1: string;
    GEMINI_API_KEY_2?: string;
    GEMINI_API_KEY_3?: string;
    GEMINI_API_KEY_4?: string;
    GEMINI_API_KEY_5?: string;
    KEY_COUNT: string;
}
export interface AuthSecrets {
    NEXTAUTH_SECRET: string;
}
/**
 * Get secret from Secrets Manager with caching
 */
export declare function getSecrets<T>(secretArn: string): Promise<T>;
/**
 * Clear secrets cache (for testing or rotation)
 */
export declare function clearSecretsCache(): void;
//# sourceMappingURL=secrets.d.ts.map