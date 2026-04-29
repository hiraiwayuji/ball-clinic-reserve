"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Menu, X } from "lucide-react";
import { isFamilyGift } from "@/lib/app-mode";

type Role = "owner" | "admin" | "staff";

type NavItem = { href: string; label: string; allow: Role[] };

// role ごとに表示する項目を制御
const CLINIC_NAV_ITEMS: NavItem[] = [
  { href: "/admin/dashboard", label: "ダッシュボード", allow: ["owner", "admin", "staff"] },
  { href: "/admin/counter", label: "受付", allow: ["owner", "admin", "staff"] },
  { href: "/admin/appointments", label: "予約一覧", allow: ["owner", "admin", "staff"] },
  { href: "/admin/customers", label: "顧客管理", allow: ["owner", "admin", "staff"] },
  { href: "/admin/sales", label: "売上記帳", allow: ["owner", "admin"] },
  { href: "/admin/evaluation", label: "経営評価", allow: ["owner", "admin"] },
  { href: "/admin/marketing", label: "LINE・販促", allow: ["owner", "admin"] },
  { href: "/admin/leaderboard", label: "🏆 ランキング", allow: ["owner", "admin", "staff"] },
  { href: "/admin/approvals", label: "承認", allow: ["owner"] },
  { href: "/admin/settings", label: "設定", allow: ["owner"] },
];

const FAMILY_GIFT_NAV_ITEMS: NavItem[] = [
  { href: "/calendar", label: "カレンダーへ", allow: ["owner", "admin", "staff"] },
  { href: "/admin/settings", label: "設定", allow: ["owner"] },
];

export default function AdminNavLinks({ role = "owner" }: { role?: Role }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const SOURCE = isFamilyGift ? FAMILY_GIFT_NAV_ITEMS : CLINIC_NAV_ITEMS;
  const NAV_ITEMS = SOURCE.filter((item) => item.allow.includes(role));

  // パス変更時にメニューを閉じる
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // メニュー外タップで閉じる
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <>
      {/* デスクトップ: 横並びナビ */}
      <nav className="hidden md:flex flex-wrap gap-x-1 gap-y-1 text-sm items-center">
        {NAV_ITEMS.map(({ href, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={
                isActive
                  ? "px-3 py-1 rounded-md font-bold whitespace-nowrap transition-colors bg-blue-600 text-white dark:bg-blue-500 dark:text-white shadow-sm"
                  : "px-3 py-1 rounded-md font-medium whitespace-nowrap transition-colors text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              }
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* モバイル: ハンバーガーメニュー */}
      <div className="relative md:hidden" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="p-2 rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="メニューを開く"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {menuOpen && (
          <div className="absolute left-0 top-full mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
            {NAV_ITEMS.map(({ href, label }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={
                    isActive
                      ? "block px-4 py-3 text-sm font-bold bg-blue-600 text-white"
                      : "block px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  }
                >
                  {label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
