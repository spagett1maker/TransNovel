"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  href: string;
  check: () => Promise<boolean>;
}

const DISMISSED_KEY = "transnovel_onboarding_dismissed";

export function OnboardingChecklist({
  role,
  userId,
}: {
  role: "AUTHOR" | "EDITOR";
  userId: string;
}) {
  const [steps, setSteps] = useState<
    { id: string; label: string; description: string; href: string; completed: boolean }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const key = `${DISMISSED_KEY}_${userId}`;
    const dismissed = localStorage.getItem(key);
    if (dismissed === "true") {
      setIsDismissed(true);
      setIsLoading(false);
      return;
    }
    setIsDismissed(false);

    async function checkSteps() {
      try {
        const definitions: OnboardingStep[] =
          role === "AUTHOR"
            ? [
                {
                  id: "create-work",
                  label: "첫 프로젝트 만들기",
                  description: "번역할 작품을 등록하세요",
                  href: "/works/new",
                  check: async () => {
                    const res = await fetch("/api/works?limit=1");
                    const data = await res.json();
                    return (data.data?.length || 0) > 0;
                  },
                },
                {
                  id: "upload-chapters",
                  label: "회차 업로드",
                  description: "원고 파일을 업로드하세요",
                  href: "/works",
                  check: async () => {
                    const res = await fetch("/api/works?limit=1");
                    const data = await res.json();
                    const work = data.data?.[0];
                    if (!work) return false;
                    return (work._count?.chapters || 0) > 0;
                  },
                },
                {
                  id: "start-translation",
                  label: "번역 시작하기",
                  description: "AI 번역을 실행해보세요",
                  href: "/works",
                  check: async () => {
                    const res = await fetch("/api/works?limit=10");
                    const data = await res.json();
                    const translationStatuses = [
                      "TRANSLATING",
                      "TRANSLATED",
                      "PROOFREADING",
                      "COMPLETED",
                    ];
                    return (data.data || []).some(
                      (w: { status: string }) =>
                        translationStatuses.includes(w.status)
                    );
                  },
                },
              ]
            : [
                {
                  id: "setup-profile",
                  label: "프로필 설정",
                  description: "윤문가 프로필을 완성하세요",
                  href: "/my-profile",
                  check: async () => {
                    const res = await fetch("/api/me/editor-profile");
                    if (!res.ok) return false;
                    const data = await res.json();
                    return !!data.profile;
                  },
                },
                {
                  id: "browse-marketplace",
                  label: "마켓플레이스 둘러보기",
                  description: "공개된 프로젝트를 확인하세요",
                  href: "/marketplace",
                  check: async () => {
                    // Consider "visited" if they have any applications
                    const res = await fetch("/api/me/applications?limit=1");
                    if (!res.ok) return false;
                    const data = await res.json();
                    return (data.data?.length || 0) > 0;
                  },
                },
                {
                  id: "apply-project",
                  label: "프로젝트에 지원하기",
                  description: "관심있는 프로젝트에 지원하세요",
                  href: "/marketplace",
                  check: async () => {
                    const res = await fetch("/api/me/applications?limit=1");
                    if (!res.ok) return false;
                    const data = await res.json();
                    return (data.data?.length || 0) > 0;
                  },
                },
              ];

        const results = await Promise.all(
          definitions.map(async (step) => {
            let completed = false;
            try {
              completed = await step.check();
            } catch {
              completed = false;
            }
            return {
              id: step.id,
              label: step.label,
              description: step.description,
              href: step.href,
              completed,
            };
          })
        );

        setSteps(results);

        // Auto-dismiss if all completed
        if (results.every((s) => s.completed)) {
          const key = `${DISMISSED_KEY}_${userId}`;
          localStorage.setItem(key, "true");
          setIsDismissed(true);
        }
      } catch {
        // Silently fail - onboarding is non-critical
      } finally {
        setIsLoading(false);
      }
    }

    checkSteps();
  }, [role, userId]);

  const handleDismiss = () => {
    const key = `${DISMISSED_KEY}_${userId}`;
    localStorage.setItem(key, "true");
    setIsDismissed(true);
  };

  if (isDismissed || isLoading) return null;

  const completedCount = steps.filter((s) => s.completed).length;
  const totalCount = steps.length;
  const allDone = completedCount === totalCount;

  if (allDone) return null;

  return (
    <div className="border rounded-xl p-5 mb-8 bg-card">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium">시작하기</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {completedCount}/{totalCount}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded-md hover:bg-muted transition-colors"
            aria-label={isCollapsed ? "펼치기" : "접기"}
          >
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-md hover:bg-muted transition-colors"
            aria-label="온보딩 닫기"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-foreground rounded-full transition-all duration-500"
          style={{ width: `${(completedCount / totalCount) * 100}%` }}
        />
      </div>

      {!isCollapsed && (
        <div className="space-y-2">
          {steps.map((step) => (
            <Link
              key={step.id}
              href={step.completed ? "#" : step.href}
              className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                step.completed
                  ? "opacity-60"
                  : "hover:bg-muted"
              }`}
              onClick={step.completed ? (e) => e.preventDefault() : undefined}
            >
              <div
                className={`flex items-center justify-center h-6 w-6 rounded-full shrink-0 border-2 transition-colors ${
                  step.completed
                    ? "bg-foreground border-foreground"
                    : "border-border"
                }`}
              >
                {step.completed && (
                  <Check className="h-3.5 w-3.5 text-background" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    step.completed ? "line-through text-muted-foreground" : ""
                  }`}
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {step.description}
                </p>
              </div>
              {!step.completed && (
                <span className="text-xs text-muted-foreground shrink-0">
                  →
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
