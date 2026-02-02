import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <p className="text-8xl font-semibold tracking-tighter text-foreground">
          404
        </p>
        <div className="mt-6 mb-8">
          <h1 className="text-xl font-medium mb-2">
            페이지를 찾을 수 없습니다
          </h1>
          <p className="text-muted-foreground">
            요청하신 페이지가 존재하지 않거나 이동되었습니다.
            <br />
            URL을 확인하거나 대시보드로 돌아가주세요.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-md hover:shadow-lg hover:-translate-y-px transition-all"
          >
            대시보드로 이동
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-border px-6 py-2.5 text-sm font-medium text-foreground hover:bg-muted hover:shadow-sm transition-all"
          >
            홈으로
          </Link>
        </div>
        <p className="mt-12 text-xs text-muted-foreground">
          TransNovel
        </p>
      </div>
    </div>
  );
}
