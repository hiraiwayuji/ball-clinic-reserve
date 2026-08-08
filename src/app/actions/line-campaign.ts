"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth, requireRole } from "@/app/actions/auth";
import { pushLineText } from "@/lib/admin-notify";
import { getPushTargetsForCustomers } from "@/lib/line-links";
import type { LineCampaignFilters, LineCampaignTarget, LineCampaignPreview } from "@/types/line-campaign";

const JST = "Asia/Tokyo";

function todayJst(): Date {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: JST }));
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

/** 文面の {name} を患者名に差し替える */
function renderMessage(template: string, name: string): string {
  return template.replaceAll("{name}", name);
}

/**
 * 条件に合う配信先を集める。
 * 「最終来院からの日数」は appointments から都度計算する（customers に来院日カラムは無い）。
 */
async function collectTargets(
  clinicId: string,
  filters: LineCampaignFilters,
): Promise<{ targets: LineCampaignTarget[]; noLineCount: number }> {
  const supabase = await createClient();
  const today = todayJst();

  let query = supabase
    .from("customers")
    .select("id, name, gender, city_name, birth_date, booking_suspended")
    .eq("clinic_id", clinicId);

  if (filters.gender) query = query.eq("gender", filters.gender);
  if (filters.city) query = query.eq("city_name", filters.city);

  const { data: customers, error } = await query;
  if (error) throw error;

  const all = (customers ?? []).filter((c: any) => !c.booking_suspended);
  if (all.length === 0) return { targets: [], noLineCount: 0 };

  const ids = all.map((c: any) => c.id as string);

  // 来院履歴（キャンセル除く）。過去＝最終来院、未来＝次回予約あり。
  const visitByCustomer = new Map<string, { last: Date | null; upcoming: Date | null; count: number }>();
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data: appts } = await supabase
      .from("appointments")
      .select("customer_id, start_time")
      .eq("clinic_id", clinicId)
      .neq("status", "cancelled")
      .in("customer_id", slice);
    for (const a of appts ?? []) {
      const cid = (a as any).customer_id as string | null;
      if (!cid) continue;
      const t = new Date((a as any).start_time);
      const prev = visitByCustomer.get(cid) ?? { last: null, upcoming: null, count: 0 };
      if (t.getTime() <= Date.now()) {
        prev.count += 1;
        if (!prev.last || t > prev.last) prev.last = t;
      } else if (!prev.upcoming || t < prev.upcoming) {
        prev.upcoming = t;
      }
      visitByCustomer.set(cid, prev);
    }
  }

  const matched: { id: string; name: string; lastVisitDate: string | null; daysSinceLastVisit: number | null; visitCount: number }[] = [];
  for (const c of all as any[]) {
    const v = visitByCustomer.get(c.id) ?? { last: null, upcoming: null, count: 0 };
    const days = v.last ? daysBetween(v.last, today) : null;

    if (filters.excludeWithUpcoming && v.upcoming) continue;
    if (filters.neverVisitedOnly && v.last) continue;
    if (!filters.neverVisitedOnly) {
      if (filters.minDaysSinceVisit != null) {
        if (days == null || days < filters.minDaysSinceVisit) continue;
      }
      if (filters.maxDaysSinceVisit != null) {
        if (days == null || days > filters.maxDaysSinceVisit) continue;
      }
    }
    if (filters.minVisitCount != null && v.count < filters.minVisitCount) continue;

    if (filters.birthMonth != null) {
      if (!c.birth_date) continue;
      const b = new Date(c.birth_date);
      if (isNaN(b.getTime()) || b.getMonth() + 1 !== filters.birthMonth) continue;
    }

    matched.push({
      id: c.id,
      name: c.name ?? "",
      lastVisitDate: v.last ? v.last.toLocaleDateString("sv-SE", { timeZone: JST }) : null,
      daysSinceLastVisit: days,
      visitCount: v.count,
    });
  }

  // LINE の宛先解決は必ず getPushTargetsForCustomers（家族の紐付けも拾う）
  const pushMap = await getPushTargetsForCustomers(matched.map((m) => m.id), clinicId);

  const targets: LineCampaignTarget[] = [];
  let noLineCount = 0;
  for (const m of matched) {
    const to = pushMap.get(m.id) ?? [];
    if (to.length === 0) { noLineCount += 1; continue; }
    targets.push({ ...m, lineUserIds: to });
  }

  targets.sort((a, b) => (b.daysSinceLastVisit ?? -1) - (a.daysSinceLastVisit ?? -1));
  return { targets, noLineCount };
}

/**
 * 送信前の確認用。誰に何人届くかを必ず見てから送る。
 */
export async function previewLineCampaign(
  filters: LineCampaignFilters,
): Promise<{ success: boolean; preview?: LineCampaignPreview; error?: string }> {
  try {
    const { clinicId } = await requireRole(["owner", "admin"]);
    const { targets, noLineCount } = await collectTargets(clinicId, filters);
    return {
      success: true,
      preview: {
        total: targets.length,
        noLineCount,
        targets: targets.slice(0, 200),
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "対象者の取得に失敗しました" };
  }
}

/**
 * 実際に送る。testLineUserId を渡すとその1人にだけ試し送りする。
 * 送信結果は line_campaigns / line_campaign_recipients に必ず残す。
 */
export async function sendLineCampaign(params: {
  title: string;
  message: string;
  filters: LineCampaignFilters;
  testLineUserId?: string;
}): Promise<{ success: boolean; sent?: number; failed?: number; error?: string }> {
  try {
    const { clinicId } = await requireRole(["owner", "admin"]);
    const message = params.message.trim();
    if (!message) return { success: false, error: "送る文面を入力してください" };
    if (message.length > 900) return { success: false, error: "文面が長すぎます（900文字まで）" };

    const supabase = await createClient();

    // 試し送り: 本人にだけ届けて、患者には送らない
    if (params.testLineUserId) {
      const res = await pushLineText(params.testLineUserId, renderMessage(message, "テスト"), clinicId);
      return res.ok
        ? { success: true, sent: 1, failed: 0 }
        : { success: false, error: res.detail ?? "テスト送信に失敗しました" };
    }

    const { targets } = await collectTargets(clinicId, params.filters);
    if (targets.length === 0) return { success: false, error: "条件に合う配信先がいません" };

    const { data: campaign, error: campErr } = await supabase
      .from("line_campaigns")
      .insert({
        clinic_id: clinicId,
        title: params.title.trim() || "お知らせ",
        message,
        filters: params.filters as any,
        target_count: targets.length,
      })
      .select("id")
      .single();
    if (campErr) throw campErr;
    const campaignId = campaign.id as string;

    let sent = 0;
    let failed = 0;
    const recipientRows: any[] = [];
    for (const t of targets) {
      const text = renderMessage(message, t.name);
      for (const to of t.lineUserIds) {
        const res = await pushLineText(to, text, clinicId);
        if (res.ok) sent += 1; else failed += 1;
        recipientRows.push({
          campaign_id: campaignId,
          clinic_id: clinicId,
          customer_id: t.id,
          customer_name: t.name,
          line_user_id: to,
          status: res.ok ? "sent" : "failed",
          error: res.ok ? null : (res.detail ?? "送信失敗"),
        });
      }
    }

    if (recipientRows.length > 0) {
      // tenant-isolation-ignore: recipientRows の各行に clinic_id: clinicId を設定済み
      await supabase.from("line_campaign_recipients").insert(recipientRows);
    }
    await supabase
      .from("line_campaigns")
      .update({ sent_count: sent, failed_count: failed })
      .eq("clinic_id", clinicId)
      .eq("id", campaignId);

    return { success: true, sent, failed };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "配信に失敗しました" };
  }
}

export type LineCampaignHistoryRow = {
  id: string;
  title: string;
  message: string;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
};

/** 「誰にいつ何を送ったか」を後から追えるようにする */
export async function getLineCampaignHistory(): Promise<{ success: boolean; rows?: LineCampaignHistoryRow[]; error?: string }> {
  try {
    const { clinicId } = await checkAdminAuth();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("line_campaigns")
      .select("id, title, message, target_count, sent_count, failed_count, created_at")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return {
      success: true,
      rows: (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        message: r.message,
        targetCount: r.target_count,
        sentCount: r.sent_count,
        failedCount: r.failed_count,
        createdAt: r.created_at,
      })),
    };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "履歴の取得に失敗しました" };
  }
}

/** 絞り込みに使う市区町村の選択肢 */
export async function getLineCampaignCities(): Promise<string[]> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("city_name")
    .eq("clinic_id", clinicId)
    .not("city_name", "is", null);
  const set = new Set<string>();
  for (const r of data ?? []) {
    const v = ((r as any).city_name ?? "").trim();
    if (v) set.add(v);
  }
  return Array.from(set).sort();
}
