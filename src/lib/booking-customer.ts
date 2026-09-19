// Web予約の顧客照合（サロン施術・カフェ席予約で共通利用）。
// 顧客台帳はサロン/カフェ共有なので、ここを単一の真実として両フローから呼ぶ。
// 照合ルール: customerId(LINE家族・名前が同じとき) → pickCustomerByNameAndPhone（電話＋氏名）
//   → 電話だけ一致なら「本人／ご家族」を確認 → 未登録ならアンケート誘導。
// ※ アンケート必須ルールは絶対 bypass しない（feedback_reserve_questionnaire_required）。

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/phone";

// 名前によく出る旧字・異体字 → 普通の字。「髙橋」を「高橋」と入れても同じ人と分かるように。
const ITAIJI: Record<string, string> = {
  "髙": "高", "﨑": "崎", "嵜": "崎", "邊": "辺", "邉": "辺", "齋": "斎", "齊": "斉", "嶋": "島", "嶌": "島",
  "濱": "浜", "濵": "浜", "澤": "沢", "廣": "広", "櫻": "桜", "國": "国", "德": "徳", "惠": "恵", "眞": "真",
  "冨": "富", "槇": "槙", "藏": "蔵", "龍": "竜", "瀨": "瀬", "條": "条", "實": "実", "壽": "寿", "與": "与",
  "榮": "栄", "淺": "浅", "澁": "渋", "驒": "騨", "曾": "曽", "禮": "礼", "彌": "弥", "穗": "穂", "黑": "黒",
};
const ITAIJI_RE = new RegExp(`[${Object.keys(ITAIJI).join("")}]`, "g");

/** 書き方どおりの比較用（空白・全角半角・かっこ書きのふりがなだけ無視。カナ/旧字はそろえない） */
function strictNameKey(value: string): string {
  const base = (value ?? "").normalize("NFKC");
  // かっこの中身（ふりがな）を落とす。ただし「(アモウミ)」のように
  // かっこ書きしか名前が無い人は、落とすと空になってしまうので元のまま使う。
  const withoutReading = base.replace(/[（(][^）)]*[）)]/g, "");
  const picked = withoutReading.replace(/[\s　]/g, "") ? withoutReading : base;
  return picked.replace(/[\s　]/g, "").toLowerCase();
}

/**
 * 氏名照合用の正規化。
 * 完全一致だけだと「山内 颯人」と「山内颯人」、全角/半角スペースの違いで
 * 既存患者を見つけられず「初めての方は…」になる事故が起きる（2026-05 山内family 実例）。
 * - NFKC で全角英数/記号を半角化 / 全半角スペース除去 / 小文字化
 * - 「松浦拓登(タクト)」のような、かっこ書きのふりがなは外して比べる
 *   （古い取り込みデータに多く、あとから作った本物のカルテと別人になっていた）
 * - カタカナはひらがなに、旧字（髙・﨑・邊…）は普通の字にそろえる
 */
export function normalizeNameForMatch(value: string): string {
  return strictNameKey(value)
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(ITAIJI_RE, (ch) => ITAIJI[ch] ?? ch);
}

export type CustomerCandidate = { id: string; name: string | null; phone: string | null };

export type PickCustomerResult<T extends CustomerCandidate> =
  | { kind: "match"; customer: T; via: "phone_and_name" | "name" }
  /** 電話が一致する人は1人いるが、名前が違う。本人の書き方違いか、同じ電話を使う家族かは機械では決められない */
  | { kind: "phone_only"; customer: T }
  | { kind: "ambiguous_name" }
  | { kind: "none" };

/**
 * 「この人は誰か」を氏名と電話から決める唯一のルール（Web予約・アンケートで共通）。
 *
 * 🚨 家族（親子・兄弟）は同じ電話番号を使う。電話だけで決めると兄と弟を取り違え、
 *    弟の予約が「同じ日にすでにご予約があります」で弾かれ、兄のカルテ名まで弟に書き換わっていた
 *    （2026-09-19 ボール接骨院 17:00 兄 / 17:30 弟）。
 *   1. 電話＋氏名がどちらも一致する人がちょうど1人 → その人
 *   2. 氏名が一致する人がちょうど1人 → その人（仮番号 080 のまま登録されている兄弟など）
 *   3. 同名が複数で電話でも絞れない → ambiguous_name（取り違えるより止める）
 *   4. 電話が一致する人がちょうど1人・名前は違う → phone_only（呼び出し側が本人か家族かを確かめる）
 *      カナと漢字、旧字、変換ミスと、兄弟の違いは文字だけでは見分けられないため、黙って決めない。
 */
export function pickCustomerByNameAndPhone<T extends CustomerCandidate>(
  rows: T[],
  input: { name?: string | null; phone?: string | null },
): PickCustomerResult<T> {
  const nameKey = normalizeNameForMatch(input.name ?? "");
  const phoneKey = normalizePhone(input.phone);
  if (!nameKey && !phoneKey) return { kind: "none" };

  const byPhone = phoneKey ? rows.filter((c) => normalizePhone(c.phone) === phoneKey) : [];
  const byName = nameKey ? rows.filter((c) => normalizeNameForMatch(c.name ?? "") === nameKey) : [];

  // カナ/旧字をそろえた結果、同じ人の重複カルテ（「渡邉」と「渡邊」など）が複数当たることがある。
  // そのときは入力どおりの書き方（空白・全角半角の違いだけ許す）で1人に絞れればその人にする。
  const strictKey = strictNameKey(input.name ?? "");
  const narrow = (list: T[]): T[] =>
    list.length > 1 ? list.filter((c) => strictNameKey(c.name ?? "") === strictKey) : list;

  if (phoneKey && nameKey) {
    const both = narrow(byPhone.filter((c) => normalizeNameForMatch(c.name ?? "") === nameKey));
    if (both.length === 1) return { kind: "match", customer: both[0], via: "phone_and_name" };
  }
  const nameHits = narrow(byName);
  if (nameHits.length === 1) return { kind: "match", customer: nameHits[0], via: "name" };
  if (byName.length > 1) return { kind: "ambiguous_name" };
  if (byPhone.length === 1) return { kind: "phone_only", customer: byPhone[0] };
  return { kind: "none" };
}

/** 入力された名前が、そのカルテ（名前 or LINE表示名）と同じ人の書き方か */
export function isSameNameAs(
  customer: { name?: string | null; display_name?: string | null },
  typedName: string | null | undefined,
): boolean {
  const key = normalizeNameForMatch(typedName ?? "");
  if (!key) return false;
  return (
    normalizeNameForMatch(customer.name ?? "") === key ||
    (!!customer.display_name && normalizeNameForMatch(customer.display_name) === key)
  );
}

/**
 * オンライン予約を止めるべき顧客か。
 * - booking_suspended: 手動の無期限停止（従来どおり）
 * - booking_suspended_until: 無断キャンセル制限による期限付き自動停止（期限が過ぎれば自動解除扱い）
 */
export function isBookingSuspendedNow(cust: {
  booking_suspended?: boolean | null;
  booking_suspended_until?: string | null;
}): boolean {
  if (cust.booking_suspended) return true;
  if (cust.booking_suspended_until) {
    const until = new Date(cust.booking_suspended_until).getTime();
    if (Number.isFinite(until) && until > Date.now()) return true;
  }
  return false;
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
  /** 「電話は同じで名前が違う」と聞かれて、患者さんが「本人です」を選んだ */
  confirmedSamePerson?: boolean;
};

export type ResolveCustomerResult =
  | { ok: true; customerId: string }
  | { ok: false; error: string; requiresQuestionnaire?: boolean; needsIdentityConfirm?: boolean };

/**
 * 予約者の customer を確定する。失敗時はそのまま返せるエラー（アンケート誘導フラグ付き）を返す。
 * adminDb は RLS バイパスのサービスロールクライアントを渡すこと。
 */
export async function resolveBookingCustomer(
  adminDb: SupabaseClient,
  params: ResolveCustomerParams,
): Promise<ResolveCustomerResult> {
  const { clinicId, name, phone, requestedCustomerId, lineUid, confirmedSamePerson } = params;
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
        .select("id, name, display_name, booking_suspended, booking_suspended_until")
        .eq("id", requestedCustomerId)
        .eq("clinic_id", clinicId)
        .maybeSingle();
      // 🚨 LINEで兄だけが紐づいていると、予約画面は兄を選んだ状態で開く。親がお名前欄を弟に
      //    書き換えても兄のIDで予約され「同じ日にすでにご予約」で弾かれていた（2026-09-19 ボール）。
      //    入力された名前が紐づけ先の名前と違えば家族選択は使わず、下の氏名＋電話の照合に回す。
      if (cust && isSameNameAs(cust, name)) {
        if (isBookingSuspendedNow(cust)) {
          return { ok: false, error: "現在、オンライン予約のご利用が停止されています。お電話またはLINEにてお問い合わせください。" };
        }
        customerId = cust.id;
      }
    }
  }

  // ── 電話番号＋氏名で照合（pickCustomerByNameAndPhone が唯一のルール） ──
  // 🚨 以前は「電話が一致したらその人」と決め打ちし、入力された名前でカルテ名を上書きしていた。
  //    兄弟は親の電話番号を共有するため、弟を予約すると兄のカルテが弟の名前に書き換わり、
  //    さらに「同じ日にすでにご予約があります」で弾かれていた（2026-09-19 ボール接骨院）。
  if (!customerId) {
    const { data: clinicCustomers, error: listErr } = await adminDb
      .from("customers")
      .select("id, name, phone, booking_suspended, booking_suspended_until")
      .eq("clinic_id", clinicId);
    if (listErr) {
      return { ok: false, error: "ご予約者の情報が確認できませんでした。お手数ですがお名前と電話番号を再度ご入力ください。" };
    }
    const picked = pickCustomerByNameAndPhone(
      (clinicCustomers ?? []) as CustomerCandidate[],
      { name, phone },
    );
    if (picked.kind === "ambiguous_name") {
      return {
        ok: false,
        error: "同じお名前の登録が複数あります。お手数ですが電話番号もご入力いただくか、お電話・LINEにてご予約ください。",
      };
    }
    if (picked.kind === "phone_only" && !confirmedSamePerson) {
      // 本人の書き方違い（カナ/旧字/変換ミス）か、同じ電話を使う家族（弟・妹）かを本人に選んでもらう。
      // 登録名はここでは返さない（電話番号を知っているだけの人に名前を見せないため）。
      return {
        ok: false,
        needsIdentityConfirm: true,
        error: "この電話番号は、別のお名前でご登録があります。ご本人の場合はご登録時のお名前で、ご家族の別の方（ごきょうだい等）は初めての方としてアンケートからお申し込みください。",
      };
    }
    if (picked.kind === "none") {
      return {
        ok: false,
        error: "初めてオンライン予約をご希望の方は、先にアンケートへのご回答をお願いします。",
        requiresQuestionnaire: true,
      };
    }
    const existing = picked.customer as CustomerCandidate & {
      booking_suspended?: boolean | null;
      booking_suspended_until?: string | null;
    };
    if (isBookingSuspendedNow(existing)) {
      return { ok: false, error: "現在、オンライン予約のご利用が停止されています。お電話またはLINEにてお問い合わせください。" };
    }
    customerId = existing.id;
  }

  if (!customerId) {
    return { ok: false, error: "ご予約者の情報が確認できませんでした。お手数ですがお名前と電話番号を再度ご入力ください。" };
  }

  return { ok: true, customerId };
}
