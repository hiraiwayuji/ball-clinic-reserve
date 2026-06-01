"use server";

import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";

/**
 * 患者向けLP（/reserve, /reserve/menu）で使う公開クリニック設定。
 * 認証不要で読める安全なフィールドだけを返す。
 *
 * primary_color とは別に theme_color を持つ：
 *   - primary_color : 管理画面・ブランディング全般
 *   - theme_color   : LP 専用（CV 最適化のため変えたい場合がある）
 */
export type PublicClinicSettings = {
  id: string;
  clinic_name: string;
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_image_url: string | null;
  hero_background_url: string | null;
  lp_features: LPFeature[] | null;
  lp_target_problems: string[] | null;
  lp_voice_quote: string | null;
  lp_voice_author: string | null;
  lp_cta_text: string | null;
  theme_color: ThemeColor;
  primary_color: string | null;

  phone_number: string | null;
  address: string | null;
  area_name: string | null;
  hp_url: string | null;
  instagram_url: string | null;
  line_official_account_url: string | null;

  /** 予約画面のグリッド刻み（15/20/30分） */
  slot_duration_minutes: 15 | 20 | 30;

  /** 患者LP /reserve の予約フロー（datetime_first|menu_first） */
  public_reserve_flow: "datetime_first" | "menu_first";

  /** 予約の部門（'サロン' | 'カフェ' 等）。2件以上なら入口で部門選択を出す。空=部門なし院 */
  departments: string[];
  /** カフェの同時受入席数（席予約の総枠上限）。NULL=未設定 */
  cafe_seat_capacity: number | null;
  /** カフェ部門の営業時間（サロンと別営業）。NULL=カフェ予約フロー未使用 */
  cafe_business_hours: CafeBusinessHours | null;
};

export type CafeBusinessHoursWindow = {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  days: number[]; // JS getDay(): 0=日 ... 6=土
};

export type CafeBusinessHours = {
  lunch?: CafeBusinessHoursWindow;
  dinner?: CafeBusinessHoursWindow;
};

export type LPFeature = {
  icon?: string;
  title: string;
  description?: string;
};

/** Tailwind v4 でも static に検出できるよう、許可色を限定する。 */
export type ThemeColor =
  | "blue"
  | "violet"
  | "emerald"
  | "amber"
  | "orange"
  | "rose"
  | "sky"
  | "teal"
  | "indigo";

const ALLOWED_COLORS: ThemeColor[] = [
  "blue",
  "violet",
  "emerald",
  "amber",
  "orange",
  "rose",
  "sky",
  "teal",
  "indigo",
];

function normalizeColor(raw: unknown): ThemeColor {
  if (typeof raw === "string" && ALLOWED_COLORS.includes(raw as ThemeColor)) {
    return raw as ThemeColor;
  }
  return "blue";
}

export async function getPublicClinicSettings(): Promise<PublicClinicSettings | null> {
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await adminClient
    .from("clinic_settings")
    .select(`
      id, clinic_name, hero_title, hero_subtitle, hero_image_url, hero_background_url,
      lp_features, lp_target_problems, lp_voice_quote, lp_voice_author, lp_cta_text,
      theme_color, primary_color,
      phone_number, address, area_name, hp_url, instagram_url, line_official_account_url,
      slot_duration_minutes, public_reserve_flow,
      departments, cafe_seat_capacity, cafe_business_hours
    `)
    .eq("id", PUBLIC_CLINIC_ID)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    clinic_name: data.clinic_name,
    hero_title: data.hero_title ?? null,
    hero_subtitle: data.hero_subtitle ?? null,
    hero_image_url: data.hero_image_url ?? null,
    hero_background_url: data.hero_background_url ?? null,
    lp_features: parseLPFeatures(data.lp_features),
    lp_target_problems: parseStringArray(data.lp_target_problems),
    lp_voice_quote: data.lp_voice_quote ?? null,
    lp_voice_author: data.lp_voice_author ?? null,
    lp_cta_text: data.lp_cta_text ?? null,
    theme_color: normalizeColor(data.theme_color),
    primary_color: data.primary_color ?? null,
    phone_number: data.phone_number ?? null,
    address: data.address ?? null,
    area_name: data.area_name ?? null,
    hp_url: data.hp_url ?? null,
    instagram_url: data.instagram_url ?? null,
    line_official_account_url: data.line_official_account_url ?? null,
    slot_duration_minutes: normalizeSlotDuration(data.slot_duration_minutes),
    public_reserve_flow: (data.public_reserve_flow === "menu_first" ? "menu_first" : "datetime_first") as "datetime_first" | "menu_first",
    departments: parseStringArray(data.departments) ?? [],
    cafe_seat_capacity: typeof data.cafe_seat_capacity === "number" ? data.cafe_seat_capacity : null,
    cafe_business_hours: parseCafeBusinessHours(data.cafe_business_hours),
  };
}

function parseCafeBusinessHours(raw: unknown): CafeBusinessHours | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const parseWindow = (w: unknown): CafeBusinessHoursWindow | undefined => {
    if (!w || typeof w !== "object") return undefined;
    const o = w as Record<string, unknown>;
    if (typeof o.start !== "string" || typeof o.end !== "string") return undefined;
    const days = Array.isArray(o.days)
      ? o.days.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6)
      : [];
    return { start: o.start, end: o.end, days };
  };
  const lunch = parseWindow(obj.lunch);
  const dinner = parseWindow(obj.dinner);
  if (!lunch && !dinner) return null;
  return { ...(lunch ? { lunch } : {}), ...(dinner ? { dinner } : {}) };
}

function normalizeSlotDuration(raw: unknown): 15 | 20 | 30 {
  if (raw === 15 || raw === 20 || raw === 30) return raw;
  return 30;
}

function parseLPFeatures(raw: unknown): LPFeature[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
    .map((f) => ({
      icon: typeof f.icon === "string" ? f.icon : undefined,
      title: typeof f.title === "string" ? f.title : "",
      description: typeof f.description === "string" ? f.description : undefined,
    }))
    .filter((f) => f.title.length > 0);
}

function parseStringArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((s): s is string => typeof s === "string" && s.length > 0);
}
