import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type LinkedCustomer = {
  customer_id: string;
  name: string;
  display_name: string | null;
  phone: string | null;
  is_primary: boolean;
  display_label: string | null;
  booking_suspended: boolean | null;
};

/**
 * 同じ LINE userId に紐付いている全 customer を返す。
 * 表示用 (`display_name ?? name`) と family 選択 UI の両方で使う。
 */
export async function getCustomersForLineUserId(
  lineUserId: string,
  clinicId: string,
  client?: SupabaseClient,
): Promise<LinkedCustomer[]> {
  const sb = client ?? getServiceClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("customer_line_links")
    .select(
      "customer_id, is_primary, display_label, customers!inner(id, name, display_name, phone, booking_suspended)",
    )
    .eq("line_user_id", lineUserId)
    .eq("clinic_id", clinicId)
    .order("is_primary", { ascending: false });
  if (error) {
    console.error("[line-links] getCustomersForLineUserId error:", error.message);
    return [];
  }
  const rows: LinkedCustomer[] = [];
  for (const row of data ?? []) {
    const c = Array.isArray((row as any).customers) ? (row as any).customers[0] : (row as any).customers;
    if (!c) continue;
    rows.push({
      customer_id: (row as any).customer_id,
      name: c.name,
      display_name: c.display_name ?? null,
      phone: c.phone ?? null,
      is_primary: Boolean((row as any).is_primary),
      display_label: (row as any).display_label ?? null,
      booking_suspended: c.booking_suspended ?? null,
    });
  }
  return rows;
}

/** 特定 customer に紐付いている全 LINE userId を返す。通知の同報先取得に使う。 */
export async function getLineUserIdsForCustomer(
  customerId: string,
  client?: SupabaseClient,
): Promise<string[]> {
  const sb = client ?? getServiceClient();
  if (!sb) return [];
  // tenant-isolation-ignore: customer_id は UUID v4 でグローバルにユニーク（衝突しない）
  const { data, error } = await sb
    .from("customer_line_links")
    .select("line_user_id")
    .eq("customer_id", customerId);
  if (error) {
    console.error("[line-links] getLineUserIdsForCustomer error:", error.message);
    return [];
  }
  return (data ?? []).map((r: { line_user_id: string }) => r.line_user_id).filter(Boolean);
}

export type CustomerLineState = {
  linked: boolean;
  /** 登録電話の下4桁（LINE連携コードとして案内する数字）。電話が無い/短い場合は null */
  phoneLast4: string | null;
  /** 登録電話の数字部分の桁数（連携コード送信が可能かの判定に使う） */
  phoneDigitCount: number;
};

/**
 * customer が LINE 連携済みかと、連携コード（電話下4桁）を返す。
 * 判定は customers.line_user_id（旧・主紐付け）と customer_line_links（複数紐付け）の両方。
 * 予約時の「LINE連携必須ゲート」と完了画面のお願いポップアップで共通利用する。
 */
export async function getCustomerLineState(
  customerId: string,
  clinicId: string,
  client?: SupabaseClient,
): Promise<CustomerLineState> {
  const sb = client ?? getServiceClient();
  if (!sb) return { linked: false, phoneLast4: null, phoneDigitCount: 0 };

  const { data: cust } = await sb
    .from("customers")
    .select("phone, line_user_id")
    .eq("id", customerId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  const digits = (cust?.phone ?? "").replace(/\D/g, "");
  const phoneLast4 = digits.length >= 4 ? digits.slice(-4) : null;

  if (cust?.line_user_id) {
    return { linked: true, phoneLast4, phoneDigitCount: digits.length };
  }
  const { count } = await sb
    .from("customer_line_links")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .eq("clinic_id", clinicId);
  return { linked: (count ?? 0) > 0, phoneLast4, phoneDigitCount: digits.length };
}

export type LinkResult =
  | { ok: true; created: boolean; isPrimary: boolean }
  | { ok: false; error: string };

/**
 * LINE userId と customer を紐付ける。同じペアが既にあれば no-op。
 * その LINE userId に他に紐付き customer がいなければ自動で is_primary=true。
 * 同時に customers.line_user_id も is_primary 用に同期する（後方互換性のため）。
 */
export async function linkLineToCustomer(
  lineUserId: string,
  customerId: string,
  clinicId: string,
  opts: { linkedVia?: string; displayLabel?: string | null } = {},
  client?: SupabaseClient,
): Promise<LinkResult> {
  const sb = client ?? getServiceClient();
  if (!sb) return { ok: false, error: "Supabase service client unavailable" };

  // 既存ペアの確認
  const { data: existing } = await sb
    .from("customer_line_links")
    .select("id, is_primary")
    .eq("line_user_id", lineUserId)
    .eq("customer_id", customerId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (existing) {
    return { ok: true, created: false, isPrimary: Boolean(existing.is_primary) };
  }

  // この LINE userId にとって初めての紐付けかどうか
  const { count } = await sb
    .from("customer_line_links")
    .select("id", { count: "exact", head: true })
    .eq("line_user_id", lineUserId)
    .eq("clinic_id", clinicId);
  const isFirst = (count ?? 0) === 0;

  const { error: insertErr } = await sb.from("customer_line_links").insert({
    customer_id: customerId,
    line_user_id: lineUserId,
    clinic_id: clinicId,
    is_primary: isFirst,
    display_label: opts.displayLabel ?? null,
    linked_via: opts.linkedVia ?? null,
  });
  if (insertErr) {
    return { ok: false, error: insertErr.message };
  }

  if (isFirst) {
    // 主紐付けは customers.line_user_id にも反映（既存コードの参照互換）
    await sb.from("customers").update({ line_user_id: lineUserId }).eq("id", customerId).eq("clinic_id", clinicId);
  }

  return { ok: true, created: true, isPrimary: isFirst };
}

/** 主紐付けを別 customer に移し替える。UNIQUE WHERE 制約のため一度 false に落としてから true に。 */
export async function setPrimaryLink(
  lineUserId: string,
  customerId: string,
  clinicId: string,
  client?: SupabaseClient,
): Promise<{ ok: boolean; error?: string }> {
  const sb = client ?? getServiceClient();
  if (!sb) return { ok: false, error: "Supabase service client unavailable" };

  // 既存の primary を全部 false に
  await sb
    .from("customer_line_links")
    .update({ is_primary: false })
    .eq("line_user_id", lineUserId)
    .eq("clinic_id", clinicId);

  const { error } = await sb
    .from("customer_line_links")
    .update({ is_primary: true })
    .eq("line_user_id", lineUserId)
    .eq("clinic_id", clinicId)
    .eq("customer_id", customerId);
  if (error) return { ok: false, error: error.message };

  // customers.line_user_id を新しい primary に同期
  await sb.from("customers").update({ line_user_id: lineUserId }).eq("id", customerId).eq("clinic_id", clinicId);

  return { ok: true };
}

/** 紐付け 1件を解除する。 */
export async function unlinkLineFromCustomer(
  lineUserId: string,
  customerId: string,
  clinicId: string,
  client?: SupabaseClient,
): Promise<{ ok: boolean; error?: string }> {
  const sb = client ?? getServiceClient();
  if (!sb) return { ok: false, error: "Supabase service client unavailable" };

  const { error } = await sb
    .from("customer_line_links")
    .delete()
    .eq("line_user_id", lineUserId)
    .eq("customer_id", customerId)
    .eq("clinic_id", clinicId);
  if (error) return { ok: false, error: error.message };

  // 主紐付けと一致していたら customers.line_user_id を NULL に
  const { data: customer } = await sb
    .from("customers")
    .select("line_user_id")
    .eq("id", customerId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (customer?.line_user_id === lineUserId) {
    await sb.from("customers").update({ line_user_id: null }).eq("id", customerId).eq("clinic_id", clinicId);
  }
  return { ok: true };
}

