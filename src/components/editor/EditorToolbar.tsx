"use client";

import { ChapterStatus } from "@prisma/client";
import {
  MessageSquare,
  History,
  Activity,
  Save,
  Undo,
  Redo,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorContext, ViewMode } from "./EditorProvider";
import { getAvailableNextStatuses, getStatusDisplayName } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function EditorToolbar() {
  const {
    editor,
    viewMode,
    setViewMode,
    leftSidebar,
    rightSidebar,
    setLeftSidebar,
    setRightSidebar,
    handleSave,
    handleStatusChange,
    isSaving,
    chapter,
    userRole,
    isEditable,
  } = useEditorContext();

  const hasTranslation =
    chapter &&
    ["TRANSLATED", "EDITED", "APPROVED", "REVIEWING"].includes(chapter.status);

  const availableStatuses = chapter
    ? getAvailableNextStatuses(userRole, chapter.status)
    : [];

  const viewModes: { mode: ViewMode; label: string; disabled?: boolean }[] = [
    { mode: "collaboration", label: "3단 비교" },
    { mode: "original", label: "원문만" },
    { mode: "translated", label: "번역문만", disabled: !hasTranslation },
    { mode: "edit", label: "편집만", disabled: !isEditable },
    { mode: "changes", label: "수정 추적", disabled: !hasTranslation },
  ];

  return (
    <div className="shrink-0 flex items-center justify-between gap-4 pb-4 border-b border-border overflow-x-auto">
      {/* Left: View Mode Tabs */}
      <div className="flex items-center gap-4">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {viewModes.map(({ mode, label, disabled }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              disabled={disabled}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                viewMode === mode
                  ? "bg-background text-foreground shadow-sm"
                  : disabled
                    ? "text-muted-foreground/50 cursor-not-allowed"
                    : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Editor Actions (only when editor is focused/active and editable) */}
        {editor && isEditable && (
          <div className="flex items-center gap-1 border-l border-border pl-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              className="h-8 w-8 p-0"
              aria-label="실행 취소"
            >
              <Undo className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              className="h-8 w-8 p-0"
              aria-label="다시 실행"
            >
              <Redo className="h-4 w-4" />
            </Button>
            <span className="flex items-center gap-1.5 ml-2 pl-2 border-l border-border text-[11px] text-muted-foreground select-none whitespace-nowrap">
              <Sparkles className="h-3.5 w-3.5 text-violet-500/70 shrink-0" />
              텍스트 선택 시 AI 표현 개선
            </span>
          </div>
        )}
      </div>

      {/* Right: Sidebar Toggles & Actions */}
      <div className="flex items-center gap-2">
        {/* Sidebar Toggles */}
        <div className="flex items-center gap-1 mr-2">
          <Button
            variant={leftSidebar === "comments" ? "secondary" : "ghost"}
            size="sm"
            onClick={() =>
              setLeftSidebar(leftSidebar === "comments" ? null : "comments")
            }
            className="h-8"
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            댓글
          </Button>
          <Button
            variant={leftSidebar === "versions" ? "secondary" : "ghost"}
            size="sm"
            onClick={() =>
              setLeftSidebar(leftSidebar === "versions" ? null : "versions")
            }
            className="h-8"
          >
            <History className="h-4 w-4 mr-1" />
            버전
          </Button>
          <Button
            variant={leftSidebar === "glossary" ? "secondary" : "ghost"}
            size="sm"
            onClick={() =>
              setLeftSidebar(leftSidebar === "glossary" ? null : "glossary")
            }
            className="h-8"
          >
            <BookOpen className="h-4 w-4 mr-1" />
            용어집
          </Button>
          <Button
            variant={rightSidebar === "activity" ? "secondary" : "ghost"}
            size="sm"
            onClick={() =>
              setRightSidebar(rightSidebar === "activity" ? null : "activity")
            }
            className="h-8"
          >
            <Activity className="h-4 w-4 mr-1" />
            활동
          </Button>
        </div>

        {/* Save Button (only when editable) */}
        {isEditable && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="h-8"
          >
            <Save className="h-4 w-4 mr-1" />
            {isSaving ? "저장 중..." : "저장"}
          </Button>
        )}

        {/* Status Change Buttons */}
        {availableStatuses.length > 0 && (
          <div className="flex gap-1 ml-2 border-l border-border pl-2">
            {availableStatuses.map((status) => (
              <Button
                key={status}
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange(status as ChapterStatus)}
                disabled={isSaving}
                className="h-8"
              >
                {getStatusDisplayName(status as ChapterStatus)}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
