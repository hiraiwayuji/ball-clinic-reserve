"use server";

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import { checkAdminAuth } from "@/app/actions/auth";

/**
 * シフト希望の「自動LINE通知」まわり。
 * - スタッフのLINE連携（ログイン不要・共通リンク＋名前選択）→ service role。
 * - 募集ラウンド（対象期間・締切・リンク配信日）のCRUDは owner（自院のみ）。
 * 実際の配信は cron（/api/cron/shift-requests）が行う。
 */

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const LINK_CODE_TTL_DAYS = 30;

// ── スタッフのLINE連携（ログイン不要・打刻/希望フォームから） ─────────

export type StaffLineLinkState = {
  linked: boolean;       // 既にLINE連携済みか
  code: string | null;   // 未連携のときの連携コード（公式LINEに送ってもらう）
  staffName: string | null;
};

/**
 * このスタッフのLINE連携を開始する。
 * - 既に連携済みなら linked=true を返す。
 * - 未連携なら連携コード（6桁）を発行して返す。スタッフはそのコードを
 *   「スタッフ連携 123456」の形で院の公式LINEに送ると連携完了になる（webhook側で処理）。
 */
export async function startStaffLineLink(staffId: string): Promise<StaffLineLinkState> {
  if (!staffId) return { linked: false, code: null, staffName: null };
  const db = admin();
  const { data: staff } = await db
    .from("reservation_staff")
    .select("id, name, line_user_id, line_link_code, line_link_code_expires_at")
    .eq("clinic_id", PUBLIC_CLINIC_ID)
    .eq("id", staffId)
    .eq("is_active", true)
    .maybeSingle();
  if (!staff) return { linked: false, code: null, staffName: null };

  const staffName = (staff.name as string) ?? null;
  if (staff.line_user_id) return { linked: true, code: null, staffName };

  // 既存の未失効コードがあれば再利用、なければ新規発行
  const now = Date.now();
  const existingCode = staff.line_link_code as string | null;
  const exp = staff.line_link_code_expires_at ? new Date(staff.line_link_code_expires_at as string).getTime() : 0;
  if (existingCode && exp > now) {
    return { linked: false, code: existingCode, staffName };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(now + LINK_CODE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db
    .from("reservation_staff")
    .update({ line_link_code: code, line_link_code_expires_at: expiresAt })
    .eq("clinic_id", PUBLIC_CLINIC_ID)
    .eq("id", staffId);
  return { linked: false, code, staffName };
}

// ── 募集ラウンド（owner専用） ─────────────────────────────

export type ShiftRound = {
  id: string;
  label: string | null;
  periodStart: string;   // "YYYY-MM-DD"
  periodEnd: string;
  deadline: string;
  linkSendDate: string;
  status: string;        // open / closed
};

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** 自院の募集ラウンド一覧（対象期間の早い順） */
export async function listShiftRounds(): Promise<ShiftRound[]> {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase
    .from("shift_request_rounds")
    .select("id, label, period_start, period_end, deadline, link_send_date, status")
    .eq("clinic_id", clinicId)
    .order("period_start", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    label: (r.label as string | null) ?? null,
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    deadline: r.deadline as string,
    linkSendDate: r.link_send_date as string,
    status: (r.status as string) ?? "open",
  }));
}

/** 募集ラウンドの新規作成・編集（owner） */
export async function upsertShiftRound(input: {
  id?: string;
  label?: string;
  periodStart: string;
  periodEnd: string;
  deadline: string;
  linkSendDate: string;
}): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const { id, label, periodStart, periodEnd, deadline, linkSendDate } = input;
  if (![periodStart, periodEnd, deadline, linkSendDate].every(isYmd)) {
    return { success: false, error: "日付の指定が不正です" };
  }
  if (periodEnd < periodStart) return { success: false, error: "対象期間の終了が開始より前です" };
  if (deadline < linkSendDate) return { success: false, error: "リンク配信日が締切より後になっています" };

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const row = {
    clinic_id: clinicId,
    label: label?.trim() || null,
    period_start: periodStart,
    period_end: periodEnd,
    deadline,
    link_send_date: linkSendDate,
    // 日程を変えたら送信済みフラグはリセットして配信し直す
    sent: {},
    status: "open",
  };
  if (id) {
    const { error } = await supabase
      .from("shift_request_rounds")
      .update(row)
      .eq("id", id)
      .eq("clinic_id", clinicId);
    return error ? { success: false, error: error.message } : { success: true };
  }
  // tenant-isolation-ignore: insert 行に clinic_id を明示設定済み
  const { error } = await supabase.from("shift_request_rounds").insert(row);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function deleteShiftRound(id: string): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  if (!id) return { success: false, error: "IDが不正です" };
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase
    .from("shift_request_rounds")
    .delete()
    .eq("id", id)
    .eq("clinic_id", clinicId);
  return error ? { success: false, error: error.message } : { success: true };
}

// ── スタッフのLINE連携状況（owner用・誰が連携済みか） ─────────

export type StaffLineStatus = {
  id: string;
  name: string;
  displayColor: string | null;
  linked: boolean;
};

export async function listStaffLineStatus(): Promise<StaffLineStatus[]> {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase
    .from("reservation_staff")
    .select("id, name, display_color, line_user_id")
    .eq("clinic_id", clinicId)
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at");
  return (data ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    displayColor: (s.display_color as string | null) ?? null,
    linked: !!(s.line_user_id as string | null),
  }));
}
