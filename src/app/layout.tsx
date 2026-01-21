import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Serif_KR } from "next/font/google";

import { SessionProvider } from "@/components/providers/session-provider";
import { TranslationProvider } from "@/contexts/translation-context";
import { BibleGenerationProvider } from "@/contexts/bible-generation-context";
import { GlobalTranslationIndicator } from "@/components/layout/global-translation-indicator";
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
  title: "TransNovel - 문학 번역 플랫폼",
  description: "AI 기반 고품질 문학 번역 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSerifKR.variable} antialiased`}
      >
        <SessionProvider>
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
      </body>
    </html>
  );
}
