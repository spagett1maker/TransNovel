import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Serif_KR } from "next/font/google";

import { Suspense } from "react";

import { SessionProvider } from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TranslationProvider } from "@/contexts/translation-context";
import { BibleGenerationProvider } from "@/contexts/bible-generation-context";
import { GlobalTranslationIndicator } from "@/components/layout/global-translation-indicator";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/error-boundary";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSerifKR = Noto_Serif_KR({
  variable: "--font-noto-serif-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "TransNovel - 문학 번역 플랫폼",
    template: "%s | TransNovel",
  },
  description: "AI 기반 고품질 문학 번역 서비스. 원작의 문체와 뉘앙스를 살린 번역, 전문 윤문가의 감수로 완성도를 높이세요.",
  metadataBase: new URL(process.env.NEXTAUTH_URL || "https://transnovel.com"),
  openGraph: {
    type: "website",
    siteName: "TransNovel",
    title: "TransNovel - AI 기반 문학 번역 플랫폼",
    description: "원작의 문체와 뉘앙스를 살린 고품질 번역. 전문 윤문가의 감수로 완성도를 높이세요.",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "TransNovel - AI 기반 문학 번역 플랫폼",
    description: "원작의 문체와 뉘앙스를 살린 고품질 번역. 전문 윤문가의 감수로 완성도를 높이세요.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSerifKR.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <SessionProvider>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <TranslationProvider>
            <BibleGenerationProvider>
              {children}
              <ErrorBoundary fallback={null}>
                <GlobalTranslationIndicator />
              </ErrorBoundary>
              <Toaster />
            </BibleGenerationProvider>
          </TranslationProvider>
        </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
