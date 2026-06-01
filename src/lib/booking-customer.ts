// Web予約の顧客照合（サロン施術・カフェ席予約で共通利用）。
// 顧客台帳はサロン/カフェ共有なので、ここを単一の真実として両フローから呼ぶ。
// 照合ルール: customerId(LINE家族) → 電話番号 → 氏名（正規化）→ 未登録ならアンケート誘導。
// ※ アンケート必須ルールは絶対 bypass しない（feedback_reserve_questionnaire_required）。

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 氏名照合用の正規化。
 * 完全一致だけだと「山内 颯人」と「山内颯人」、全角/半角スペースの違いで
 * 既存患者を見つけられず「初めての方は…」になる事故が起きる（2026-05 山内family 実例）。
 * - NFKC で全角英数/記号を半角化 / 全半角スペース除去 / 小文字化
 */
export function normalizeNameForMatch(value: string): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\s　]/g, "")
    .toLowerCase();
}

export type ResolveCustomerParams = {
  clinicId: string;
  name: string;
  /** ハイフン/スペース除去済みの電話番号（空文字可） */
  phone: string;
  /** LINE家族選択で渡された customer_id（任意） */
  requestedCustomerId?: string | null;
  /** ball_line_uid cookie 由来の LINE user id（任意。家族選択検証に使う） */
  lineUid?: string | null;
};

export type ResolveCustomerResult =
  | { ok: true; customerId: string }
  | { ok: false; error: string; requiresQuestionnaire?: boolean };

/**
 * 予約者の customer を確定する。失敗時はそのまま返せるエラー（アンケート誘導フラグ付き）を返す。
 * adminDb は RLS バイパスのサービスロールクライアントを渡すこと。
 */
export async function resolveBookingCustomer(
  adminDb: SupabaseClient,
  params: ResolveCustomerParams,
): Promise<ResolveCustomerResult> {
  const { clinicId, name, phone, requestedCustomerId, lineUid } = params;
  let customerId: string | null = null;

  // ── LINE 経由の家族選択 ──
  // customerId が来たら、その customer が cookie の line_user_id に紐付いているかを検証。
  if (requestedCustomerId && lineUid) {
    const { data: link } = await adminDb
      .from("customer_line_links")
      .select("customer_id")
      .eq("line_user_id", lineUid)
      .eq("customer_id", requestedCustomerId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (link) {
      const { data: cust } = await adminDb
        .from("customers")
        .select("id, name, booking_suspended")
        .eq("id", requestedCustomerId)
        .eq("clinic_id", clinicId)
        .maybeSingle();
      if (cust) {
        if (cust.booking_suspended) {
          return { ok: false, error: "現在、オンライン予約のご利用が停止されています。お電話またはLINEにてお問い合わせください。" };
        }
        customerId = cust.id;
      }
    }
  }

  // ── 電話番号で照合 ──
  if (!customerId && phone) {
    const { data: existing } = await adminDb
      .from("customers")
      .select("id, name, booking_suspended, line_user_id")
      .eq("clinic_id", clinicId)
      .eq("phone", phone)
      .maybeSingle();

    if (existing) {
      if (existing.booking_suspended) {
        return { ok: false, error: "現在、オンライン予約のご利用が停止されています。お電話またはLINEにてお問い合わせください。" };
      }
      customerId = existing.id;
      if (existing.name !== name) {
        await adminDb.from("customers").update({ name }).eq("id", customerId).eq("clinic_id", clinicId);
      }
    } else {
      return {
        ok: false,
        error: "初めてオンライン予約をご希望の方は、先にアンケートへのご回答をお願いします。",
        requiresQuestionnaire: true,
      };
    }
  } else if (!customerId) {
    // ── 電話番号なし（再診・名前のみ）→ 氏名 + clinic_id で照合 ──
    let { data: existingList } = await adminDb
      .from("customers")
      .select("id, name, booking_suspended, line_user_id")
      .eq("name", name)
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false });

    if (!existingList || existingList.length === 0) {
      // 完全一致なし → 院内の顧客を正規化名で突き合わせる
      const target = normalizeNameForMatch(name);
      const { data: clinicCustomers } = await adminDb
        .from("customers")
        .select("id, name, booking_suspended, line_user_id")
        .eq("clinic_id", clinicId);
      existingList = (clinicCustomers ?? []).filter(
        (c) => normalizeNameForMatch(c.name as string) === target,
      );
    }

    if (!existingList || existingList.length === 0) {
      return {
        ok: false,
        error: "初めてオンライン予約をご希望の方は、先にアンケートへのご回答をお願いします。",
        requiresQuestionnaire: true,
      };
    }

    if (existingList.length > 1) {
      return {
        ok: false,
        error: "同じお名前の登録が複数あります。お手数ですが電話番号もご入力いただくか、お電話・LINEにてご予約ください。",
      };
    }

    const existing = existingList[0];
    if (existing.booking_suspended) {
      return { ok: false, error: "現在、オンライン予約のご利用が停止されています。お電話またはLINEにてお問い合わせください。" };
    }
    customerId = existing.id;
  }

  if (!customerId) {
    return { ok: false, error: "ご予約者の情報が確認できませんでした。お手数ですがお名前と電話番号を再度ご入力ください。" };
  }

  return { ok: true, customerId };
}
