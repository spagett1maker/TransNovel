"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useTranslation } from "@/contexts/translation-context";

interface WorkPageRefresherProps {
  workId: string;
}

/**
 * 번역 완료 시 페이지를 자동으로 새로고침하는 컴포넌트
 * 서버 컴포넌트의 데이터를 갱신하기 위해 router.refresh()를 호출
 */
export function WorkPageRefresher({ workId }: WorkPageRefresherProps) {
  const router = useRouter();
  const { getJobByWorkId } = useTranslation();
  const job = getJobByWorkId(workId);

  // 이전 완료 챕터 수를 추적
  const prevCompletedRef = useRef<number | null>(null);
  // 이전 상태를 추적
  const prevStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!job) {
      // 작업이 없으면 refs 초기화
      prevCompletedRef.current = null;
      prevStatusRef.current = null;
      return;
    }

    const prevCompleted = prevCompletedRef.current;
    const prevStatus = prevStatusRef.current;

    // 챕터가 완료되었을 때 (completedChapters가 증가했을 때)
    if (prevCompleted !== null && job.completedChapters > prevCompleted) {
      console.log("[WorkPageRefresher] 챕터 완료 감지, 페이지 새로고침");
      router.refresh();
    }

    // 작업이 완료/실패 상태로 변경되었을 때
    if (
      prevStatus !== null &&
      prevStatus !== job.status &&
      (job.status === "COMPLETED" || job.status === "FAILED")
    ) {
      console.log("[WorkPageRefresher] 작업 완료/실패 감지, 페이지 새로고침");
      router.refresh();
    }

    // 현재 값을 저장
    prevCompletedRef.current = job.completedChapters;
    prevStatusRef.current = job.status;
  }, [job, router]);

  // 렌더링할 UI 없음
  return null;
}
