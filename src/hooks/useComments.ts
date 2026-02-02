"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";

export interface CommentAuthor {
  id: string;
  name: string;
  image: string | null;
  role: string;
}

export interface Comment {
  id: string;
  content: string;
  textRange: { from: number; to: number } | null;
  quotedText: string | null;
  isResolved: boolean;
  resolvedAt: string | null;
  resolvedBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthor;
  parentId: string | null;
  replies: Comment[];
}

interface UseCommentsOptions {
  workId: string;
  chapterNum: number | undefined;
  includeResolved?: boolean;
}

interface CreateCommentData {
  content: string;
  textRange?: { from: number; to: number };
  quotedText?: string;
  parentId?: string;
}

export function useComments({
  workId,
  chapterNum,
  includeResolved = false,
}: UseCommentsOptions) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);

  // Fetch comments
  const fetchComments = useCallback(
    async (cursor?: string, append = false) => {
      if (!workId || chapterNum == null) {
        setIsLoading(false);
        return;
      }
      try {
        if (!append) {
          setIsLoading(true);
        }
        setError(null);

        let url = `/api/works/${workId}/chapters/${chapterNum}/comments?includeResolved=${includeResolved}`;
        if (cursor) {
          url += `&cursor=${cursor}`;
        }

        const response = await fetch(url);

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "댓글을 불러오는 데 실패했습니다");
        }

        const result = await response.json();

        if (append) {
          setComments((prev) => [...prev, ...result.data]);
        } else {
          setComments(result.data);
        }
        setHasMore(result.hasMore);
        setNextCursor(result.nextCursor);
        if (result.unresolvedCount !== undefined) {
          setUnresolvedCount(result.unresolvedCount);
          setResolvedCount(result.resolvedCount);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "오류가 발생했습니다";
        setError(message);
        console.error("Error fetching comments:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [workId, chapterNum, includeResolved]
  );

  // Initial fetch
  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Load more
  const loadMore = useCallback(() => {
    if (hasMore && nextCursor) {
      fetchComments(nextCursor, true);
    }
  }, [hasMore, nextCursor, fetchComments]);

  // Create comment
  const createComment = useCallback(
    async (data: CreateCommentData): Promise<Comment | null> => {
      try {
        const response = await fetch(
          `/api/works/${workId}/chapters/${chapterNum}/comments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "댓글 작성에 실패했습니다");
        }

        const newComment = await response.json();

        // Update local state
        if (data.parentId) {
          // It's a reply, add to parent's replies
          setComments((prev) =>
            prev.map((comment) =>
              comment.id === data.parentId
                ? { ...comment, replies: [...comment.replies, newComment] }
                : comment
            )
          );
        } else {
          // It's a top-level comment
          setComments((prev) => [newComment, ...prev]);
        }

        toast.success("댓글이 작성되었습니다");
        return newComment;
      } catch (err) {
        const message = err instanceof Error ? err.message : "오류가 발생했습니다";
        toast.error(message);
        console.error("Error creating comment:", err);
        return null;
      }
    },
    [workId, chapterNum]
  );

  // Update comment
  const updateComment = useCallback(
    async (
      commentId: string,
      data: { content?: string; isResolved?: boolean }
    ): Promise<Comment | null> => {
      try {
        const response = await fetch(
          `/api/works/${workId}/chapters/${chapterNum}/comments/${commentId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "댓글 수정에 실패했습니다");
        }

        const updatedComment = await response.json();

        // Update local state
        setComments((prev) =>
          prev.map((comment) => {
            if (comment.id === commentId) {
              return updatedComment;
            }
            // Check if it's in replies
            if (comment.replies.some((r) => r.id === commentId)) {
              return {
                ...comment,
                replies: comment.replies.map((r) =>
                  r.id === commentId ? updatedComment : r
                ),
              };
            }
            return comment;
          })
        );

        if (data.isResolved !== undefined) {
          // resolve/unresolve 후 서버에서 정확한 카운트 동기화
          fetchComments();
          toast.success(data.isResolved ? "댓글이 해결되었습니다" : "댓글이 다시 열렸습니다");
        } else {
          toast.success("댓글이 수정되었습니다");
        }

        return updatedComment;
      } catch (err) {
        const message = err instanceof Error ? err.message : "오류가 발생했습니다";
        toast.error(message);
        console.error("Error updating comment:", err);
        return null;
      }
    },
    [workId, chapterNum]
  );

  // Delete comment
  const deleteComment = useCallback(
    async (commentId: string, parentId?: string): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/works/${workId}/chapters/${chapterNum}/comments/${commentId}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "댓글 삭제에 실패했습니다");
        }

        // Update local state
        if (parentId) {
          // It's a reply, remove from parent's replies
          setComments((prev) =>
            prev.map((comment) =>
              comment.id === parentId
                ? {
                    ...comment,
                    replies: comment.replies.filter((r) => r.id !== commentId),
                  }
                : comment
            )
          );
        } else {
          // It's a top-level comment
          setComments((prev) => prev.filter((c) => c.id !== commentId));
        }

        toast.success("댓글이 삭제되었습니다");
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "오류가 발생했습니다";
        toast.error(message);
        console.error("Error deleting comment:", err);
        return false;
      }
    },
    [workId, chapterNum]
  );

  // Resolve/unresolve comment
  const toggleResolve = useCallback(
    async (commentId: string): Promise<boolean> => {
      const comment = comments.find((c) => c.id === commentId);
      if (!comment) return false;

      const result = await updateComment(commentId, {
        isResolved: !comment.isResolved,
      });
      return result !== null;
    },
    [comments, updateComment]
  );

  return {
    comments,
    isLoading,
    error,
    hasMore,
    unresolvedCount,
    resolvedCount,
    loadMore,
    fetchComments,
    createComment,
    updateComment,
    deleteComment,
    toggleResolve,
  };
}
