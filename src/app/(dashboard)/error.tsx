"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <p className="text-6xl font-semibold tracking-tighter text-foreground mb-6">
        오류
      </p>
      <h1 className="text-lg font-medium mb-2">
        페이지를 불러올 수 없습니다
      </h1>
      <p className="text-muted-foreground mb-8 max-w-sm">
        일시적인 문제가 발생했습니다. 다시 시도하거나 대시보드로 돌아가주세요.
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={reset}>다시 시도</Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">대시보드로 이동</Link>
        </Button>
      </div>
      {error.digest && (
        <p className="mt-6 text-xs text-muted-foreground">
          오류 코드: {error.digest}
        </p>
      )}
    </div>
  );
}
