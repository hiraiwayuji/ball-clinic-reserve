"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import AdminSidebar from "@/components/admin/AdminSidebar";
import type { Role } from "@/lib/admin-nav";

export default function AdminMobileNav({ role = "owner" }: { role?: Role }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // パス変更で自動クローズ
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // ESC で閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // body スクロール抑止
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-2 rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
        aria-label="メニューを開く"
        aria-expanded={open}
      >
        <Menu className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
          {/* オーバーレイ */}
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label="メニューを閉じる"
          />
          {/* Drawer 本体 */}
          <div className="relative z-10 h-full bg-white dark:bg-slate-900 shadow-xl animate-in slide-in-from-left duration-200">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 z-20 p-2 rounded-md text-slate-500 hover:bg-slate-100"
              aria-label="メニューを閉じる"
            >
              <X className="w-5 h-5" />
            </button>
            <AdminSidebar role={role} variant="mobile" onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
