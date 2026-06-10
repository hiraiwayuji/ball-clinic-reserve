import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  UserCheck,
  CalendarDays,
  Users,
  Coins,
  TrendingUp,
  MessageSquare,
  Trophy,
  ShieldCheck,
  Settings,
  CalendarRange,
  CalendarClock,
  CalendarOff,
  Newspaper,
} from "lucide-react";
import { isFamilyGift } from "@/lib/app-mode";

export type Role = "owner" | "admin" | "staff";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  allow: Role[];
};

const CLINIC_NAV_ITEMS: NavItem[] = [
  { href: "/admin/dashboard", label: "ダッシュボード", icon: LayoutDashboard, allow: ["owner", "admin", "staff"] },
  { href: "/admin/counter", label: "受付", icon: UserCheck, allow: ["owner", "admin", "staff"] },
  { href: "/admin/appointments", label: "予約一覧", icon: CalendarDays, allow: ["owner", "admin", "staff"] },
  { href: "/admin/customers", label: "顧客管理", icon: Users, allow: ["owner", "admin", "staff"] },
  { href: "/admin/sales", label: "売上記帳", icon: Coins, allow: ["owner"] },
  { href: "/admin/evaluation", label: "経営評価", icon: TrendingUp, allow: ["owner"] },
  { href: "/admin/marketing", label: "SNS・LINE等", icon: MessageSquare, allow: ["owner", "admin"] },
  { href: "/admin/leaderboard", label: "ランキング", icon: Trophy, allow: ["owner", "admin", "staff"] },
  { href: "/admin/approvals", label: "承認", icon: ShieldCheck, allow: ["owner"] },
  { href: "/admin/my-schedule", label: "私の休み希望", icon: CalendarOff, allow: ["owner", "admin", "staff"] },
  { href: "/admin/settings/staff-schedule", label: "スタッフ予定", icon: CalendarClock, allow: ["owner"] },
  { href: "/admin/settings/external-signals", label: "時事ネタ", icon: Newspaper, allow: ["owner", "admin"] },
  { href: "/admin/settings", label: "設定", icon: Settings, allow: ["owner"] },
];

const FAMILY_GIFT_NAV_ITEMS: NavItem[] = [
  { href: "/calendar", label: "カレンダーへ", icon: CalendarRange, allow: ["owner", "admin", "staff"] },
  { href: "/admin/settings", label: "設定", icon: Settings, allow: ["owner"] },
];

export function getAdminNavItems(role: Role): NavItem[] {
  const source = isFamilyGift ? FAMILY_GIFT_NAV_ITEMS : CLINIC_NAV_ITEMS;
  return source.filter((item) => item.allow.includes(role));
}

export function isActiveNav(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
