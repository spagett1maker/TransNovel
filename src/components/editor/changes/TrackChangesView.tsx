"use client";

import { useState } from "react";
import { useEditorContext } from "../EditorProvider";
import { useTrackChanges } from "@/hooks/useTrackChanges";
import { Check, X, CheckCheck, XCircle, Save, ThumbsUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ChapterStatus } from "@prisma/client";

export function TrackChangesView() {
  const { chapter, editor, work, isEditable, fetchData, handleStatusChange } = useEditorContext();
  const [isApplying, setIsApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const currentEdited = editor?.getHTML() || chapter?.editedContent || null;
  const originalTranslation = chapter?.translatedContent || null;

  const {
    chunks,
    stats,
    acceptChange,
    rejectChange,
    acceptAll,
    rejectAll,
    getResultHtml,
    hasUndecided,
  } = useTrackChanges(originalTranslation, currentEdited);

  // 작가(읽기전용)만 수락/거절 가능, 윤문가는 diff만 확인
  const canReview = !isEditable;

  // editedContent가 없거나 translatedContent와 동일하면 편집 전
  const hasEditedContent = !!(
    chapter?.editedContent &&
    chapter.editedContent !== chapter.translatedContent
  );

  const handleApply = async () => {
    if (!chapter || !work) return;

    setIsApplying(true);
    try {
      const resultHtml = getResultHtml();

      const res = await fetch(
        `/api/works/${work.id}/chapters/${chapter.number}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackChangesResult: resultHtml,
            _updatedAt: chapter.updatedAt,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        if (data.code === "CONFLICT") {
          toast.error("다른 사용자가 이미 수정했습니다. 페이지를 새로고침해주세요.");
        } else {
          toast.error(data.error || "적용에 실패했습니다");
        }
        return;
      }

      // 에디터 내용도 동기화
      if (editor) {
        editor.commands.setContent(resultHtml);
      }

      await fetchData();
      setApplied(true);
      toast.success("수정 추적 결과가 적용되었습니다");
    } catch {
      toast.error("적용 중 오류가 발생했습니다");
    } finally {
      setIsApplying(false);
    }
  };

  if (!chapter) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">챕터를 불러오는 중...</p>
      </div>
    );
  }

  if (!originalTranslation) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          번역문이 없어 변경 사항을 비교할 수 없습니다.
        </p>
      </div>
    );
  }

  // 윤문가가 아직 편집하지 않은 경우
  if (!hasEditedContent && canReview) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            아직 윤문가가 편집하지 않았습니다
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            윤문가가 편집을 완료하면 변경 사항을 확인할 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  const hasChanges = stats.changes > 0;

  // 적용 완료 후 상태 전이 선택 UI
  if (applied) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm">
          <CheckCheck className="h-10 w-10 text-green-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">
            변경사항이 적용되었습니다
          </p>
          <p className="text-xs text-muted-foreground mb-6">
            다음 단계를 선택하세요.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              size="sm"
              onClick={() => handleStatusChange(ChapterStatus.APPROVED)}
              className="gap-1.5"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              승인
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatusChange(ChapterStatus.REVIEWING)}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              재윤문 요청
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header with stats and bulk actions */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-4">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            수정 추적
          </h2>
          {hasChanges && (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-600 dark:text-green-400">
                +{stats.added.toLocaleString()}자
              </span>
              <span className="text-red-600 dark:text-red-400">
                -{stats.deleted.toLocaleString()}자
              </span>
              <span className="text-muted-foreground">
                {stats.changes}건 변경
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* 작가만 수락/거절 가능 */}
          {canReview && hasChanges && hasUndecided && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={acceptAll}
                className="h-7 text-xs gap-1"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                전체 수락
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={rejectAll}
                className="h-7 text-xs gap-1"
              >
                <XCircle className="h-3.5 w-3.5" />
                전체 거절
              </Button>
            </>
          )}

          {/* 작가: 모든 결정 완료 후 적용 버튼 */}
          {canReview && hasChanges && !hasUndecided && (
            <Button
              size="sm"
              onClick={handleApply}
              disabled={isApplying}
              className="h-7 text-xs gap-1"
            >
              <Save className="h-3.5 w-3.5" />
              {isApplying ? "적용 중..." : "변경사항 적용"}
            </Button>
          )}

          {/* 윤문가: 자신의 편집 확인용 */}
          {!canReview && hasChanges && (
            <span className="text-[11px] text-muted-foreground">
              내 편집 내역 확인
            </span>
          )}
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-background">
        {!hasChanges ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <CheckCheck className="h-8 w-8 text-green-500 mb-2" />
            <p className="text-sm font-medium text-foreground">
              변경 사항이 없습니다
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              번역문과 편집문이 동일합니다.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto text-sm leading-relaxed whitespace-pre-wrap">
            {chunks.map((chunk, index) => {
              if (chunk.type === "equal") {
                return (
                  <span key={index} className="text-foreground">
                    {chunk.text}
                  </span>
                );
              }

              const isInsert = chunk.type === "insert";
              const isDecided = chunk.decision !== null;
              const isRejected = chunk.decision === "rejected";

              // Decided changes: show visual feedback
              if (isDecided) {
                if (isInsert && isRejected) {
                  return (
                    <span
                      key={index}
                      className="bg-red-100/30 dark:bg-red-900/10 text-red-800/40 dark:text-red-300/40 line-through"
                    >
                      {chunk.text}
                    </span>
                  );
                }
                if (!isInsert && isRejected) {
                  return (
                    <span
                      key={index}
                      className="bg-blue-100/50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300"
                    >
                      {chunk.text}
                    </span>
                  );
                }
              }

              return (
                <span
                  key={index}
                  className={cn(
                    "relative inline group",
                    isInsert
                      ? isDecided
                        ? "bg-green-100/50 dark:bg-green-900/20 text-green-800 dark:text-green-300"
                        : "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 underline decoration-green-400 decoration-2 underline-offset-2"
                      : isDecided
                        ? "bg-red-100/50 dark:bg-red-900/20 text-red-800/50 dark:text-red-300/50 line-through"
                        : "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 line-through decoration-red-400 decoration-2"
                  )}
                >
                  {chunk.text}
                  {/* 작가만 개별 수락/거절 가능 */}
                  {canReview && !isDecided && (
                    <span className="invisible group-hover:visible absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-popover border border-border rounded-md shadow-md px-1 py-0.5 z-10">
                      <button
                        onClick={() => acceptChange(index)}
                        className="p-0.5 rounded hover:bg-green-100 dark:hover:bg-green-900/40 text-green-600"
                        title="수락"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => rejectChange(index)}
                        className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600"
                        title="거절"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
