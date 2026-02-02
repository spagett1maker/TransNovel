import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

/**
 * 에디터 프로필 (대시보드 헤더용)
 * 60초 캐싱 — 프로필 수정 시 revalidateTag('editor-profile-{userId}')로 즉시 무효화
 */
export function getCachedEditorProfile(userId: string) {
  return unstable_cache(
    async () => {
      return db.editorProfile.findUnique({
        where: { userId },
        select: {
          id: true,
          displayName: true,
          bio: true,
          availability: true,
          averageRating: true,
          totalReviews: true,
        },
      });
    },
    [`editor-profile-${userId}`],
    {
      revalidate: 60,
      tags: [`editor-profile-${userId}`],
    }
  )();
}

/**
 * 대시보드 통계 (작품 수, 챕터 수, 번역 완료 수, 검토 대기 수)
 * 30초 캐싱 — 뮤테이션 시 revalidateTag('user-{userId}-stats')로 즉시 무효화
 */
export function getCachedDashboardStats(userId: string, isEditor: boolean) {
  return unstable_cache(
    async () => {
      const whereClause = isEditor
        ? { editorId: userId }
        : { authorId: userId };

      const [worksCount, chaptersCount, translatedCount, reviewPendingCount] =
        await Promise.all([
          db.work.count({ where: whereClause }),
          db.chapter.count({ where: { work: whereClause } }),
          db.chapter.count({
            where: {
              work: whereClause,
              status: { in: ["TRANSLATED", "EDITED", "APPROVED"] },
            },
          }),
          isEditor
            ? db.chapter.count({
                where: { work: { editorId: userId }, status: "TRANSLATED" },
              })
            : Promise.resolve(0),
        ]);

      return { worksCount, chaptersCount, translatedCount, reviewPendingCount };
    },
    [`dashboard-stats-${userId}-${isEditor}`],
    {
      revalidate: 30,
      tags: [`user-${userId}-stats`],
    }
  )();
}
