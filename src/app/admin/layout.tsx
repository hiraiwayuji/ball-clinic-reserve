import { ThemeToggle } from "@/components/ThemeToggle";
import { checkAdminAuth, logoutAction } from "@/app/actions/auth";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import AiChatPanel from "@/components/AiChatPanel";
import AdminNavLinks from "@/components/admin/AdminNavLinks";
import { isFamilyGift, APP_TITLE, APP_SUBTITLE } from "@/lib/app-mode";

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
              {!isFamilyGift && (
                <div className="relative w-8 h-8 dark:invert">
                  <Image
                    src="/images/logo-black.png"
                    alt="ボール接骨院"
                    fill
                    className="object-contain"
                  />
                </div>
              )}
              <span className="text-xl font-bold text-slate-900 dark:text-blue-50 group-hover:text-blue-600 transition-colors">{APP_TITLE}</span>
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

      <main className="flex-1 container mx-auto px-4 py-8 relative">
        {children}
      </main>
      
      {/* 全管理画面にAIチャットを配置（CLINICモードのみ） */}
      {!isFamilyGift && <AiChatPanel />}
    </div>
  );
}

