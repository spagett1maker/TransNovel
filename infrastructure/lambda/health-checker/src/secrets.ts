/**
 * AWS Secrets Manager helper for Lambda
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({
  region: process.env.AWS_REGION_CUSTOM || process.env.AWS_REGION || "ap-northeast-2",
});

// Cache for secrets (Lambda warm start optimization)
const secretsCache = new Map<string, { value: unknown; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface DatabaseSecrets {
  DATABASE_URL: string;
  DIRECT_URL: string;
}

/**
 * Get secret from Secrets Manager with caching
 */
export async function getSecrets<T>(secretArn: string): Promise<T> {
  // Check cache
  const cached = secretsCache.get(secretArn);
  if (cached && cached.expiry > Date.now()) {
    return cached.value as T;
  }

  // Fetch from Secrets Manager
  const command = new GetSecretValueCommand({
    SecretId: secretArn,
  });

  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error(`Secret ${secretArn} has no value`);
  }

  const secrets = JSON.parse(response.SecretString) as T;

  // Cache the result
  secretsCache.set(secretArn, {
    value: secrets,
    expiry: Date.now() + CACHE_TTL_MS,
  });

  return secrets;
}
