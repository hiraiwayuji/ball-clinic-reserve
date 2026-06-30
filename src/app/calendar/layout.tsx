import { redirect } from "next/navigation";
import { isFamilyGift } from "@/lib/app-mode";

/**
 * 共有カレンダー(/calendar/*)は家族カレンダー配布(FAMILY_GIFT)専用。
 * 予約院(CLINIC/DEMO)のデプロイでは、ホーム画面アイコンやブックマークが
 * 直接 /calendar/◯◯ を指していても、合言葉画面で行き止まりにならないよう
 * 予約管理へ送る。FAMILY_GIFT のときはそのまま表示する。
 */
export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  if (!isFamilyGift) redirect("/admin");
  return <>{children}</>;
}
