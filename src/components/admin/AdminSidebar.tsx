"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { getAdminNavItems, isActiveNav, type Role } from "@/lib/admin-nav";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
import { isFamilyGift, APP_TITLE } from "@/lib/app-mode";
import { logoutAction } from "@/app/actions/auth";

const hasCustomLogo = !!CLINIC_CONFIG.logoSmallUrl && CLINIC_CONFIG.logoSmallUrl !== "/images/logo-white.png";
const isDefaultClinic = CLINIC_CONFIG.isDefaultClinic;
const showLogoIcon = hasCustomLogo || isDefaultClinic;

type Props = {
  role?: Role;
  /** モバイル Drawer 内で使う場合 true。リンククリック時の onNavigate コールバックも併用 */
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
};

export default function AdminSidebar({ role = "owner", variant = "desktop", onNavigate }: Props) {
  const pathname = usePathname();
  const items = getAdminNavItems(role);
  const homeHref = isFamilyGift ? "/calendar" : "/admin/dashboard";

  return (
    <aside
      className={
        variant === "desktop"
          ? "hidden md:flex md:flex-col w-60 shrink-0 bg-[var(--sidebar)] border-r border-[var(--sidebar-border)] min-h-screen sticky top-0"
          : "flex flex-col w-72 max-w-[85vw] bg-white dark:bg-slate-900 h-full pb-[env(safe-area-inset-bottom)]"
      }
      style={variant === "mobile" ? { backgroundColor: "#ffffff" } : undefined}
    >
      {/* ロゴ・院名 */}
      <div className="h-16 flex items-center gap-2 px-5 border-b border-[var(--sidebar-border)]">
        <Link
          href={homeHref}
          onClick={onNavigate}
          className="flex items-center gap-2 group min-w-0"
        >
          {!isFamilyGift && showLogoIcon && hasCustomLogo && (
            <img
              src={CLINIC_CONFIG.logoSmallUrl}
              alt={CLINIC_CONFIG.nameShort}
              className="h-9 w-auto object-contain max-w-[180px]"
            />
          )}
          {!isFamilyGift && showLogoIcon && !hasCustomLogo && isDefaultClinic && (
            <div className="relative w-8 h-8 shrink-0">
              <Image
                src={CLINIC_CONFIG.logoSmallUrl}
                alt={CLINIC_CONFIG.nameShort}
                fill
                className="object-contain"
              />
            </div>
          )}
          {(!hasCustomLogo || isFamilyGift) && (
            <span className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
              {isFamilyGift ? APP_TITLE : CLINIC_CONFIG.nameShort}
            </span>
          )}
        </Link>
      </div>

      {/* メニュー */}
      <nav className="flex-1 overflow-y-auto py-4 px-3" aria-label="管理メニュー">
        <ul className="space-y-1">
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActiveNav(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "flex items-center gap-3 pl-3 pr-3 py-2 rounded-md text-sm font-semibold text-blue-700 bg-sky-50 border-l-[3px] border-[#2563EB] -ml-[3px]"
                      : "flex items-center gap-3 pl-3 pr-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  }
                >
                  <Icon className={active ? "w-4 h-4 shrink-0 text-[#2563EB]" : "w-4 h-4 shrink-0 text-slate-500"} />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 下部: ログアウト */}
      <div className="border-t border-[var(--sidebar-border)] px-3 py-3">
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>ログアウト</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
