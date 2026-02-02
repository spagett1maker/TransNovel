"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GENRES, SOURCE_LANGUAGES } from "@/lib/validations/work";
import { cn } from "@/lib/utils";

interface WorksFilterBarProps {
  currentTab: string;
  currentLang: string | null;
  currentGenres: string[];
}

function buildUrl(params: {
  tab?: string;
  lang?: string | null;
  genres?: string[];
}) {
  const sp = new URLSearchParams();
  if (params.tab && params.tab !== "all") sp.set("tab", params.tab);
  if (params.lang) sp.set("lang", params.lang);
  if (params.genres && params.genres.length > 0) sp.set("genres", params.genres.join(","));
  const qs = sp.toString();
  return qs ? `/works?${qs}` : "/works";
}

export function WorksFilterBar({ currentTab, currentLang, currentGenres }: WorksFilterBarProps) {
  const router = useRouter();
  const [genreOpen, setGenreOpen] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(currentGenres);
  const genreRef = useRef<HTMLDivElement>(null);

  // Sync with URL params on navigation
  useEffect(() => {
    setSelectedGenres(currentGenres);
  }, [currentGenres]);

  // Close genre dropdown on outside click
  useEffect(() => {
    if (!genreOpen) return;
    function handleClick(e: MouseEvent) {
      if (genreRef.current && !genreRef.current.contains(e.target as Node)) {
        setGenreOpen(false);
        // Apply genre changes on close
        if (JSON.stringify(selectedGenres.sort()) !== JSON.stringify(currentGenres.sort())) {
          router.push(buildUrl({ tab: currentTab, lang: currentLang, genres: selectedGenres }));
        }
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [genreOpen, selectedGenres, currentGenres, currentTab, currentLang, router]);

  const hasActiveFilters = currentLang || currentGenres.length > 0;

  function handleLangChange(lang: string | null) {
    router.push(buildUrl({ tab: currentTab, lang, genres: currentGenres }));
  }

  function handleGenreToggle(genre: string) {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  }

  function handleGenreApply() {
    setGenreOpen(false);
    router.push(buildUrl({ tab: currentTab, lang: currentLang, genres: selectedGenres }));
  }

  function handleClearAll() {
    router.push(buildUrl({ tab: currentTab }));
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Language filter */}
      <div className="relative">
        <select
          value={currentLang || ""}
          onChange={(e) => handleLangChange(e.target.value || null)}
          className={cn(
            "h-8 rounded-lg border border-border bg-background px-3 pr-8 text-sm transition-colors",
            "appearance-none cursor-pointer hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring",
            currentLang && "border-foreground/30 bg-foreground/5"
          )}
        >
          <option value="">원작 언어</option>
          {Object.entries(SOURCE_LANGUAGES).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      </div>

      {/* Genre filter */}
      <div className="relative" ref={genreRef}>
        <button
          onClick={() => setGenreOpen(!genreOpen)}
          className={cn(
            "h-8 rounded-lg border border-border bg-background px-3 text-sm transition-colors",
            "flex items-center gap-1.5 hover:bg-muted",
            currentGenres.length > 0 && "border-foreground/30 bg-foreground/5"
          )}
        >
          장르
          {currentGenres.length > 0 && (
            <span className="bg-foreground text-background text-[10px] rounded-full px-1.5 py-0.5 leading-none font-medium">
              {currentGenres.length}
            </span>
          )}
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", genreOpen && "rotate-180")} />
        </button>

        {genreOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 w-64 rounded-xl border border-border bg-background shadow-lg">
            <div className="max-h-64 overflow-y-auto p-2">
              {GENRES.map((genre) => (
                <label
                  key={genre}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={selectedGenres.includes(genre)}
                    onCheckedChange={() => handleGenreToggle(genre)}
                  />
                  <span className="text-sm">{genre}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border p-2">
              <button
                onClick={() => setSelectedGenres([])}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
              >
                초기화
              </button>
              <Button size="sm" className="h-7 text-xs" onClick={handleGenreApply}>
                적용
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Clear all filters */}
      {hasActiveFilters && (
        <button
          onClick={handleClearAll}
          className="h-8 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1.5"
        >
          <X className="h-3.5 w-3.5" />
          필터 초기화
        </button>
      )}
    </div>
  );
}
