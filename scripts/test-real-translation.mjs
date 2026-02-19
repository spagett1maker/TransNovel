import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== 실제 번역 테스트 ===\n');

  // 1. 테스트 작품 조회
  const work = await prisma.work.findFirst({
    where: {
      id: 'cml52khku0001iink858pewpo',
      settingBible: { status: 'CONFIRMED' }
    },
    include: {
      chapters: {
        where: { status: 'PENDING' },
        select: { id: true, number: true, originalContent: true },
        orderBy: { number: 'asc' },
        take: 1
      },
      author: { select: { id: true, email: true } }
    }
  });

  if (!work || work.chapters.length === 0) {
    console.error('테스트할 작품/챕터가 없습니다.');
    process.exit(1);
  }

  const chapter = work.chapters[0];
  console.log(`작품: ${work.titleKo}`);
  console.log(`챕터: ${chapter.number}화`);
  console.log(`원문 길이: ${chapter.originalContent.length}자`);

  // 2. 새 번역 작업 생성
  const jobId = `job_${Date.now()}_realtest`;
  
  await prisma.activeTranslationJob.create({
    data: {
      jobId,
      workId: work.id,
      workTitle: work.titleKo,
      userId: work.author.id,
      userEmail: work.author.email,
      status: 'IN_PROGRESS',
      totalChapters: 1,
      completedChapters: 0,
      failedChapters: 0,
      chaptersProgress: [{
        number: chapter.number,
        chapterId: chapter.id,
        status: 'PENDING',
        currentChunk: 0,
        totalChunks: 0
      }]
    }
  });

  console.log(`\n✓ 작업 생성됨: ${jobId}`);
  console.log(`\n작업이 생성되었습니다. SQS를 통해 Lambda 워커가 처리합니다.`);
  console.log(`작업 확인: node scripts/check-jobs.mjs`);

  await prisma.$disconnect();
}

main().catch(console.error);
