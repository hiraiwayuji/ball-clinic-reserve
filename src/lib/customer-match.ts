// 「この人はもう登録されているか？」の判定を1か所にまとめる。
//
// この判定を各画面がバラバラに書いていたせいで、
// 電話番号のハイフン有無や氏名の空白ゆれだけで別人と見なされ、
// 同じ患者さんのカルテが何枚も作られていた。
// （例: LINE予約の「ヒガシムラ　ミユ」と受付手入力の「東村　心愛」）
//
// 患者側Web予約は src/lib/booking-customer.ts の resolveBookingCustomer が担当。
// こちらは管理画面・アンケートなど「スタッフや本人が直接入力する」側で使う。

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeNameForMatch, pickCustomerByNameAndPhone } from "@/lib/booking-customer";
import { normalizePhone } from "@/lib/phone";

export type MatchedCustomer = {
  id: string;
  name: string;
  phone: string | null;
};

/**
 * 院内の customers から同一人物を探す。
 *
 * 順番は「確かな順」。1件に絞れないときは**採用しない**（間違った人に紐づけるほうが事故なので）。
 *   1. 電話（正規化）＋ 氏名（正規化）が一致
 *   2. 氏名（正規化）が一致する人がちょうど1人
 *   ※ 「電話だけ一致・名前は違う」は採用しない。家族（兄弟）は同じ電話を使うので、
 *     弟のアンケートで兄のカルテ（名前・生年月日）を上書きしてしまう（2026-09-19）。
 *     本人の書き方違いならカルテが2枚になるが、スタッフが統合できる（上書きは元に戻せない）。
 *
 * 仮電話番号 "080" を149人が共有しているような院があるので、
 * 2 は「1人だけのとき」に限る。
 *
 * @param db RLSを跨いで院内全件を見られるクライアント（service role）を渡すこと
 */
export async function findExistingCustomer(
  db: SupabaseClient,
  clinicId: string,
  input: { name?: string | null; phone?: string | null },
): Promise<MatchedCustomer | null> {
  const nameKey = normalizeNameForMatch(input.name ?? "");
  const phoneKey = normalizePhone(input.phone);
  if (!nameKey && !phoneKey) return null;

  const { data, error } = await db
    .from("customers")
    .select("id, name, phone")
    .eq("clinic_id", clinicId);
  if (error || !data) return null;

  // 判定ルールは Web予約と同じ pickCustomerByNameAndPhone に一本化（兄弟の取り違え防止）。
  const picked = pickCustomerByNameAndPhone(data as MatchedCustomer[], input);
  return picked.kind === "match" ? picked.customer : null; // phone_only は採用しない（上の※）
}

/**
 * 同じ名前（表記ゆれ込み）の患者を全部返す。
 * 「同姓の別人かもしれない」場面の判定材料に使う。
 */
export async function findCustomersByName(
  db: SupabaseClient,
  clinicId: string,
  name: string,
): Promise<MatchedCustomer[]> {
  const key = normalizeNameForMatch(name);
  if (!key) return [];
  const { data } = await db
    .from("customers")
    .select("id, name, phone")
    .eq("clinic_id", clinicId);
  return ((data ?? []) as MatchedCustomer[]).filter(
    (c) => normalizeNameForMatch(c.name) === key,
  );
}
