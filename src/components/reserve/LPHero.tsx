"use client";

import Link from "next/link";
import { CalendarDays, Sparkles, MapPin, Phone, Globe, Instagram, MessageCircle, Star } from "lucide-react";
import type { PublicClinicSettings } from "@/app/actions/publicSettings";
import { getThemeClasses } from "@/lib/lp-theme";

interface Props {
  settings: PublicClinicSettings | null;
  fallbackName: string;
  /** メニューLP用の最小表示。画像・CTA・口コミを省き、院名＋連絡先だけにして
   *  すぐ下のクーポン/メニューに目が行くようにする。 */
  minimal?: boolean;
}

const LINE_DEFAULT_URL = process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL;

export default function LPHero({ settings, fallbackName, minimal = false }: Props) {
  const theme = getThemeClasses(settings?.theme_color ?? "blue");
  const title = settings?.hero_title || fallbackName;
  const subtitle = settings?.hero_subtitle;
  const heroImage = settings?.hero_image_url;
  const heroBackground = settings?.hero_background_url;

  const ctaText = settings?.lp_cta_text || "クーポン・メニューから予約する";

  return (
    <section
      className={`relative overflow-hidden bg-gradient-to-b ${theme.heroGradient}`}
      style={
        heroBackground
          ? {
              backgroundImage: `linear-gradient(to bottom, rgba(15,23,42,0.55), rgba(15,23,42,0.92)), url(${heroBackground})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <div className={`max-w-3xl mx-auto px-5 ${minimal ? "pt-8 pb-5" : "pt-12 pb-10"}`}>
        {/* 院名 */}
        <p className={`text-[11px] font-bold uppercase tracking-[0.25em] ${theme.accentText} mb-3`}>
          {settings?.area_name ?? ""}
        </p>
        <h1 className={`${minimal ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"} font-black text-white tracking-tight leading-tight`}>
          {title}
        </h1>
        {subtitle && !minimal && (
          <p className={`mt-4 text-base sm:text-lg ${theme.leadText} leading-relaxed font-medium`}>
            {subtitle}
          </p>
        )}

        {/* メインビジュアル（最小表示では非表示） */}
        {!minimal && heroImage && (
          <div className="mt-6 rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/40 aspect-[16/9]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImage}
              alt={title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* メインCTA / セカンダリCTA（最小表示ではすぐ下がメニューなので省略） */}
        {!minimal && (
          <>
            <Link
              href="/reserve/menu"
              className={`mt-6 flex items-center justify-center gap-2 w-full h-16 rounded-2xl ${theme.ctaBg} ${theme.ctaHoverBg} active:scale-[0.98] text-white text-base font-black shadow-xl ${theme.ctaShadow} transition-all`}
            >
              <Sparkles className="w-5 h-5" />
              {ctaText}
            </Link>

            <Link
              href="/reserve/calendar"
              className="mt-2 flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-white/90 text-sm font-bold transition"
            >
              <CalendarDays className="w-4 h-4" />
              先にカレンダーで空き状況を確認
            </Link>
          </>
        )}

        {/* お問い合わせ群 */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          {settings?.phone_number && (
            <a
              href={`tel:${settings.phone_number.replace(/[^\d+]/g, "")}`}
              className="flex items-center justify-center gap-1.5 h-11 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold transition"
            >
              <Phone className={`w-3.5 h-3.5 ${theme.accentText}`} />
              電話する
            </a>
          )}
          {(settings?.line_official_account_url || LINE_DEFAULT_URL) && (
            <a
              href={settings?.line_official_account_url || LINE_DEFAULT_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 h-11 rounded-xl bg-[#06C755]/15 hover:bg-[#06C755]/25 border border-[#06C755]/40 text-white text-xs font-bold transition"
            >
              <MessageCircle className="w-3.5 h-3.5 text-[#06C755]" />
              LINE で問合せ
            </a>
          )}
        </div>

        {/* リンク群 */}
        {(settings?.hp_url || settings?.instagram_url || settings?.address) && (
          <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-white/60">
            {settings.address && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {settings.address}
              </span>
            )}
            {settings.hp_url && (
              <a
                href={settings.hp_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-white transition"
              >
                <Globe className="w-3 h-3" />
                公式HP
              </a>
            )}
            {settings.instagram_url && (
              <a
                href={settings.instagram_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-white transition"
              >
                <Instagram className="w-3 h-3" />
                Instagram
              </a>
            )}
          </div>
        )}

        {/* 患者の声（短文・最小表示では非表示） */}
        {!minimal && settings?.lp_voice_quote && (
          <div className="mt-7 bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-4">
            <div className="flex items-start gap-2">
              <Star className={`w-4 h-4 ${theme.accentText} shrink-0 mt-0.5 fill-current`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/90 leading-relaxed font-medium">
                  「{settings.lp_voice_quote}」
                </p>
                {settings.lp_voice_author && (
                  <p className="mt-1.5 text-[11px] text-white/50 font-bold">
                    — {settings.lp_voice_author}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
