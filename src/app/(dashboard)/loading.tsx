import { Spinner } from "@/components/ui/spinner";

export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Spinner size="lg" label="대시보드 로딩 중..." className="text-muted-foreground" />
    </div>
  );
}
