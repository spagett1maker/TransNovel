import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">TransNovel</span>
          </div>
          <div>
            {session ? (
              <Button asChild>
                <Link href="/dashboard">대시보드</Link>
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" asChild>
                  <Link href="/login">로그인</Link>
                </Button>
                <Button asChild>
                  <Link href="/register">시작하기</Link>
                </Button>
              </div>
            )}
          </div>
        </nav>
      </header>

      {/* Hero */}
      <main className="container mx-auto px-4 py-32">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-5xl font-bold tracking-tight">
            AI 기반
            <br />
            웹소설 번역 플랫폼
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Gemini AI를 활용한 고품질 중국어 웹소설 번역.
            <br />
            서지정보 기반 맞춤형 프롬프트로 자연스러운 한국어 번역을 제공합니다.
          </p>
          <div className="mt-10">
            <Button size="lg" asChild>
              <Link href={session ? "/dashboard" : "/register"}>
                무료로 시작하기
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
