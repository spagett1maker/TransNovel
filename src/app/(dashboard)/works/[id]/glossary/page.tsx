"use client";

import { ArrowLeft, BookOpen, Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

interface GlossaryItem {
  id: string;
  original: string;
  translated: string;
  category: string | null;
  note: string | null;
}

const CATEGORIES = [
  { value: "character", label: "인명" },
  { value: "place", label: "지명" },
  { value: "skill", label: "스킬/무공" },
  { value: "item", label: "아이템" },
  { value: "organization", label: "조직/문파" },
  { value: "other", label: "기타" },
];

export default function GlossaryPage() {
  const params = useParams();
  const workId = params.id as string;

  const [glossary, setGlossary] = useState<GlossaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    original: "",
    translated: "",
    category: "",
    note: "",
  });

  useEffect(() => {
    fetchGlossary();
  }, [workId]);

  async function fetchGlossary() {
    try {
      const response = await fetch(`/api/works/${workId}/glossary`);
      if (response.ok) {
        const data = await response.json();
        setGlossary(data);
      }
    } catch (error) {
      console.error("Failed to fetch glossary:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAddItem() {
    if (!newItem.original || !newItem.translated) {
      toast.error("원문과 번역어를 입력해주세요.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/works/${workId}/glossary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newItem),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "등록에 실패했습니다.");
      }

      const item = await response.json();
      setGlossary((prev) => [...prev, item].sort((a, b) => a.original.localeCompare(b.original)));
      setNewItem({ original: "", translated: "", category: "", note: "" });
      setIsDialogOpen(false);
      toast.success("용어가 등록되었습니다.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "등록에 실패했습니다."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    try {
      const response = await fetch(
        `/api/works/${workId}/glossary/${itemId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("삭제에 실패했습니다.");
      }

      setGlossary((prev) => prev.filter((item) => item.id !== itemId));
      toast.success("용어가 삭제되었습니다.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "삭제에 실패했습니다."
      );
    }
  }

  const getCategoryLabel = (category: string | null) => {
    if (!category) return null;
    return CATEGORIES.find((c) => c.value === category)?.label || category;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/works/${workId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">용어집 관리</h1>
          <p className="text-gray-500">
            번역 시 일관되게 사용할 용어를 등록합니다
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              용어 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>용어 추가</DialogTitle>
              <DialogDescription>
                번역 시 사용할 용어를 등록합니다
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="original">원문 *</Label>
                  <Input
                    id="original"
                    placeholder="林动"
                    value={newItem.original}
                    onChange={(e) =>
                      setNewItem({ ...newItem, original: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="translated">번역어 *</Label>
                  <Input
                    id="translated"
                    placeholder="임동"
                    value={newItem.translated}
                    onChange={(e) =>
                      setNewItem({ ...newItem, translated: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">분류</Label>
                <Select
                  value={newItem.category}
                  onValueChange={(value) =>
                    setNewItem({ ...newItem, category: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="분류 선택" />
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
                  placeholder="추가 설명 (선택)"
                  value={newItem.note}
                  onChange={(e) =>
                    setNewItem({ ...newItem, note: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                취소
              </Button>
              <Button onClick={handleAddItem} disabled={isSaving}>
                {isSaving && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                추가
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-400" />
            <p className="mt-2 text-gray-500">용어집 불러오는 중...</p>
          </CardContent>
        </Card>
      ) : glossary.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BookOpen className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-4 text-lg font-medium">
              등록된 용어가 없습니다
            </h3>
            <p className="mt-2 text-gray-500">
              번역 시 일관되게 사용할 용어를 등록해보세요
            </p>
            <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              첫 용어 추가
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>용어 목록</CardTitle>
            <CardDescription>
              총 {glossary.length}개의 용어가 등록되어 있습니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>원문</TableHead>
                  <TableHead>번역어</TableHead>
                  <TableHead>분류</TableHead>
                  <TableHead>메모</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {glossary.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.original}
                    </TableCell>
                    <TableCell>{item.translated}</TableCell>
                    <TableCell>
                      {item.category && (
                        <Badge variant="outline">
                          {getCategoryLabel(item.category)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {item.note}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
