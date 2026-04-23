import { ThemeToggle } from "@/components/ThemeToggle";
import { checkAdminAuth, logoutAction } from "@/app/actions/auth";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import AiChatPanel from "@/components/AiChatPanel";
import AdminNavLinks from "@/components/admin/AdminNavLinks";
import { isFamilyGift, isDemo, APP_TITLE, APP_SUBTITLE } from "@/lib/app-mode";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
const hasCustomLogo = CLINIC_CONFIG.logoSmallUrl !== "/images/logo-white.png";
// デフォルトロゴ（ボール接骨院のロゴマーク）はボール接骨院専用
const isDefaultClinic = CLINIC_CONFIG.name === "ボール接骨院";
const showLogoIcon = hasCustomLogo || isDefaultClinic;
import { FlaskConical } from "lucide-react";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // admin配下のページはすべてここで認証チェックを行う（/admin/login は除くためlayoutの配置に注意）
  await checkAdminAuth();

  return (
    <div className="min-h-screen bg-background dark:bg-slate-950 flex flex-col transition-colors duration-500">
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b sticky top-0 z-50 transition-colors duration-500">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={isFamilyGift ? "/calendar" : "/admin/dashboard"} className="flex items-center gap-2 group">
              {!isFamilyGift && showLogoIcon && hasCustomLogo && (
                <img
                  src={CLINIC_CONFIG.logoSmallUrl}
                  alt={CLINIC_CONFIG.nameShort}
                  className="h-10 w-auto object-contain max-w-[200px]"
                />
              )}
              {!isFamilyGift && showLogoIcon && !hasCustomLogo && isDefaultClinic && (
                <div className="relative w-8 h-8">
                  <Image src={CLINIC_CONFIG.logoSmallUrl} alt={CLINIC_CONFIG.nameShort} fill className="object-contain dark:invert" />
                </div>
              )}
              {(!hasCustomLogo || isFamilyGift) && (
                <span className="text-xl font-bold text-slate-900 dark:text-blue-50 group-hover:text-blue-600 transition-colors">
                  {isFamilyGift ? APP_TITLE : CLINIC_CONFIG.nameShort}
                </span>
              )}
            </Link>
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-2 hidden md:block" />
            <span className="text-sm font-medium text-slate-500 hidden md:block uppercase tracking-widest">{APP_SUBTITLE}</span>
            <AdminNavLinks />
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1" />
            <form action={logoutAction}>
              <Button variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400 hover:text-rose-600 transition-colors">
                <LogOut className="w-4 h-4 mr-1 md:mr-2" />
                <span className="hidden md:inline">ログアウト</span>
              </Button>
            </form>
          </div>
        </div>
      </header>

      {isDemo && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2 text-amber-400 text-xs font-bold">
          <FlaskConical className="w-3.5 h-3.5" />
          DEMO MODE — テスト環境です。重要な設定変更は無効化されています。
        </div>
      )}
      <main className="flex-1 container mx-auto px-4 py-8 relative">
        {children}
      </main>
      
      {/* 全管理画面にAIチャットを配置（CLINICモードのみ） */}
      {!isFamilyGift && <AiChatPanel />}
    </div>
  );
}

