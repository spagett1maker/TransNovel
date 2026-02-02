"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Check,
  CheckCircle,
  MoreHorizontal,
  Pencil,
  Reply,
  Trash2,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Comment } from "@/hooks/useComments";
import { cn } from "@/lib/utils";

interface CommentThreadProps {
  comment: Comment;
  onReply: (parentId: string, content: string) => Promise<void>;
  onResolve: (commentId: string) => Promise<boolean>;
  onDelete: (commentId: string, parentId?: string) => Promise<boolean>;
  onEdit: (
    commentId: string,
    data: { content?: string; isResolved?: boolean }
  ) => Promise<Comment | null>;
  onClick?: () => void;
}

export function CommentThread({
  comment,
  onReply,
  onResolve,
  onDelete,
  onEdit,
  onClick,
}: CommentThreadProps) {
  const { data: session } = useSession();
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [editContent, setEditContent] = useState(comment.content);

  const isAuthor = session?.user?.id === comment.author.id;
  const isAdmin = session?.user?.role === "ADMIN";
  const canModify = isAuthor || isAdmin;

  const handleReply = async () => {
    if (!replyContent.trim()) return;
    await onReply(comment.id, replyContent);
    setReplyContent("");
    setIsReplying(false);
  };

  const handleEdit = async () => {
    if (!editContent.trim()) return;
    const result = await onEdit(comment.id, { content: editContent });
    if (result) {
      setIsEditing(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "방금 전";
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    return date.toLocaleDateString("ko-KR");
  };

  return (
    <div
      className={cn(
        "p-4 hover:bg-muted/50 transition-colors cursor-pointer",
        comment.isResolved && "opacity-60"
      )}
      onClick={onClick}
    >
      {/* Quoted Text */}
      {comment.quotedText && (
        <div className="mb-2 pl-3 border-l-2 border-primary/50">
          <p className="text-xs text-muted-foreground line-clamp-2 italic">
            "{comment.quotedText}"
          </p>
        </div>
      )}

      {/* Comment Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-xs font-medium text-primary">
              {comment.author.name?.[0] || "?"}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium">{comment.author.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatTime(comment.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {comment.isResolved && (
            <CheckCircle className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setIsReplying(true);
                }}
              >
                <Reply className="h-4 w-4 mr-2" />
                답글
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onResolve(comment.id);
                }}
              >
                {comment.isResolved ? (
                  <>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    다시 열기
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    해결됨
                  </>
                )}
              </DropdownMenuItem>
              {canModify && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing(true);
                      setEditContent(comment.content);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    수정
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(comment.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    삭제
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Comment Content */}
      {isEditing ? (
        <div onClick={(e) => e.stopPropagation()}>
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[60px] text-sm resize-none mb-2"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(false)}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleEdit}
              disabled={!editContent.trim()}
            >
              저장
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
      )}

      {/* Resolved Info */}
      {comment.isResolved && comment.resolvedBy && (
        <p className="text-xs text-muted-foreground mt-2">
          {comment.resolvedBy.name}님이 해결함
        </p>
      )}

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-3 ml-4 pl-4 border-l border-border space-y-3">
          {comment.replies.map((reply) => (
            <ReplyItem
              key={reply.id}
              reply={reply}
              parentId={comment.id}
              onDelete={onDelete}
              onEdit={onEdit}
              canModify={
                session?.user?.id === reply.author.id ||
                session?.user?.role === "ADMIN"
              }
            />
          ))}
        </div>
      )}

      {/* Reply Form */}
      {isReplying && (
        <div className="mt-3 ml-4 pl-4 border-l border-border" onClick={(e) => e.stopPropagation()}>
          <Textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="답글을 입력하세요..."
            className="min-h-[60px] text-sm resize-none mb-2"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsReplying(false)}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleReply}
              disabled={!replyContent.trim()}
            >
              답글 작성
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Reply Item Component
interface ReplyItemProps {
  reply: Comment;
  parentId: string;
  onDelete: (commentId: string, parentId?: string) => Promise<boolean>;
  onEdit: (
    commentId: string,
    data: { content?: string }
  ) => Promise<Comment | null>;
  canModify: boolean;
}

function ReplyItem({
  reply,
  parentId,
  onDelete,
  onEdit,
  canModify,
}: ReplyItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(reply.content);

  const handleEdit = async () => {
    if (!editContent.trim()) return;
    const result = await onEdit(reply.id, { content: editContent });
    if (result) {
      setIsEditing(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "방금 전";
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    return date.toLocaleDateString("ko-KR");
  };

  return (
    <div className="text-sm">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-[10px] font-medium text-primary">
              {reply.author.name?.[0] || "?"}
            </span>
          </div>
          <span className="font-medium text-xs">{reply.author.name}</span>
          <span className="text-xs text-muted-foreground">
            {formatTime(reply.createdAt)}
          </span>
        </div>

        {canModify && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                  setEditContent(reply.content);
                }}
              >
                <Pencil className="h-4 w-4 mr-2" />
                수정
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(reply.id, parentId);
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {isEditing ? (
        <div onClick={(e) => e.stopPropagation()}>
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[50px] text-xs resize-none mb-2"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setIsEditing(false)}
            >
              취소
            </Button>
            <Button
              size="sm"
              className="h-6 text-xs"
              onClick={handleEdit}
              disabled={!editContent.trim()}
            >
              저장
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs whitespace-pre-wrap text-muted-foreground">
          {reply.content}
        </p>
      )}
    </div>
  );
}
