"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

export interface GlossaryItem {
  id: string;
  original: string;
  translated: string;
  category: string | null;
  note: string | null;
}

export interface Character {
  id: string;
  nameOriginal: string;
  nameKorean: string;
  nameHanja: string | null;
  titles: string[];
  aliases: string[];
  personality: string | null;
  speechStyle: string | null;
  role: string;
  description: string | null;
  relationships: Record<string, string> | null;
  firstAppearChapter: number | null;
}

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  chapterStart: number;
  chapterEnd: number | null;
  eventType: string;
  importance: number;
}

interface EditorReferenceData {
  glossary: GlossaryItem[];
  characters: Character[];
  timeline: TimelineEvent[];
}

interface UseGlossaryDataResult {
  glossary: GlossaryItem[];
  characters: Character[];
  timeline: TimelineEvent[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  categoryFilter: string | null;
  setCategoryFilter: (c: string | null) => void;
  filteredGlossary: GlossaryItem[];
  filteredCharacters: Character[];
  categories: string[];
  refetch: () => Promise<void>;
}

export function useGlossaryData(workId: string): UseGlossaryDataResult {
  const [data, setData] = useState<EditorReferenceData>({
    glossary: [],
    characters: [],
    timeline: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/works/${workId}/editor-reference`);
      if (!res.ok) {
        throw new Error("데이터를 불러올 수 없습니다");
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setIsLoading(false);
    }
  }, [workId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const item of data.glossary) {
      if (item.category) cats.add(item.category);
    }
    return Array.from(cats).sort();
  }, [data.glossary]);

  const filteredGlossary = useMemo(() => {
    let items = data.glossary;

    if (categoryFilter) {
      items = items.filter((i) => i.category === categoryFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (i) =>
          i.original.toLowerCase().includes(q) ||
          i.translated.toLowerCase().includes(q) ||
          (i.note && i.note.toLowerCase().includes(q))
      );
    }

    return items;
  }, [data.glossary, searchQuery, categoryFilter]);

  const filteredCharacters = useMemo(() => {
    if (!searchQuery) return data.characters;
    const q = searchQuery.toLowerCase();
    return data.characters.filter(
      (c) =>
        c.nameKorean.toLowerCase().includes(q) ||
        c.nameOriginal.toLowerCase().includes(q) ||
        (c.nameHanja && c.nameHanja.toLowerCase().includes(q)) ||
        c.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [data.characters, searchQuery]);

  return {
    glossary: data.glossary,
    characters: data.characters,
    timeline: data.timeline,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    filteredGlossary,
    filteredCharacters,
    categories,
    refetch: fetchData,
  };
}
