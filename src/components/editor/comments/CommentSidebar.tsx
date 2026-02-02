"use client";

import { useState } from "react";
import {
  MessageSquare,
  Check,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useComments, Comment } from "@/hooks/useComments";
import { useEditorContext } from "../EditorProvider";
import { CommentThread } from "./CommentThread";


interface CommentSidebarProps {
  onCommentClick?: (comment: Comment) => void;
}

export function CommentSidebar({ onCommentClick }: CommentSidebarProps) {
  const { work, chapter } = useEditorContext();
  const workId = work?.id ?? "";
  const chapterNum = chapter?.number;

  const [showResolved, setShowResolved] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newCommentContent, setNewCommentContent] = useState("");

  const {
    comments,
    isLoading,
    hasMore,
    unresolvedCount,
    resolvedCount,
    loadMore,
    createComment,
    updateComment,
    deleteComment,
    toggleResolve,
  } = useComments({
    workId,
    chapterNum,
    includeResolved: showResolved,
  });

  const handleCreateComment = async () => {
    if (!newCommentContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const result = await createComment({
      content: newCommentContent,
    });

    if (result) {
      setNewCommentContent("");
      setIsCreating(false);
    }
    setIsSubmitting(false);
  };

  const handleReply = async (parentId: string, content: string) => {
    await createComment({
      content,
      parentId,
    });
  };

  // When showResolved=false, API already filters; when true, show all
  const filteredComments = comments;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <h3 className="font-medium text-sm">댓글</h3>
            {unresolvedCount > 0 && (
              <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                {unresolvedCount}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Button
            variant={showResolved ? "outline" : "secondary"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowResolved(false)}
          >
            미해결 ({unresolvedCount})
          </Button>
          <Button
            variant={showResolved ? "secondary" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowResolved(true)}
          >
            <Check className="h-3 w-3 mr-1" />
            해결됨 ({resolvedCount})
          </Button>
        </div>
      </div>

      {/* New Comment Form */}
      {isCreating && (
        <div className="p-4 border-b border-border bg-muted/50">
          <Textarea
            value={newCommentContent}
            onChange={(e) => setNewCommentContent(e.target.value)}
            placeholder="댓글을 입력하세요..."
            className="min-h-[80px] text-sm resize-none mb-2"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsCreating(false);
                setNewCommentContent("");
              }}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleCreateComment}
              disabled={!newCommentContent.trim() || isSubmitting}
            >
              {isSubmitting ? "작성 중..." : "작성"}
            </Button>
          </div>
        </div>
      )}

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredComments.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8 px-4">
            {showResolved ? (
              <p>해결된 댓글이 없습니다</p>
            ) : (
              <>
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>아직 댓글이 없습니다</p>
                <p className="text-xs mt-1">
                  텍스트를 선택하거나 위의 + 버튼을 눌러 댓글을 추가하세요
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredComments.map((comment) => (
              <CommentThread
                key={comment.id}
                comment={comment}
                onReply={handleReply}
                onResolve={toggleResolve}
                onDelete={deleteComment}
                onEdit={updateComment}
                onClick={() => onCommentClick?.(comment)}
              />
            ))}
            {hasMore && (
              <div className="p-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={loadMore}
                >
                  더 보기
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
