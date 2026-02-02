"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Sparkles, Loader2, X, Check, RotateCcw, Copy } from "lucide-react";
import { toast } from "sonner";

interface Suggestion {
  text: string;
  reason: string;
}

interface AiImproveBubbleProps {
  editor: Editor;
  workId: string;
  chapterNum: number;
}

export function AiImproveBubble({
  editor,
  workId,
  chapterNum,
}: AiImproveBubbleProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const lastSelectionRef = useRef<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<{ selectedText: string; context: string } | null>(null);

  // Reset state and cancel pending request when selection changes
  useEffect(() => {
    const handleSelectionUpdate = () => {
      const { from, to } = editor.state.selection;
      const selKey = `${from}-${to}`;
      if (selKey !== lastSelectionRef.current) {
        lastSelectionRef.current = selKey;
        // Abort any in-flight request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        setSuggestions(null);
        setError(null);
        setIsLoading(false);
        setCopiedIndex(null);
      }
    };

    editor.on("selectionUpdate", handleSelectionUpdate);
    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate);
    };
  }, [editor]);

  const fetchSuggestions = useCallback(
    async (selectedText: string, context: string) => {
      // Abort previous request if any
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);
      setSuggestions(null);
      setCopiedIndex(null);

      try {
        const res = await fetch(
          `/api/works/${workId}/chapters/${chapterNum}/ai-improve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selectedText, context }),
            signal: controller.signal,
          }
        );

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "요청 실패");
        }

        const data = await res.json();
        setSuggestions(data.suggestions || []);
      } catch (err) {
        // Ignore abort errors
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "오류 발생");
      } finally {
        setIsLoading(false);
      }
    },
    [workId, chapterNum]
  );

  const handleImprove = useCallback(async () => {
    const { from, to } = editor.state.selection;
    if (from === to) return;

    const selectedText = editor.state.doc.textBetween(from, to, " ");
    if (!selectedText.trim()) return;

    // Get surrounding context
    const docSize = editor.state.doc.content.size;
    const contextBefore = editor.state.doc.textBetween(
      Math.max(0, from - 200),
      from,
      " "
    );
    const contextAfter = editor.state.doc.textBetween(
      to,
      Math.min(docSize, to + 200),
      " "
    );
    const context =
      contextBefore +
      "[SELECTED]" +
      selectedText +
      "[/SELECTED]" +
      contextAfter;

    lastRequestRef.current = { selectedText, context };
    await fetchSuggestions(selectedText, context);
  }, [editor, fetchSuggestions]);

  const handleRetry = useCallback(async () => {
    if (lastRequestRef.current) {
      await fetchSuggestions(
        lastRequestRef.current.selectedText,
        lastRequestRef.current.context
      );
    }
  }, [fetchSuggestions]);

  const applySuggestion = useCallback(
    (text: string) => {
      editor
        .chain()
        .focus()
        .deleteSelection()
        .insertContent(text)
        .run();
      setSuggestions(null);
      toast.success("표현이 적용되었습니다");
    },
    [editor]
  );

  const copySuggestion = useCallback(
    (text: string, index: number) => {
      navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      toast.success("클립보드에 복사되었습니다");
      setTimeout(() => setCopiedIndex(null), 2000);
    },
    []
  );

  const dismiss = useCallback(() => {
    setSuggestions(null);
    setError(null);
    setIsLoading(false);
    setCopiedIndex(null);
  }, []);

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e }) => {
        const { from, to } = e.state.selection;
        return from !== to;
      }}
    >
      <div className="bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
        {/* Initial state: just the button */}
        {!isLoading && !suggestions && !error && (
          <button
            onClick={handleImprove}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            AI 표현 개선
          </button>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
            <span className="text-xs text-muted-foreground">
              대안 표현 생성 중...
            </span>
            <button
              onClick={() => {
                abortControllerRef.current?.abort();
                setIsLoading(false);
              }}
              className="ml-1 p-0.5 rounded hover:bg-muted text-muted-foreground"
              title="취소"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-3 py-2 max-w-[300px]">
            <div className="flex items-center gap-2">
              <span className="text-xs text-destructive flex-1">{error}</span>
              <button
                onClick={handleRetry}
                className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0"
                title="다시 시도"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
              <button
                onClick={dismiss}
                className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0"
                title="닫기"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* Suggestions */}
        {suggestions && suggestions.length > 0 && (
          <div className="max-w-[400px]">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/50">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-violet-500" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  AI 제안
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={handleRetry}
                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                  title="다시 생성"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
                <button
                  onClick={dismiss}
                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                  title="닫기"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="divide-y divide-border">
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className="group relative hover:bg-muted/50 transition-colors"
                >
                  <button
                    onClick={() => applySuggestion(s.text)}
                    className="w-full text-left px-3 py-2.5 pr-8"
                  >
                    <p className="text-xs font-medium text-foreground leading-relaxed">
                      {s.text}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {s.reason}
                    </p>
                  </button>
                  <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copySuggestion(s.text, i);
                      }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground"
                      title="복사"
                    >
                      {copiedIndex === i ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      onClick={() => applySuggestion(s.text)}
                      className="p-1 rounded hover:bg-muted text-violet-500"
                      title="적용"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-3 py-1.5 border-t border-border bg-muted/30">
              <p className="text-[10px] text-muted-foreground text-center">
                클릭하여 적용 · 호버하여 복사
              </p>
            </div>
          </div>
        )}

        {suggestions && suggestions.length === 0 && (
          <div className="px-3 py-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex-1">
              적합한 대안을 찾지 못했습니다
            </span>
            <button
              onClick={handleRetry}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
              title="다시 시도"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
            <button
              onClick={dismiss}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
              title="닫기"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </BubbleMenu>
  );
}
