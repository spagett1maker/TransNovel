"use client";

import { ChapterStatus, UserRole } from "@prisma/client";
import { CheckCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import DOMPurify from "isomorphic-dompurify";
import { EditorContent } from "@tiptap/react";
import {
  Undo,
  Redo,
  Save,
  MessageSquare,
  History,
  Activity,
  BookOpen,
  Columns2,
  Pencil,
  GitCompareArrows,
  Eye,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Palette,
  Minus,
  Plus,
  Pilcrow,
  Space,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { EditorProvider, useEditorContext } from "@/components/editor";
import { CommentSidebar } from "@/components/editor/comments/CommentSidebar";
import { SnapshotPanel } from "@/components/editor/versions/SnapshotPanel";
import { ActivitySidebar } from "@/components/editor/activity/ActivitySidebar";
import { GlossarySidebar } from "@/components/editor/glossary/GlossarySidebar";
import { TrackChangesView } from "@/components/editor/changes/TrackChangesView";
import { AiImproveBubble } from "@/components/editor/ai/AiImproveBubble";
import { getChapterStatusConfig } from "@/lib/chapter-status";
import { getAvailableNextStatuses, getStatusDisplayName } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useEditorPreferences } from "@/hooks/useEditorPreferences";

// ─── Types ───────────────────────────────────────────────

interface ChapterSummary {
  id: string;
  number: number;
  title: string | null;
  translatedTitle: string | null;
  status: ChapterStatus;
  wordCount: number;
}

interface Work {
  id: string;
  titleKo: string;
  titleOriginal: string;
  author: {
    name: string;
  };
  chapters: ChapterSummary[];
}

type ReviewViewMode = "edit" | "changes";
type RightPanel = "comments" | "versions" | "activity" | "glossary" | null;

const EDITOR_BG_COLORS = [
  { name: "기본", value: "", className: "bg-background" },
  { name: "크림", value: "#fdf6e3", className: "" },
  { name: "연두", value: "#f0fdf4", className: "" },
  { name: "연파랑", value: "#eff6ff", className: "" },
  { name: "연보라", value: "#faf5ff", className: "" },
  { name: "연회색", value: "#f5f5f4", className: "" },
  { name: "다크", value: "#1e1e1e", className: "" },
] as const;

// ─── Inner Editor (consumes EditorProvider context) ──────

function ReviewEditor({ workId }: { workId: string }) {
  const {
    editor,
    chapter,
    work,
    handleSave,
    handleStatusChange,
    isSaving,
    userRole,
    isEditable,
  } = useEditorContext();

  const [viewMode, setViewMode] = useState<ReviewViewMode>("edit");
  const [rightPanel, setRightPanel] = useState<RightPanel>(!isEditable ? "comments" : null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);

  const {
    editorBgColor: editorBg,
    setEditorBgColor,
    savedColors,
    saveCustomColor,
    removeCustomColor: removeSavedColor,
    editorFontSize,
    setEditorFontSize,
    editorLineHeight,
    setEditorLineHeight,
    editorPadding,
    setEditorPadding,
    showParagraphMarks,
    setShowParagraphMarks,
  } = useEditorPreferences();

  const bgPickerRef = useRef<HTMLDivElement>(null);
  const bgButtonRef = useRef<HTMLButtonElement>(null);

  const handleBgChange = useCallback((value: string) => {
    setEditorBgColor(value);
    const presetValues: string[] = EDITOR_BG_COLORS.map((c) => c.value);
    if (value && !presetValues.includes(value)) {
      saveCustomColor(value);
    }
    setShowBgPicker(false);
  }, [setEditorBgColor, saveCustomColor]);

  useEffect(() => {
    if (!showBgPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (bgPickerRef.current && !bgPickerRef.current.contains(e.target as Node)) {
        setShowBgPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showBgPicker]);

  const hasTranslation =
    chapter &&
    ["TRANSLATED", "EDITED", "APPROVED", "REVIEWING"].includes(chapter.status);

  const availableStatuses = chapter
    ? getAvailableNextStatuses(userRole, chapter.status)
    : [];

  // Keyboard shortcut: Ctrl/Cmd + S (only when editable)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isEditable) {
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, isEditable]);

  const toggleRightPanel = useCallback(
    (panel: NonNullable<RightPanel>) => {
      setRightPanel((prev) => (prev === panel ? null : panel));
    },
    []
  );

  const charCount =
    editor?.storage.characterCount?.characters?.() ??
    editor?.getText().length ??
    0;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-background/80 backdrop-blur-sm">
        {/* Left: mode toggle + editor actions */}
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("edit")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                viewMode === "edit"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Pencil className="h-3.5 w-3.5" />
              편집
            </button>
            <button
              onClick={() => setViewMode("changes")}
              disabled={!hasTranslation}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                viewMode === "changes"
                  ? "bg-background text-foreground shadow-sm"
                  : !hasTranslation
                    ? "text-muted-foreground/50 cursor-not-allowed"
                    : "text-muted-foreground hover:text-foreground"
              )}
            >
              <GitCompareArrows className="h-3.5 w-3.5" />
              수정 추적
            </button>
          </div>

          {/* 서식 + Undo/Redo (only when editable) */}
          {editor && isEditable && (
            <div className="flex items-center gap-0.5 border-l border-border pl-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={editor.isActive("bold") ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className="h-8 w-8 p-0"
                  >
                    <Bold className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>굵게 (⌘B)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={editor.isActive("italic") ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className="h-8 w-8 p-0"
                  >
                    <Italic className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>기울임 (⌘I)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={editor.isActive("underline") ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    className="h-8 w-8 p-0"
                  >
                    <Underline className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>밑줄 (⌘U)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={editor.isActive("strike") ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    className="h-8 w-8 p-0"
                  >
                    <Strikethrough className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>취소선 (⌘⇧S)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={editor.isActive("highlight") ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleHighlight().run()}
                    className="h-8 w-8 p-0"
                  >
                    <Highlighter className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>형광펜 (⌘⇧H)</TooltipContent>
              </Tooltip>

              <div className="w-px h-5 bg-border mx-1" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().undo().run()}
                    disabled={!editor.can().undo()}
                    className="h-8 w-8 p-0"
                  >
                    <Undo className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>실행 취소</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().redo().run()}
                    disabled={!editor.can().redo()}
                    className="h-8 w-8 p-0"
                  >
                    <Redo className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>다시 실행</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* 배경색 선택 */}
          <div ref={bgPickerRef} className="relative border-l border-border pl-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  ref={bgButtonRef}
                  variant={showBgPicker ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setShowBgPicker(!showBgPicker)}
                  className="h-8 w-8 p-0"
                >
                  <Palette className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>배경색</TooltipContent>
            </Tooltip>
            {showBgPicker && createPortal(
              <div
                ref={bgPickerRef}
                className="p-3 rounded-lg shadow-xl border border-border bg-white dark:bg-neutral-900"
                style={{
                  position: "fixed",
                  zIndex: 9999,
                  top: (bgButtonRef.current?.getBoundingClientRect().bottom ?? 0) + 8,
                  left: bgButtonRef.current?.getBoundingClientRect().left ?? 0,
                }}
              >
                <div className="flex gap-1.5 mb-2">
                  {EDITOR_BG_COLORS.map((color) => (
                    <Tooltip key={color.name}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => handleBgChange(color.value)}
                          className={cn(
                            "w-7 h-7 rounded-md border-2 transition-all hover:scale-110",
                            editorBg === color.value ? "border-primary ring-2 ring-primary/30" : "border-border"
                          )}
                          style={{
                            backgroundColor: color.value || "var(--background)",
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>{color.name}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
                {savedColors.length > 0 && (
                  <div className="pt-2 border-t border-border">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider">저장된 색상</label>
                    <div className="flex gap-1.5 mt-1">
                      {savedColors.map((color) => (
                        <Tooltip key={color}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleBgChange(color)}
                              onContextMenu={(e) => { e.preventDefault(); removeSavedColor(color); }}
                              className={cn(
                                "w-7 h-7 rounded-md border-2 transition-all hover:scale-110",
                                editorBg === color ? "border-primary ring-2 ring-primary/30" : "border-border"
                              )}
                              style={{ backgroundColor: color }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>{color} (우클릭으로 삭제)</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">직접 선택</label>
                  <input
                    type="color"
                    value={editorBg || "#ffffff"}
                    onChange={(e) => handleBgChange(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border border-border"
                  />
                </div>
              </div>,
              document.body
            )}
          </div>

          {/* 폰트 크기 조절 */}
          <div className="flex items-center gap-0.5 border-l border-border pl-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditorFontSize(editorFontSize - 1)}
                  disabled={editorFontSize <= 12}
                  className="h-8 w-8 p-0"
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>글자 축소</TooltipContent>
            </Tooltip>
            <input
              type="number"
              min={12}
              max={24}
              value={editorFontSize}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (v >= 12 && v <= 24) setEditorFontSize(v);
              }}
              className="w-9 h-6 text-xs tabular-nums text-center text-muted-foreground bg-transparent border border-border rounded px-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditorFontSize(editorFontSize + 1)}
                  disabled={editorFontSize >= 24}
                  className="h-8 w-8 p-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>글자 확대</TooltipContent>
            </Tooltip>
          </div>

          {/* 줄 간격 조절 */}
          <div className="flex items-center gap-0.5 border-l border-border pl-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditorLineHeight(editorLineHeight - 0.2)}
                  disabled={editorLineHeight <= 1}
                  className="h-8 w-8 p-0"
                >
                  <Space className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>줄 간격 줄이기</TooltipContent>
            </Tooltip>
            <span className="text-[10px] tabular-nums text-muted-foreground w-7 text-center select-none">
              {editorLineHeight.toFixed(1)}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditorLineHeight(editorLineHeight + 0.2)}
                  disabled={editorLineHeight >= 3}
                  className="h-8 w-8 p-0"
                >
                  <Space className="h-3.5 w-3.5 rotate-180" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>줄 간격 늘리기</TooltipContent>
            </Tooltip>
          </div>

          {/* 여백 조절 */}
          <div className="flex items-center gap-0.5 border-l border-border pl-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditorPadding(Math.max(0, editorPadding - 10))}
                  disabled={editorPadding <= 0}
                  className="h-8 w-8 p-0"
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>여백 줄이기</TooltipContent>
            </Tooltip>
            <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-center select-none">
              {editorPadding}px
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditorPadding(Math.min(120, editorPadding + 10))}
                  disabled={editorPadding >= 120}
                  className="h-8 w-8 p-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>여백 늘리기</TooltipContent>
            </Tooltip>
          </div>

          {/* 문단 기호 토글 */}
          <div className="border-l border-border pl-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showParagraphMarks ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setShowParagraphMarks(!showParagraphMarks)}
                  className="h-8 w-8 p-0"
                >
                  <Pilcrow className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>문단 기호 표시</TooltipContent>
            </Tooltip>
          </div>

          {/* Side-by-side translation toggle */}
          <div className="border-l border-border pl-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showTranslation ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setShowTranslation(!showTranslation)}
                  disabled={!hasTranslation}
                  className="h-8 text-xs gap-1.5"
                >
                  <Columns2 className="h-4 w-4" />
                  번역 비교
                </Button>
              </TooltipTrigger>
              <TooltipContent>번역문 나란히 보기</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Right: save, status, sidebar toggles */}
        <div className="flex items-center gap-2">
          {/* Character count */}
          {viewMode === "edit" && (
            <span className="text-xs text-muted-foreground tabular-nums mr-1">
              {charCount.toLocaleString()}자
            </span>
          )}

          {/* Sidebar toggles */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={rightPanel === "comments" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => toggleRightPanel("comments")}
                  className="h-8 w-8 p-0"
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>댓글</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={rightPanel === "versions" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => toggleRightPanel("versions")}
                  className="h-8 w-8 p-0"
                >
                  <History className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>버전</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={rightPanel === "activity" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => toggleRightPanel("activity")}
                  className="h-8 w-8 p-0"
                >
                  <Activity className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>활동</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={rightPanel === "glossary" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => toggleRightPanel("glossary")}
                  className="h-8 w-8 p-0"
                >
                  <BookOpen className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>용어집</TooltipContent>
            </Tooltip>
          </div>

          {/* Save (only when editable) */}
          {isEditable && (
            <div className="border-l border-border pl-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="h-8 gap-1.5"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "저장 중..." : "저장"}
              </Button>
            </div>
          )}

          {/* Status transitions */}
          {availableStatuses.length > 0 && (
            <div className="flex gap-1 border-l border-border pl-2">
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

      {/* ── Read-only banner ──────────────────────────── */}
      {!isEditable && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="text-sm">읽기 전용 모드 — 댓글과 승인/반려만 가능합니다</span>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex">
        {/* Main content: split or single */}
        <div
          className={cn(
            "flex-1 min-w-0 min-h-0 flex",
            showTranslation && viewMode === "edit" ? "divide-x divide-border" : ""
          )}
        >
          {/* Translation column (left half of split view) */}
          {showTranslation && viewMode === "edit" && (
            <div className="w-1/2 min-h-0 overflow-y-auto bg-muted/20">
              <div className="shrink-0 px-6 py-3 border-b border-border sticky top-0 bg-muted/40 backdrop-blur-sm z-10">
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground">
                  AI 번역문
                </h3>
              </div>
              <div className="max-w-2xl mx-auto px-8 py-10">
                {chapter?.translatedContent ? (
                  <div
                    className="prose prose-sm max-w-none text-foreground/80 text-base leading-relaxed [&_p]:my-0 [&_p]:leading-relaxed whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(chapter.translatedContent),
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-20">
                    번역된 내용이 없습니다
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Editor column (full or right half) */}
          <div
            className={cn(
              "min-h-0 overflow-y-auto",
              !editorBg && "bg-background",
              showTranslation && viewMode === "edit" ? "w-1/2" : "w-full"
            )}
            style={editorBg ? {
              backgroundColor: editorBg,
              color: (() => {
                const hex = editorBg.replace("#", "");
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                // relative luminance
                return (r * 299 + g * 587 + b * 114) / 1000 < 128 ? "#d4d4d4" : undefined;
              })(),
            } : undefined}
          >
            {viewMode === "edit" ? (
              <div
                className={cn(
                  "mx-auto px-8 py-10",
                  showTranslation ? "max-w-2xl" : "max-w-3xl"
                )}
              >
                {showTranslation && (
                  <div className="shrink-0 mb-6 pb-3 border-b border-border">
                    <h3 className="text-xs uppercase tracking-widest text-muted-foreground">
                      윤문 편집
                    </h3>
                  </div>
                )}
                <EditorContent
                  editor={editor}
                  className={cn(
                    "min-h-[60vh] [&_.ProseMirror]:min-h-[60vh] [&_.ProseMirror]:outline-none [&_.ProseMirror_p]:my-0 [&_.ProseMirror]:whitespace-pre-wrap",
                    showParagraphMarks && "[&_.ProseMirror_p::after]:content-['¶'] [&_.ProseMirror_p::after]:text-muted-foreground/30 [&_.ProseMirror_p::after]:text-xs [&_.ProseMirror_p::after]:ml-0.5"
                  )}
                  style={{
                    fontSize: `${editorFontSize}px`,
                    lineHeight: editorLineHeight,
                    padding: `${editorPadding}px`,
                  }}
                />
                {editor && work && chapter && isEditable && (
                  <AiImproveBubble
                    editor={editor}
                    workId={work.id}
                    chapterNum={chapter.number}
                  />
                )}
              </div>
            ) : (
              <TrackChangesView />
            )}
          </div>
        </div>

        {/* Right sidebar panel */}
        {rightPanel && (
          <div className="w-80 shrink-0 border-l border-border flex flex-col min-h-0 bg-background overflow-hidden">
            {rightPanel === "comments" && <CommentSidebar />}
            {rightPanel === "versions" && <SnapshotPanel />}
            {rightPanel === "activity" && <ActivitySidebar />}
            {rightPanel === "glossary" && <GlossarySidebar workId={workId} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────

export default function ReviewPage() {
  const params = useParams();
  const { data: session } = useSession();
  const workId = params.id as string;

  const [work, setWork] = useState<Work | null>(null);
  const [selectedChapterNum, setSelectedChapterNum] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initialLoadDone = useRef(false);

  const userRole = (session?.user?.role as UserRole) || UserRole.AUTHOR;

  const fetchWork = useCallback(async () => {
    try {
      const response = await fetch(`/api/works/${workId}`);
      if (!response.ok) throw new Error("Failed to fetch work");
      const data = await response.json();
      setWork(data);

      // 최초 로드 시에만 자동 선택
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        const pendingChapter = data.chapters.find(
          (c: ChapterSummary) => c.status === "TRANSLATED" || c.status === "REVIEWING"
        );
        if (pendingChapter) {
          setSelectedChapterNum(pendingChapter.number);
        } else if (data.chapters.length > 0) {
          const reviewable = data.chapters.find(
            (c: ChapterSummary) =>
              c.status === "TRANSLATED" ||
              c.status === "REVIEWING" ||
              c.status === "EDITED" ||
              c.status === "APPROVED"
          );
          if (reviewable) {
            setSelectedChapterNum(reviewable.number);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching work:", error);
    } finally {
      setIsLoading(false);
    }
  }, [workId]);

  useEffect(() => {
    fetchWork();
  }, [fetchWork]);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!work) {
    return (
      <div className="text-center py-20">
        <p className="text-xl font-medium mb-2">작품을 찾을 수 없습니다</p>
        <Link
          href="/works"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← 작품 목록으로
        </Link>
      </div>
    );
  }

  const reviewableChapters = work.chapters.filter(
    (c) =>
      c.status === "TRANSLATED" ||
      c.status === "REVIEWING" ||
      c.status === "EDITED" ||
      c.status === "APPROVED"
  );

  const pendingCount = reviewableChapters.filter(
    (c) => c.status === "TRANSLATED"
  ).length;

  const allApproved = reviewableChapters.length > 0 &&
    reviewableChapters.every((c) => c.status === "APPROVED");

  return (
    <div className="h-[calc(100dvh-3rem)] lg:h-[100dvh] flex flex-col -mx-4 -my-6 sm:-mx-6 sm:-my-8 lg:-mx-8">
      {/* ── Top header bar ──────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between gap-4 px-4 py-2.5 border-b border-border bg-background">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/works"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            ← 프로젝트 목록
          </Link>
          <span className="text-border">/</span>
          <h1 className="text-sm font-medium truncate">{work.titleKo}</h1>
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">
            {work.titleOriginal}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pendingCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              검토 대기 {pendingCount}건
            </Badge>
          )}
          {allApproved && (
            <Badge variant="success" className="text-xs">
              전체 승인 완료
            </Badge>
          )}
        </div>
      </header>

      {/* ── 전체 승인 완료 배너 ────────────────────────── */}
      {allApproved && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 border-b border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-800 dark:text-emerald-200">
              모든 회차의 승인이 완료되었습니다.
            </p>
          </div>
          <Link
            href={`/works/${workId}`}
            className="text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:underline shrink-0"
          >
            프로젝트 페이지로 이동 →
          </Link>
        </div>
      )}

      {/* ── Main layout: chapter list + editor ──────────── */}
      <div className="flex-1 min-h-0 flex">
        {/* Chapter list sidebar */}
        <aside className="w-56 shrink-0 border-r border-border flex flex-col min-h-0 bg-muted/20">
          <div className="shrink-0 px-3 py-3 border-b border-border">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              검토 가능한 회차
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {reviewableChapters.length === 0 ? (
              <p className="text-sm text-muted-foreground px-3 py-4">
                검토 가능한 회차가 없습니다
              </p>
            ) : (
              reviewableChapters.map((chapter) => {
                const statusConfig = getChapterStatusConfig(chapter.status);
                const isSelected = selectedChapterNum === chapter.number;

                return (
                  <button
                    key={chapter.id}
                    onClick={() => setSelectedChapterNum(chapter.number)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors",
                      isSelected
                        ? "bg-foreground text-background"
                        : "hover:bg-muted"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {chapter.number}화
                        {(chapter.translatedTitle || chapter.title) && (
                          <span
                            className={cn(
                              "font-normal ml-1",
                              isSelected ? "opacity-70" : "text-muted-foreground"
                            )}
                          >
                            {chapter.translatedTitle || chapter.title}
                          </span>
                        )}
                      </p>
                      <p
                        className={cn(
                          "text-xs mt-0.5",
                          isSelected ? "opacity-60" : "text-muted-foreground"
                        )}
                      >
                        {chapter.wordCount.toLocaleString()}자
                      </p>
                    </div>
                    <Badge
                      variant={isSelected ? "secondary" : statusConfig.variant}
                      className="text-[10px] shrink-0 ml-2"
                    >
                      {statusConfig.label}
                    </Badge>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Editor area */}
        {selectedChapterNum !== null ? (
          <EditorProvider
            key={selectedChapterNum}
            workId={workId}
            chapterNum={selectedChapterNum}
            userRole={userRole}
            onChapterStatusChange={fetchWork}
          >
            <ReviewEditor workId={workId} />
          </EditorProvider>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">회차를 선택하세요</p>
          </div>
        )}
      </div>
    </div>
  );
}
