export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-background">
      {/* Brand Section - hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-foreground via-foreground/95 to-foreground/85" />

        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-status-info/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-status-success/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-status-progress/5 rounded-full blur-2xl" />

        {/* Content */}
        <div className="relative z-10">
          <span className="text-xl font-semibold tracking-tight text-primary-foreground">
            TransNovel
          </span>
        </div>

        <div className="relative z-10 max-w-md">
          <p className="text-xs uppercase tracking-widest text-primary-foreground/50 mb-6">
            AI-Powered Literary Translation
          </p>
          <h2 className="text-4xl font-bold tracking-tight mb-5 text-primary-foreground leading-[1.15]">
            원작의 감동을
            <br />
            그대로 전하다
          </h2>
          <p className="text-primary-foreground/60 text-lg leading-relaxed">
            AI 번역과 전문 윤문가의 협업으로
            <br />
            원작의 문체와 뉘앙스를 살린 고품질 번역을 완성하세요.
          </p>

          <div className="mt-12 grid grid-cols-3 gap-8">
            <div>
              <p className="text-3xl font-bold tabular-nums text-primary-foreground">AI</p>
              <p className="text-xs text-primary-foreground/40 mt-1.5">스마트 번역</p>
            </div>
            <div>
              <p className="text-3xl font-bold tabular-nums text-primary-foreground">1:1</p>
              <p className="text-xs text-primary-foreground/40 mt-1.5">전문가 윤문</p>
            </div>
            <div>
              <p className="text-3xl font-bold tabular-nums text-primary-foreground">3+</p>
              <p className="text-xs text-primary-foreground/40 mt-1.5">지원 언어</p>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-primary-foreground/30">
          &copy; {new Date().getFullYear()} TransNovel
        </p>
      </div>

      {/* Form Section */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
