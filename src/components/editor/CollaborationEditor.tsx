"use client";

import { useRef, useCallback, useState } from "react";
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
  const { viewMode, leftSidebar, rightSidebar, chapter, editor } = useEditorContext();

  // Scroll sync refs
  const originalScrollRef = useRef<{ scrollTo: (ratio: number) => void } | null>(null);
  const translationScrollRef = useRef<{ scrollTo: (ratio: number) => void } | null>(null);
  const editingScrollRef = useRef<{ scrollTo: (ratio: number) => void } | null>(null);

  // Track which column is being scrolled to prevent feedback loops
  const [scrollingColumn, setScrollingColumn] = useState<string | null>(null);

  // Sync scroll handler
  const handleScroll = useCallback(
    (source: string, _scrollTop: number, ratio: number) => {
      if (scrollingColumn && scrollingColumn !== source) return;

      setScrollingColumn(source);

      // Sync other columns
      if (source !== "original" && originalScrollRef.current) {
        originalScrollRef.current.scrollTo(ratio);
      }
      if (source !== "translation" && translationScrollRef.current) {
        translationScrollRef.current.scrollTo(ratio);
      }
      if (source !== "editing" && editingScrollRef.current) {
        editingScrollRef.current.scrollTo(ratio);
      }

      // Reset after a short delay
      setTimeout(() => setScrollingColumn(null), 50);
    },
    [scrollingColumn]
  );

  // Render based on view mode
  const renderContent = () => {
    switch (viewMode) {
      case "collaboration":
        return (
          <div className="grid grid-cols-3 gap-4 h-full">
            <OriginalColumn
              onScroll={(scrollTop, ratio) => handleScroll("original", scrollTop, ratio)}
              syncScrollRef={originalScrollRef}
            />
            <TranslationColumn
              workId={workId}
              onScroll={(scrollTop, ratio) => handleScroll("translation", scrollTop, ratio)}
              syncScrollRef={translationScrollRef}
            />
            <EditingColumn
              onScroll={(scrollTop, ratio) => handleScroll("editing", scrollTop, ratio)}
              syncScrollRef={editingScrollRef}
            />
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
                    __html: DOMPurify.sanitize(chapter.editedContent || chapter.translatedContent),
                  }}
                />
              ) : (
                <div className="text-center py-20">
                  <p className="text-muted-foreground">번역된 내용이 없습니다</p>
                </div>
              )}
            </div>
          </div>
        );

      case "edit":
        return (
          <div className="grid grid-cols-2 gap-6 h-full">
            <OriginalColumn />
            <EditingColumn />
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
            leftSidebar && rightSidebar ? "" : leftSidebar || rightSidebar ? "" : ""
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
