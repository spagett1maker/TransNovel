"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import DiffMatchPatch from "diff-match-patch";

export interface ChangeChunk {
  type: "equal" | "insert" | "delete";
  text: string;
  /** null = undecided, "accepted" = keep this change, "rejected" = undo this change */
  decision: "accepted" | "rejected" | null;
}

interface TrackChangesResult {
  chunks: ChangeChunk[];
  stats: { added: number; deleted: number; changes: number };
  acceptChange: (index: number) => void;
  rejectChange: (index: number) => void;
  acceptAll: () => void;
  rejectAll: () => void;
  /** Get the resulting text after all decisions (plain text) */
  getResultText: () => string;
  /** Get the resulting text as HTML paragraphs for TipTap */
  getResultHtml: () => string;
  /** Has any undecided change remaining? */
  hasUndecided: boolean;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

export function useTrackChanges(
  originalHtml: string | null,
  editedHtml: string | null
): TrackChangesResult {
  const dmp = useMemo(() => new DiffMatchPatch(), []);

  const originalText = useMemo(
    () => stripHtml(originalHtml || ""),
    [originalHtml]
  );
  const editedText = useMemo(
    () => stripHtml(editedHtml || ""),
    [editedHtml]
  );

  // Compute diffs
  const computedChunks = useMemo(() => {
    if (!originalText && !editedText) return [];

    const diffs = dmp.diff_main(originalText, editedText);
    dmp.diff_cleanupSemantic(diffs);

    return diffs.map(([op, text]): ChangeChunk => ({
      type: op === 0 ? "equal" : op === 1 ? "insert" : "delete",
      text,
      decision: op === 0 ? "accepted" : null, // equal chunks are always accepted
    }));
  }, [dmp, originalText, editedText]);

  const [chunks, setChunks] = useState<ChangeChunk[]>(computedChunks);

  // Sync chunks when inputs change (useEffect, not useMemo)
  useEffect(() => {
    setChunks(computedChunks);
  }, [computedChunks]);

  const stats = useMemo(() => {
    let added = 0;
    let deleted = 0;
    let changes = 0;

    for (const chunk of chunks) {
      if (chunk.type === "insert") {
        added += chunk.text.length;
        changes++;
      } else if (chunk.type === "delete") {
        deleted += chunk.text.length;
        changes++;
      }
    }

    return { added, deleted, changes };
  }, [chunks]);

  // Accept = keep the change as-is (insert stays, delete stays removed)
  const acceptChange = useCallback((index: number) => {
    setChunks((prev) =>
      prev.map((chunk, i) =>
        i === index ? { ...chunk, decision: "accepted" as const } : chunk
      )
    );
  }, []);

  // Reject = undo the change (insert removed, delete restored)
  const rejectChange = useCallback((index: number) => {
    setChunks((prev) =>
      prev.map((chunk, i) =>
        i === index ? { ...chunk, decision: "rejected" as const } : chunk
      )
    );
  }, []);

  const acceptAll = useCallback(() => {
    setChunks((prev) =>
      prev.map((chunk) =>
        chunk.decision === null
          ? { ...chunk, decision: "accepted" as const }
          : chunk
      )
    );
  }, []);

  const rejectAll = useCallback(() => {
    setChunks((prev) =>
      prev.map((chunk) =>
        chunk.decision === null
          ? { ...chunk, decision: "rejected" as const }
          : chunk
      )
    );
  }, []);

  const getResultText = useCallback(() => {
    return chunks
      .filter((c) => {
        if (c.type === "equal") return true;
        // Accepted insert → keep, rejected insert → skip
        if (c.type === "insert") return c.decision === "accepted";
        // Accepted delete → skip (text stays deleted), rejected delete → restore
        if (c.type === "delete") return c.decision === "rejected";
        return false;
      })
      .map((c) => c.text)
      .join("");
  }, [chunks]);

  const getResultHtml = useCallback(() => {
    const text = getResultText();
    if (!text) return "";
    return text
      .split("\n\n")
      .map((para) => {
        const lines = para.split("\n").join("<br>");
        return `<p>${lines || "<br>"}</p>`;
      })
      .join("");
  }, [getResultText]);

  const hasUndecided = useMemo(
    () => chunks.some((c) => c.decision === null),
    [chunks]
  );

  return {
    chunks,
    stats,
    acceptChange,
    rejectChange,
    acceptAll,
    rejectAll,
    getResultText,
    getResultHtml,
    hasUndecided,
  };
}
