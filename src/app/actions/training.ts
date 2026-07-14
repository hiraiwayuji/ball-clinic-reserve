"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "./auth";
import { revalidatePath } from "next/cache";
import {
  TRAINING_CLINIC_IDS,
  AXES,
  type Assessment,
  type Measurement,
  type RegionKey,
  type AxisKey,
  type Side,
} from "@/lib/training-catalog";

/** この院でトレーニング評価が有効か（3院のみ）。無効ならエラー。 */
function assertEnabled(clinicId: string) {
  if (!TRAINING_CLINIC_IDS.has(clinicId)) {
    throw new Error("この院ではトレーニング評価は利用できません。");
  }
}

async function auth() {
  const info = await checkAdminAuth();
  assertEnabled(info.clinicId);
  return info;
}

// ───────────────────────── 一覧（トップ） ─────────────────────────
export type TrainingPatientRow = {
  customerId: string;
  name: string;
  sessions: number;
  lastAssessedOn: string; // "yyyy-MM-dd"
  lastGoal: string | null;
  lastHomework: string | null;
};

/** 直近で評価した患者一覧（最終評価日が新しい順） */
export async function listTrainingPatients(): Promise<TrainingPatientRow[]> {
  const { clinicId } = await auth();
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_assessments")
    .select("customer_id, assessed_on, next_goal, homework, customers(name)")
    .eq("clinic_id", clinicId)
    .order("assessed_on", { ascending: false })
    .limit(500);

  const byCustomer = new Map<string, TrainingPatientRow>();
  for (const r of data ?? []) {
    const cid = (r as any).customer_id as string;
    const existing = byCustomer.get(cid);
    if (existing) {
      existing.sessions += 1;
      continue;
    }
    byCustomer.set(cid, {
      customerId: cid,
      name: ((r as any).customers?.name as string) ?? "（名称不明）",
      sessions: 1,
      lastAssessedOn: (r as any).assessed_on as string,
      lastGoal: ((r as any).next_goal as string) ?? null,
      lastHomework: ((r as any).homework as string) ?? null,
    });
  }
  return [...byCustomer.values()];
}

// ───────────────────────── 患者の履歴 ─────────────────────────
export type PatientTraining = {
  patient: { id: string; name: string; phone: string | null };
  assessments: Assessment[]; // 新しい順
};

export async function getPatientTraining(customerId: string): Promise<PatientTraining | null> {
  const { clinicId } = await auth();
  const supabase = await createClient();

  const { data: patient } = await supabase
    .from("customers")
    .select("id, name, phone")
    .eq("id", customerId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!patient) return null;

  const { data: heads } = await supabase
    .from("training_assessments")
    .select("id, customer_id, assessed_on, assessor_name, overall_memo, next_goal, homework, created_at")
    .eq("clinic_id", clinicId)
    .eq("customer_id", customerId)
    .order("assessed_on", { ascending: false })
    .order("created_at", { ascending: false });

  const ids = (heads ?? []).map((h: any) => h.id);
  let measurements: any[] = [];
  if (ids.length) {
    const { data: ms } = await supabase
      .from("training_measurements")
      .select("assessment_id, item_key, axis, side, score, memo")
      .eq("clinic_id", clinicId)
      .in("assessment_id", ids);
    measurements = ms ?? [];
  }

  const byAssessment = new Map<string, Measurement[]>();
  for (const m of measurements) {
    const arr = byAssessment.get(m.assessment_id) ?? [];
    arr.push({
      item_key: m.item_key as RegionKey,
      axis: m.axis as AxisKey,
      side: m.side as Side,
      score: m.score,
      memo: m.memo,
    });
    byAssessment.set(m.assessment_id, arr);
  }

  const assessments: Assessment[] = (heads ?? []).map((h: any) => ({
    id: h.id,
    customer_id: h.customer_id,
    assessed_on: h.assessed_on,
    assessor_name: h.assessor_name,
    overall_memo: h.overall_memo,
    next_goal: h.next_goal,
    homework: h.homework,
    created_at: h.created_at,
    measurements: byAssessment.get(h.id) ?? [],
  }));

  return {
    patient: { id: patient.id, name: patient.name, phone: (patient as any).phone ?? null },
    assessments,
  };
}

/** 新規採点画面の「前回」表示用：直近セッション1件（ヘッダー＋スコア）。 */
export async function getLatestAssessment(customerId: string): Promise<Assessment | null> {
  const data = await getPatientTraining(customerId);
  if (!data || data.assessments.length === 0) return null;
  return data.assessments[0];
}

// ───────────────────────── みんなの平均・順位（他者比較） ─────────────────────────
export type ClinicBenchmark = {
  nPatients: number;                          // 評価済みの患者数（母数）
  axisAvg: Record<AxisKey, number | null>;    // 全体の軸別平均（各患者の最新回ベース）
  overallAvg: number | null;                  // 全体の総合平均
  myOverall: number | null;                   // この患者の総合点
  rank: number | null;                        // この患者の順位（1位が最高）
  percentile: number | null;                  // 上位何%か（0-100、小さいほど上位）
};

/**
 * 院内の全患者の「最新評価」を集計し、みんなの平均と、この患者の順位を返す。
 * 匿名集計（他人の氏名や個票は返さない）。
 */
export async function getClinicBenchmark(customerId: string): Promise<ClinicBenchmark> {
  const { clinicId } = await auth();
  const supabase = await createClient();

  // 院内の全評価ヘッダー（新しい順）→ 患者ごとの最新1件を採用
  const { data: heads } = await supabase
    .from("training_assessments")
    .select("id, customer_id, assessed_on")
    .eq("clinic_id", clinicId)
    .order("assessed_on", { ascending: false })
    .order("created_at", { ascending: false });

  const latestByCustomer = new Map<string, string>(); // customer_id -> assessment_id
  for (const h of heads ?? []) {
    if (!latestByCustomer.has((h as any).customer_id)) {
      latestByCustomer.set((h as any).customer_id, (h as any).id);
    }
  }
  const latestIds = [...latestByCustomer.values()];
  const emptyAxisAvg = {} as Record<AxisKey, number | null>;
  for (const a of AXES) emptyAxisAvg[a.key] = null;
  const empty: ClinicBenchmark = {
    nPatients: latestByCustomer.size, axisAvg: emptyAxisAvg,
    overallAvg: null, myOverall: null, rank: null, percentile: null,
  };
  if (latestIds.length === 0) return empty;

  const { data: ms } = await supabase
    .from("training_measurements")
    .select("assessment_id, item_key, axis, side, score")
    .eq("clinic_id", clinicId)
    .in("assessment_id", latestIds);

  // assessment_id -> 平均点 と 軸別合計
  const byAssessment = new Map<string, { scores: number[]; axis: Record<string, number[]> }>();
  for (const m of ms ?? []) {
    if ((m as any).score == null) continue;
    const a = byAssessment.get((m as any).assessment_id) ?? { scores: [], axis: {} };
    a.scores.push((m as any).score);
    (a.axis[(m as any).axis] ??= []).push((m as any).score);
    byAssessment.set((m as any).assessment_id, a);
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);

  // 全体の軸別・総合平均
  const allByAxis: Record<string, number[]> = {};
  const overalls: { assessmentId: string; overall: number }[] = [];
  for (const [aid, a] of byAssessment) {
    for (const ax of Object.keys(a.axis)) (allByAxis[ax] ??= []).push(...a.axis[ax]);
    const ov = mean(a.scores);
    if (ov != null) overalls.push({ assessmentId: aid, overall: ov });
  }
  const axisAvg = {} as Record<AxisKey, number | null>;
  for (const a of AXES) axisAvg[a.key] = mean(allByAxis[a.key] ?? []);
  const overallAvg = mean(overalls.map((o) => o.overall));

  // この患者の順位
  const myId = latestByCustomer.get(customerId);
  const myEntry = myId ? overalls.find((o) => o.assessmentId === myId) : undefined;
  const myOverall = myEntry?.overall ?? null;
  let rank: number | null = null;
  let percentile: number | null = null;
  if (myOverall != null && overalls.length > 0) {
    const sorted = [...overalls].sort((a, b) => b.overall - a.overall);
    rank = sorted.findIndex((o) => o.assessmentId === myId) + 1;
    percentile = Math.round((rank / sorted.length) * 100);
  }

  return {
    nPatients: latestByCustomer.size,
    axisAvg,
    overallAvg: overallAvg != null ? Math.round(overallAvg * 10) / 10 : null,
    myOverall: myOverall != null ? Math.round(myOverall * 10) / 10 : null,
    rank,
    percentile,
  };
}

// ───────────────────────── 保存 ─────────────────────────
export type SaveMeasurement = {
  item_key: RegionKey;
  axis: AxisKey;
  side: Side;
  score: number | null;
  memo?: string | null;
};
export type SaveAssessmentInput = {
  customerId: string;
  assessedOn: string; // "yyyy-MM-dd"
  assessorName?: string | null;
  overallMemo?: string | null;
  nextGoal?: string | null;
  homework?: string | null;
  measurements: SaveMeasurement[];
};

export async function saveAssessment(
  input: SaveAssessmentInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const { clinicId, userId } = await auth();
  const supabase = await createClient();

  try {
    // 患者がこの院のものか確認（別院IDの取り違え防止）
    const { data: patient } = await supabase
      .from("customers")
      .select("id")
      .eq("id", input.customerId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!patient) return { success: false, error: "患者が見つかりません。" };

    const { data: head, error: headErr } = await supabase
      .from("training_assessments")
      .insert({
        clinic_id: clinicId,
        customer_id: input.customerId,
        assessed_on: input.assessedOn,
        assessor_name: input.assessorName?.trim() || null,
        overall_memo: input.overallMemo?.trim() || null,
        next_goal: input.nextGoal?.trim() || null,
        homework: input.homework?.trim() || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (headErr || !head) throw headErr ?? new Error("セッションの作成に失敗しました。");

    // 採点済み（score != null）またはメモ付きのセルだけ保存
    const rows = input.measurements
      .filter((m) => m.score != null || (m.memo && m.memo.trim()))
      .map((m) => ({
        assessment_id: head.id,
        clinic_id: clinicId,
        item_key: m.item_key,
        axis: m.axis,
        side: m.side,
        score: m.score ?? null,
        memo: m.memo?.trim() || null,
      }));

    if (rows.length) {
      // tenant-isolation-ignore: rows の各要素に clinic_id を含めて insert している
      const { error: msErr } = await supabase.from("training_measurements").insert(rows);
      if (msErr) {
        // 失敗したらヘッダーも巻き戻す（孤立レコードを残さない）
        await supabase.from("training_assessments").delete().eq("id", head.id).eq("clinic_id", clinicId);
        throw msErr;
      }
    }

    revalidatePath("/admin/training");
    revalidatePath(`/admin/training/${input.customerId}`);
    return { success: true, id: head.id };
  } catch (err) {
    console.error("saveAssessment error:", err);
    return { success: false, error: "保存に失敗しました。" };
  }
}

export async function deleteAssessment(id: string): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await auth();
  const supabase = await createClient();
  // 患者ページ再検証用に customer_id を取得
  const { data: head } = await supabase
    .from("training_assessments")
    .select("customer_id")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  const { error } = await supabase
    .from("training_assessments")
    .delete()
    .eq("id", id)
    .eq("clinic_id", clinicId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/training");
  if (head?.customer_id) revalidatePath(`/admin/training/${head.customer_id}`);
  return { success: true };
}
