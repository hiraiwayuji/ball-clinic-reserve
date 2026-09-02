import AdminMobileNav from "@/components/admin/AdminMobileNav";
import { APP_SUBTITLE } from "@/lib/app-mode";
import type { Role } from "@/lib/admin-nav";

export default function AdminTopBar({ role, salesInputMode }: { role: Role; salesInputMode?: string | null }) {
  // ログアウトはサイドバー下部の1か所だけ（確認つき）。右上にも置くと、受付の共用アカウントが
  // 誤タップでログアウトされ、パスワードを知らない受付が詰む事故になるため外した。
  return (
    <header className="h-14 sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-[var(--border)] flex items-center px-4 gap-2">
      <AdminMobileNav role={role} salesInputMode={salesInputMode} />
      <span className="hidden md:inline text-xs font-medium text-slate-500 uppercase tracking-widest">
        {APP_SUBTITLE}
      </span>
      <div className="flex-1" />
    </header>
  );
}
