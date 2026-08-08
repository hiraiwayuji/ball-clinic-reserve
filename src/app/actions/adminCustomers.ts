"use server";

import { createClient } from "@/lib/supabase/server";
import { countNewAndReturnVisits, countVisitDays } from "@/lib/patient-count";
import { compareNames, nameNeedsCleanup, normalizeForCompare } from "@/lib/name-similarity";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { checkAdminAuth } from "./auth";
import { revalidatePath } from "next/cache";
import { getClinicSettings } from "./settings";
import { writeAudit, type AuditActorRole } from "@/lib/audit";

type CustomerWithStats = {
  id: string;
  name: string;
  phone: string;
  created_at: string;
  appointmentCount: number;
  cancelCount: number;
  noShowCount: number;
  lastVisit: string | null;
  booking_suspended: boolean;
  /** 無断キャンセル制限による期限付きオンライン予約停止（期限内なら停止中） */
  booking_suspended_until: string | null;
  line_user_id: string | null;
  line_display_name: string | null;
  birth_month: number | null;
  gender: string | null;
  age_group: string | null;
  guardian_name: string | null;
  city_name: string | null;
  birth_date: string | null;
  referral_source: string | null;
  medical_record_number: string | null;
  address: string | null;
  school_club: string | null;
};

type AppointmentRow = {
  id: string;
  start_time: string;
  status: string | null;
  no_show?: boolean | null;
  cancel_kind?: string | null;
};

type CustomerRow = Omit<CustomerWithStats, "appointmentCount" | "cancelCount" | "lastVisit"> & {
  appointments?: AppointmentRow[] | null;
};

type SupabaseErrorLike = {
  message?: string;
};

type CustomerUpdateData = {
  name: string;
  phone: string;
  medical_record_number?: string | null;
};

export async function getCustomers(): Promise<CustomerWithStats[]> {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await createClient();

    // まず medical_record_number を含めてクエリ
    const { data: rawCustomers, error: firstError } = await supabase
      .from("customers")
      .select(`
        id,
        name,
        phone,
        created_at,
        booking_suspended,
        booking_suspended_until,
        line_user_id,
        line_display_name,
        birth_month,
        gender,
        age_group,
        guardian_name,
        city_name,
        birth_date,
        referral_source,
        medical_record_number,
        address,
        school_club,
        appointments (
          id,
          start_time,
          status,
          no_show,
          cancel_kind
        )
      `)
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false });

    let customers: CustomerRow[] | null = rawCustomers as CustomerRow[] | null;
    let queryError = firstError;

    // エラーが発生した場合（medical_record_number カラム未作成など）は除外して再クエリ
    if (queryError) {
      const errMsg = (queryError as SupabaseErrorLike).message ?? JSON.stringify(queryError);
      console.warn("First query failed, retrying without medical_record_number:", errMsg);
      const fallback = await supabase
        .from("customers")
        .select(`
          id,
          name,
          phone,
          created_at,
          booking_suspended,
          line_user_id,
          line_display_name,
          birth_month,
          gender,
          age_group,
          guardian_name,
          city_name,
          birth_date,
          referral_source,
          address,
          school_club,
          appointments (
            id,
            start_time,
            status
          )
        `)
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false });
      customers = (fallback.data as CustomerRow[] | null) ?? null;
      queryError = fallback.error;
    }

    if (queryError) {
      const errMsg = (queryError as SupabaseErrorLike).message ?? JSON.stringify(queryError);
      console.error("Failed to fetch customers:", errMsg);
      return [];
    }

    const customerRows = customers ?? [];

    // LINE連携の表示は customers.line_user_id だけでは足りない。
    // 家族紐付け（customer_line_links の is_primary=false）の人が「未連携」に見えてしまうため、
    // 自院の links を1回で引いて補完する。
    const linkByCustomer = new Map<string, string>();
    try {
      const { data: links } = await supabase
        .from("customer_line_links")
        .select("customer_id, line_user_id, is_primary")
        .eq("clinic_id", clinicId)
        .order("is_primary", { ascending: false });
      for (const l of (links ?? []) as { customer_id: string; line_user_id: string }[]) {
        if (!linkByCustomer.has(l.customer_id)) linkByCustomer.set(l.customer_id, l.line_user_id);
      }
    } catch (e) {
      console.warn("customer_line_links fetch failed (LINE連携表示は customers.line_user_id のみ):", e);
    }

    const formattedCustomers: CustomerWithStats[] = customerRows.map((c) => {
      const appointments = c.appointments || [];
      // セット解除（cancel_kind='set_removed'）と院都合（cancel_kind='clinic_reason'）は
      // 本人のドタキャンではないので、キャンセル回数にも未来院にも数えない。
      const cancelled = appointments.filter(
        (a) =>
          a.status === "cancelled" &&
          a.cancel_kind !== "set_removed" &&
          a.cancel_kind !== "clinic_reason",
      );
      const active = appointments.filter((a) => a.status !== "cancelled");
      // 未来院（赤バッジ）＝無断・未確認のみ。
      // 仕分け済み: cancel_kind='unexcused'。未仕分け: 従来どおり no_show フラグで判定。
      const noShow = appointments.filter(
        (a) =>
          a.cancel_kind === "unexcused" ||
          (a.no_show === true && (a.cancel_kind == null || a.cancel_kind === undefined)),
      );

      let lastVisit = null;
      if (active.length > 0) {
        const sorted = [...active].sort((a, b) =>
          new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
        );
        lastVisit = sorted[0].start_time;
      }

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        created_at: c.created_at,
        // 来院回数は「予約の件数」ではなく「来院した日数」。
        // 同じ日に保険＋鍼灸で2予約取る方が多く、件数だと1回の来院が2回になり
        // リピート率（2回以上）が実態より高く出る。
        appointmentCount: countVisitDays(active.map((a) => a.start_time)),
        cancelCount: cancelled.length,
        noShowCount: noShow.length,
        lastVisit,
        booking_suspended: c.booking_suspended ?? false,
        booking_suspended_until: c.booking_suspended_until ?? null,
        line_user_id: c.line_user_id ?? linkByCustomer.get(c.id) ?? null,
        line_display_name: c.line_display_name ?? null,
        birth_month: c.birth_month ?? null,
        gender: c.gender ?? null,
        age_group: c.age_group ?? null,
        guardian_name: c.guardian_name ?? null,
        city_name: c.city_name ?? null,
        birth_date: c.birth_date ?? null,
        referral_source: c.referral_source ?? null,
        address: c.address ?? null,
        medical_record_number: c.medical_record_number ?? null,
        school_club: c.school_club ?? null,
      };
    });

    return formattedCustomers;
  } catch (err) {
    console.error("Customers fetch error:", err);
    return [];
  }
}

export async function updateCustomerQuestionnaire(
  customerId: string,
  data: {
    guardian_name?: string | null;
    birth_month?: number | null;
    gender?: string | null;
    age_group?: string | null;
    city_name?: string | null;
    birth_date?: string | null;
    referral_source?: string | null;
    address?: string | null;
    school_club?: string | null;
  }
) {
  const { clinicId } = await checkAdminAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  const supabase = createAdminClient(url, key);
  const { error } = await supabase
    .from("customers")
    .update(data)
    .eq("id", customerId)
    .eq("clinic_id", clinicId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
  return { success: true };
}

export async function updateCustomerInfo(
  customerId: string, 
  name: string, 
  phone: string,
  medicalRecordNumber?: string | null
) {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);
  
  const updateData: CustomerUpdateData = { 
    name: name.trim(), 
    phone: phone.trim() 
  };
  
  if (medicalRecordNumber !== undefined) {
    updateData.medical_record_number = medicalRecordNumber?.trim() || null;
  }

  const { error } = await supabase
    .from("customers")
    .update(updateData)
    .eq("id", customerId)
    .eq("clinic_id", clinicId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
  return { success: true };
}

/**
 * customers を参照している子テーブル（customer_id 列を持つテーブル）の一覧。
 *
 * ⚠️ ここに書き忘れたテーブルは、統合の最後に走る source 顧客の DELETE で
 *    ON DELETE CASCADE により黙って消える。
 *    （2026-07-18 にトレーニング評価が消失したのはこれが原因。予約だけ移していた）
 *    customers を参照する子テーブルを増やしたら、必ずここにも足すこと。
 *    足し忘れた場合も、統合の直前に残存チェックで止まるようにしてある。
 */
const CUSTOMER_CHILD_TABLES = [
  "appointments",
  "training_assessments",
  "customer_line_links",
] as const;

const CHILD_TABLE_LABEL: Record<(typeof CUSTOMER_CHILD_TABLES)[number], string> = {
  appointments: "予約",
  training_assessments: "トレーニング評価",
  customer_line_links: "LINE連携",
};

/**
 * 二つの顧客データを統合する（名寄せ）
 * - target に値が無いフィールド（カルテ番号・電話・LINE等）は source の値で埋める
 * - source にぶら下がる子データ（予約・トレーニング評価・LINE連携）を target へ移動
 * - 移動漏れが1件も無いことを確認してから source を削除
 *
 * name と clinic_id は target を正として維持。id/created_at 等のシステム列は触らない。
 */
export async function mergeCustomers(
  sourceId: string,
  targetId: string,
): Promise<{ success: boolean; error?: string }> {
  if (sourceId === targetId) {
    throw new Error("同じ患者同士は統合できません");
  }

  const { clinicId, userId, email, role } = await checkAdminAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);

  // 1. source と target のフルレコードを取得
  const [{ data: sourceRow }, { data: targetRow }] = await Promise.all([
    supabase
      .from("customers")
      .select("*")
      .eq("id", sourceId)
      .eq("clinic_id", clinicId)
      .maybeSingle(),
    supabase
      .from("customers")
      .select("*")
      .eq("id", targetId)
      .eq("clinic_id", clinicId)
      .maybeSingle(),
  ]);

  if (!sourceRow || !targetRow) {
    throw new Error("対象の顧客が見つかりません");
  }

  // 2. target に値が無いカラムについて source の値で埋める
  //    name は target を維持（統合先＝正の名前）。システム列は対象外。
  const SKIP = new Set(["id", "clinic_id", "name", "created_at", "updated_at"]);
  const mergePatch: Record<string, unknown> = {};
  for (const key of Object.keys(sourceRow as Record<string, unknown>)) {
    if (SKIP.has(key)) continue;
    const targetVal = (targetRow as Record<string, unknown>)[key];
    const sourceVal = (sourceRow as Record<string, unknown>)[key];
    const targetEmpty =
      targetVal === null || targetVal === undefined || targetVal === "";
    const sourceHas =
      sourceVal !== null && sourceVal !== undefined && sourceVal !== "";
    if (targetEmpty && sourceHas) {
      mergePatch[key] = sourceVal;
    }
  }

  // 3. unique 制約のあるカラム（medical_record_number 等）は source を先に null にして
  //    target への UPDATE が unique 違反にならないようにする
  const uniqueCandidates = ["medical_record_number", "line_user_id"] as const;
  const sourceClearPatch: Record<string, null> = {};
  for (const col of uniqueCandidates) {
    if (mergePatch[col] !== undefined) {
      sourceClearPatch[col] = null;
    }
  }
  if (Object.keys(sourceClearPatch).length > 0) {
    const { error: clearError } = await supabase
      .from("customers")
      .update(sourceClearPatch)
      .eq("id", sourceId)
      .eq("clinic_id", clinicId);
    if (clearError) {
      console.error("Failed to clear source unique fields:", clearError);
      throw new Error("source 側の一意制約解除に失敗しました");
    }
  }

  // 4. target をマージで更新
  if (Object.keys(mergePatch).length > 0) {
    const { error: mergeError } = await supabase
      .from("customers")
      .update(mergePatch)
      .eq("id", targetId)
      .eq("clinic_id", clinicId);
    if (mergeError) {
      console.error("Failed to merge customer fields:", mergeError);
      throw new Error(
        "顧客フィールドの統合に失敗しました（カルテ番号・電話番号等）",
      );
    }
  }

  // 5. LINE連携は (customer_id, line_user_id, clinic_id) が unique。
  //    target に同じ LINE アカウントが既にある分だけ、先に source 側を消して衝突を避ける。
  const { data: targetLinks } = await supabase
    .from("customer_line_links")
    .select("line_user_id")
    .eq("customer_id", targetId)
    .eq("clinic_id", clinicId);
  const dupLineIds = (targetLinks ?? [])
    .map((r: { line_user_id: string | null }) => r.line_user_id)
    .filter((v): v is string => !!v);
  if (dupLineIds.length > 0) {
    await supabase
      .from("customer_line_links")
      .delete()
      .eq("customer_id", sourceId)
      .eq("clinic_id", clinicId)
      .in("line_user_id", dupLineIds);
  }

  // 6. 子データを target へ引っ越す（予約・トレーニング評価・LINE連携）
  const movedCounts: Record<string, number> = {};
  for (const table of CUSTOMER_CHILD_TABLES) {
    const { data: moved, error: moveError } = await supabase
      .from(table)
      .update({ customer_id: targetId })
      .eq("customer_id", sourceId)
      .eq("clinic_id", clinicId)
      .select("id");
    if (moveError) {
      console.error(`Failed to move ${table}:`, moveError);
      // throw ではなく return。本番の Server Actions は throw したメッセージが
      // 画面に出ない（伏せられる）ため、理由を先生に見せるには戻り値で返す必要がある。
      return {
        success: false,
        error: `${CHILD_TABLE_LABEL[table]}の移行に失敗したため統合を中止しました。データは消えていません。`,
      };
    }
    movedCounts[table] = moved?.length ?? 0;
  }

  // 6-b. 売上（cash_sales）は customer_id を持たず customer_name の文字列だけで
  //      患者と結びついている。名義を target の名前に付け替えないと、
  //      カルテを統合しても売上・来院数は別人のまま残り続ける。
  {
    const srcName = String((sourceRow as any)?.name ?? "").trim();
    const dstName = String((targetRow as any)?.name ?? "").trim();
    if (srcName && dstName && srcName !== dstName) {
      const { data: renamed, error: renameError } = await supabase
        .from("cash_sales")
        .update({ customer_name: dstName })
        .eq("clinic_id", clinicId)
        .eq("customer_name", srcName)
        .select("id");
      if (renameError) {
        console.error("Failed to move cash_sales:", renameError);
        return {
          success: false,
          error: "売上の名義移行に失敗したため統合を中止しました。データは消えていません。",
        };
      }
      movedCounts["cash_sales"] = renamed?.length ?? 0;
    }
  }

  // 7. 引っ越し漏れの確認。1件でも source 側に残っていたら削除しない。
  //    source を消すと ON DELETE CASCADE で子データが道連れで消えるため、ここで必ず止める。
  const leftovers: string[] = [];
  for (const table of CUSTOMER_CHILD_TABLES) {
    const { count } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("customer_id", sourceId)
      .eq("clinic_id", clinicId);
    if ((count ?? 0) > 0) leftovers.push(`${CHILD_TABLE_LABEL[table]} ${count}件`);
  }
  if (leftovers.length > 0) {
    return {
      success: false,
      error:
        `統合を中止しました。移せなかったデータが残っています（${leftovers.join(" / ")}）。` +
        `そのまま削除するとこのデータが消えてしまうため、元のカルテを残したまま止めています。`,
    };
  }

  // 8. 元の顧客データを削除
  const { error: deleteError } = await supabase
    .from("customers")
    .delete()
    .eq("id", sourceId)
    .eq("clinic_id", clinicId);

  if (deleteError) {
    console.error("Failed to delete source customer:", deleteError);
    // フィールド統合・子データ移動は完了済みなのでここでは throw しない（手動削除で対応可能）
  }

  // 9. 監査ログ（誰がどのカルテを統合したか。消えたデータを後から追えるように）
  await writeAudit({
    clinicId,
    actorUserId: userId,
    actorEmail: email,
    actorRole: (role ?? "unknown") as AuditActorRole,
    actionType: "customer.merge",
    targetTable: "customers",
    targetId,
    before: {
      source: { id: sourceId, name: sourceRow.name, medical_record_number: sourceRow.medical_record_number },
      target: { id: targetId, name: targetRow.name, medical_record_number: targetRow.medical_record_number },
    },
    after: { movedCounts, mergedFields: Object.keys(mergePatch), sourceDeleted: !deleteError },
  });

  revalidatePath("/admin/customers");
  return { success: true };
}

// ───────────────── 名前の整理（似た名前の検索・要整理リスト） ─────────────────

export type NameCandidate = {
  id: string;
  name: string;
  medicalRecordNumber: string | null;
  phone: string | null;
  visitDays: number;
  lastVisit: string | null;
  /** 直近の来院日（最大3件）。「この人は誰だったか」を思い出す手がかりに使う */
  recentVisits: string[];
  salesRows: number;
  /** 予約も売上も無い＝消しても何も失わない */
  isEmpty: boolean;
};

export type SimilarCandidate = NameCandidate & { score: number; reason: string };

export type NameCleanupRow = NameCandidate & { cleanupReason: string };

/** 院内の患者を、名前の整理に必要な情報つきでまとめて取る */
async function loadNameCandidates(clinicId: string): Promise<NameCandidate[]> {
  const supabase = await createClient();
  const [{ data: customers }, { data: appts }, { data: sales }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, medical_record_number, phone")
      .eq("clinic_id", clinicId),
    supabase
      .from("appointments")
      .select("customer_id, start_time, status")
      .eq("clinic_id", clinicId)
      .neq("status", "cancelled"),
    supabase
      .from("cash_sales")
      .select("customer_name")
      .eq("clinic_id", clinicId),
  ]);

  const daysByCustomer = new Map<string, Set<string>>();
  const lastByCustomer = new Map<string, string>();
  for (const a of (appts ?? []) as any[]) {
    if (!a.customer_id) continue;
    const d = String(a.start_time ?? "").slice(0, 10);
    if (!d) continue;
    const set = daysByCustomer.get(a.customer_id) ?? new Set<string>();
    set.add(d);
    daysByCustomer.set(a.customer_id, set);
    const prev = lastByCustomer.get(a.customer_id);
    if (!prev || d > prev) lastByCustomer.set(a.customer_id, d);
  }

  // 売上は名前の文字列で結びついているので、正規化した名前で数える
  const salesByName = new Map<string, number>();
  for (const s of (sales ?? []) as any[]) {
    const k = normalizeForCompare(s.customer_name);
    if (!k) continue;
    salesByName.set(k, (salesByName.get(k) ?? 0) + 1);
  }

  return ((customers ?? []) as any[]).map((c) => {
    const days = daysByCustomer.get(c.id);
    const visitDays = days?.size ?? 0;
    const salesRows = salesByName.get(normalizeForCompare(c.name)) ?? 0;
    return {
      id: c.id as string,
      name: (c.name ?? "") as string,
      medicalRecordNumber: c.medical_record_number ?? null,
      phone: c.phone ?? null,
      visitDays,
      lastVisit: lastByCustomer.get(c.id) ?? null,
      recentVisits: Array.from(days ?? []).sort().reverse().slice(0, 3),
      salesRows,
      isEmpty: visitDays === 0 && salesRows === 0,
    };
  });
}

/**
 * 名前を入れると、似ている患者を探して返す。
 * 空白・ふりがな・カタカナ/ひらがな・打ち間違い・姓だけ、を拾う。
 */
export async function searchSimilarCustomers(query: string): Promise<SimilarCandidate[]> {
  const { clinicId } = await checkAdminAuth();
  const q = (query ?? "").trim();
  if (!q) return [];
  const all = await loadNameCandidates(clinicId);
  const hits: SimilarCandidate[] = [];
  for (const c of all) {
    const hit = compareNames(q, c.name);
    if (!hit) continue;
    hits.push({ ...c, score: hit.score, reason: hit.reason });
  }
  return hits
    .sort((a, b) => b.score - a.score || b.visitDays - a.visitDays)
    .slice(0, 40);
}

/**
 * 名前が不完全な患者（ふりがなだけ・カタカナだけ・姓だけ）を、
 * 直しやすいように新しい順で返す。似た名前の候補も添える。
 */
export async function getNameCleanupList(): Promise<{
  rows: (NameCleanupRow & { similar: SimilarCandidate[] })[];
  totalCustomers: number;
}> {
  const { clinicId } = await checkAdminAuth();
  const all = await loadNameCandidates(clinicId);

  const rows = all
    .map((c) => ({ c, check: nameNeedsCleanup(c.name) }))
    .filter((x) => x.check.needs)
    .map(({ c, check }) => {
      // その人に似た名前の患者を、本人以外から探す
      const similar = all
        .filter((o) => o.id !== c.id)
        .map((o) => {
          const hit = compareNames(c.name, o.name);
          return hit ? { ...o, score: hit.score, reason: hit.reason } : null;
        })
        .filter((v): v is SimilarCandidate => v !== null)
        .sort((a, b) => b.score - a.score || b.visitDays - a.visitDays)
        .slice(0, 5);
      return { ...c, cleanupReason: check.reason, similar };
    })
    .sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? "") || b.visitDays - a.visitDays);

  return { rows, totalCustomers: all.length };
}

/**
 * 予約も売上も無い患者カルテだけを消す。
 * 1件でもぶら下がっていたら消さない（消すと予約が道連れで消えるため）。
 */
export async function deleteEmptyCustomer(customerId: string): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const all = await loadNameCandidates(clinicId);
  const target = all.find((c) => c.id === customerId);
  if (!target) return { success: false, error: "この院の患者ではありません" };
  if (!target.isEmpty) {
    return {
      success: false,
      error: `${target.name}様には来院${target.visitDays}日・売上${target.salesRows}件が残っています。`
        + `消すとそれも消えるので、統合するか、お名前を直してください。`,
    };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("id", customerId);
  if (error) return { success: false, error: "削除に失敗しました: " + error.message };
  revalidatePath("/admin/customers");
  return { success: true };
}

export type FuzzyDuplicateGroup = {
  ids: string[];
  reason: string;
  confidence: "high" | "medium" | "low";
};

export type FindFuzzyDuplicatesResult = {
  groups: FuzzyDuplicateGroup[];
  scannedAt: string;
  scannedCount: number;
};

export async function findFuzzyDuplicates(): Promise<FindFuzzyDuplicatesResult> {
  const { clinicId } = await checkAdminAuth();
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API キーが未設定です");
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  
  const supabase = createAdminClient(url, key);
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, name")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });
  
  if (error) throw new Error("顧客データの取得に失敗しました");
  if (!customers || customers.length < 2) {
    return { 
      groups: [], 
      scannedAt: new Date().toISOString(), 
      scannedCount: customers?.length ?? 0,
    };
  }
  
  // 名前のみで Gemini に送信（プライバシー配慮）
  const customerList = customers.map(c => `${c.id}: ${c.name}`).join("\n");
  
  const prompt = `あなたは日本の医療機関の患者データを管理するアシスタントです。
以下の患者リストから、表記が異なるが同一人物の可能性が高いペアやグループを見つけてください。

検出すべき例:
- 「鈴木一郎」と「すずきいちろう」（漢字 vs ひらがな、同一読み）
- 「タナカ ハナコ」と「田中花子」（カタカナ vs 漢字）
- 「山田たろう」と「ヤマダタロウ」（ひらがな vs カタカナ）

検出すべきでない例:
- 同姓だが名前が違う（「鈴木一郎」と「鈴木次郎」は別人）
- 一部のみ一致（「田中」と「田中花子」は別の可能性）
- 同姓同名が複数いる場合は除外

【患者リスト】（id: 名前）
${customerList}

ルール:
- ids は患者リストに実在するUUIDのみ使用
- 1グループに最大3名まで
- confidence: high(ほぼ確実)/medium(可能性あり)/low(疑わしい程度)
- 表記揺れがない場合は空配列を返す

以下のJSON形式のみで返答（説明文・コードブロック不要）:
{
  "groups": [
    { "ids": ["uuid1", "uuid2"], "reason": "漢字とひらがなで同一読み「すずきいちろう」", "confidence": "high" }
  ]
}`;

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI 応答のパースに失敗しました");
  
  const parsed = JSON.parse(jsonMatch[0]) as { groups?: unknown };
  
  // ハルシネーション対策: 配列でない or ID不在のものを除外
  const rawGroups = Array.isArray(parsed.groups) ? parsed.groups : [];
  const validIds = new Set(customers.map(c => c.id));
  const validConfidences = new Set(["high", "medium", "low"]);
  
  const validatedGroups: FuzzyDuplicateGroup[] = rawGroups
    .map((g: unknown): FuzzyDuplicateGroup | null => {
      if (!g || typeof g !== "object") return null;
      const obj = g as Record<string, unknown>;
      const idsRaw = Array.isArray(obj.ids) ? obj.ids : [];
      const ids = idsRaw
        .filter((id): id is string => typeof id === "string" && validIds.has(id))
        .slice(0, 3);
      if (ids.length < 2) return null;
      const reason = typeof obj.reason === "string" ? obj.reason : "表記揺れの可能性";
      const confidence = (typeof obj.confidence === "string" && validConfidences.has(obj.confidence))
        ? (obj.confidence as "high" | "medium" | "low")
        : "low";
      return { ids, reason, confidence };
    })
    .filter((g): g is FuzzyDuplicateGroup => g !== null);
  
  return {
    groups: validatedGroups,
    scannedAt: new Date().toISOString(),
    scannedCount: customers.length,
  };
}

export async function linkLineUser(customerId: string, lineUserId: string) {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);
  const { linkLineToCustomer } = await import("@/lib/line-links");
  const result = await linkLineToCustomer(
    lineUserId.trim(),
    customerId,
    clinicId,
    { linkedVia: "admin_manual" },
    supabase,
  );
  if (!result.ok) {
    console.error("linkLineUser error:", result.error);
    throw new Error(result.error);
  }
  revalidatePath("/admin/customers");
  return { success: true };
}

/** 指定 customer の特定 LINE 紐付けを解除（複数紐付き時に 1 件だけ消す）。 */
export async function unlinkSpecificLineLink(customerId: string, lineUserId: string) {
  const { clinicId } = await checkAdminAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  const supabase = createAdminClient(url, key);
  const { unlinkLineFromCustomer } = await import("@/lib/line-links");
  const result = await unlinkLineFromCustomer(lineUserId, customerId, clinicId, supabase);
  if (!result.ok) throw new Error(result.error || "unlink failed");
  revalidatePath("/admin/customers");
  return { success: true };
}

export async function unlinkLineUser(customerId: string) {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);
  // この customer に紐付く全 LINE link を削除
  await supabase
    .from("customer_line_links")
    .delete()
    .eq("customer_id", customerId)
    .eq("clinic_id", clinicId);
  const { error } = await supabase
    .from("customers")
    .update({ line_user_id: null })
    .eq("id", customerId)
    .eq("clinic_id", clinicId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
}

/** 指定 customer に紐付いている LINE userId の一覧を返す（管理画面表示用）。 */
export async function getLineLinksForCustomer(customerId: string): Promise<{
  line_user_id: string;
  is_primary: boolean;
  display_label: string | null;
  linked_via: string | null;
  linked_at: string;
}[]> {
  const { clinicId } = await checkAdminAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createAdminClient(url, key);
  const { data } = await supabase
    .from("customer_line_links")
    .select("line_user_id, is_primary, display_label, linked_via, linked_at")
    .eq("clinic_id", clinicId)
    .eq("customer_id", customerId)
    .order("is_primary", { ascending: false });
  return data ?? [];
}

/** 同じ LINE userId に紐付いている他 customer（家族メンバー）を返す。 */
export async function getFamilyMembersForCustomer(customerId: string): Promise<{
  customer_id: string;
  name: string;
  display_name: string | null;
  is_primary: boolean;
}[]> {
  const { clinicId } = await checkAdminAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createAdminClient(url, key);
  // 自分の LINE userId 一覧（自院内のみ）
  const { data: myLinks } = await supabase
    .from("customer_line_links")
    .select("line_user_id")
    .eq("clinic_id", clinicId)
    .eq("customer_id", customerId);
  const lineIds = (myLinks ?? []).map((r: { line_user_id: string }) => r.line_user_id);
  if (lineIds.length === 0) return [];
  // 同じ LINE userId に紐付いている全 customer（自院内、自分も含む）
  const { data: family } = await supabase
    .from("customer_line_links")
    .select("customer_id, is_primary, customers!inner(name, display_name)")
    .eq("clinic_id", clinicId)
    .in("line_user_id", lineIds);
  const seen = new Set<string>();
  const result: { customer_id: string; name: string; display_name: string | null; is_primary: boolean }[] = [];
  for (const row of family ?? []) {
    const id = (row as any).customer_id;
    if (id === customerId || seen.has(id)) continue;
    seen.add(id);
    const c = Array.isArray((row as any).customers) ? (row as any).customers[0] : (row as any).customers;
    if (!c) continue;
    result.push({
      customer_id: id,
      name: c.name,
      display_name: c.display_name ?? null,
      is_primary: Boolean((row as any).is_primary),
    });
  }
  return result;
}

/** 主紐付けを別 customer に切替える。 */
export async function setPrimaryLinkForCustomer(customerId: string, lineUserId: string) {
  const { clinicId } = await checkAdminAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  const supabase = createAdminClient(url, key);
  const { setPrimaryLink } = await import("@/lib/line-links");
  const result = await setPrimaryLink(lineUserId, customerId, clinicId, supabase);
  if (!result.ok) throw new Error(result.error || "set primary failed");
  revalidatePath("/admin/customers");
  return { success: true };
}

// 最近LINEからメッセージを送ってきた未紐づけのユーザーIDを取得
export async function getRecentUnlinkedLineLogs(): Promise<{ user_id: string; message: string | null; created_at: string; display_name: string | null }[]> {
  const { clinicId } = await checkAdminAuth();

  // RLSをバイパスするためにservice roleキーで接続
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createAdminClient(url, key);

  // line_debug_logsからユニークなuser_idを取得（最近のもの優先）
  const { data: logs, error: logsError } = await supabase
    .from("line_debug_logs")
    .select("user_id, message, created_at")
    .neq("user_id", "unknown")
    .order("created_at", { ascending: false })
    .limit(200);

  if (logsError) {
    console.error("line_debug_logs fetch error:", logsError);
    return [];
  }
  if (!logs || logs.length === 0) return [];

  // 既に紐づけ済みのLINE IDを取得
  const { data: linked } = await supabase
    .from("customers")
    .select("line_user_id")
    .eq("clinic_id", clinicId)
    .not("line_user_id", "is", null);

  // 家族紐付け（customer_line_links）だけの LINE も「紐づけ済み」に含める
  const { data: linkRows } = await supabase
    .from("customer_line_links")
    .select("line_user_id")
    .eq("clinic_id", clinicId);

  const linkedIds = new Set<string | null>([
    ...(linked || []).map((c: { line_user_id: string | null }) => c.line_user_id),
    ...(linkRows || []).map((l: { line_user_id: string }) => l.line_user_id),
  ]);

  // ユニーク化（最新のメッセージのみ）& 未紐づけのみ
  const seen = new Set<string>();
  const result: { user_id: string; message: string | null; created_at: string; display_name: string | null }[] = [];
  for (const log of logs) {
    if (!seen.has(log.user_id) && !linkedIds.has(log.user_id)) {
      seen.add(log.user_id);
      result.push({ user_id: log.user_id, message: log.message, created_at: log.created_at, display_name: null });
    }
    if (result.length >= 50) break;
  }

  // 各 user_id の LINE 表示名を取得（誰を紐づけるか判別しやすくする）。
  // トークンは1回だけ発行して使い回す。
  try {
    const { getLineAccessToken, getLineProfileName } = await import("@/lib/admin-notify");
    const token = await getLineAccessToken();
    if (token) {
      await Promise.all(
        result.map(async (r) => {
          r.display_name = await getLineProfileName(r.user_id, token);
        }),
      );
    }
  } catch (err) {
    console.error("getRecentUnlinkedLineLogs: display name fetch error:", err);
  }

  return result;
}

/**
 * 連携済み顧客（line_user_id あり）の LINE 表示名を bot/profile から取得し、
 * customers.line_display_name にキャッシュ保存する。
 * onlyMissing=true なら未取得のものだけ更新（軽量）。false なら全件リフレッシュ。
 */
export async function refreshLineDisplayNames(
  onlyMissing: boolean = true,
): Promise<{ ok: boolean; updated: number; total: number; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, updated: 0, total: 0, error: "Supabase env missing" };
  const supabase = createAdminClient(url, key);

  let query = supabase
    .from("customers")
    .select("id, line_user_id, line_display_name")
    .eq("clinic_id", clinicId)
    .not("line_user_id", "is", null);
  if (onlyMissing) query = query.is("line_display_name", null);

  const { data: rows, error } = await query;
  if (error) return { ok: false, updated: 0, total: 0, error: error.message };

  const targets = (rows ?? []) as { id: string; line_user_id: string; line_display_name: string | null }[];
  if (targets.length === 0) return { ok: true, updated: 0, total: 0 };

  const { getLineAccessToken, getLineProfileName } = await import("@/lib/admin-notify");
  const token = await getLineAccessToken();
  if (!token) return { ok: false, updated: 0, total: targets.length, error: "LINE トークンが取得できません" };

  let updated = 0;
  await Promise.all(
    targets.map(async (c) => {
      const name = await getLineProfileName(c.line_user_id, token);
      if (name && name !== c.line_display_name) {
        const { error: upErr } = await supabase
          .from("customers")
          .update({ line_display_name: name })
          .eq("id", c.id)
          .eq("clinic_id", clinicId);
        if (!upErr) updated++;
      }
    }),
  );

  if (updated > 0) revalidatePath("/admin/customers");
  return { ok: true, updated, total: targets.length };
}

/** 無断キャンセル制限による期限付き自動停止を解除する */
export async function clearAutoSuspension(customerId: string) {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);
  const { error } = await supabase
    .from("customers")
    .update({ booking_suspended_until: null })
    .eq("id", customerId)
    .eq("clinic_id", clinicId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
}

export async function toggleBookingSuspension(customerId: string, suspend: boolean) {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);
  const { error } = await supabase
    .from("customers")
    .update({ booking_suspended: suspend })
    .eq("id", customerId)
    .eq("clinic_id", clinicId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
}

// ===== 休眠患者への LINE 追客メッセージ送信 =====

export async function sendDormantLinePush(
  lineUserId: string,
  customerName: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { clinicId } = await checkAdminAuth();

    // 送信は共通経路に統一（発行トークン優先・認証エラー時のみフォールバック・失敗理由を返す）
    const { pushLineText } = await import("@/lib/admin-notify");
    const push = await pushLineText(lineUserId, message, clinicId);
    if (!push.ok) {
      console.error("[LINE追客送信失敗]", customerName, push.detail);
      return { success: false, error: `LINE送信に失敗しました（${push.detail ?? "原因不明"}）` };
    }

    return { success: true };
  } catch (err) {
    console.error("sendDormantLinePush error:", err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

// ===== リピート率・失客率 月別推移 =====

export type MonthlyVisitStat = {
  month: string;      // "2026-04"
  label: string;      // "4月"
  newPatients: number;
  returnPatients: number;
  total: number;
};

export async function getMonthlyVisitStats(months = 6): Promise<MonthlyVisitStat[]> {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createAdminClient(url, key);

  const result: MonthlyVisitStat[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const startDate = `${monthStr}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const endDate = `${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

    const { data } = await supabase
      .from("cash_sales")
      .select("is_first_visit, customer_name, sale_date")
      .eq("clinic_id", clinicId)
      .gte("sale_date", startDate)
      .lte("sale_date", endDate);

    // 日計表は1人が列ごとに複数行になるので、行数で数えると再来院が水増しになる。
    // 「その日その人が来た」を1として数える。
    const { newVisits, returnVisits, total } = countNewAndReturnVisits(data ?? []);

    result.push({
      month: monthStr,
      label: `${month}月`,
      newPatients: newVisits,
      returnPatients: returnVisits,
      total,
    });
  }

  return result;
}

// ===== CSV一括インポート =====

export type ImportCustomerRow = {
  name: string;
  phone?: string | null;
  birth_date?: string | null;   // "YYYY-MM-DD" or "YYYY/MM/DD"
  gender?: string | null;       // 男/女/その他
  city_name?: string | null;
  medical_record_number?: string | null;
  referral_source?: string | null;
  memo?: string | null;
};

export type ImportResult = {
  success: boolean;
  inserted: number;
  skipped: number;
  errors: { row: number; name: string; reason: string }[];
};

type CustomerInsertData = {
  name: string;
  clinic_id: string;
  phone?: string;
  birth_date?: string;
  birth_month?: number;
  gender?: string;
  city_name?: string;
  medical_record_number?: string;
  referral_source?: string;
};

function normalizeGender(val: string | null | undefined): string | null {
  if (!val) return null;
  const v = val.trim();
  if (v === "男" || v === "male" || v === "男性") return "male";
  if (v === "女" || v === "female" || v === "女性") return "female";
  if (v === "その他" || v === "other") return "other";
  return null;
}

function normalizeDate(val: string | null | undefined): string | null {
  if (!val) return null;
  // YYYY/MM/DD → YYYY-MM-DD
  const normalized = val.trim().replace(/\//g, "-");
  // 簡易バリデーション
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  return null;
}

export async function bulkImportCustomers(rows: ImportCustomerRow[]): Promise<ImportResult> {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);

  // 既存の名前+電話番号のセットを取得（重複チェック用）
  const { data: existing } = await supabase
    .from("customers")
    .select("name, phone")
    .eq("clinic_id", clinicId);

  const existingKeys = new Set(
    (existing || []).map((c) => `${c.name.trim()}__${(c.phone || "").trim()}`)
  );

  let inserted = 0;
  let skipped = 0;
  const errors: ImportResult["errors"] = [];
  const toInsert: CustomerInsertData[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    if (!row.name?.trim()) {
      errors.push({ row: rowNum, name: "(空)", reason: "患者名が空です" });
      continue;
    }

    const key = `${row.name.trim()}__${(row.phone || "").trim()}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    existingKeys.add(key); // 同一CSV内の重複も防ぐ

    const record: CustomerInsertData = {
      name: row.name.trim(),
      clinic_id: clinicId,
    };
    if (row.phone?.trim()) record.phone = row.phone.trim();
    const bd = normalizeDate(row.birth_date);
    if (bd) {
      record.birth_date = bd;
      record.birth_month = parseInt(bd.split("-")[1], 10);
    }
    const gender = normalizeGender(row.gender);
    if (gender) record.gender = gender;
    if (row.city_name?.trim()) record.city_name = row.city_name.trim();
    if (row.medical_record_number?.trim()) record.medical_record_number = row.medical_record_number.trim();
    if (row.referral_source?.trim()) record.referral_source = row.referral_source.trim();

    toInsert.push(record);
  }

  if (toInsert.length > 0) {
    // tenant-isolation-ignore: toInsert の各レコードに clinic_id を埋め込み済み（L781）
    const { error } = await supabase.from("customers").insert(toInsert);
    if (error) throw new Error("一括登録に失敗しました: " + error.message);
    inserted = toInsert.length;
  }

  revalidatePath("/admin/customers");
  return { success: true, inserted, skipped, errors };
}
