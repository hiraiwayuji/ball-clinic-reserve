import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import { Toaster } from "@/components/ui/sonner";
import { isFamilyGift } from "@/lib/app-mode";

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
      title: `${process.env.NEXT_PUBLIC_CLINIC_NAME ?? "ボール接骨院"} | Web予約システム`,
      description: `${process.env.NEXT_PUBLIC_CLINIC_NAME ?? "ボール接骨院"}のWeb予約システムです。24時間オンラインで予約・確認が可能です。`,
    };

import { ThemeProvider } from "@/components/ThemeProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#3b82f6" />
        {/* iOS PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="V-ARC AI秘書" />
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
