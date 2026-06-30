import { redirect } from "next/navigation";
import { isFamilyGift } from "@/lib/app-mode";

export default function FamilyPage() {
  // 家族カレンダー配布(FAMILY_GIFT)のときだけ実カレンダーへ。
  // 予約院(CLINIC/DEMO)のデプロイでは、ホーム画面アイコン等がここに来ても
  // 合言葉カレンダーではなく予約管理へ送る（PWA入口の取り違え対策）。
  redirect(isFamilyGift ? "/calendar/76p83beb" : "/admin");
}
