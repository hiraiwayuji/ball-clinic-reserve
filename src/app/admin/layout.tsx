import { checkAdminAuth, logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import Link from "next/link";
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
            <span className="text-xl font-bold text-slate-900">予約管理システム</span>
            <nav className="hidden md:flex gap-4 text-sm">
              <Link href="/admin/dashboard" className="text-blue-600 font-medium">ダッシュボード</Link>
              <Link href="/admin/appointments" className="text-slate-600 hover:text-blue-600">予約一覧</Link>
              <Link href="/admin/customers" className="text-slate-600 hover:text-blue-600">顧客管理</Link>
              <Link href="/admin/sales" className="text-slate-600 hover:text-blue-600">売上入力</Link>
              <Link href="/admin/insurance" className="text-slate-600 hover:text-blue-600">保険入金</Link>
              <Link href="/admin/expenses" className="text-slate-600 hover:text-blue-600">経費</Link>
              <Link href="/admin/evaluation" className="text-slate-600 hover:text-blue-600">経営評価</Link>
              <Link href="/admin/holidays" className="text-slate-600 hover:text-blue-600">休診日</Link>
              <Link href="/admin/marketing" className="text-slate-600 hover:text-blue-600">LINE・販促</Link>
              <Link href="/admin/settings" className="text-slate-600 hover:text-blue-600 border-l pl-4 border-slate-300">設定</Link>
              <Link href="/" className="text-slate-600 hover:text-blue-600 text-xs ml-4 border-l pl-4 border-slate-300" target="_blank">
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
