"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "ダッシュボード" },
  { href: "/admin/appointments", label: "予約一覧" },
  { href: "/admin/customers", label: "顧客管理" },
  { href: "/admin/sales", label: "売上記帳" },
  { href: "/admin/evaluation", label: "経営評価" },
  { href: "/admin/marketing", label: "LINE・販促" },
  { href: "/admin/settings", label: "設定" },
];

export default function AdminNavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-x-1 gap-y-1 text-sm items-center">
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
  );
}
