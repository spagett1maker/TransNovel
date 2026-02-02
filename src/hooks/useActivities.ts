"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ActivityType } from "@prisma/client";

export interface ActivityActor {
  id: string;
  name: string;
  image: string | null;
  role: string;
}

export interface Activity {
  id: string;
  activityType: ActivityType;
  metadata: Record<string, unknown> | null;
  summary: string;
  createdAt: string;
  actor: ActivityActor;
}

interface UseActivitiesOptions {
  workId: string;
  chapterNum: number | undefined;
  pollingInterval?: number; // in milliseconds
}

export function useActivities({
  workId,
  chapterNum,
  pollingInterval = 30000, // 30 seconds default (기존 10초에서 변경)
}: UseActivitiesOptions) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastModifiedRef = useRef<string | null>(null);

  // Fetch activities
  const fetchActivities = useCallback(
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

        const url = new URL(
          `/api/works/${workId}/chapters/${chapterNum}/activity`,
          window.location.origin
        );
        if (cursor) {
          url.searchParams.set("cursor", cursor);
        }

        // 조건부 폴링: 이전 응답의 Last-Modified를 전송
        const headers: HeadersInit = {};
        if (!cursor && lastModifiedRef.current) {
          headers["If-Modified-Since"] = lastModifiedRef.current;
        }

        const response = await fetch(url.toString(), { headers });

        // 304 Not Modified: 변경 없음, 상태 업데이트 불필요
        if (response.status === 304) {
          setIsLoading(false);
          return;
        }

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "활동을 불러오는 데 실패했습니다");
        }

        // Last-Modified 헤더 저장
        const lm = response.headers.get("Last-Modified");
        if (lm) {
          lastModifiedRef.current = lm;
        }

        const data = await response.json();

        if (append) {
          setActivities((prev) => [...prev, ...data.data]);
        } else {
          setActivities(data.data);
        }
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      } catch (err) {
        const message = err instanceof Error ? err.message : "오류가 발생했습니다";
        setError(message);
        console.error("Error fetching activities:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [workId, chapterNum]
  );

  // Initial fetch
  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Polling for new activities
  useEffect(() => {
    if (pollingInterval > 0) {
      pollingRef.current = setInterval(() => {
        fetchActivities();
      }, pollingInterval);

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
        }
      };
    }
  }, [pollingInterval, fetchActivities]);

  // Load more
  const loadMore = useCallback(() => {
    if (hasMore && nextCursor) {
      fetchActivities(nextCursor, true);
    }
  }, [hasMore, nextCursor, fetchActivities]);

  // Refresh
  const refresh = useCallback(() => {
    lastModifiedRef.current = null; // 강제 새로고침 시 캐시 무시
    fetchActivities();
  }, [fetchActivities]);

  return {
    activities,
    isLoading,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}
