import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 작업 상태 확인
  const job = await prisma.activeTranslationJob.findFirst({
    where: { jobId: 'trans_1770183828488_sqstest' }
  });

  console.log('=== 작업 상태 ===');
  console.log(`상태: ${job?.status}`);
  console.log(`완료/전체: ${job?.completedChapters}/${job?.totalChapters}`);

  // 챕터 상태 확인
  const chapter = await prisma.chapter.findUnique({
    where: { id: 'cml52ksma004ziinkiui7ind5' },
    select: { 
      number: true, 
      status: true, 
      originalContent: true,
      translatedContent: true 
    }
  });

  console.log('\n=== 챕터 상태 ===');
  console.log(`번호: ${chapter?.number}화`);
  console.log(`상태: ${chapter?.status}`);
  console.log(`원문 길이: ${chapter?.originalContent?.length}자`);
  console.log(`번역 길이: ${chapter?.translatedContent?.length}자`);

  if (chapter?.translatedContent) {
    console.log('\n=== 번역 결과 (처음 500자) ===');
    console.log(chapter.translatedContent.substring(0, 500));
    console.log('\n...(생략)...');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
