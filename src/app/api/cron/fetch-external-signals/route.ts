import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

// Vercel Cron で日次（朝 9:30 JST = 00:30 UTC）に叩く想定。
// 気象庁オープンデータの徳島県 forecast JSON を取得し、external_health_signals に upsert。
// 認証は ?secret=... または Authorization: Bearer ... のどちらでも可（Vercel Cron は両対応）。

const JMA_TOKUSHIMA_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/360000.json";

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.EXTERNAL_SIGNALS_CRON_SECRET;
  if (!expected) return false;
  const querySecret = req.nextUrl.searchParams.get("secret");
  if (querySecret === expected) return true;
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${expected}`) return true;
  // Vercel Cron は自動で Authorization: Bearer <CRON_SECRET> を送る
  if (auth.startsWith("Bearer ") && process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase env missing" }, { status: 500 });
  }
  const db = createAdminClient(url, key, { auth: { persistSession: false } });

  // 気象庁 forecast を取得（徳島県）
  let weatherSummary: string | null = null;
  let weatherPayload: Record<string, unknown> = {};
  let observedFor = todayJST();
  try {
    const res = await fetch(JMA_TOKUSHIMA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`JMA fetch failed: ${res.status}`);
    const data = (await res.json()) as JmaForecastResponse;
    const first = data?.[0];
    const series = first?.timeSeries?.[0];
    const area = series?.areas?.[0]; // 徳島県南部 (最初の area)
    const todayWeather = area?.weathers?.[0] ?? null;
    // 気温は series 2 番目以降から
    const tempSeries = first?.timeSeries?.find((s) => s.areas?.[0]?.tempsMin || s.areas?.[0]?.tempsMax);
    const tempArea = tempSeries?.areas?.[0];
    const tempMin = tempArea?.tempsMin?.[0] ?? null;
    const tempMax = tempArea?.tempsMax?.[0] ?? null;

    if (todayWeather) {
      const tempText = tempMin && tempMax ? `（最低 ${tempMin}℃ / 最高 ${tempMax}℃）` : tempMax ? `（最高 ${tempMax}℃）` : "";
      weatherSummary = `今日の徳島は${todayWeather}${tempText}`;
    }
    weatherPayload = {
      areaName: area?.area?.name ?? null,
      weather: todayWeather,
      tempMin,
      tempMax,
      reportDatetime: first?.reportDatetime ?? null,
      sourceUrl: JMA_TOKUSHIMA_URL,
    };
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: `JMA fetch error: ${err?.message ?? "unknown"}` }, { status: 200 });
  }

  // upsert
  if (weatherSummary) {
    const { error } = await db.from("external_health_signals").upsert(
      {
        prefecture: "徳島",
        signal_type: "weather_today",
        observed_for: observedFor,
        summary: weatherSummary,
        payload: weatherPayload,
        source: "jma",
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "prefecture,signal_type,observed_for" }
    );
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, summary: weatherSummary, observedFor });
}

function todayJST(): string {
  const now = new Date();
  const jst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  return `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, "0")}-${String(jst.getDate()).padStart(2, "0")}`;
}

// JMA forecast API の主要部分の型（簡易）
type JmaArea = {
  area?: { name?: string; code?: string };
  weathers?: string[];
  weatherCodes?: string[];
  tempsMin?: string[];
  tempsMax?: string[];
};
type JmaTimeSeries = {
  timeDefines?: string[];
  areas?: JmaArea[];
};
type JmaForecastEntry = {
  publishingOffice?: string;
  reportDatetime?: string;
  timeSeries?: JmaTimeSeries[];
};
type JmaForecastResponse = JmaForecastEntry[];
