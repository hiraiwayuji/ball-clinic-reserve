import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import { Toaster } from "@/components/ui/sonner";
import { isFamilyGift } from "@/lib/app-mode";
import { CLINIC_CONFIG } from "@/lib/clinic-config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = isFamilyGift
  ? {
      title: "家族カレンダー by V-ARC",
      description: "家族みんなで使えるGoogleカレンダー風アプリ。予定を共有しよう。",
    }
  : {
      title: `${CLINIC_CONFIG.name} | Web予約システム`,
      description: `${CLINIC_CONFIG.name}のWeb予約システムです。24時間オンラインで予約・確認が可能です。`,
    };

import { ThemeProvider } from "@/components/ThemeProvider";

// ホーム画面アイコンの表示名（iOS）。予約院では院名、家族配布では家族カレンダー。
const APPLE_APP_TITLE = isFamilyGift ? "家族カレンダー" : `${CLINIC_CONFIG.nameShort} 予約`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      suppressHydrationWarning
      data-clinic-warm={CLINIC_CONFIG.reserveTheme === "warm" ? "" : undefined}
      data-clinic-light={CLINIC_CONFIG.reserveTheme === "light" ? "" : undefined}
    >
      <head>
        <meta name="google" content="notranslate" />
        {/* manifest は app/manifest.ts が /manifest.webmanifest として自動リンクする（モード別） */}
        <meta name="theme-color" content="#3b82f6" />
        {/* iOS PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={APPLE_APP_TITLE} />
        <link rel="apple-touch-icon" href="/images/logo_symbol_main_black.png" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ServiceWorkerRegistrar />
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
