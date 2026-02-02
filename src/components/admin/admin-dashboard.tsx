"use client";

import { useState, useEffect, useCallback } from "react";
import { LogLevel, LogCategory } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Types
interface Stats {
  errors: {
    totalErrors: number;
    byErrorCode: Record<string, number>;
    byCategory: Record<string, number>;
    recentErrors: LogEntry[];
  };
  jobs: {
    total: number;
    completed: number;
    failed: number;
    successRate: string | number;
    recent: JobHistory[];
  };
  users: UserStats[];
  today: {
    jobCount: number;
    totalChapters: number;
    completedChapters: number;
    failedChapters: number;
    totalDurationMs: number;
  };
}

interface LogEntry {
  id: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  errorCode?: string;
  jobId?: string;
  workId?: string;
  chapterNum?: number;
  chunkIndex?: number;
  userId?: string;
  userEmail?: string;
  durationMs?: number;
  createdAt: string;
}

interface JobHistory {
  id: string;
  jobId: string;
  workId: string;
  workTitle: string;
  userId: string;
  userEmail?: string;
  status: string;
  totalChapters: number;
  completedChapters: number;
  failedChapters: number;
  errorMessage?: string;
  failedChapterNums: number[];
  durationMs?: number;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
}

interface UserStats {
  userId: string;
  userEmail?: string;
  jobCount: number;
  totalChapters: number;
  completedChapters: number;
  failedChapters: number;
}

type Tab = "overview" | "logs" | "jobs" | "users";

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [jobs, setJobs] = useState<JobHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [logLevel, setLogLevel] = useState<string>("");
  const [logCategory, setLogCategory] = useState<string>("");
  const [jobStatus, setJobStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error("통계 조회 실패");
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    }
  }, []);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (logLevel) params.set("level", logLevel);
      if (logCategory) params.set("category", logCategory);
      params.set("page", String(page));
      params.set("limit", "30");

      const res = await fetch(`/api/admin/logs?${params}`);
      if (!res.ok) throw new Error("로그 조회 실패");
      const data = await res.json();
      setLogs(data.logs);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    }
  }, [logLevel, logCategory, page]);

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (jobStatus) params.set("status", jobStatus);
      params.set("page", String(page));
      params.set("limit", "20");

      const res = await fetch(`/api/admin/jobs?${params}`);
      if (!res.ok) throw new Error("작업 조회 실패");
      const data = await res.json();
      setJobs(data.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    }
  }, [jobStatus, page]);

  // Initial load and refresh
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStats(), fetchLogs(), fetchJobs()]).finally(() =>
      setLoading(false)
    );
  }, [fetchStats, fetchLogs, fetchJobs]);

  // Auto refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats();
      if (activeTab === "logs") fetchLogs();
      if (activeTab === "jobs") fetchJobs();
    }, 30000);
    return () => clearInterval(interval);
  }, [activeTab, fetchStats, fetchLogs, fetchJobs]);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}초`;
    return `${(ms / 60000).toFixed(1)}분`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getLevelBadge = (level: LogLevel) => {
    switch (level) {
      case "ERROR":
        return <Badge variant="destructive">ERROR</Badge>;
      case "WARN":
        return <Badge className="bg-amber-500 dark:bg-amber-600">WARN</Badge>;
      case "INFO":
        return <Badge variant="secondary">INFO</Badge>;
      default:
        return <Badge variant="outline">DEBUG</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <Badge className="bg-emerald-600 dark:bg-emerald-500">완료</Badge>;
      case "FAILED":
        return <Badge variant="destructive">실패</Badge>;
      case "PAUSED":
        return <Badge className="bg-amber-500 dark:bg-amber-600">일시정지</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading && !stats) {
    return (
      <div className="max-w-7xl">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl">
        <div className="section-surface text-center py-12">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>새로고침</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl">
      {/* Header */}
      <header className="pb-8 border-b border-border mb-8">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
              Admin
            </p>
            <h1 className="text-4xl font-semibold tracking-tight">
              번역 모니터링
            </h1>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              fetchStats();
              fetchLogs();
              fetchJobs();
            }}
          >
            새로고침
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 mb-8">
        {(["overview", "logs", "jobs", "users"] as Tab[]).map((tab) => (
          <Button
            key={tab}
            variant={activeTab === tab ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setActiveTab(tab);
              setPage(1);
            }}
          >
            {tab === "overview" && "개요"}
            {tab === "logs" && "로그"}
            {tab === "jobs" && "작업 히스토리"}
            {tab === "users" && "사용자"}
          </Button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && stats && (
        <div className="space-y-8">
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <div className="section-surface">
              <p className="text-sm text-muted-foreground mb-1">오늘 작업</p>
              <p className="text-3xl font-bold">{stats.today.jobCount}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.today.completedChapters}개 챕터 완료
              </p>
            </div>
            <div className="section-surface">
              <p className="text-sm text-muted-foreground mb-1">전체 작업</p>
              <p className="text-3xl font-bold">{stats.jobs.total}</p>
              <p className="text-xs text-muted-foreground mt-1">
                성공률 {stats.jobs.successRate}%
              </p>
            </div>
            <div className="section-surface">
              <p className="text-sm text-muted-foreground mb-1">실패 작업</p>
              <p className="text-3xl font-bold text-destructive">
                {stats.jobs.failed}
              </p>
            </div>
            <div className="section-surface">
              <p className="text-sm text-muted-foreground mb-1">총 에러</p>
              <p className="text-3xl font-bold text-destructive">
                {stats.errors.totalErrors}
              </p>
            </div>
          </div>

          {/* Error by Code */}
          {Object.keys(stats.errors.byErrorCode).length > 0 && (
            <div className="section-surface">
              <h3 className="font-semibold mb-4">에러 코드별 통계</h3>
              <div className="grid gap-2 md:grid-cols-3">
                {Object.entries(stats.errors.byErrorCode)
                  .sort(([, a], [, b]) => b - a)
                  .map(([code, count]) => (
                    <div
                      key={code}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <code className="text-sm font-mono">{code}</code>
                      <Badge variant="destructive">{count}</Badge>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Recent Jobs */}
          <div className="section-surface">
            <h3 className="font-semibold mb-4">최근 작업</h3>
            <div className="space-y-3">
              {stats.jobs.recent.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{job.workTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.userEmail || job.userId} · {formatDate(job.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm tabular-nums">
                      {job.completedChapters}/{job.totalChapters}화
                    </span>
                    {getStatusBadge(job.status)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Errors */}
          {stats.errors.recentErrors.length > 0 && (
            <div className="section-surface">
              <h3 className="font-semibold mb-4">최근 에러</h3>
              <div className="space-y-2">
                {stats.errors.recentErrors.map((err) => (
                  <div
                    key={err.id}
                    className="p-3 rounded-lg bg-destructive/10 border border-destructive/20"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getLevelBadge(err.level)}
                          {err.errorCode && (
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                              {err.errorCode}
                            </code>
                          )}
                        </div>
                        <p className="text-sm truncate">{err.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {err.userEmail || err.userId} · 챕터 {err.chapterNum} ·{" "}
                          {formatDate(err.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === "logs" && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <select
              value={logLevel}
              onChange={(e) => {
                setLogLevel(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-lg border bg-background text-sm"
            >
              <option value="">모든 레벨</option>
              <option value="ERROR">ERROR</option>
              <option value="WARN">WARN</option>
              <option value="INFO">INFO</option>
              <option value="DEBUG">DEBUG</option>
            </select>
            <select
              value={logCategory}
              onChange={(e) => {
                setLogCategory(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-lg border bg-background text-sm"
            >
              <option value="">모든 카테고리</option>
              <option value="TRANSLATION">번역</option>
              <option value="API_CALL">API 호출</option>
              <option value="RATE_LIMIT">Rate Limit</option>
              <option value="CHUNK">청크</option>
              <option value="CHAPTER">챕터</option>
              <option value="JOB">작업</option>
              <option value="SYSTEM">시스템</option>
            </select>
          </div>

          {/* Log List */}
          <div className="section-surface p-0 overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              {logs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  로그가 없습니다
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium">시간</th>
                      <th className="text-left p-3 font-medium">레벨</th>
                      <th className="text-left p-3 font-medium">카테고리</th>
                      <th className="text-left p-3 font-medium">메시지</th>
                      <th className="text-left p-3 font-medium">사용자</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/50">
                        <td className="p-3 whitespace-nowrap tabular-nums">
                          {formatDate(log.createdAt)}
                        </td>
                        <td className="p-3">{getLevelBadge(log.level)}</td>
                        <td className="p-3">
                          <Badge variant="outline">{log.category}</Badge>
                        </td>
                        <td className="p-3 max-w-md truncate" title={log.message}>
                          {log.errorCode && (
                            <code className="text-xs bg-destructive/20 text-destructive px-1 py-0.5 rounded mr-2">
                              {log.errorCode}
                            </code>
                          )}
                          {log.message}
                        </td>
                        <td className="p-3 text-muted-foreground truncate max-w-[150px]">
                          {log.userEmail || log.userId || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                이전
              </Button>
              <span className="px-3 py-2 text-sm">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                다음
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Jobs Tab */}
      {activeTab === "jobs" && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex gap-3">
            <select
              value={jobStatus}
              onChange={(e) => {
                setJobStatus(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-lg border bg-background text-sm"
            >
              <option value="">모든 상태</option>
              <option value="COMPLETED">완료</option>
              <option value="FAILED">실패</option>
              <option value="PAUSED">일시정지</option>
            </select>
          </div>

          {/* Job List */}
          <div className="space-y-3">
            {jobs.length === 0 ? (
              <div className="section-surface text-center py-12 text-muted-foreground">
                작업 히스토리가 없습니다
              </div>
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="section-surface">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusBadge(job.status)}
                        <h4 className="font-medium truncate">{job.workTitle}</h4>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {job.userEmail || job.userId}
                      </p>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span>
                          챕터: {job.completedChapters}/{job.totalChapters}
                        </span>
                        {job.failedChapters > 0 && (
                          <span className="text-destructive">
                            실패: {job.failedChapters}개
                          </span>
                        )}
                        {job.durationMs && (
                          <span>소요: {formatDuration(job.durationMs)}</span>
                        )}
                      </div>
                      {job.errorMessage && (
                        <p className="mt-2 text-xs text-destructive truncate">
                          {job.errorMessage}
                        </p>
                      )}
                      {job.failedChapterNums.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          실패한 챕터: {job.failedChapterNums.join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                      <p>{formatDate(job.startedAt)}</p>
                      {job.completedAt && (
                        <p>~ {formatDate(job.completedAt)}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === "users" && stats && (
        <div className="space-y-6">
          <div className="section-surface p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-medium">사용자</th>
                  <th className="text-right p-3 font-medium">작업 수</th>
                  <th className="text-right p-3 font-medium">총 챕터</th>
                  <th className="text-right p-3 font-medium">완료</th>
                  <th className="text-right p-3 font-medium">실패</th>
                  <th className="text-right p-3 font-medium">성공률</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stats.users.map((user) => {
                  const successRate =
                    user.totalChapters > 0
                      ? ((user.completedChapters / user.totalChapters) * 100).toFixed(
                          1
                        )
                      : 0;
                  return (
                    <tr key={user.userId} className="hover:bg-muted/50">
                      <td className="p-3">
                        <span className="truncate max-w-[200px] block">
                          {user.userEmail || user.userId}
                        </span>
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {user.jobCount}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {user.totalChapters}
                      </td>
                      <td className="p-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                        {user.completedChapters}
                      </td>
                      <td className="p-3 text-right tabular-nums text-destructive">
                        {user.failedChapters}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {successRate}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
