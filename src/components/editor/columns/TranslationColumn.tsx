"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { useEditorContext } from "../EditorProvider";

interface TranslationColumnProps {
  workId: string;
  onScroll?: (scrollTop: number, scrollHeight: number) => void;
  syncScrollRef?: React.RefObject<{ scrollTo: (ratio: number) => void } | null>;
  onTextSelect?: (text: string) => void;
}

export function TranslationColumn({
  workId,
  onScroll,
  syncScrollRef,
  onTextSelect,
}: TranslationColumnProps) {
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

  const handleMouseUp = () => {
    if (onTextSelect) {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        onTextSelect(selection.toString().trim());
      }
    }
  };

  if (!chapter) return null;

  const hasTranslation = ["TRANSLATED", "EDITED", "APPROVED", "REVIEWING"].includes(
    chapter.status
  );
  const translatedText = chapter.translatedContent;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-3 shrink-0 px-1">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          AI 번역문
        </h2>
        {translatedText && (
          <span className="text-xs text-muted-foreground">
            참조용 (읽기 전용)
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        onMouseUp={handleMouseUp}
        className="flex-1 min-h-0 overflow-y-auto rounded-xl bg-muted/50 p-6"
      >
        {translatedText ? (
          <div
            className="prose prose-sm max-w-none text-foreground text-sm leading-relaxed [&_p]:my-0 [&_p]:leading-relaxed whitespace-pre-wrap selection:bg-blue-200 selection:text-foreground"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(translatedText),
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground mb-4">
                아직 번역되지 않았습니다
              </p>
              {hasTranslation ? null : (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/works/${workId}/translate`}>번역 시작</Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
