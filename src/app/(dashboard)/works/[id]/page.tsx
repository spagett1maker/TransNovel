import { UserRole } from "@prisma/client";
import { CheckCircle } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BulkUploadDialog } from "@/components/chapters/bulk-upload-dialog";
import { ChapterList } from "@/components/chapters/chapter-list";
import { DownloadDialog } from "@/components/download/download-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuickActions } from "@/components/works/quick-actions";
import { TranslationActionButton } from "@/components/works/translation-action-button";
import { WorkPageRefresher } from "@/components/works/work-page-refresher";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessWork } from "@/lib/permissions";
import { AGE_RATINGS, ORIGINAL_STATUS, SOURCE_LANGUAGES } from "@/lib/validations/work";
import { getWorkStatusConfig } from "@/lib/work-status";
import { EditorAssignment } from "./editor-assignment";

export default async function WorkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  const { id } = await params;

  if (!session) {
    redirect("/login");
  }

  const work = await db.work.findUnique({
    where: { id },
    include: {
      creators: true,
      chapters: {
        orderBy: { number: "asc" },
        // 챕터 목록에서는 메타데이터만 필요 (콘텐츠 제외로 메모리/대역폭 절약)
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          wordCount: true,
        },
      },
      glossary: {
        take: 10,
      },
      editor: {
        select: { id: true, name: true },
      },
      settingBible: {
        select: {
          id: true,
          status: true,
          analyzedChapters: true,
          _count: {
            select: {
              characters: true,
              terms: true,
              events: true,
            },
          },
        },
      },
      listings: {
        select: {
          id: true,
          status: true,
          _count: {
            select: { applications: true },
          },
          applications: {
            where: { status: "PENDING" },
            select: { id: true },
          },
        },
      },
      contracts: {
        where: { isActive: true },
        select: { id: true, chapterStart: true, chapterEnd: true },
        take: 1,
      },
      _count: {
        select: { chapters: true, glossary: true },
      },
    },
  });

  if (!work) {
    notFound();
  }

  const userRole = session.user.role as UserRole;

  if (!canAccessWork(session.user.id, userRole, work)) {
    redirect("/works");
  }

  if (userRole === UserRole.EDITOR) {
    redirect(`/works/${id}/review`);
  }

  const isAuthor = work.authorId === session.user.id || userRole === UserRole.ADMIN;
  const isCompleted = work.status === "COMPLETED";

  // 이미 가져온 chapters 데이터에서 계산 (별도 쿼리 불필요)
  const approvedCount = work.chapters.filter(
    (ch) => ch.status === "APPROVED"
  ).length;
  const translatedCount = work.chapters.filter(
    (ch) => ["TRANSLATED", "EDITED", "APPROVED"].includes(ch.status)
  ).length;

  const progressPercent = work._count.chapters > 0
    ? Math.round((translatedCount / work._count.chapters) * 100)
    : 0;

  const activeContract = work.contracts[0] ?? null;

  // 완료 배너: 계약이 있으면 계약 범위 내 챕터만, 없으면 전체 챕터 기준
  const relevantChapters = activeContract
    ? work.chapters.filter((ch) => {
        if (activeContract.chapterStart && ch.number < activeContract.chapterStart) return false;
        if (activeContract.chapterEnd && ch.number > activeContract.chapterEnd) return false;
        return true;
      })
    : work.chapters;
  const allRelevantApproved = relevantChapters.length > 0 &&
    relevantChapters.every((ch) => ch.status === "APPROVED");
  const showCompletionBanner = allRelevantApproved && activeContract && !isCompleted;

  const statusConfig = getWorkStatusConfig(work.status);

  return (
    <div className="max-w-6xl">
      {/* Breadcrumb */}
      <nav className="mb-8">
        <Link
          href="/works"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← 프로젝트 목록
        </Link>
      </nav>

      {/* 번역 완료 시 페이지 자동 갱신 */}
      <WorkPageRefresher workId={id} />

      {/* Page Header */}
      <header className="pb-10 border-b border-border mb-10">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
              <span className="text-xs text-muted-foreground">
                {AGE_RATINGS[work.ageRating as keyof typeof AGE_RATINGS]}
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2 truncate">
              {work.titleKo}
            </h1>
            <p className="text-lg text-muted-foreground truncate">
              {work.titleOriginal}
            </p>
            {work.creators.length > 0 && (
              <p className="text-sm text-muted-foreground mt-3">
                {work.creators.map((c) => c.name).join(", ")}
              </p>
            )}
          </div>
          {!isCompleted && (
            <div className="flex gap-2 shrink-0">
              <BulkUploadDialog workId={id} />
              <TranslationActionButton
                workId={id}
                settingBibleConfirmed={work.settingBible?.status === "CONFIRMED"}
              />
            </div>
          )}
          {isCompleted && (
            <div className="shrink-0">
              <DownloadDialog
                workId={work.id}
                workTitle={work.titleKo}
                chapters={work.chapters.map((ch) => ({
                  number: ch.number,
                  title: ch.title,
                  status: ch.status,
                }))}
              />
            </div>
          )}
        </div>
      </header>

      {/* 모든 챕터 승인 완료 + 계약 미종료 시 완료 안내 배너 */}
      {showCompletionBanner && (
        <div className="flex items-center justify-between gap-4 px-5 py-4 mb-10 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                모든 회차의 승인이 완료되었습니다
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                계약을 완료하여 프로젝트를 마무리하세요
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline" className="border-emerald-300 dark:border-emerald-700 shrink-0">
            <Link href={`/contracts/${activeContract.id}`}>
              계약 완료하기
            </Link>
          </Button>
        </div>
      )}

      {/* Stats Row */}
      <section className="mb-12">
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="stat-card">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">회차</p>
            <p className="text-2xl font-semibold tabular-nums mt-1">{work._count.chapters}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              {isCompleted ? "승인 완료" : "번역 완료"}
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-2xl font-semibold tabular-nums">
                {isCompleted ? approvedCount : translatedCount}
              </p>
              <p className="text-sm text-muted-foreground">/ {work._count.chapters}</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isCompleted ? "bg-emerald-500" : "bg-foreground"}`}
                  style={{ width: `${isCompleted ? 100 : progressPercent}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {isCompleted ? "100%" : `${progressPercent}%`}
              </span>
            </div>
          </div>
          <div className="stat-card">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">용어집</p>
            <p className="text-2xl font-semibold tabular-nums mt-1">{work._count.glossary}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">장르</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {work.genres.slice(0, 3).map((genre: string) => (
                <span key={genre} className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded">
                  {genre}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Grid */}
      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        {/* Chapter List - Primary Focus */}
        <section>
          <div className="section-header">
            <div>
              <h2 className="text-xl font-semibold">회차 목록</h2>
              <p className="text-sm text-muted-foreground mt-1">
                회차를 클릭하여 원문과 번역본을 확인하세요
              </p>
            </div>
            <div className="flex gap-2">
              {/* <Button variant="outline" size="sm" asChild>
                <Link href={`/works/${id}/chapters`}>회차 관리</Link>
              </Button> */}
              <DownloadDialog
                workId={work.id}
                workTitle={work.titleKo}
                chapters={work.chapters.map((ch) => ({
                  number: ch.number,
                  title: ch.title,
                  status: ch.status,
                }))}
              />
            </div>
          </div>

          {work.chapters.length === 0 ? (
            <div className="section-surface text-center py-16">
              <p className="text-xl font-medium mb-2">등록된 회차가 없습니다</p>
              <p className="text-muted-foreground mb-8">
                원문을 업로드하여 번역을 시작하세요
              </p>
              <BulkUploadDialog workId={id} />
            </div>
          ) : (
            <ChapterList
              workId={id}
              chapters={work.chapters.map((ch) => ({
                id: ch.id,
                number: ch.number,
                title: ch.title,
                status: ch.status,
                wordCount: ch.wordCount,
              }))}
              itemsPerPage={10}
            />
          )}
        </section>

        {/* Sidebar - Work Info */}
        <aside className="space-y-8">
          {/* Synopsis */}
          <div>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
              줄거리
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-6">
              {work.synopsis || "줄거리가 등록되지 않았습니다."}
            </p>
          </div>

          {/* Original Work Info */}
          <div>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
              원작 정보
            </h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">원작 언어</dt>
                <dd>{SOURCE_LANGUAGES[work.sourceLanguage as keyof typeof SOURCE_LANGUAGES]}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">연재 상태</dt>
                <dd>{ORIGINAL_STATUS[work.originalStatus as keyof typeof ORIGINAL_STATUS]}</dd>
              </div>
              {work.expectedChapters && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">예상 회차</dt>
                  <dd>{work.expectedChapters}화</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">출판사</dt>
                <dd className="truncate ml-4">{work.publisher}</dd>
              </div>
              {work.platformName && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">플랫폼</dt>
                  <dd>
                    {work.platformUrl ? (
                      <a
                        href={work.platformUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground hover:underline"
                      >
                        {work.platformName} ↗
                      </a>
                    ) : (
                      work.platformName
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Quick Actions (COMPLETED 시 숨김) */}
          {!isCompleted && (
            <div>
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
                빠른 작업
              </h3>
              <QuickActions
                workId={id}
                settingBibleConfirmed={work.settingBible?.status === "CONFIRMED"}
                settingBibleExists={!!work.settingBible}
                characterCount={work.settingBible?._count.characters ?? 0}
                termCount={work.settingBible?._count.terms ?? 0}
                glossaryCount={work._count.glossary}
              />
            </div>
          )}

          {/* Application Notifications */}
          {isAuthor && work.listings.length > 0 && (() => {
            const pendingCount = work.listings.reduce(
              (sum, l) => sum + l.applications.length, 0
            );
            const totalApps = work.listings.reduce(
              (sum, l) => sum + l._count.applications, 0
            );
            return (
              <div>
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
                  지원서
                </h3>
                <Link
                  href={`/works/${id}/listings`}
                  className="block border rounded-xl p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">지원서 관리</span>
                    {pendingCount > 0 ? (
                      <Badge variant="warning">{pendingCount}건 대기</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">{totalApps}건</span>
                    )}
                  </div>
                </Link>
              </div>
            );
          })()}

          {/* Editor Assignment (COMPLETED 시 숨김) */}
          {isAuthor && !isCompleted && (
            <div>
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
                담당 윤문가
              </h3>
              <EditorAssignment
                workId={work.id}
                currentEditor={work.editor}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
