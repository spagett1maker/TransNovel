"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <p className="text-8xl font-semibold tracking-tighter text-foreground">
          500
        </p>
        <div className="mt-6 mb-8">
          <h1 className="text-xl font-medium mb-2">
            문제가 발생했습니다
          </h1>
          <p className="text-muted-foreground">
            일시적인 오류가 발생했습니다.
            <br />
            잠시 후 다시 시도해주세요.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-md hover:shadow-lg hover:-translate-y-px transition-all"
          >
            다시 시도
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-full border border-border px-6 py-2.5 text-sm font-medium text-foreground hover:bg-muted hover:shadow-sm transition-all"
          >
            대시보드로 이동
          </a>
        </div>
        {error.digest && (
          <p className="mt-8 text-xs text-muted-foreground">
            오류 코드: {error.digest}
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          TransNovel
        </p>
      </div>
    </div>
  );
}
