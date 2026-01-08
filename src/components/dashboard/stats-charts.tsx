"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#e5e7eb",
  TRANSLATING: "#fbbf24",
  TRANSLATED: "#3b82f6",
  REVIEWING: "#a855f7",
  EDITED: "#22c55e",
  APPROVED: "#10b981",
};

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
      <Card>
        <CardContent className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex h-64 items-center justify-center">
          <p className="text-gray-500">{error || "데이터를 불러올 수 없습니다."}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">상세 통계</h2>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-32">
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

      <div className="grid gap-6 md:grid-cols-2">
        {/* Translation Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">번역 추이</CardTitle>
            <CardDescription>기간별 번역 완료 현황</CardDescription>
          </CardHeader>
          <CardContent>
            {data.timeSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={data.timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis tick={{ fontSize: 12 }} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="translated"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="번역완료"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="edited"
                    stroke="#22c55e"
                    strokeWidth={2}
                    name="윤문완료"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[250px] items-center justify-center text-gray-500">
                데이터가 없습니다
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Distribution Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">상태별 분포</CardTitle>
            <CardDescription>회차 상태 현황</CardDescription>
          </CardHeader>
          <CardContent>
            {data.statusBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={data.statusBreakdown}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {data.statusBreakdown.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_COLORS[entry.status] || "#e5e7eb"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [value, name]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[250px] items-center justify-center text-gray-500">
                데이터가 없습니다
              </div>
            )}
          </CardContent>
        </Card>

        {/* Work Completion Chart */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">작품별 진행률</CardTitle>
            <CardDescription>작품별 번역 완료율</CardDescription>
          </CardHeader>
          <CardContent>
            {data.workStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(200, data.workStats.length * 40)}>
                <BarChart
                  data={data.workStats}
                  layout="vertical"
                  margin={{ left: 0, right: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="title"
                    tick={{ fontSize: 12 }}
                    width={150}
                  />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "완료율"]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                    }}
                  />
                  <Bar
                    dataKey="completionRate"
                    fill="#3b82f6"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-gray-500">
                등록된 작품이 없습니다
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
