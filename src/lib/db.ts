import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// 프로덕션에서도 글로벌 캐싱 적용 (서버리스 환경 최적화)
globalForPrisma.prisma = db;

// 트랜잭션 기본 타임아웃 설정 (30초)
const DEFAULT_TRANSACTION_TIMEOUT = 30000;

/**
 * 타임아웃이 늘어난 트랜잭션 래퍼
 * 기본 5초 → 30초
 */
export async function dbTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    timeout?: number;
    maxWait?: number;
  }
): Promise<T> {
  return db.$transaction(fn, {
    timeout: options?.timeout ?? DEFAULT_TRANSACTION_TIMEOUT,
    maxWait: options?.maxWait ?? 10000, // 트랜잭션 시작 대기 시간 10초
  });
}
