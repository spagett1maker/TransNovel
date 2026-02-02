"use client";

import { useRef, useEffect } from "react";
import { EditorContent } from "@tiptap/react";
import { useEditorContext } from "../EditorProvider";
import { AiImproveBubble } from "../ai/AiImproveBubble";

interface EditingColumnProps {
  onScroll?: (scrollTop: number, scrollHeight: number) => void;
  syncScrollRef?: React.RefObject<{ scrollTo: (ratio: number) => void } | null>;
}

export function EditingColumn({ onScroll, syncScrollRef }: EditingColumnProps) {
  const { editor, chapter, work, isEditable } = useEditorContext();
  const containerRef = useRef<HTMLDivElement>(null);

  // Expose scroll method for sync
  useEffect(() => {
    if (syncScrollRef && containerRef.current) {
      (syncScrollRef as React.MutableRefObject<{ scrollTo: (ratio: number) => void } | null>).current = {
        scrollTo: (ratio: number) => {
          if (containerRef.current) {
            const maxScroll = containerRef.current.scrollHeight - containerRef.current.clientHeight;
            containerRef.current.scrollTop = maxScroll * ratio;
          }
        },
      };
    }
  }, [syncScrollRef]);

  const handleScroll = () => {
    if (containerRef.current && onScroll) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const maxScroll = scrollHeight - clientHeight;
      const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
      onScroll(scrollTop, ratio);
    }
  };

  // Character count from editor
  const charCount = editor?.storage.characterCount?.characters?.() ??
    editor?.getText().length ?? 0;

  if (!chapter) return null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-3 shrink-0 px-1">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          {isEditable ? "윤문 편집" : "윤문본 (읽기전용)"}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {charCount.toLocaleString()}자
        </span>
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto rounded-xl bg-background border border-border p-6 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all"
      >
        <EditorContent
          editor={editor}
          className="min-h-full [&_.ProseMirror]:min-h-full [&_.ProseMirror]:outline-none [&_.ProseMirror_p]:my-0 [&_.ProseMirror_p]:leading-relaxed [&_.ProseMirror]:text-sm [&_.ProseMirror]:whitespace-pre-wrap"
        />
        {editor && work && chapter && isEditable && (
          <AiImproveBubble
            editor={editor}
            workId={work.id}
            chapterNum={chapter.number}
          />
        )}
      </div>
    </div>
  );
}
