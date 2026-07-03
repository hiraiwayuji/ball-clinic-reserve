import { isFamilyGift } from "@/lib/app-mode";
import { CLINIC_CONFIG } from "@/lib/clinic-config";

/**
 * PWA/ホーム画面アイコン（manifest と apple-touch-icon で共用）。
 * ボール本体（と家族カレンダー配布）だけボールのロゴ、
 * 他院は env のカスタムアイコン → 中立アイコン（青地「予約」）の順。
 * ボールロゴを全院共通にしない（他院の端末にボールのアイコンが並ぶ事故防止）。
 */
export function clinicPwaIconSrc(): string {
  if (isFamilyGift || CLINIC_CONFIG.isDefaultClinic) {
    // clinic-leak-ignore: ボール本体/家族カレンダー配布に限定したボールロゴ
    return "/images/logo_symbol_main_black.png";
  }
  return process.env.NEXT_PUBLIC_CLINIC_PWA_ICON ?? "/images/pwa-icon-neutral.png";
}
