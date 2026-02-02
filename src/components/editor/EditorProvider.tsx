"use client";

import { ChapterStatus, UserRole } from "@prisma/client";
import { toast } from "sonner";
import { useEditor, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import { canEditChapterContent } from "@/lib/permissions";

// Types
export interface Chapter {
  id: string;
  number: number;
  title: string | null;
  originalContent: string;
  translatedContent: string | null;
  editedContent: string | null;
  status: ChapterStatus;
  wordCount: number;
  updatedAt: string;
}

export interface Work {
  id: string;
  titleKo: string;
  titleOriginal: string;
  chapters: { number: number }[];
  _count: {
    chapters: number;
  };
}

export type ViewMode = "collaboration" | "original" | "translated" | "edit" | "changes";

interface ContractRange {
  chapterStart: number | null;
  chapterEnd: number | null;
}

interface EditorContextType {
  // Data
  work: Work | null;
  chapter: Chapter | null;
  isLoading: boolean;
  isSaving: boolean;

  // Editor
  editor: Editor | null;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Sidebars
  leftSidebar: "comments" | "versions" | "glossary" | null;
  rightSidebar: "activity" | null;
  setLeftSidebar: (sidebar: "comments" | "versions" | "glossary" | null) => void;
  setRightSidebar: (sidebar: "activity" | null) => void;

  // Actions
  fetchData: () => Promise<void>;
  handleSave: () => Promise<void>;
  handleStatusChange: (newStatus: ChapterStatus) => Promise<void>;

  // User
  userRole: UserRole;

  // Permissions
  isEditable: boolean;
  outOfContractRange: boolean;
  contractRange: ContractRange | null;
}

const EditorContext = createContext<EditorContextType | null>(null);

export function useEditorContext() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditorContext must be used within EditorProvider");
  }
  return context;
}

interface EditorProviderProps {
  workId: string;
  chapterNum: number;
  userRole: UserRole;
  children: ReactNode;
  onChapterStatusChange?: () => void;
}

export function EditorProvider({
  workId,
  chapterNum,
  userRole,
  children,
  onChapterStatusChange,
}: EditorProviderProps) {
  const [work, setWork] = useState<Work | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("collaboration");
  const [leftSidebar, setLeftSidebar] = useState<"comments" | "versions" | "glossary" | null>("comments");
  const [rightSidebar, setRightSidebar] = useState<"activity" | null>(null);
  const [contractRange, setContractRange] = useState<ContractRange | null>(null);

  // TipTap Editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Placeholder.configure({
        placeholder: "번역문을 수정하세요...",
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-full text-foreground",
      },
    },
    immediatelyRender: false,
  });

  // Convert plain text (with \n) to HTML paragraphs for TipTap
  const toEditorHtml = useCallback((text: string): string => {
    if (!text) return "";
    // Already HTML (contains common tags) — use as-is
    if (/<(p|div|br|span|h[1-6]|ul|ol|li|strong|em|a|blockquote)\b/i.test(text)) return text;
    // Plain text — wrap each line in <p>, empty lines become empty <p>
    return text
      .split("\n")
      .map((line) => `<p>${line || "<br>"}</p>`)
      .join("");
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetches: Promise<Response>[] = [
        fetch(`/api/works/${workId}`),
        fetch(`/api/works/${workId}/chapters/${chapterNum}`),
      ];

      // 에디터 역할인 경우 계약 범위 정보도 함께 가져오기
      if (userRole === UserRole.EDITOR) {
        fetches.push(fetch(`/api/contracts?isActive=true`));
      }

      const responses = await Promise.all(fetches);
      const [workRes, chapterRes] = responses;

      if (!workRes.ok || !chapterRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const workData = await workRes.json();
      const chapterData = await chapterRes.json();

      setWork(workData);
      setChapter(chapterData);

      // 에디터 계약 범위 확인
      if (userRole === UserRole.EDITOR && responses[2]) {
        const contractRes = responses[2];
        if (contractRes.ok) {
          const contractData = await contractRes.json();
          const contracts = contractData.data || [];
          const activeContract = contracts.find(
            (c: { work?: { id: string } }) => c.work?.id === workId
          );
          if (activeContract) {
            setContractRange({
              chapterStart: activeContract.chapterStart ?? null,
              chapterEnd: activeContract.chapterEnd ?? null,
            });
          } else {
            setContractRange(null);
          }
        }
      }

      // Set editor content
      const content = chapterData.editedContent || chapterData.translatedContent || "";
      if (editor) {
        editor.commands.setContent(toEditorHtml(content));
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [workId, chapterNum, editor, toEditorHtml, userRole]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Update editor when chapter changes
  useEffect(() => {
    if (editor && chapter) {
      const content = chapter.editedContent || chapter.translatedContent || "";
      const html = toEditorHtml(content);
      if (editor.getHTML() !== html) {
        editor.commands.setContent(html);
      }
    }
  }, [editor, chapter, toEditorHtml]);

  // 에디터 계약 범위 밖 여부 확인
  const outOfContractRange = useMemo(() => {
    if (userRole !== UserRole.EDITOR || !contractRange) return false;
    const { chapterStart, chapterEnd } = contractRange;
    if (chapterStart !== null && chapterNum < chapterStart) return true;
    if (chapterEnd !== null && chapterNum > chapterEnd) return true;
    return false;
  }, [userRole, contractRange, chapterNum]);

  // Compute editable state
  const isEditable = useMemo(() => {
    if (!chapter) return true;
    if (outOfContractRange) return false;
    return canEditChapterContent(userRole, chapter.status);
  }, [userRole, chapter?.status, outOfContractRange]);

  // Sync editor editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(isEditable);
    }
  }, [editor, isEditable]);

  // Save handler
  const handleSave = useCallback(async () => {
    if (!chapter || !editor) return;
    if (!isEditable) {
      toast.error("읽기 전용 모드에서는 저장할 수 없습니다");
      return;
    }

    setIsSaving(true);
    try {
      const editedContent = editor.getHTML();

      const response = await fetch(
        `/api/works/${workId}/chapters/${chapterNum}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            editedContent,
            _updatedAt: chapter.updatedAt,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (error.code === "CONFLICT") {
          toast.error("다른 사용자가 이미 수정했습니다. 페이지를 새로고침해주세요.", {
            action: {
              label: "새로고침",
              onClick: () => fetchData(),
            },
          });
        } else {
          toast.error(error.error || "저장에 실패했습니다");
        }
        return;
      }

      const updatedChapter = await response.json();
      setChapter(updatedChapter);
      toast.success("저장되었습니다");
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("저장에 실패했습니다");
    } finally {
      setIsSaving(false);
    }
  }, [chapter, editor, workId, chapterNum, isEditable, fetchData]);

  // Status change handler
  const handleStatusChange = useCallback(
    async (newStatus: ChapterStatus) => {
      if (!chapter || !editor) return;

      setIsSaving(true);
      try {
        // 읽기 전용 모드에서는 상태만 전송 (콘텐츠 수정 제외)
        const payload: Record<string, unknown> = {
          status: newStatus,
          _updatedAt: chapter.updatedAt,
        };
        if (isEditable) {
          const editedContent = editor.getHTML();
          payload.editedContent = editedContent || chapter.translatedContent;
        }

        const response = await fetch(
          `/api/works/${workId}/chapters/${chapterNum}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          if (error.code === "CONFLICT") {
            toast.error("다른 사용자가 이미 수정했습니다. 페이지를 새로고침해주세요.", {
              action: {
                label: "새로고침",
                onClick: () => fetchData(),
              },
            });
          } else {
            toast.error(error.error || "상태 변경에 실패했습니다.");
          }
          return;
        }

        const updatedChapter = await response.json();
        setChapter(updatedChapter);
        toast.success("상태가 변경되었습니다");
        onChapterStatusChange?.();
      } catch (error) {
        console.error("Error changing status:", error);
        toast.error("상태 변경에 실패했습니다");
      } finally {
        setIsSaving(false);
      }
    },
    [chapter, editor, workId, chapterNum, isEditable, onChapterStatusChange, fetchData]
  );

  const value: EditorContextType = {
    work,
    chapter,
    isLoading,
    isSaving,
    editor,
    viewMode,
    setViewMode,
    leftSidebar,
    rightSidebar,
    setLeftSidebar,
    setRightSidebar,
    fetchData,
    handleSave,
    handleStatusChange,
    userRole,
    isEditable,
    outOfContractRange,
    contractRange,
  };

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}
