import type { MetadataRoute } from "next";
import { isFamilyGift } from "@/lib/app-mode";
import { CLINIC_CONFIG } from "@/lib/clinic-config";

/**
 * PWA manifest をモード別に出し分ける。
 * 旧来は public/manifest.json が「家族カレンダー / start_url=/family」固定で、
 * 予約院でも「ホーム画面に追加」すると合言葉カレンダーが起動先になっていた。
 * 予約院(CLINIC/DEMO)では予約管理(/admin)を起動先にする。
 */
export default function manifest(): MetadataRoute.Manifest {
  const icons = [
    {
      src: "/images/logo_symbol_main_black.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "maskable" as const,
    },
    {
      src: "/images/logo_symbol_main_black.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable" as const,
    },
  ];

  if (isFamilyGift) {
    return {
      name: "ボール接骨院 ファミリーカレンダー",
      short_name: "家族カレンダー",
      description: "家族みんなで使える共有カレンダー",
      theme_color: "#3b82f6",
      background_color: "#ffffff",
      display: "standalone",
      orientation: "portrait",
      start_url: "/family",
      scope: "/",
      lang: "ja",
      icons,
    };
  }

  return {
    name: `${CLINIC_CONFIG.name} 予約システム`,
    short_name: `${CLINIC_CONFIG.nameShort} 予約`,
    description: `${CLINIC_CONFIG.name}のWeb予約システム`,
    theme_color: "#3b82f6",
    background_color: "#ffffff",
    display: "standalone",
    orientation: "portrait",
    start_url: "/admin",
    scope: "/",
    lang: "ja",
    icons,
  };
}
