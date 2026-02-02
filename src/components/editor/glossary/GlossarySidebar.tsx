"use client";

import { useState } from "react";
import { Search, User, BookText, ChevronDown, ChevronRight } from "lucide-react";
import { useGlossaryData, Character } from "@/hooks/useGlossaryData";
import { cn } from "@/lib/utils";

interface GlossarySidebarProps {
  workId: string;
}

const ROLE_LABELS: Record<string, string> = {
  PROTAGONIST: "주인공",
  ANTAGONIST: "적대자",
  SUPPORTING: "조연",
  MINOR: "단역",
};

const ROLE_COLORS: Record<string, string> = {
  PROTAGONIST: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  ANTAGONIST: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  SUPPORTING: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  MINOR: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function CharacterCard({ character }: { character: Character }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {character.nameKorean}
            </span>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
                ROLE_COLORS[character.role] || ROLE_COLORS.MINOR
              )}
            >
              {ROLE_LABELS[character.role] || character.role}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {character.nameOriginal}
            {character.nameHanja && ` (${character.nameHanja})`}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
          {character.aliases.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                별칭
              </span>
              <p className="text-xs">{character.aliases.join(", ")}</p>
            </div>
          )}
          {character.speechStyle && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                말투
              </span>
              <p className="text-xs">{character.speechStyle}</p>
            </div>
          )}
          {character.personality && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                성격
              </span>
              <p className="text-xs">{character.personality}</p>
            </div>
          )}
          {character.description && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                설명
              </span>
              <p className="text-xs">{character.description}</p>
            </div>
          )}
          {character.relationships &&
            Object.keys(character.relationships).length > 0 && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  관계
                </span>
                <div className="space-y-0.5 mt-0.5">
                  {Object.entries(character.relationships).map(
                    ([name, relation]) => (
                      <p key={name} className="text-xs">
                        <span className="font-medium">{name}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          — {relation}
                        </span>
                      </p>
                    )
                  )}
                </div>
              </div>
            )}
          {character.firstAppearChapter !== null && (
            <p className="text-[10px] text-muted-foreground">
              첫 등장: {character.firstAppearChapter}화
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function GlossarySidebar({ workId }: GlossarySidebarProps) {
  const [tab, setTab] = useState<"glossary" | "characters">("glossary");
  const {
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    filteredGlossary,
    filteredCharacters,
    categories,
  } = useGlossaryData(workId);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 p-3 border-b border-border">
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setTab("glossary")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded-md transition-colors",
              tab === "glossary"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BookText className="h-3.5 w-3.5" />
            용어집
          </button>
          <button
            onClick={() => setTab("characters")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded-md transition-colors",
              tab === "characters"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <User className="h-3.5 w-3.5" />
            캐릭터
          </button>
        </div>

        {/* Search */}
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="검색..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Category Filter (glossary tab only) */}
        {tab === "glossary" && categories.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            <button
              onClick={() => setCategoryFilter(null)}
              className={cn(
                "px-2 py-0.5 text-[10px] rounded-full border transition-colors",
                !categoryFilter
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              전체
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() =>
                  setCategoryFilter(categoryFilter === cat ? null : cat)
                }
                className={cn(
                  "px-2 py-0.5 text-[10px] rounded-full border transition-colors",
                  categoryFilter === cat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-10 bg-muted animate-pulse rounded-md"
              />
            ))}
          </div>
        ) : error ? (
          <p className="text-xs text-destructive text-center py-4">{error}</p>
        ) : tab === "glossary" ? (
          filteredGlossary.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {searchQuery ? "검색 결과가 없습니다" : "용어집이 비어있습니다"}
            </p>
          ) : (
            <div className="space-y-0.5">
              {filteredGlossary.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-muted-foreground truncate">
                        {item.original}
                      </span>
                      <span className="text-xs text-foreground">
                        {item.translated}
                      </span>
                    </div>
                    {item.note && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                        {item.note}
                      </p>
                    )}
                  </div>
                  {item.category && (
                    <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {item.category}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )
        ) : filteredCharacters.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {searchQuery
              ? "검색 결과가 없습니다"
              : "캐릭터 정보가 없습니다"}
          </p>
        ) : (
          <div className="space-y-2">
            {filteredCharacters.map((character) => (
              <CharacterCard key={character.id} character={character} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
