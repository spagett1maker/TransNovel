import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 1. 테스트 작업들 삭제
  const deleted = await prisma.activeTranslationJob.deleteMany({
    where: {
      jobId: { contains: '_test' }
    }
  });
  console.log(`삭제된 테스트 작업: ${deleted.count}개`);

  // 2. 테스트 작품/챕터 조회
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
    console.error('테스트할 챕터 없음');
    process.exit(1);
  }

  const chapter = work.chapters[0];
  console.log(`\n테스트 챕터: ${chapter.number}화 (${chapter.originalContent.length}자)`);

  // 3. 새 작업 생성 (translation-manager와 동일한 형식)
  const jobId = `trans_${Date.now()}_sqstest`;
  
  const job = await prisma.activeTranslationJob.create({
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

  console.log(`\n✓ 작업 생성: ${jobId}`);
  console.log(`\n작업이 생성되었습니다. SQS를 통해 Lambda 워커가 처리합니다.`);
  console.log(`작업 확인: node scripts/check-jobs.mjs`);

  await prisma.$disconnect();
}

main().catch(console.error);
