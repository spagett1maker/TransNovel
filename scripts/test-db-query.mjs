import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 번역 가능한 작품 조회
  const works = await prisma.work.findMany({
    where: {
      settingBible: {
        status: 'CONFIRMED'
      },
      chapters: {
        some: {
          status: 'PENDING'
        }
      }
    },
    include: {
      settingBible: {
        select: { id: true, status: true }
      },
      chapters: {
        where: { status: 'PENDING' },
        select: { id: true, number: true },
        orderBy: { number: 'asc' },
        take: 3
      },
      author: {
        select: { id: true, email: true }
      }
    },
    take: 3
  });

  console.log('=== 번역 가능한 작품 ===');
  for (const work of works) {
    console.log(JSON.stringify({
      id: work.id,
      title: work.titleKo,
      status: work.status,
      bibleStatus: work.settingBible?.status,
      authorId: work.author.id,
      authorEmail: work.author.email,
      pendingChapters: work.chapters.map(c => ({ id: c.id, number: c.number }))
    }, null, 2));
  }

  if (works.length === 0) {
    console.log('번역 가능한 작품이 없습니다.');
    
    const anyWork = await prisma.work.findFirst({
      include: {
        settingBible: true,
        chapters: {
          select: { id: true, number: true, status: true },
          orderBy: { number: 'asc' },
          take: 5
        },
        author: {
          select: { id: true, email: true }
        }
      }
    });
    
    if (anyWork) {
      console.log('\n=== 대안 작품 ===');
      console.log(JSON.stringify({
        id: anyWork.id,
        title: anyWork.titleKo,
        status: anyWork.status,
        bibleStatus: anyWork.settingBible?.status || '없음',
        authorId: anyWork.author.id,
        chapters: anyWork.chapters.map(c => ({ number: c.number, status: c.status }))
      }, null, 2));
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
