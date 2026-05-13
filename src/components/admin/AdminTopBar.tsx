import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import AdminMobileNav from "@/components/admin/AdminMobileNav";
import { logoutAction } from "@/app/actions/auth";
import { APP_SUBTITLE } from "@/lib/app-mode";
import type { Role } from "@/lib/admin-nav";

export default function AdminTopBar({ role }: { role: Role }) {
  return (
    <header className="h-14 sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-[var(--border)] flex items-center px-4 gap-2">
      <AdminMobileNav role={role} />
      <span className="hidden md:inline text-xs font-medium text-slate-500 uppercase tracking-widest">
        {APP_SUBTITLE}
      </span>
      <div className="flex-1" />
      <form action={logoutAction} className="hidden md:block">
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-600 hover:text-rose-600 transition-colors"
        >
          <LogOut className="w-4 h-4 mr-2" />
          ログアウト
        </Button>
      </form>
    </header>
  );
}
