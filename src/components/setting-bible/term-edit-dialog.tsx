"use client";

import { useState, useEffect } from "react";
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
import { TermCategory } from "@prisma/client";

interface Term {
  id: string;
  original: string;
  translated: string;
  category: TermCategory;
  note: string | null;
  context: string | null;
}

interface TermEditDialogProps {
  term: Term | null;
  workId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const CATEGORIES: { value: TermCategory; label: string }[] = [
  { value: "CHARACTER", label: "인명" },
  { value: "PLACE", label: "지명" },
  { value: "ORGANIZATION", label: "조직/문파" },
  { value: "RANK_TITLE", label: "직위/제도" },
  { value: "SKILL_TECHNIQUE", label: "무공/스킬" },
  { value: "ITEM", label: "아이템" },
  { value: "OTHER", label: "기타" },
];

export function TermEditDialog({
  term,
  workId,
  open,
  onOpenChange,
  onSaved,
}: TermEditDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    translated: "",
    category: "OTHER" as TermCategory,
    note: "",
    context: "",
  });

  // term이 변경될 때 폼 데이터 초기화
  useEffect(() => {
    if (term) {
      setFormData({
        translated: term.translated,
        category: term.category,
        note: term.note || "",
        context: term.context || "",
      });
    }
  }, [term]);

  async function handleSave() {
    if (!term) return;

    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/works/${workId}/setting-bible/terms/${term.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            translated: formData.translated,
            category: formData.category,
            note: formData.note || null,
            context: formData.context || null,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "저장에 실패했습니다.");
      }

      toast.success("용어가 저장되었습니다.");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!term) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>용어 수정</DialogTitle>
          <DialogDescription>
            <span className="font-medium">{term.original}</span>의 번역을 수정합니다
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="translated">번역어 *</Label>
            <Input
              id="translated"
              value={formData.translated}
              onChange={(e) =>
                setFormData({ ...formData, translated: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">분류</Label>
            <Select
              value={formData.category}
              onValueChange={(value) =>
                setFormData({ ...formData, category: value as TermCategory })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">메모</Label>
            <Textarea
              id="note"
              value={formData.note}
              onChange={(e) =>
                setFormData({ ...formData, note: e.target.value })
              }
              placeholder="번역 시 참고사항"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="context">사용 맥락</Label>
            <Textarea
              id="context"
              value={formData.context}
              onChange={(e) =>
                setFormData({ ...formData, context: e.target.value })
              }
              placeholder="이 용어가 사용되는 맥락"
              rows={2}
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
