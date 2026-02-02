"use client";

import { useRef, useEffect } from "react";
import { useEditorContext } from "../EditorProvider";

interface OriginalColumnProps {
  onScroll?: (scrollTop: number, scrollHeight: number) => void;
  syncScrollRef?: React.RefObject<{ scrollTo: (ratio: number) => void } | null>;
}

export function OriginalColumn({ onScroll, syncScrollRef }: OriginalColumnProps) {
  const { chapter } = useEditorContext();
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

  if (!chapter) return null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-3 shrink-0 px-1">
        원문
      </h2>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto rounded-xl bg-muted/50 p-6"
      >
        <div className="prose prose-sm max-w-none">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground bg-transparent p-0 m-0">
            {chapter.originalContent}
          </pre>
        </div>
      </div>
    </div>
  );
}
