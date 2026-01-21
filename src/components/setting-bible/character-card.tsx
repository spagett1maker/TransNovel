"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={roleConfig.variant} className="gap-1">
                {roleConfig.icon}
                {roleConfig.label}
              </Badge>
              {character.firstAppearance && (
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
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onEdit(character)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:text-red-600"
                  onClick={() => onDelete(character.id)}
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
  );
}
