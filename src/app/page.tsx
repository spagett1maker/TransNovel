import { ArrowRight, BookOpen, Languages, Sparkles, Users, Zap, Shield } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";

const features = [
  {
    icon: Sparkles,
    title: "AI 기반 번역",
    description: "Gemini AI가 원작의 문체와 뉘앙스를 살린 자연스러운 번역을 제공합니다.",
  },
  {
    icon: BookOpen,
    title: "서지정보 시스템",
    description: "캐릭터, 용어, 세계관 설정을 자동 분석하여 일관된 번역 품질을 유지합니다.",
  },
  {
    icon: Users,
    title: "전문 윤문가 매칭",
    description: "마켓플레이스에서 전문 윤문가를 찾아 번역의 완성도를 높이세요.",
  },
  {
    icon: Zap,
    title: "실시간 협업",
    description: "작가와 윤문가가 실시간으로 원고를 검토하고 수정사항을 반영합니다.",
  },
  {
    icon: Languages,
    title: "다국어 지원",
    description: "중국어, 일본어, 영어 원작을 고품질 한국어로 번역합니다.",
  },
  {
    icon: Shield,
    title: "안전한 원고 관리",
    description: "체계적인 권한 관리와 버전 추적으로 원고를 안전하게 보호합니다.",
  },
];

const steps = [
  { num: "01", title: "프로젝트 등록", desc: "원작 정보와 원고를 업로드하세요" },
  { num: "02", title: "설정집 생성", desc: "AI가 캐릭터·용어를 자동 분석합니다" },
  { num: "03", title: "AI 번역 실행", desc: "설정집 기반 맞춤형 번역을 시작합니다" },
  { num: "04", title: "윤문 및 완성", desc: "전문가 검토로 최종 품질을 확보하세요" },
];

export default async function HomePage() {
  const session = await getSession();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/40">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">TransNovel</span>
          </Link>
          <div className="flex items-center gap-3">
            {session ? (
              <Button asChild className="rounded-full px-6">
                <Link href="/dashboard">대시보드</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild className="rounded-full">
                  <Link href="/login">로그인</Link>
                </Button>
                <Button asChild className="rounded-full px-6">
                  <Link href="/register">시작하기</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-muted/50 via-transparent to-transparent" />
        <div className="container mx-auto px-6 pt-24 pb-32 relative">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-6">
              AI-Powered Literary Translation
            </p>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
              원작의 감동을
              <br />
              <span className="bg-gradient-to-r from-status-info via-status-progress to-status-success bg-clip-text text-transparent">
                그대로 전하다
              </span>
            </h1>
            <p className="mt-8 text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
              AI 번역과 전문 윤문가의 협업으로 원작의 문체와 뉘앙스를 살린 고품질 번역을 완성하세요.
            </p>
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" asChild className="rounded-full px-10 h-12 text-base">
                <Link href={session ? "/dashboard" : "/register"}>
                  무료로 시작하기
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild className="rounded-full px-10 h-12 text-base">
                <Link href="/login">
                  기존 계정 로그인
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 border-t border-border/40">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Process</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              간단한 4단계로 시작하세요
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {steps.map((step, i) => (
              <div key={step.num} className="relative">
                {i < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-border -translate-x-4" />
                )}
                <div className="text-4xl font-bold text-muted-foreground/20 tabular-nums mb-4">
                  {step.num}
                </div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              번역에 필요한 모든 것
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="bg-background rounded-2xl p-8 border border-border/60 hover:border-border hover:shadow-lg transition-all duration-300"
                >
                  <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center mb-5">
                    <Icon className="h-5 w-5 text-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
              지금 바로 시작하세요
            </h2>
            <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto">
              무료로 가입하고 AI 번역의 품질을 직접 경험해보세요.
              전문 윤문가 매칭까지, 번역의 모든 과정을 지원합니다.
            </p>
            <Button size="lg" asChild className="rounded-full px-10 h-12 text-base">
              <Link href={session ? "/dashboard" : "/register"}>
                무료로 시작하기
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="container mx-auto px-6 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} TransNovel
          </span>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">로그인</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">회원가입</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
