"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CharacterRole } from "@prisma/client";
import { Edit2, Trash2, User, Crown, Skull, Users } from "lucide-react";

interface Character {
  id: string;
  nameOriginal: string;
  nameKorean: string;
  nameHanja: string | null;
  titles: string[];
  aliases: string[];
  personality: string | null;
  speechStyle: string | null;
  role: CharacterRole;
  description: string | null;
  relationships: Record<string, string> | null;
  firstAppearance: number | null;
  isConfirmed: boolean;
}

interface CharacterCardProps {
  character: Character;
  onEdit?: (character: Character) => void;
  onDelete?: (id: string) => void;
  readOnly?: boolean;
}

const ROLE_CONFIG: Record<CharacterRole, {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: React.ReactNode;
}> = {
  PROTAGONIST: {
    label: "주인공",
    variant: "default",
    icon: <Crown className="h-3 w-3" />,
  },
  ANTAGONIST: {
    label: "적대자",
    variant: "destructive",
    icon: <Skull className="h-3 w-3" />,
  },
  SUPPORTING: {
    label: "조연",
    variant: "secondary",
    icon: <Users className="h-3 w-3" />,
  },
  MINOR: {
    label: "단역",
    variant: "outline",
    icon: <User className="h-3 w-3" />,
  },
};

export function CharacterCard({ character, onEdit, onDelete, readOnly = false }: CharacterCardProps) {
  const roleConfig = ROLE_CONFIG[character.role];
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <>
      <Card
        className="group hover:shadow-md transition-shadow cursor-pointer"
        onClick={() => setDetailOpen(true)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={roleConfig.variant} className="gap-1">
                  {roleConfig.icon}
                  {roleConfig.label}
                </Badge>
                {character.firstAppearance != null && (
                  <span className="text-xs text-muted-foreground">
                    {character.firstAppearance}화 등장
                  </span>
                )}
              </div>
              <CardTitle className="text-lg leading-tight">
                {character.nameKorean}
                {character.nameHanja && (
                  <span className="text-muted-foreground font-normal ml-1">
                    ({character.nameHanja})
                  </span>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {character.nameOriginal}
              </p>
            </div>
            {!readOnly && (
              <div
                className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                {onEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onEdit(character)}
                    aria-label="인물 수정"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive/80"
                    onClick={() => onDelete(character.id)}
                    aria-label="인물 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {/* 칭호 & 별명 */}
          {(character.titles.length > 0 || character.aliases.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {character.titles.map((title, i) => (
                <Badge key={`title-${i}`} variant="outline" className="text-xs">
                  {title}
                </Badge>
              ))}
              {character.aliases.map((alias, i) => (
                <Badge key={`alias-${i}`} variant="secondary" className="text-xs">
                  {alias}
                </Badge>
              ))}
            </div>
          )}

          {/* 설명 */}
          {character.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {character.description}
            </p>
          )}

          {/* 성격 & 말투 */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {character.personality && (
              <div>
                <span className="text-muted-foreground">성격:</span>{" "}
                <span className="line-clamp-1">{character.personality}</span>
              </div>
            )}
            {character.speechStyle && (
              <div>
                <span className="text-muted-foreground">말투:</span>{" "}
                <span className="line-clamp-1">{character.speechStyle}</span>
              </div>
            )}
          </div>

          {/* 관계 */}
          {character.relationships && Object.keys(character.relationships).length > 0 && (
            <div className="text-xs">
              <span className="text-muted-foreground">관계:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(character.relationships).slice(0, 3).map(([name, relation]) => (
                  <span key={name} className="px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                    {name}: {relation}
                  </span>
                ))}
                {Object.keys(character.relationships).length > 3 && (
                  <span className="text-muted-foreground">
                    +{Object.keys(character.relationships).length - 3}
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 상세 다이얼로그 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={roleConfig.variant} className="gap-1">
                {roleConfig.icon}
                {roleConfig.label}
              </Badge>
              {character.firstAppearance != null && (
                <span className="text-xs text-muted-foreground">
                  {character.firstAppearance}화 등장
                </span>
              )}
            </div>
            <DialogTitle className="text-xl">
              {character.nameKorean}
              {character.nameHanja && (
                <span className="text-muted-foreground font-normal ml-2">
                  ({character.nameHanja})
                </span>
              )}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {character.nameOriginal}
            </p>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* 칭호 & 별명 */}
            {(character.titles.length > 0 || character.aliases.length > 0) && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">칭호 / 별명</h4>
                <div className="flex flex-wrap gap-1.5">
                  {character.titles.map((title, i) => (
                    <Badge key={`title-${i}`} variant="outline" className="text-xs">
                      {title}
                    </Badge>
                  ))}
                  {character.aliases.map((alias, i) => (
                    <Badge key={`alias-${i}`} variant="secondary" className="text-xs">
                      {alias}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* 설명 */}
            {character.description && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">설명</h4>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {character.description}
                </p>
              </div>
            )}

            {/* 성격 */}
            {character.personality && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">성격</h4>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {character.personality}
                </p>
              </div>
            )}

            {/* 말투 */}
            {character.speechStyle && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">말투</h4>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {character.speechStyle}
                </p>
              </div>
            )}

            {/* 관계 */}
            {character.relationships && Object.keys(character.relationships).length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">관계</h4>
                <div className="space-y-1.5">
                  {Object.entries(character.relationships).map(([name, relation]) => (
                    <div key={name} className="flex gap-2 text-sm">
                      <span className="font-medium shrink-0">{name}</span>
                      <span className="text-muted-foreground">{relation}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
