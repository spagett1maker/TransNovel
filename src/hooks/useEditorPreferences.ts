"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { UserPreferences } from "@/lib/validations/preferences";

const LS_BG = "editor-bg-color";
const LS_COLORS = "editor-saved-colors";
const LS_FONT = "editor-font-size";

const DEFAULT_FONT_SIZE = 16;

function readLocal(): UserPreferences {
  if (typeof window === "undefined") return {};
  return {
    editorBgColor: localStorage.getItem(LS_BG) || undefined,
    savedColors: (() => {
      try { return JSON.parse(localStorage.getItem(LS_COLORS) || "[]"); }
      catch { return []; }
    })(),
    editorFontSize: parseInt(localStorage.getItem(LS_FONT) || "", 10) || undefined,
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
}

export function useEditorPreferences() {
  const [editorBgColor, setEditorBgColorState] = useState(() => readLocal().editorBgColor || "");
  const [savedColors, setSavedColorsState] = useState<string[]>(() => readLocal().savedColors || []);
  const [editorFontSize, setEditorFontSizeState] = useState(() => readLocal().editorFontSize || DEFAULT_FONT_SIZE);
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

  return {
    editorBgColor,
    setEditorBgColor,
    savedColors,
    saveCustomColor,
    removeCustomColor,
    editorFontSize,
    setEditorFontSize,
    isLoading,
  };
}
