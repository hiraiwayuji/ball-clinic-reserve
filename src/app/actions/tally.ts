"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { checkAdminAuth, requireRole } from "@/app/actions/auth";
import { getTallyColumns } from "@/app/actions/settings";
import type { TallyColumn } from "@/lib/tally-columns";
import { nameKey } from "@/lib/patient-count";
import { writeAudit, notifyOwnerOfStaffAction } from "@/lib/audit";
import { revalidatePath } from "next/cache";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

/** Asia/Tokyo の今日 (yyyy-MM-dd) */
function todayJst(): string {
  const now = new Date();
  const jst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  return `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, "0")}-${String(jst.getDate()).padStart(2, "0")}`;
}

export type TallyStaff = { id: string; name: string };

export type TallyRow = {
  // 行の一時ID（クライアント側のkey用。保存時は使わない）
  customer_name: string;
  medical_record_number: string;
  minutes: string;            // 入力欄なので文字列で扱う
  staff_id: string | null;
  is_first_visit: boolean;
  amounts: Record<string, number>; // colKey -> 金額
  // 種別を持つ列で選ばれた種別（colKey -> 種別名。例: { shinkyu: "小児鍼" }）
  variants?: Record<string, string>;
  // 受付カウンターとの連動・次回予約のための予約紐付け（保存対象外、表示用）
  appointment_id?: string | null;
  // その行にまとまっている予約すべて（保険＋鍼灸など、同じ人の同じ日の複数予約）。
  // 会計済は人単位なので、この全部をまとめて更新する。
  appointment_ids?: string[];
  customer_id?: string | null;
  customer_phone?: string;
  checkin_status?: string | null; // null|"arrived"|"in_treatment"|"done"
};

export type TallySheetData = {
  columns: TallyColumn[];
  staff: TallyStaff[];
  rows: TallyRow[];
  isOwner: boolean;
  isToday: boolean;
};

const TALLY_PREFIX = "tally:";

/** 受付ステータスの進み具合（小さいほど手前）。複数施術がある人は一番手前の状態を採用する */
const CHECKIN_ORDER: (string | null)[] = [null, "arrived", "in_treatment", "done"];
function earlierCheckin(a: string | null, b: string | null): string | null {
  return CHECKIN_ORDER.indexOf(a) <= CHECKIN_ORDER.indexOf(b) ? a : b;
}

/** memo(JSON) から日計表メタ情報を取り出す */
function parseTallyMemo(memo: string | null): { mrn: string; minutes: string; variant: string } {
  if (!memo) return { mrn: "", minutes: "", variant: "" };
  try {
    const d = JSON.parse(memo);
    return {
      mrn: d?.medicalRecordNumber ? String(d.medicalRecordNumber) : "",
      minutes: d?.minutes != null ? String(d.minutes) : "",
      variant: d?.variant ? String(d.variant) : "",
    };
  } catch {
    return { mrn: "", minutes: "", variant: "" };
  }
}

/** 日計表の保存済み行（cash_sales の tally: 行）を、患者ごとに1つへ集約した形 */
type TallyAgg = {
  amounts: Record<string, number>;
  variants: Record<string, string>;
  staff_id: string | null;
  mrn: string;
  minutes: string;
  is_first_visit: boolean;
};

/**
 * 同じ人かどうかを見分けるキー。
 * ふだんは名前（空白ゆれ込み）だけで足りるが、同じ日に同姓同名の2人が来ると
 * 名前だけでは1人に合体してしまう（金額が合算され、片方の記帳が消えたように見える）。
 * そこで「その日に同じ名前が複数いる」ときだけ、カルテ番号を足して見分ける。
 * cash_sales は customer_id を持たないので、保存済み行との突合はこのキー（名前＋カルテ番号）で行う。
 */
function personKey(name: string, mrn: string | null | undefined, dupNames: Set<string>): string {
  const k = nameKey(name);
  return dupNames.has(k) ? `${k}|${String(mrn ?? "").trim()}` : k;
}

/** 保存済みの tally: 行（1列1行）を、同一人物（空白ゆれ込み）ごとに1つへ集約する。
 *  dupNames に入っている名前だけは、カルテ番号も含めて別人として分ける。 */
function aggregateTallyRows(rawRows: any[], dupNames: Set<string> = new Set()): Map<string, { name: string } & TallyAgg> {
  const saved = new Map<string, { name: string } & TallyAgg>();
  rawRows.forEach((r: any) => {
    const name = String(r.customer_name ?? "").trim();
    if (!nameKey(name)) return;
    const colKey = String(r.payment_type ?? "").slice(TALLY_PREFIX.length);
    const meta = parseTallyMemo(r.memo);
    const key = personKey(name, meta.mrn, dupNames);
    const prev = saved.get(key) ?? { name, amounts: {}, variants: {}, staff_id: null, mrn: "", minutes: "", is_first_visit: false };
    prev.amounts[colKey] = (prev.amounts[colKey] ?? 0) + (Number(r.treatment_fee) || 0);
    if (meta.variant) prev.variants[colKey] = meta.variant;
    prev.staff_id = prev.staff_id ?? r.staff_id ?? null;
    prev.mrn = prev.mrn || meta.mrn;
    prev.minutes = prev.minutes || meta.minutes;
    prev.is_first_visit = prev.is_first_visit || !!r.is_first_visit;
    saved.set(key, prev);
  });
  return saved;
}

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

/** 変更前後のtally集約を列ごとに比べ、「保険施術: ¥1,500 → ¥1,800」の形で差分の行を作る */
function diffAmountLines(before: TallyAgg | null, after: TallyAgg | null, columns: TallyColumn[]): string[] {
  const labelByKey = new Map(columns.map((c) => [c.key, c.label]));
  const keys = new Set([...Object.keys(before?.amounts ?? {}), ...Object.keys(after?.amounts ?? {})]);
  const lines: string[] = [];
  for (const key of keys) {
    const b = before?.amounts?.[key];
    const a = after?.amounts?.[key];
    if ((b ?? null) === (a ?? null)) continue;
    const label = labelByKey.get(key) ?? key;
    lines.push(`${label}: ${b == null ? "（なし）" : yen(b)} → ${a == null ? "（なし）" : yen(a)}`);
  }
  return lines;
}

/** 削除前の中身を「保険施術: ¥1,500」の形で列挙する */
function listAmountLines(agg: TallyAgg, columns: TallyColumn[]): string[] {
  const labelByKey = new Map(columns.map((c) => [c.key, c.label]));
  return Object.entries(agg.amounts)
    .filter(([, v]) => v)
    .map(([k, v]) => `${labelByKey.get(k) ?? k}: ${yen(v)}`);
}

/**
 * 窓口日計表の入力データを取得。
 * その日の予約・受付済み患者を行に自動展開し、保存済みの日計表(tally:行)があれば金額をプリフィル。
 */
export async function getTallySheet(dateStr: string): Promise<TallySheetData> {
  const auth = await checkAdminAuth();
  const { clinicId } = auth;
  const isOwner = auth.role === "owner";
  const isToday = dateStr === todayJst();

  const columns = await getTallyColumns();
  const sb = getAdminSupabase();
  if (!sb) {
    return { columns, staff: [], rows: [], isOwner, isToday };
  }

  // スタッフ（担当）一覧
  const { data: staffData } = await sb
    .from("reservation_staff")
    .select("id, name, is_active, sort_order")
    .eq("clinic_id", clinicId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const staff: TallyStaff[] = (staffData ?? []).map((s: any) => ({ id: s.id, name: s.name }));

  // その日の予約・受付済み（キャンセル除く）
  const dayStart = `${dateStr}T00:00:00+09:00`;
  const dayEnd = `${dateStr}T23:59:59+09:00`;
  const { data: appts } = await sb
    .from("appointments")
    .select(`id, start_time, end_time, is_first_visit, staff_id, checkin_status,
      customers(id, name, phone, medical_record_number)`)
    .eq("clinic_id", clinicId)
    .neq("status", "cancelled")
    .gte("start_time", dayStart)
    .lte("start_time", dayEnd)
    .order("start_time", { ascending: true });

  // その日のキャンセル分（名前だけ）。
  // 受付でキャンセルにしたのに、保存済みの0円行が「飛び込み」として復活し、
  // 来院人数に数えられてしまう事故を防ぐために使う（2026-08-07 藤川先生の指摘）。
  const { data: cancelledAppts } = await sb
    .from("appointments")
    .select("customers(name)")
    .eq("clinic_id", clinicId)
    .eq("status", "cancelled")
    .gte("start_time", dayStart)
    .lte("start_time", dayEnd);
  const cancelledNames = new Set<string>(
    (cancelledAppts ?? [])
      .map((a: any) => {
        const cust = Array.isArray(a.customers) ? a.customers[0] : a.customers;
        return nameKey((cust?.name ?? "").trim());
      })
      .filter(Boolean),
  );

  // 保存済みの日計表行（tally:）を顧客名でまとめてプリフィル
  const { data: savedRows } = await sb
    .from("cash_sales")
    .select("customer_name, treatment_fee, payment_type, memo, staff_id, is_first_visit")
    .eq("clinic_id", clinicId)
    .eq("sale_date", dateStr)
    .like("payment_type", `${TALLY_PREFIX}%`);

  // 同じ人が同じ日に複数予約（保険→鍼灸で担当が違う等）でも記帳は1行。
  // 予約ごとに行を作ると、保存済み金額が各行にプリフィルされて保存のたび金額が倍になる。
  // まとめる単位は「患者ID」。患者IDが無い予約だけ名前でまとめる。
  // （名前だけでまとめると、同姓同名の2人が1行に合体して片方の会計が消えていた）
  type ApptGroup = { name: string; mrn: string; minutes: number; staff_id: string | null; is_first_visit: boolean; appointment_id: string | null; appointment_ids: string[]; customer_id: string | null; phone: string; checkin_status: string | null };
  const apptGroups = new Map<string, ApptGroup>();
  (appts ?? []).forEach((a: any) => {
    const cust = Array.isArray(a.customers) ? a.customers[0] : a.customers;
    const name = (cust?.name ?? "").trim();
    if (!nameKey(name)) return;
    const key: string = cust?.id ? `id:${cust.id}` : `name:${nameKey(name)}`;
    let mins = 0;
    try {
      const m = Math.round((new Date(a.end_time).getTime() - new Date(a.start_time).getTime()) / 60000);
      if (m > 0 && m < 600) mins = m;
    } catch {}
    const prev = apptGroups.get(key);
    if (!prev) {
      apptGroups.set(key, {
        name,
        mrn: cust?.medical_record_number ?? "",
        minutes: mins,
        staff_id: a.staff_id ?? null,
        is_first_visit: !!a.is_first_visit,
        appointment_id: a.id ?? null,
        appointment_ids: a.id ? [a.id as string] : [],
        customer_id: cust?.id ?? null,
        phone: cust?.phone ?? "",
        checkin_status: a.checkin_status ?? null,
      });
      return;
    }
    // 施術時間は合算（40分＋20分＝60分）、受付状態は一番手前のものを残す
    prev.minutes += mins;
    prev.is_first_visit = prev.is_first_visit || !!a.is_first_visit;
    prev.staff_id = prev.staff_id ?? a.staff_id ?? null;
    prev.mrn = prev.mrn || (cust?.medical_record_number ?? "");
    prev.checkin_status = earlierCheckin(prev.checkin_status, a.checkin_status ?? null);
    if (a.id) prev.appointment_ids.push(a.id as string);
  });

  // その日に同じ名前の患者が2人以上いるか（同姓同名）。いる名前だけカルテ番号で見分ける。
  const nameCount = new Map<string, number>();
  apptGroups.forEach((g) => {
    const k = nameKey(g.name);
    nameCount.set(k, (nameCount.get(k) ?? 0) + 1);
  });
  const dupNames = new Set<string>(Array.from(nameCount.entries()).filter(([, n]) => n >= 2).map(([k]) => k));

  // 保存済み行を同一人物（空白ゆれを含む。同姓同名はカルテ番号でも分ける）ごとに集約
  const saved = aggregateTallyRows(savedRows ?? [], dupNames);

  const usedNames = new Set<string>();
  const rows: TallyRow[] = [];

  // 予約ベースの行
  apptGroups.forEach((g) => {
    let key = personKey(g.name, g.mrn, dupNames);
    let s = saved.get(key);
    // 同姓同名で、保存済み行にカルテ番号が無かった（＝どちらの人か分からない）ときは、
    // 消えたように見えないよう、最初に出てきた同名の人の行に出す。
    if (!s && dupNames.has(nameKey(g.name))) {
      const fallbackKey = `${nameKey(g.name)}|`;
      if (!usedNames.has(fallbackKey) && saved.has(fallbackKey)) {
        key = fallbackKey;
        s = saved.get(fallbackKey);
      }
    }
    rows.push({
      customer_name: g.name,
      medical_record_number: s?.mrn || g.mrn || "",
      minutes: s?.minutes || (g.minutes > 0 ? String(g.minutes) : ""),
      staff_id: s?.staff_id ?? g.staff_id,
      is_first_visit: s?.is_first_visit ?? g.is_first_visit,
      amounts: s?.amounts ?? {},
      variants: s?.variants ?? {},
      appointment_id: g.appointment_id,
      appointment_ids: g.appointment_ids,
      customer_id: g.customer_id,
      customer_phone: g.phone,
      checkin_status: g.checkin_status,
    });
    usedNames.add(key);
  });

  // 予約に無い保存済み患者（飛び込み）も行として追加
  saved.forEach((agg, key) => {
    if (usedNames.has(key)) return;
    // その日の予約が全部キャンセルになっていて、金額も入っていない行は出さない。
    // （受付でキャンセルにした人が0円のまま残り、来院人数に1名として数えられていた）
    // お金が入っている行は「実際に来て会計した」ので必ず残す。
    if (cancelledNames.has(nameKey(agg.name))) {
      const total = Object.values(agg.amounts).reduce((s, v) => s + (Number(v) || 0), 0);
      if (total === 0) return;
    }
    rows.push({
      customer_name: agg.name,
      medical_record_number: agg.mrn,
      minutes: agg.minutes,
      staff_id: agg.staff_id,
      is_first_visit: agg.is_first_visit,
      amounts: agg.amounts,
      variants: agg.variants,
      appointment_id: null,
      appointment_ids: [],
      customer_id: null,
      customer_phone: "",
      checkin_status: null,
    });
  });

  return { columns, staff, rows, isOwner, isToday };
}

/**
 * 窓口日計表から、ある患者さんのその日の記帳を消す。
 *
 * これまで画面の「削除」ボタンはその場の表示から消すだけで、保存済みの記帳
 * （cash_sales）は残ったままだった。次に開くと「保存済みだが予約に無い患者」
 * として復活し、消したはずの行がまた出てくる不具合になっていた。
 * ここで実際に保存済みデータを消すことで、消したら本当に消える状態にする。
 * （その日の予約自体がある方は、この関数の対象にしない＝予約は残るので
 *   一覧からは消えず、金額欄が空に戻るだけの扱いにする＝呼び出し側の判断）
 */
export async function deleteTallyEntriesForName(
  dateStr: string,
  customerName: string,
  editorName?: string | null,
  // 同姓同名の2人がいる日に、片方だけ消すためのカルテ番号（省略可）。
  // 保存済み行のカルテ番号が1種類しか無ければ、従来どおり名前だけで消す。
  medicalRecordNumber?: string | null,
): Promise<{ success: boolean; error?: string; deleted?: number }> {
  const auth = await checkAdminAuth();
  const { clinicId } = auth;
  const key = nameKey(customerName);
  if (!key) return { success: false, error: "お名前が空です" };
  // ログインが共用アカウントの院もあり、メールアドレスだけでは「誰が」直したか分からない。
  // 当日以外を削除するときは、操作した人の名前を必ず添えてもらう(2026-08-24 藤川先生の指摘)。
  const editor = (editorName ?? "").trim();
  if (dateStr !== todayJst() && !editor) {
    return { success: false, error: "当日以外の削除は、操作した方のお名前の指定が必要です" };
  }

  const sb = getAdminSupabase();
  if (!sb) return { success: false, error: "サーバー設定エラーです" };

  const { data: existingRows, error: fetchErr } = await sb
    .from("cash_sales")
    .select("id, customer_name, treatment_fee, payment_type, memo, staff_id, is_first_visit")
    .eq("clinic_id", clinicId)
    .eq("sale_date", dateStr)
    .like("payment_type", `${TALLY_PREFIX}%`);
  if (fetchErr) return { success: false, error: "削除準備に失敗しました: " + fetchErr.message };

  let matched = (existingRows ?? []).filter((r: any) => nameKey(String(r.customer_name ?? "")) === key);
  // 同じ名前でカルテ番号が2種類以上ある（＝同姓同名の2人分）ときだけ、指定のカルテ番号の人に絞る。
  // 「カルテ番号なし」(空文字) も1人分として扱う。番号なしの人のゴミ箱で、番号ありの人の記帳まで
  // 消えないように、空でも必ず絞り込む（undefined/null＝指定なし のときだけ従来どおり名前で全部）。
  const mrn = String(medicalRecordNumber ?? "").trim();
  const distinctMrns = new Set(matched.map((r: { memo: string | null }) => parseTallyMemo(r.memo).mrn));
  const dupNames = distinctMrns.size >= 2 ? new Set([key]) : new Set<string>();
  if (distinctMrns.size >= 2) {
    // どちらの人か指定が無いときは、2人分まとめて消すのではなく止める（片方の記帳を巻き添えにしない）
    if (medicalRecordNumber == null) {
      return { success: false, error: "同じお名前の方が2人いるので、カルテ番号を入れてから消してください" };
    }
    matched = matched.filter((r: { memo: string | null }) => parseTallyMemo(r.memo).mrn === mrn);
  }
  const ids = matched.map((r: any) => r.id as string);
  if (ids.length === 0) return { success: true, deleted: 0 };

  const { error: delErr } = await sb
    .from("cash_sales")
    .delete()
    .eq("clinic_id", clinicId)
    .in("id", ids);
  if (delErr) return { success: false, error: "削除に失敗しました: " + delErr.message };

  // ── 監査ログ + オーナーへの通知 ──
  // 誰でも記帳・削除できるようにした代わりに、何を消したか必ず残す(2026-08-24)。
  const beforeAgg = aggregateTallyRows(matched, dupNames).get(personKey(customerName, mrn, dupNames))
    ?? Array.from(aggregateTallyRows(matched, dupNames).values())[0];
  const name = matched[0]?.customer_name ? String(matched[0].customer_name).trim() : customerName.trim();
  if (beforeAgg) {
    const columns = await getTallyColumns();
    const summaryLines = listAmountLines(beforeAgg, columns);
    await writeAudit({
      clinicId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      actionType: "tally.delete",
      targetTable: "cash_sales",
      targetId: dateStr,
      before: { customerName: name, editorName: editor || null, ...beforeAgg },
      after: null,
    });
    await notifyOwnerOfStaffAction({
      clinicId,
      actorRole: auth.role,
      actorEmail: auth.email,
      actionType: "窓口日計表の削除",
      summary: `${dateStr}${editor ? `（操作: ${editor}）` : ""} ${name}様の記帳を削除\n${summaryLines.length > 0 ? summaryLines.join("\n") : "（金額の入力なし）"}`,
    });
  }

  revalidatePath("/admin/sales");
  return { success: true, deleted: ids.length };
}

/**
 * 窓口日計表を保存（その日の tally: 行を入れ替え）。
 * 誰でも当日・過去日どちらも記帳できる。その代わり、患者ごとに変更前後の金額を
 * 比べて監査ログに残し、スタッフが直したときはオーナーへLINEで知らせる(2026-08-24)。
 */
export async function saveTallySheet(
  dateStr: string,
  rows: TallyRow[],
  editorName?: string | null,
): Promise<{ success: boolean; error?: string; saved?: number }> {
  const auth = await checkAdminAuth();
  const { clinicId } = auth;

  if (!dateStr) return { success: false, error: "日付が不正です" };
  // ログインが共用アカウントの院もあり、メールアドレスだけでは「誰が」直したか分からない。
  // 当日以外を保存するときは、操作した人の名前を必ず添えてもらう(2026-08-24 藤川先生の指摘)。
  const editor = (editorName ?? "").trim();
  if (dateStr !== todayJst() && !editor) {
    return { success: false, error: "当日以外の記帳は、操作した方のお名前の指定が必要です" };
  }

  const columns = await getTallyColumns();
  const colKeys = new Set(columns.map((c) => c.key));

  // 読み込み(getTallySheet)は service role で全行見えるのに、保存だけログインユーザー権限だと、
  // 「読めるのに消せない行」が1件でもあった瞬間に delete が空振りして insert だけ乗り、
  // また金額が倍になる。読み書きで見えるものをそろえておく。
  // clinic_id は下のクエリで必ず明示している。
  const supabase = getAdminSupabase() ?? (await createClient());

  // 同じ人の行が2つ届いた場合の取り扱い。
  // 中身が同じなら「画面の重複表示」なので1つに畳む（そのまま入れると金額が倍になる）。
  // 中身が違うなら別会計なので列ごとに合算する。
  //
  // ただし同姓同名の2人（名前が同じでカルテ番号が違う）は別人なので合算しない。
  // 「同じ名前でカルテ番号が2種類以上ある」名前だけ、カルテ番号込みで見分ける。
  const mrnsByName = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = nameKey(r.customer_name ?? "");
    if (!k) continue;
    if (!mrnsByName.has(k)) mrnsByName.set(k, new Set());
    mrnsByName.get(k)!.add((r.medical_record_number ?? "").trim());
  }
  const dupNames = new Set<string>(
    Array.from(mrnsByName.entries()).filter(([, s]) => s.size >= 2).map(([k]) => k),
  );

  const mergedRows: TallyRow[] = [];
  const rowByName = new Map<string, TallyRow>();
  for (const r of rows) {
    const name = (r.customer_name ?? "").trim();
    if (!name) continue;
    const key = personKey(name, r.medical_record_number, dupNames);
    const prev = rowByName.get(key);
    if (!prev) {
      const copy: TallyRow = { ...r, customer_name: name, amounts: { ...r.amounts }, variants: { ...(r.variants ?? {}) } };
      rowByName.set(key, copy);
      mergedRows.push(copy);
      continue;
    }
    if (JSON.stringify(prev.amounts) === JSON.stringify(r.amounts)) continue;
    for (const [col, val] of Object.entries(r.amounts ?? {})) {
      prev.amounts[col] = (prev.amounts[col] ?? 0) + (Number(val) || 0);
    }
    for (const [col, v] of Object.entries(r.variants ?? {})) {
      if (!prev.variants![col]) prev.variants![col] = v;
    }
    prev.is_first_visit = prev.is_first_visit || r.is_first_visit;
    prev.medical_record_number = prev.medical_record_number || r.medical_record_number;
    prev.staff_id = prev.staff_id ?? r.staff_id;
  }

  // 空データが送られてきた場合（画面ロード失敗・通信の巻き戻し等）に
  // その日の記帳を全消去してしまう事故を防ぐ。何も送られなければ何もしない。
  if (mergedRows.length === 0) {
    return { success: true, saved: 0 };
  }

  // 既存の tally 行を「今回送信された患者の分だけ」削除して入れ替える。
  // 個別入力の cash_sales（payment_type が tally: 以外）は触らない。
  // 「布川紗帆」と「布川　紗帆」のような空白ゆれも同じ人として消す（残すと重複行が復活する）。
  const submittedKeys = new Set(mergedRows.map((r) => nameKey(r.customer_name)));
  const { data: existingTallyRows, error: fetchErr } = await supabase
    .from("cash_sales")
    .select("id, customer_name, treatment_fee, payment_type, memo, staff_id, is_first_visit")
    .eq("clinic_id", clinicId)
    .eq("sale_date", dateStr)
    .like("payment_type", `${TALLY_PREFIX}%`);
  if (fetchErr) {
    console.error("saveTallySheet fetch error:", fetchErr);
    return { success: false, error: "保存準備に失敗しました: " + fetchErr.message };
  }
  // 監査ログ用に「直す前」の状態を、削除する前に患者ごとへ集約しておく
  const beforeByKey = aggregateTallyRows(
    (existingTallyRows ?? []).filter((r: any) => submittedKeys.has(nameKey(String(r.customer_name ?? "")))),
    dupNames,
  );
  const deleteIds = (existingTallyRows ?? [])
    .filter((r: any) => submittedKeys.has(nameKey(String(r.customer_name ?? ""))))
    .map((r: any) => r.id as string);
  if (deleteIds.length > 0) {
    const { error: delErr } = await supabase
      .from("cash_sales")
      .delete()
      .eq("clinic_id", clinicId)
      .in("id", deleteIds);
    if (delErr) {
      console.error("saveTallySheet delete error:", delErr);
      return { success: false, error: "保存準備に失敗しました: " + delErr.message };
    }
  }

  // 列ごとの種別候補（種別の正当性チェック用）
  const variantsByKey = new Map<string, Set<string>>(
    columns.map((c) => [c.key, new Set((c.variants ?? []).map((v) => v.trim()).filter(Boolean))]),
  );

  // 各行 → 金額のある列ごとに 1 行へ展開
  const insertRows: any[] = [];
  for (const row of mergedRows) {
    const name = (row.customer_name ?? "").trim();
    if (!name) continue;
    const mrn = (row.medical_record_number ?? "").trim();
    const minutes = (row.minutes ?? "").toString().trim();
    const staffId = row.staff_id || null;

    let firstLine = true;
    for (const col of columns) {
      if (!colKeys.has(col.key)) continue;
      const raw = row.amounts?.[col.key];
      // 未入力(undefined/null)はスキップ。明示的に入力された 0（自賠責など窓口0円）は計上する。
      if (raw == null) continue;
      const amount = Math.round(Number(raw));
      if (!Number.isFinite(amount)) continue;
      // 種別（その列に定義された候補にあるものだけ採用）
      const variant = (row.variants?.[col.key] ?? "").trim();
      const validVariant = variant && variantsByKey.get(col.key)?.has(variant) ? variant : "";
      // memo は列ごと（種別が列で異なるため行共通にしない）
      const memo = JSON.stringify({
        ...(mrn ? { medicalRecordNumber: mrn } : {}),
        ...(minutes ? { minutes } : {}),
        ...(validVariant ? { variant: validVariant } : {}),
      });
      insertRows.push({
        sale_date: dateStr,
        customer_name: name,
        treatment_fee: amount,
        memo,
        // 新患の多重カウント防止: 患者の先頭行だけ true
        is_first_visit: firstLine ? !!row.is_first_visit : false,
        payment_type: `${TALLY_PREFIX}${col.key}`,
        payment_types: [`${TALLY_PREFIX}${col.key}`],
        staff_id: staffId,
        clinic_id: clinicId,
      });
      firstLine = false;
    }
  }

  if (insertRows.length > 0) {
    // tenant-isolation-ignore: insertRows の各行に clinic_id: clinicId を設定済み
    const { error: insErr } = await supabase.from("cash_sales").insert(insertRows);
    if (insErr) {
      console.error("saveTallySheet insert error:", insErr);
      return { success: false, error: "保存に失敗しました: " + insErr.message };
    }
  }

  // ── 監査ログ + オーナーへの通知 ──
  // 患者ごとに「直す前」と「直した後」を比べ、実際に変わった人だけ記録する
  // （毎回その日の全員分を送信し直す作りなので、変わっていない人まで記録すると埋もれる）。
  const changedSummaries: string[] = [];
  for (const row of mergedRows) {
    const key = personKey(row.customer_name, row.medical_record_number, dupNames);
    const before = beforeByKey.get(key) ?? null;
    const after: TallyAgg = {
      amounts: row.amounts ?? {},
      variants: row.variants ?? {},
      staff_id: row.staff_id ?? null,
      mrn: row.medical_record_number ?? "",
      minutes: row.minutes ?? "",
      is_first_visit: !!row.is_first_visit,
    };
    const diffLines = diffAmountLines(before, after, columns);
    if (diffLines.length === 0) continue; // 金額に変化がなければ記録しない

    await writeAudit({
      clinicId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      actionType: "tally.update",
      targetTable: "cash_sales",
      targetId: dateStr,
      before: before ? { customerName: row.customer_name, editorName: editor || null, ...before } : null,
      after: { customerName: row.customer_name, editorName: editor || null, ...after },
    });
    changedSummaries.push(`${row.customer_name}様\n${diffLines.map((l) => `　${l}`).join("\n")}`);
  }
  if (changedSummaries.length > 0) {
    await notifyOwnerOfStaffAction({
      clinicId,
      actorRole: auth.role,
      actorEmail: auth.email,
      actionType: "窓口日計表の修正",
      summary: `${dateStr}${editor ? `（操作: ${editor}）` : ""}\n${changedSummaries.join("\n")}`,
    });
  }

  revalidatePath("/admin/sales");
  revalidatePath("/admin/dashboard");
  return { success: true, saved: insertRows.length };
}

/**
 * ある日の窓口日計表の変更履歴（修正・削除）を新しい順に返す。
 * 「誰でも記帳・削除できる」代わりに、何が変わったか誰でも確認できるようにする。
 */
export type TallyChangeLogEntry = {
  id: string;
  createdAt: string;
  actorEmail: string | null;
  actorRole: string;
  // 当日以外の変更で登録してもらった、操作した人の名前（当日の変更にはnull）
  editorName: string | null;
  action: "update" | "delete";
  customerName: string;
  before: (TallyAgg & { customerName: string }) | null;
  after: (TallyAgg & { customerName: string }) | null;
};

export async function getTallyChangeLog(dateStr: string): Promise<TallyChangeLogEntry[]> {
  const auth = await checkAdminAuth();
  const sb = getAdminSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("audit_log")
    .select("id, created_at, actor_email, actor_role, action_type, before_data, after_data")
    .eq("clinic_id", auth.clinicId)
    .eq("target_table", "cash_sales")
    .eq("target_id", dateStr)
    .in("action_type", ["tally.update", "tally.delete"])
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((r: any) => {
    const before = r.before_data ?? null;
    const after = r.after_data ?? null;
    return {
      id: r.id,
      createdAt: r.created_at,
      actorEmail: r.actor_email,
      actorRole: r.actor_role,
      editorName: after?.editorName ?? before?.editorName ?? null,
      action: r.action_type === "tally.delete" ? "delete" : "update",
      customerName: after?.customerName ?? before?.customerName ?? "",
      before,
      after,
    } as TallyChangeLogEntry;
  });
}

// ───────────────────────── データ分析（オーナー専用） ─────────────────────────

export type CategoryBreakdownRow = { key: string; label: string; amount: number; ratio: number; count: number };
export type TrendPoint = { period: string; amount: number; count: number };
export type StaffBreakdownRow = { staff_id: string | null; name: string; amount: number; count: number };

async function fetchSalesRange(clinicId: string, from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_sales")
    .select("sale_date, treatment_fee, payment_type, staff_id, customer_name, is_first_visit")
    .eq("clinic_id", clinicId)
    .gte("sale_date", from)
    .lte("sale_date", to);
  if (error) throw error;
  return data ?? [];
}

/** カテゴリ別売上構成（tally 列ごと＋その他） */
export async function getTallyCategoryBreakdown(
  from: string,
  to: string,
): Promise<{ success: boolean; rows?: CategoryBreakdownRow[]; total?: number; error?: string }> {
  try {
    const { clinicId } = await requireRole(["owner"]);
    const columns = await getTallyColumns();
    const labelByKey = new Map(columns.map((c) => [c.key, c.label]));
    const data = await fetchSalesRange(clinicId, from, to);

    const sumByKey = new Map<string, { amount: number; count: number }>();
    for (const r of data as any[]) {
      const pt = String(r.payment_type ?? "");
      const key = pt.startsWith(TALLY_PREFIX) ? pt.slice(TALLY_PREFIX.length) : "__other__";
      const prev = sumByKey.get(key) ?? { amount: 0, count: 0 };
      prev.amount += Number(r.treatment_fee) || 0;
      prev.count += 1;
      sumByKey.set(key, prev);
    }
    const total = Array.from(sumByKey.values()).reduce((s, v) => s + v.amount, 0);

    // tally 列の順序で並べ、最後にその他
    const rows: CategoryBreakdownRow[] = [];
    for (const col of columns) {
      const v = sumByKey.get(col.key);
      if (!v) continue;
      rows.push({ key: col.key, label: col.label, amount: v.amount, count: v.count, ratio: total ? v.amount / total : 0 });
    }
    const other = sumByKey.get("__other__");
    if (other && other.amount !== 0) {
      rows.push({ key: "__other__", label: "その他（個別入力・旧データ）", amount: other.amount, count: other.count, ratio: total ? other.amount / total : 0 });
    }
    return { success: true, rows, total };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "取得に失敗しました" };
  }
}

/** 日別・月別の売上推移 */
export async function getSalesTrend(
  granularity: "day" | "month",
  from: string,
  to: string,
): Promise<{ success: boolean; points?: TrendPoint[]; error?: string }> {
  try {
    const { clinicId } = await requireRole(["owner"]);
    const data = await fetchSalesRange(clinicId, from, to);
    const byPeriod = new Map<string, { amount: number; count: number }>();
    for (const r of data as any[]) {
      const d = String(r.sale_date); // yyyy-MM-dd
      const period = granularity === "month" ? d.slice(0, 7) : d;
      const prev = byPeriod.get(period) ?? { amount: 0, count: 0 };
      prev.amount += Number(r.treatment_fee) || 0;
      prev.count += 1;
      byPeriod.set(period, prev);
    }
    const points: TrendPoint[] = Array.from(byPeriod.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([period, v]) => ({ period, amount: v.amount, count: v.count }));
    return { success: true, points };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "取得に失敗しました" };
  }
}

/** 担当（スタッフ）別売上 */
export async function getStaffSalesBreakdown(
  from: string,
  to: string,
): Promise<{ success: boolean; rows?: StaffBreakdownRow[]; error?: string }> {
  try {
    const { clinicId } = await requireRole(["owner"]);
    const data = await fetchSalesRange(clinicId, from, to);

    const byStaff = new Map<string, { amount: number; count: number }>();
    for (const r of data as any[]) {
      const sid = r.staff_id ?? "__none__";
      const prev = byStaff.get(sid) ?? { amount: 0, count: 0 };
      prev.amount += Number(r.treatment_fee) || 0;
      prev.count += 1;
      byStaff.set(sid, prev);
    }

    // スタッフ名解決
    const sb = getAdminSupabase();
    const nameById = new Map<string, string>();
    if (sb) {
      const { data: staff } = await sb
        .from("reservation_staff")
        .select("id, name")
        .eq("clinic_id", clinicId);
      (staff ?? []).forEach((s: any) => nameById.set(s.id, s.name));
    }

    const rows: StaffBreakdownRow[] = Array.from(byStaff.entries())
      .map(([sid, v]) => ({
        staff_id: sid === "__none__" ? null : sid,
        name: sid === "__none__" ? "未設定" : (nameById.get(sid) ?? "（不明な担当）"),
        amount: v.amount,
        count: v.count,
      }))
      .sort((a, b) => b.amount - a.amount);

    return { success: true, rows };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "取得に失敗しました" };
  }
}

/** 売上記帳モードだけを軽量取得（/admin/sales のモード分岐用） */
export async function getSalesInputMode(): Promise<"per_patient" | "tally"> {
  const { clinicId } = await checkAdminAuth();
  const sb = getAdminSupabase();
  if (!sb) return "per_patient";
  const { data } = await sb
    .from("clinic_settings")
    .select("sales_input_mode")
    .eq("id", clinicId)
    .maybeSingle();
  return data?.sales_input_mode === "tally" ? "tally" : "per_patient";
}
