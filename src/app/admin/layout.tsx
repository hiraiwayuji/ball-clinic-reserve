import { ThemeToggle } from "@/components/ThemeToggle";

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
            <Link href="/admin/dashboard" className="flex items-center gap-2 group">
              <div className="relative w-8 h-8 dark:invert">
                <Image 
                  src="/images/logo-black.png" 
                  alt="ボール接骨院" 
                  fill 
                  className="object-contain"
                />
              </div>
              <span className="text-xl font-bold text-slate-900 dark:text-blue-50 group-hover:text-blue-600 transition-colors">ボール接骨院</span>
            </Link>
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-2 hidden md:block" />
            <span className="text-sm font-medium text-slate-500 hidden md:block uppercase tracking-widest">AI Secretary System</span>
            <nav className="hidden lg:flex gap-5 text-sm items-center">
              <Link href="/admin/dashboard" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium">ダッシュボード</Link>
              <Link href="/admin/appointments" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">予約一覧</Link>
              <Link href="/admin/customers" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">顧客管理</Link>
              <Link href="/admin/expenses" className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-bold">売上記帳</Link>
              <Link href="/admin/evaluation" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">経営評価</Link>
              <Link href="/admin/marketing" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">LINE・販促</Link>
              <Link href="/admin/settings" className="text-slate-400 dark:text-slate-600 hover:text-blue-600 ml-2">設定</Link>
            </nav>
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
      
      {/* 全管理画面にAIチャットを配置 */}
      <AiChatPanel />
    </div>
  );
}

