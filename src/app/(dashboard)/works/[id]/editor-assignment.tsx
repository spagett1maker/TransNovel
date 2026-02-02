"use client";

import { Loader2, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Editor {
  id: string;
  name: string;
  email?: string;
}

interface EditorAssignmentProps {
  workId: string;
  currentEditor: Editor | null;
}

export function EditorAssignment({
  workId,
  currentEditor,
}: EditorAssignmentProps) {
  const router = useRouter();
  const [editors, setEditors] = useState<Editor[]>([]);
  const [selectedEditorId, setSelectedEditorId] = useState<string>(
    currentEditor?.id || ""
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  useEffect(() => {
    fetchEditors();
  }, []);

  async function fetchEditors() {
    try {
      const response = await fetch("/api/users/editors");
      if (response.ok) {
        const data = await response.json();
        setEditors(data);
      }
    } catch (error) {
      console.error("Failed to fetch editors:", error);
      toast.error("윤문가 목록을 불러오지 못했습니다");
    } finally {
      setIsFetching(false);
    }
  }

  async function handleAssign() {
    if (!selectedEditorId || isLoading) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/works/${workId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editorId: selectedEditorId }),
      });

      if (response.ok) {
        toast.success("윤문가가 할당되었습니다");
        router.refresh();
      } else {
        const error = await response.json().catch(() => ({}));
        toast.error(error.error || "윤문가 할당에 실패했습니다.");
      }
    } catch (error) {
      console.error("Failed to assign editor:", error);
      toast.error("윤문가 할당에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRemove() {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/works/${workId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editorId: null }),
      });

      if (response.ok) {
        toast.success("윤문가가 해제되었습니다");
        setSelectedEditorId("");
        router.refresh();
      } else {
        const error = await response.json().catch(() => ({}));
        toast.error(error.error || "윤문가 해제에 실패했습니다.");
      }
    } catch (error) {
      console.error("Failed to remove editor:", error);
      toast.error("윤문가 해제에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isFetching) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (currentEditor) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-accent text-accent-foreground">
              {currentEditor.name[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{currentEditor.name}</p>
            {currentEditor.email && <p className="text-sm text-muted-foreground">{currentEditor.email}</p>}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRemove}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UserMinus className="mr-2 h-4 w-4" />
          )}
          해제
        </Button>
      </div>
    );
  }

  if (editors.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        <p>등록된 윤문가가 없습니다.</p>
        <p className="text-sm mt-1">윤문가로 가입한 사용자가 필요합니다.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Select value={selectedEditorId} onValueChange={setSelectedEditorId}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="윤문가를 선택하세요" />
        </SelectTrigger>
        <SelectContent>
          {editors.map((editor) => (
            <SelectItem key={editor.id} value={editor.id}>
              <div className="flex items-center gap-2">
                <span>{editor.name}</span>
                <span className="text-muted-foreground text-xs">({editor.email})</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={handleAssign} disabled={!selectedEditorId || isLoading}>
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <UserPlus className="mr-2 h-4 w-4" />
        )}
        할당
      </Button>
    </div>
  );
}
