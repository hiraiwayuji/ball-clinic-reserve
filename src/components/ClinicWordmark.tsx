import Image from "next/image";
import { CLINIC_CONFIG } from "@/lib/clinic-config";

/**
 * 院ロゴの共通表示。ボールのロゴが他院に漏れるのを防ぐための単一の出口。
 *
 * 表示ルール:
 *   1. 独自ロゴあり（NEXT_PUBLIC_CLINIC_LOGO_SMALL_URL 設定）→ その画像
 *   2. ボール本体（NEXT_PUBLIC_CLINIC_NAME 未設定 = isDefaultClinic）→ ボールのロゴ
 *   3. それ以外（他院でロゴ未設定）→ **ボールのロゴは出さず院名テキスト**
 *
 * ※ 患者向けページのロゴは必ずこのコンポーネントを使うこと（直接 CLINIC_CONFIG.logoSmallUrl を
 *   img/Image で描画しない＝混入防止。audit-clinic-leaks でも検査する）。
 */
export default function ClinicWordmark({
  sizeClassName = "w-48 h-16",
  textClassName = "text-xl font-extrabold text-white text-center leading-tight",
}: {
  sizeClassName?: string;
  textClassName?: string;
}) {
  const isExternal = CLINIC_CONFIG.logoSmallUrl.startsWith("http");
  const showImage = CLINIC_CONFIG.hasCustomLogo || CLINIC_CONFIG.isDefaultClinic;

  if (showImage) {
    return (
      <div className={`relative ${sizeClassName} flex items-center justify-center`}>
        {isExternal ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={CLINIC_CONFIG.logoSmallUrl}
            alt={CLINIC_CONFIG.name}
            className={`max-h-full w-auto object-contain ${CLINIC_CONFIG.usesWordmarkLogo ? "bg-white rounded-lg px-3 py-2" : ""}`}
          />
        ) : (
          <Image src={CLINIC_CONFIG.logoSmallUrl} alt={CLINIC_CONFIG.name} fill className="object-contain" />
        )}
      </div>
    );
  }

  // 他院でロゴ未設定 → ボールのロゴを出さず院名テキスト
  return (
    <div className={`${sizeClassName} flex items-center justify-center`}>
      <span className={textClassName}>{CLINIC_CONFIG.name}</span>
    </div>
  );
}
