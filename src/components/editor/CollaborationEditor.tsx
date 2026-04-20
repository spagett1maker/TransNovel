"use client";

import { useRef, useCallback, useState } from "react";
import { Link2, Link2Off } from "lucide-react";
import { useEditorContext } from "./EditorProvider";
import { EditorToolbar } from "./EditorToolbar";
import { OriginalColumn } from "./columns/OriginalColumn";
import { TranslationColumn } from "./columns/TranslationColumn";
import { EditingColumn } from "./columns/EditingColumn";
import { CommentSidebar } from "./comments";
import { SnapshotPanel } from "./versions";
import { ActivitySidebar } from "./activity";
import { GlossarySidebar } from "./glossary/GlossarySidebar";
import { TrackChangesView } from "./changes/TrackChangesView";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

interface CollaborationEditorProps {
  workId: string;
}

export function CollaborationEditor({ workId }: CollaborationEditorProps) {
  const { viewMode, leftSidebar, rightSidebar, chapter } = useEditorContext();

  // Scroll sync state
  const [scrollSyncEnabled, setScrollSyncEnabled] = useState(true);
  const [editReference, setEditReference] = useState<"original" | "translation">("translation");

  // Scroll sync refs
  const originalScrollRef = useRef<{ scrollTo: (ratio: number) => void } | null>(null);
  const translationScrollRef = useRef<{ scrollTo: (ratio: number) => void } | null>(null);
  const editingScrollRef = useRef<{ scrollTo: (ratio: number) => void } | null>(null);

  // Use ref for scrolling lock to avoid re-renders on every scroll event
  const scrollingColumnRef = useRef<string | null>(null);
  const scrollSyncRef = useRef(scrollSyncEnabled);
  scrollSyncRef.current = scrollSyncEnabled;

  // Stable scroll handler — reads mutable state from refs, no state deps
  const handleScroll = useCallback(
    (source: string, _scrollTop: number, ratio: number) => {
      if (!scrollSyncRef.current) return;
      if (scrollingColumnRef.current && scrollingColumnRef.current !== source) return;

      scrollingColumnRef.current = source;

      if (source !== "original" && originalScrollRef.current) {
        originalScrollRef.current.scrollTo(ratio);
      }
      if (source !== "translation" && translationScrollRef.current) {
        translationScrollRef.current.scrollTo(ratio);
      }
      if (source !== "editing" && editingScrollRef.current) {
        editingScrollRef.current.scrollTo(ratio);
      }

      setTimeout(() => {
        scrollingColumnRef.current = null;
      }, 50);
    },
    [],
  );

  // Scroll sync toggle button (reused across modes)
  const scrollSyncToggle = (
    <button
      onClick={() => setScrollSyncEnabled((prev) => !prev)}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors",
        scrollSyncEnabled
          ? "text-primary bg-primary/10 hover:bg-primary/15"
          : "text-muted-foreground hover:bg-muted",
      )}
      title={scrollSyncEnabled ? "스크롤 동기화 해제" : "스크롤 동기화 켜기"}
    >
      {scrollSyncEnabled ? (
        <Link2 className="h-3.5 w-3.5" />
      ) : (
        <Link2Off className="h-3.5 w-3.5" />
      )}
      스크롤 동기화
    </button>
  );

  // Render based on view mode
  const renderContent = () => {
    switch (viewMode) {
      case "collaboration":
        return (
          <div className="flex flex-col h-full gap-2">
            <div className="shrink-0 flex items-center justify-end px-1">
              {scrollSyncToggle}
            </div>
            <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
              <OriginalColumn
                onScroll={(scrollTop, ratio) =>
                  handleScroll("original", scrollTop, ratio)
                }
                syncScrollRef={originalScrollRef}
              />
              <TranslationColumn
                workId={workId}
                onScroll={(scrollTop, ratio) =>
                  handleScroll("translation", scrollTop, ratio)
                }
                syncScrollRef={translationScrollRef}
              />
              <EditingColumn
                onScroll={(scrollTop, ratio) =>
                  handleScroll("editing", scrollTop, ratio)
                }
                syncScrollRef={editingScrollRef}
              />
            </div>
          </div>
        );

      case "original":
        return (
          <div className="h-full overflow-y-auto rounded-xl bg-muted/50 p-8">
            <div className="max-w-3xl mx-auto">
              <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed text-foreground">
                {chapter?.originalContent}
              </pre>
            </div>
          </div>
        );

      case "translated":
        return (
          <div className="h-full overflow-y-auto rounded-xl bg-muted/50 p-8">
            <div className="max-w-3xl mx-auto">
              {chapter?.translatedContent ? (
                <div
                  className="prose prose-sm max-w-none text-foreground text-base leading-relaxed [&_p]:my-0 [&_p]:leading-relaxed whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(
                      chapter.editedContent || chapter.translatedContent,
                    ),
                  }}
                />
              ) : (
                <div className="text-center py-20">
                  <p className="text-muted-foreground">
                    번역된 내용이 없습니다
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case "edit":
        return (
          <div className="flex flex-col h-full gap-2">
            {/* Reference toggle + scroll sync toggle */}
            <div className="shrink-0 flex items-center justify-between px-1">
              <div className="flex gap-1 bg-muted rounded-md p-0.5">
                <button
                  onClick={() => setEditReference("translation")}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded transition-colors",
                    editReference === "translation"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  번역문 참조
                </button>
                <button
                  onClick={() => setEditReference("original")}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded transition-colors",
                    editReference === "original"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  원문 참조
                </button>
              </div>
              {scrollSyncToggle}
            </div>
            <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">
              {editReference === "original" ? (
                <OriginalColumn
                  onScroll={(scrollTop, ratio) =>
                    handleScroll("original", scrollTop, ratio)
                  }
                  syncScrollRef={originalScrollRef}
                />
              ) : (
                <TranslationColumn
                  workId={workId}
                  onScroll={(scrollTop, ratio) =>
                    handleScroll("translation", scrollTop, ratio)
                  }
                  syncScrollRef={translationScrollRef}
                />
              )}
              <EditingColumn
                onScroll={(scrollTop, ratio) =>
                  handleScroll("editing", scrollTop, ratio)
                }
                syncScrollRef={editingScrollRef}
              />
            </div>
          </div>
        );

      case "changes":
        return <TrackChangesView />;

      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <EditorToolbar />

      {/* Main Content */}
      <div className="flex-1 min-h-0 mt-4 flex gap-4">
        {/* Left Sidebar */}
        {leftSidebar && (
          <div className="w-80 shrink-0 flex flex-col min-h-0 border border-border rounded-xl bg-background overflow-hidden">
            {leftSidebar === "comments" ? (
              <CommentSidebar />
            ) : leftSidebar === "glossary" ? (
              <GlossarySidebar workId={workId} />
            ) : (
              <SnapshotPanel />
            )}
          </div>
        )}

        {/* Editor Area */}
        <div
          className={cn(
            "flex-1 min-w-0 min-h-0",
            leftSidebar && rightSidebar
              ? ""
              : leftSidebar || rightSidebar
                ? ""
                : "",
          )}
        >
          {renderContent()}
        </div>

        {/* Right Sidebar - Activity Log */}
        {rightSidebar && (
          <div className="w-72 shrink-0 flex flex-col min-h-0 border border-border rounded-xl bg-background overflow-hidden">
            <ActivitySidebar />
          </div>
        )}
      </div>
    </div>
  );
}
