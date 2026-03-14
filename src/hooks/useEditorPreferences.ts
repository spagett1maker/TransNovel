"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { UserPreferences } from "@/lib/validations/preferences";

const LS_BG = "editor-bg-color";
const LS_COLORS = "editor-saved-colors";
const LS_FONT = "editor-font-size";
const LS_LINE_HEIGHT = "editor-line-height";
const LS_PADDING = "editor-padding";
const LS_PARA_MARKS = "editor-paragraph-marks";

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_LINE_HEIGHT = 1.8;
const DEFAULT_PADDING = 40;

function readLocal(): UserPreferences {
  if (typeof window === "undefined") return {};
  return {
    editorBgColor: localStorage.getItem(LS_BG) || undefined,
    savedColors: (() => {
      try { return JSON.parse(localStorage.getItem(LS_COLORS) || "[]"); }
      catch { return []; }
    })(),
    editorFontSize: parseInt(localStorage.getItem(LS_FONT) || "", 10) || undefined,
    editorLineHeight: parseFloat(localStorage.getItem(LS_LINE_HEIGHT) || "") || undefined,
    editorPadding: parseInt(localStorage.getItem(LS_PADDING) || "", 10) ?? undefined,
    showParagraphMarks: localStorage.getItem(LS_PARA_MARKS) === "true" ? true : undefined,
  };
}

function writeLocal(prefs: UserPreferences) {
  if (typeof window === "undefined") return;
  if (prefs.editorBgColor !== undefined) {
    if (prefs.editorBgColor) localStorage.setItem(LS_BG, prefs.editorBgColor);
    else localStorage.removeItem(LS_BG);
  }
  if (prefs.savedColors !== undefined) {
    localStorage.setItem(LS_COLORS, JSON.stringify(prefs.savedColors));
  }
  if (prefs.editorFontSize !== undefined) {
    localStorage.setItem(LS_FONT, String(prefs.editorFontSize));
  }
  if (prefs.editorLineHeight !== undefined) {
    localStorage.setItem(LS_LINE_HEIGHT, String(prefs.editorLineHeight));
  }
  if (prefs.editorPadding !== undefined) {
    localStorage.setItem(LS_PADDING, String(prefs.editorPadding));
  }
  if (prefs.showParagraphMarks !== undefined) {
    localStorage.setItem(LS_PARA_MARKS, String(prefs.showParagraphMarks));
  }
}

export function useEditorPreferences() {
  const [editorBgColor, setEditorBgColorState] = useState(() => readLocal().editorBgColor || "");
  const [savedColors, setSavedColorsState] = useState<string[]>(() => readLocal().savedColors || []);
  const [editorFontSize, setEditorFontSizeState] = useState(() => readLocal().editorFontSize || DEFAULT_FONT_SIZE);
  const [editorLineHeight, setEditorLineHeightState] = useState(() => readLocal().editorLineHeight || DEFAULT_LINE_HEIGHT);
  const [editorPadding, setEditorPaddingState] = useState(() => readLocal().editorPadding ?? DEFAULT_PADDING);
  const [showParagraphMarks, setShowParagraphMarksState] = useState(() => readLocal().showParagraphMarks || false);
  const [isLoading, setIsLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // DB에서 로드
  useEffect(() => {
    fetch("/api/me/preferences")
      .then((r) => r.ok ? r.json() : null)
      .then((data: UserPreferences | null) => {
        if (data) {
          if (data.editorBgColor !== undefined) setEditorBgColorState(data.editorBgColor || "");
          if (data.savedColors) setSavedColorsState(data.savedColors);
          if (data.editorFontSize) setEditorFontSizeState(data.editorFontSize);
          if (data.editorLineHeight) setEditorLineHeightState(data.editorLineHeight);
          if (data.editorPadding !== undefined) setEditorPaddingState(data.editorPadding);
          if (data.showParagraphMarks !== undefined) setShowParagraphMarksState(data.showParagraphMarks);
          writeLocal(data);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  // DB에 저장 (debounce)
  const syncToDb = useCallback((partial: UserPreferences) => {
    writeLocal(partial);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch("/api/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      }).catch(() => {});
    }, 500);
  }, []);

  const setEditorBgColor = useCallback((value: string) => {
    setEditorBgColorState(value);
    syncToDb({ editorBgColor: value });
  }, [syncToDb]);

  const saveCustomColor = useCallback((value: string) => {
    if (!value) return;
    setSavedColorsState((prev) => {
      const next = [value, ...prev.filter((c) => c !== value)].slice(0, 8);
      syncToDb({ savedColors: next });
      return next;
    });
  }, [syncToDb]);

  const removeCustomColor = useCallback((value: string) => {
    setSavedColorsState((prev) => {
      const next = prev.filter((c) => c !== value);
      syncToDb({ savedColors: next });
      return next;
    });
  }, [syncToDb]);

  const setEditorFontSize = useCallback((size: number) => {
    const clamped = Math.max(12, Math.min(24, size));
    setEditorFontSizeState(clamped);
    syncToDb({ editorFontSize: clamped });
  }, [syncToDb]);

  const setEditorLineHeight = useCallback((value: number) => {
    const clamped = Math.max(1, Math.min(3, Math.round(value * 10) / 10));
    setEditorLineHeightState(clamped);
    syncToDb({ editorLineHeight: clamped });
  }, [syncToDb]);

  const setEditorPadding = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(120, value));
    setEditorPaddingState(clamped);
    syncToDb({ editorPadding: clamped });
  }, [syncToDb]);

  const setShowParagraphMarks = useCallback((value: boolean) => {
    setShowParagraphMarksState(value);
    syncToDb({ showParagraphMarks: value });
  }, [syncToDb]);

  return {
    editorBgColor,
    setEditorBgColor,
    savedColors,
    saveCustomColor,
    removeCustomColor,
    editorFontSize,
    setEditorFontSize,
    editorLineHeight,
    setEditorLineHeight,
    editorPadding,
    setEditorPadding,
    showParagraphMarks,
    setShowParagraphMarks,
    isLoading,
  };
}
