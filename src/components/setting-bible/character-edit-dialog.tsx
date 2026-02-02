"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CharacterRole } from "@prisma/client";

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
}

interface CharacterEditDialogProps {
  character: Character | null;
  workId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const ROLES: { value: CharacterRole; label: string }[] = [
  { value: "PROTAGONIST", label: "주인공" },
  { value: "ANTAGONIST", label: "적대자" },
  { value: "SUPPORTING", label: "조연" },
  { value: "MINOR", label: "단역" },
];

export function CharacterEditDialog({
  character,
  workId,
  open,
  onOpenChange,
  onSaved,
}: CharacterEditDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    nameKorean: character?.nameKorean || "",
    nameHanja: character?.nameHanja || "",
    titles: character?.titles.join(", ") || "",
    aliases: character?.aliases.join(", ") || "",
    personality: character?.personality || "",
    speechStyle: character?.speechStyle || "",
    role: character?.role || "SUPPORTING",
    description: character?.description || "",
  });

  // character가 변경될 때 폼 데이터 초기화
  useState(() => {
    if (character) {
      setFormData({
        nameKorean: character.nameKorean,
        nameHanja: character.nameHanja || "",
        titles: character.titles.join(", "),
        aliases: character.aliases.join(", "),
        personality: character.personality || "",
        speechStyle: character.speechStyle || "",
        role: character.role,
        description: character.description || "",
      });
    }
  });

  async function handleSave() {
    if (!character) return;

    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/works/${workId}/setting-bible/characters/${character.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nameKorean: formData.nameKorean,
            nameHanja: formData.nameHanja || null,
            titles: formData.titles
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            aliases: formData.aliases
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            personality: formData.personality || null,
            speechStyle: formData.speechStyle || null,
            role: formData.role,
            description: formData.description || null,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "저장에 실패했습니다.");
      }

      toast.success("인물 정보가 저장되었습니다.");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!character) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>인물 수정</DialogTitle>
          <DialogDescription>
            {character.nameOriginal}의 정보를 수정합니다
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nameKorean">한국어 이름 *</Label>
              <Input
                id="nameKorean"
                value={formData.nameKorean}
                onChange={(e) =>
                  setFormData({ ...formData, nameKorean: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nameHanja">한자 표기</Label>
              <Input
                id="nameHanja"
                value={formData.nameHanja}
                onChange={(e) =>
                  setFormData({ ...formData, nameHanja: e.target.value })
                }
                placeholder="林动"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">역할</Label>
            <Select
              value={formData.role}
              onValueChange={(value) =>
                setFormData({ ...formData, role: value as CharacterRole })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="titles">칭호 (쉼표로 구분)</Label>
            <Input
              id="titles"
              value={formData.titles}
              onChange={(e) =>
                setFormData({ ...formData, titles: e.target.value })
              }
              placeholder="무림맹주, 천하제일검"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="aliases">별명 (쉼표로 구분)</Label>
            <Input
              id="aliases"
              value={formData.aliases}
              onChange={(e) =>
                setFormData({ ...formData, aliases: e.target.value })
              }
              placeholder="검신, 백발신선"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="personality">성격</Label>
              <Textarea
                id="personality"
                value={formData.personality}
                onChange={(e) =>
                  setFormData({ ...formData, personality: e.target.value })
                }
                placeholder="냉철하고 과묵함"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="speechStyle">말투</Label>
              <Textarea
                id="speechStyle"
                value={formData.speechStyle}
                onChange={(e) =>
                  setFormData({ ...formData, speechStyle: e.target.value })
                }
                placeholder="~하오체, 존댓말 사용"
                rows={2}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">설명</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="인물에 대한 상세 설명"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
