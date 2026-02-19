import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.activeTranslationJob.findMany({
    orderBy: { startedAt: 'desc' },
    take: 5,
    select: {
      jobId: true,
      workTitle: true,
      status: true,
      totalChapters: true,
      completedChapters: true,
      failedChapters: true,
      errorMessage: true,
      startedAt: true
    }
  });

  console.log('=== 최근 번역 작업 ===');
  for (const job of jobs) {
    console.log(`\n${job.jobId}`);
    console.log(`  상태: ${job.status}`);
    console.log(`  진행: ${job.completedChapters}/${job.totalChapters} (실패: ${job.failedChapters})`);
    if (job.errorMessage) console.log(`  에러: ${job.errorMessage}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
