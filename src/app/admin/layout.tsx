import { checkAdminAuth, logoutAction } from "@/app/actions/auth";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import AiChatPanel from "@/components/AiChatPanel";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // admin配下のページはすべてここで認証チェックを行う（/admin/login は除くためlayoutの配置に注意）
  await checkAdminAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/dashboard" className="flex items-center gap-2 group">
              <div className="relative w-8 h-8">
                <Image 
                  src="/images/logo-black.png" 
                  alt="ボール接骨院" 
                  fill 
                  className="object-contain"
                />
              </div>
              <span className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">ボール接骨院</span>
            </Link>
            <div className="h-6 w-px bg-slate-200 mx-2 hidden md:block" />
            <span className="text-sm font-medium text-slate-500 hidden md:block">予約管理システム</span>
            <nav className="hidden lg:flex gap-5 text-sm items-center">
              <Link href="/admin/dashboard" className="text-slate-600 hover:text-blue-600 font-medium">ダッシュボード</Link>
              <Link href="/admin/appointments" className="text-slate-600 hover:text-blue-600">予約一覧</Link>
              <Link href="/admin/customers" className="text-slate-600 hover:text-blue-600">顧客管理</Link>
              <Link href="/admin/expenses" className="px-3 py-1 bg-slate-100 rounded-md text-slate-700 hover:bg-slate-200 transition-colors font-bold">売上記帳</Link>
              <Link href="/admin/evaluation" className="text-slate-600 hover:text-blue-600">経営評価</Link>
              <Link href="/admin/marketing" className="text-slate-600 hover:text-blue-600">LINE・販促</Link>
              <Link href="/admin/settings" className="text-slate-400 hover:text-blue-600 ml-2">設定</Link>
              <Link href="/" className="text-slate-400 hover:text-blue-600 text-xs ml-2 border-l pl-4" target="_blank">
                サイトを表示
              </Link>
            </nav>
          </div>
          <form action={logoutAction}>
            <Button variant="ghost" size="sm" className="text-slate-600">
              <LogOut className="w-4 h-4 mr-2" />
              ログアウト
            </Button>
          </form>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 relative">
        {children}
      </main>
      
      {/* 全管理画面にAIチャットを配置 */}
      <AiChatPanel />
    </div>
  );
}

