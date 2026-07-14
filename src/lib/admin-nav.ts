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
  Clock,
  Bell,
  Dumbbell,
} from "lucide-react";
import { isFamilyGift } from "@/lib/app-mode";
import { isTrainingEnabled } from "@/lib/training-catalog";

export type Role = "owner" | "admin" | "staff";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  allow: Role[];
  /** ホバー時に表示する一言説明（title 属性） */
  description?: string;
  /** サイドバーのグループ見出し。同じ group が連続する項目がまとまって表示される */
  group?: string;
};

const CLINIC_NAV_ITEMS: NavItem[] = [
  { href: "/admin/dashboard", label: "ダッシュボード", icon: LayoutDashboard, allow: ["owner", "admin", "staff"], group: "日々の業務", description: "今日の予約・やること・お知らせをまとめて確認" },
  { href: "/admin/counter", label: "受付", icon: UserCheck, allow: ["owner", "admin", "staff"], group: "日々の業務", description: "来院した患者さんの受付〜会計までを進める画面" },
  { href: "/admin/appointments", label: "予約一覧", icon: CalendarDays, allow: ["owner", "admin", "staff"], group: "日々の業務", description: "予約カレンダー。予約の追加・変更・休憩枠もここから" },
  { href: "/admin/customers", label: "顧客管理", icon: Users, allow: ["owner", "admin", "staff"], group: "日々の業務", description: "患者さんの一覧・検索・LINE連携の確認" },
  { href: "/admin/training", label: "トレーニング評価", icon: Dumbbell, allow: ["owner", "admin", "staff"], group: "トレーニング", description: "身体機能を筋力・反射・運動神経の3軸＋左右差で採点し、宿題と次回目標を記録" },
  { href: "/admin/sales", label: "売上記帳", icon: Coins, allow: ["owner"], group: "売上・経営", description: "その日の売上を記帳する画面" },
  { href: "/admin/evaluation", label: "経営評価", icon: TrendingUp, allow: ["owner"], group: "売上・経営", description: "月ごとの売上・来院数などの成績表" },
  { href: "/admin/marketing", label: "SNS・LINE等", icon: MessageSquare, allow: ["owner", "admin"], group: "集客", description: "LINE配信・SNS投稿などの集客ツール" },
  { href: "/admin/leaderboard", label: "ランキング", icon: Trophy, allow: ["owner", "admin", "staff"], group: "集客", description: "スタッフの頑張りポイントランキング" },
  { href: "/admin/settings/external-signals", label: "時事ネタ", icon: Newspaper, allow: ["owner", "admin"], group: "集客", description: "季節・地域の話題を投稿ネタに活用" },
  { href: "/admin/approvals", label: "承認", icon: ShieldCheck, allow: ["owner"], group: "スタッフ管理", description: "スタッフの休み希望・変更申請をOK/NGする画面" },
  { href: "/admin/my-schedule", label: "出勤調整", icon: CalendarOff, allow: ["owner"], group: "スタッフ管理", description: "月ごとの出勤表（シフト）づくり" },
  { href: "/admin/shift-reminders", label: "シフト希望の通知", icon: Bell, allow: ["owner"], group: "スタッフ管理", description: "出勤希望の提出リンクを締切前に各自LINEへ自動送信・催促" },
  { href: "/admin/attendance", label: "勤怠", icon: Clock, allow: ["owner"], group: "スタッフ管理", description: "出勤・退勤の打刻記録と残業の確認" },
  { href: "/admin/settings/staff-schedule", label: "スタッフ予定", icon: CalendarClock, allow: ["owner"], group: "スタッフ管理", description: "スタッフごとの出勤日・予定の設定" },
  { href: "/admin/settings", label: "設定", icon: Settings, allow: ["owner"], group: "設定", description: "院の基本情報・コース・通知などの設定" },
];

const FAMILY_GIFT_NAV_ITEMS: NavItem[] = [
  { href: "/calendar", label: "カレンダーへ", icon: CalendarRange, allow: ["owner", "admin", "staff"] },
  { href: "/admin/settings", label: "設定", icon: Settings, allow: ["owner"] },
];

export function getAdminNavItems(role: Role): NavItem[] {
  const source = isFamilyGift ? FAMILY_GIFT_NAV_ITEMS : CLINIC_NAV_ITEMS;
  return source.filter((item) => {
    if (!item.allow.includes(role)) return false;
    // トレーニング評価は対象3院（ボール・からだ・マッスル）のみ表示
    if (item.href === "/admin/training" && !isTrainingEnabled()) return false;
    return true;
  });
}

export function isActiveNav(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
