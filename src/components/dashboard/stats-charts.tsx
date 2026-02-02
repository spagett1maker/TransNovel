"use client";

import { BarChart3, Loader2, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface StatusBreakdown {
  status: string;
  label: string;
  count: number;
  [key: string]: string | number;
}

interface WorkStat {
  id: string;
  title: string;
  totalChapters: number;
  completedChapters: number;
  completionRate: number;
  [key: string]: string | number;
}

interface TimeSeriesData {
  date: string;
  translated: number;
  edited: number;
  approved: number;
  total: number;
  [key: string]: string | number;
}

interface StatsData {
  statusBreakdown: StatusBreakdown[];
  workStats: WorkStat[];
  timeSeries: TimeSeriesData[];
  summary: {
    totalChapters: number;
    translatedChapters: number;
    completionRate: number;
    recentActivity: number;
    worksCount: number;
  };
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  PENDING:     { color: "#9aa0a6", bg: "#9aa0a60d" },
  TRANSLATING: { color: "#e8710a", bg: "#e8710a15" },
  TRANSLATED:  { color: "#1a73e8", bg: "#1a73e815" },
  REVIEWING:   { color: "#9334e6", bg: "#9334e615" },
  EDITED:      { color: "#1e8e3e", bg: "#1e8e3e15" },
  APPROVED:    { color: "#1e8e3e", bg: "#1e8e3e15" },
};

const CHART_COLORS = {
  translated: "#1a73e8",
  edited: "#1e8e3e",
};

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-4 py-3 shadow-lg">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-medium tabular-nums">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// Donut chart (SVG, no recharts dependency for this)
function DonutChart({ data }: { data: StatusBreakdown[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) return null;

  const size = 160;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let cumulativePercent = 0;

  return (
    <div className="flex items-center gap-8">
      <div className="relative shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={strokeWidth}
          />
          {/* Segments */}
          {data.map((segment) => {
            const percent = segment.count / total;
            const offset = circumference * (1 - percent);
            const rotation = cumulativePercent * 360 - 90;
            cumulativePercent += percent;
            const colors = STATUS_COLORS[segment.status] || { color: "#9aa0a6" };

            return (
              <circle
                key={segment.status}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={colors.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${circumference}`}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform={`rotate(${rotation} ${center} ${center})`}
                className="transition-all duration-500"
              />
            );
          })}
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums">{total}</span>
          <span className="text-[10px] text-muted-foreground">총 회차</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex-1 space-y-2.5">
        {data.map((segment) => {
          const colors = STATUS_COLORS[segment.status] || { color: "#9aa0a6", bg: "#9aa0a60d" };
          const percent = total > 0 ? Math.round((segment.count / total) * 100) : 0;
          return (
            <div key={segment.status} className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ background: colors.color }}
              />
              <span className="text-sm text-muted-foreground flex-1 truncate">
                {segment.label}
              </span>
              <span className="text-sm font-medium tabular-nums">{segment.count}</span>
              <span className="text-xs text-muted-foreground tabular-nums w-9 text-right">
                {percent}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Custom progress bars for work completion
function WorkProgressList({ data }: { data: WorkStat[] }) {
  return (
    <div className="space-y-4">
      {data.map((work) => {
        const rate = work.completionRate;
        const barColor =
          rate >= 80 ? "#1e8e3e" :
          rate >= 40 ? "#1a73e8" :
          rate > 0 ? "#e8710a" : "#dadce0";

        return (
          <div key={work.id}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium truncate flex-1 mr-4">
                {work.title}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {work.completedChapters}/{work.totalChapters}
                </span>
                <span
                  className="text-xs font-semibold tabular-nums w-10 text-right"
                  style={{ color: barColor }}
                >
                  {rate}%
                </span>
              </div>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${Math.max(rate, 1)}%`, background: barColor }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StatsCharts() {
  const [period, setPeriod] = useState("30d");
  const [data, setData] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/stats?period=${period}`);
        if (!response.ok) {
          throw new Error("통계를 불러오는데 실패했습니다.");
        }
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchStats();
  }, [period]);

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">통계를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-muted-foreground">{error || "데이터를 불러올 수 없습니다."}</p>
      </div>
    );
  }

  const hasTimeSeries = data.timeSeries.some((d) => d.total > 0);
  const hasStatusData = data.statusBreakdown.length > 0;
  const hasWorkData = data.workStats.length > 0;

  // No data at all
  if (!hasTimeSeries && !hasStatusData && !hasWorkData) {
    return (
      <div className="text-center py-12">
        <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-lg font-medium mb-1">아직 통계 데이터가 없습니다</p>
        <p className="text-sm text-muted-foreground">
          번역을 시작하면 여기에 진행 현황이 표시됩니다
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Analytics
          </h2>
          <p className="text-xl font-semibold">상세 통계</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-28 h-9 rounded-lg text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7일</SelectItem>
            <SelectItem value="30d">30일</SelectItem>
            <SelectItem value="90d">90일</SelectItem>
            <SelectItem value="1y">1년</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Mini Cards */}
      {data.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-muted/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">총 회차</p>
            <p className="text-xl font-semibold tabular-nums mt-0.5">{data.summary.totalChapters}</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">번역 완료</p>
            <p className="text-xl font-semibold tabular-nums mt-0.5">{data.summary.translatedChapters}</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">완료율</p>
            <p className="text-xl font-semibold tabular-nums mt-0.5">{data.summary.completionRate}%</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">최근 활동</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xl font-semibold tabular-nums">{data.summary.recentActivity}</p>
              {data.summary.recentActivity > 0 && (
                <TrendingUp className="h-4 w-4 text-status-success" />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Translation Trend - Area Chart */}
        <div>
          <div className="mb-5">
            <h3 className="text-base font-semibold">번역 추이</h3>
            <p className="text-sm text-muted-foreground mt-0.5">기간별 번역 완료 현황</p>
          </div>
          {hasTimeSeries ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.timeSeries} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="gradTranslated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.translated} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={CHART_COLORS.translated} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradEdited" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.edited} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={CHART_COLORS.edited} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="translated"
                  stroke={CHART_COLORS.translated}
                  strokeWidth={2}
                  fill="url(#gradTranslated)"
                  name="번역완료"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--background))" }}
                />
                <Area
                  type="monotone"
                  dataKey="edited"
                  stroke={CHART_COLORS.edited}
                  strokeWidth={2}
                  fill="url(#gradEdited)"
                  name="윤문완료"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--background))" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border">
              <div className="text-center">
                <TrendingUp className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  이 기간에 번역 활동이 없습니다
                </p>
              </div>
            </div>
          )}
          {/* Inline legend */}
          {hasTimeSeries && (
            <div className="flex items-center gap-5 mt-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS.translated }} />
                <span className="text-xs text-muted-foreground">번역완료</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS.edited }} />
                <span className="text-xs text-muted-foreground">윤문완료</span>
              </div>
            </div>
          )}
        </div>

        {/* Status Distribution - Donut */}
        <div>
          <div className="mb-5">
            <h3 className="text-base font-semibold">상태별 분포</h3>
            <p className="text-sm text-muted-foreground mt-0.5">회차 상태 현황</p>
          </div>
          {hasStatusData ? (
            <DonutChart data={data.statusBreakdown} />
          ) : (
            <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border">
              <p className="text-sm text-muted-foreground">등록된 회차가 없습니다</p>
            </div>
          )}
        </div>
      </div>

      {/* Work Completion - Progress Bars */}
      {hasWorkData && (
        <div>
          <div className="mb-5">
            <h3 className="text-base font-semibold">작품별 진행률</h3>
            <p className="text-sm text-muted-foreground mt-0.5">작품별 번역 완료율</p>
          </div>
          <div className="rounded-xl border border-border p-6">
            <WorkProgressList data={data.workStats} />
          </div>
        </div>
      )}
    </div>
  );
}
