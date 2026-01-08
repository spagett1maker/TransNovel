import { ArrowRight, BookOpen, Languages, Sparkles, Zap } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Languages className="h-6 w-6 text-blue-600" />
            <span className="text-xl font-bold">TransNovel</span>
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
      <main className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-5xl font-bold tracking-tight text-gray-900">
            AI 기반
            <br />
            <span className="text-blue-600">웹소설 번역</span> 플랫폼
          </h1>
          <p className="mt-6 text-xl text-gray-600">
            Gemini AI를 활용한 고품질 중국어 웹소설 번역.
            <br />
            서지정보 기반 맞춤형 프롬프트로 자연스러운 한국어 번역을 제공합니다.
          </p>
          <div className="mt-10 flex justify-center gap-4">
            <Button size="lg" asChild>
              <Link href={session ? "/dashboard" : "/register"}>
                무료로 시작하기
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="mt-32 grid gap-8 md:grid-cols-3">
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Sparkles className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">맞춤형 프롬프트</h3>
            <p className="mt-2 text-gray-600">
              장르, 연령등급, 줄거리를 분석해 작품에 최적화된 번역 프롬프트를
              자동 생성합니다.
            </p>
          </div>
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <BookOpen className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">용어집 관리</h3>
            <p className="mt-2 text-gray-600">
              인명, 지명, 스킬명 등 고유명사를 등록하면 일관된 번역어로 자동
              적용됩니다.
            </p>
          </div>
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <Zap className="h-6 w-6 text-purple-600" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">빠른 번역</h3>
            <p className="mt-2 text-gray-600">
              Gemini 2.0 Flash를 활용해 대용량 원고도 빠르게 번역합니다. 배치
              번역도 지원합니다.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-32">
          <h2 className="text-center text-3xl font-bold">이용 방법</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-4">
            {[
              { step: 1, title: "작품 등록", desc: "서지정보 입력" },
              { step: 2, title: "원고 업로드", desc: "txt 파일 업로드" },
              { step: 3, title: "용어집 설정", desc: "고유명사 등록" },
              { step: 4, title: "번역 실행", desc: "AI 자동 번역" },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white">
                  {item.step}
                </div>
                <h3 className="mt-4 font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white py-8">
        <div className="container mx-auto px-4 text-center text-sm text-gray-500">
          <p>TransNovel - AI 기반 웹소설 번역 플랫폼</p>
        </div>
      </footer>
    </div>
  );
}
