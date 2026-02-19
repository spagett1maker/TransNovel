"use strict";
/**
 * AWS Secrets Manager helper for Lambda
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSecrets = getSecrets;
exports.clearSecretsCache = clearSecretsCache;
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const client = new client_secrets_manager_1.SecretsManagerClient({
    region: process.env.AWS_REGION_CUSTOM || process.env.AWS_REGION || "ap-northeast-2",
});
// Cache for secrets (Lambda warm start optimization)
const secretsCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
/**
 * Get secret from Secrets Manager with caching
 */
async function getSecrets(secretArn) {
    // Check cache
    const cached = secretsCache.get(secretArn);
    if (cached && cached.expiry > Date.now()) {
        return cached.value;
    }
    // Fetch from Secrets Manager
    const command = new client_secrets_manager_1.GetSecretValueCommand({
        SecretId: secretArn,
    });
    const response = await client.send(command);
    if (!response.SecretString) {
        throw new Error(`Secret ${secretArn} has no value`);
    }
    const secrets = JSON.parse(response.SecretString);
    // Cache the result
    secretsCache.set(secretArn, {
        value: secrets,
        expiry: Date.now() + CACHE_TTL_MS,
    });
    return secrets;
}
/**
 * Clear secrets cache (for testing or rotation)
 */
function clearSecretsCache() {
    secretsCache.clear();
}
//# sourceMappingURL=secrets.js.map