"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "./auth";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import {
  TRAINING_CLINIC_IDS,
  AXES,
  axisAverages,
  asymmetries,
  growth,
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

// ───────────────────────── 修正（あとから直す） ─────────────────────────

export type AssessmentEditData = {
  customerId: string;
  patientName: string;
  assessment: Assessment;
  /** ひとつ前のセッション（前回値のゴースト表示用）。無ければ null */
  prev: Assessment | null;
};

/** 保存済みの評価を編集画面へ読み込む。自院のものだけ。 */
export async function getAssessmentEdit(assessmentId: string): Promise<AssessmentEditData | null> {
  const { clinicId } = await auth();
  const supabase = await createClient();

  const { data: head } = await supabase
    .from("training_assessments")
    .select("customer_id")
    .eq("id", assessmentId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!head) return null;

  const data = await getPatientTraining(head.customer_id);
  if (!data) return null;

  const idx = data.assessments.findIndex((a) => a.id === assessmentId);
  if (idx < 0) return null;

  return {
    customerId: head.customer_id,
    patientName: data.patient.name,
    assessment: data.assessments[idx],
    // assessments は新しい順なので、ひとつ後ろが「前回」
    prev: data.assessments[idx + 1] ?? null,
  };
}

export type UpdateAssessmentInput = {
  assessmentId: string;
  assessedOn: string; // "yyyy-MM-dd"
  assessorName?: string | null;
  overallMemo?: string | null;
  nextGoal?: string | null;
  homework?: string | null;
  measurements: SaveMeasurement[];
};

/**
 * 保存済みの評価を上書きする（コメントの誤字直し・点数の入れ直し）。
 * スコアは「入っているものを upsert → 消されたセルだけ delete」で反映する。
 * 先に全消ししてから入れ直すと、途中で失敗したときに点数が飛ぶため。
 */
export async function updateAssessment(
  input: UpdateAssessmentInput,
): Promise<{ success: boolean; customerId?: string; error?: string }> {
  const { clinicId } = await auth();
  const supabase = await createClient();

  try {
    const { data: head } = await supabase
      .from("training_assessments")
      .select("id, customer_id")
      .eq("id", input.assessmentId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!head) return { success: false, error: "評価が見つかりません。" };

    const { error: headErr } = await supabase
      .from("training_assessments")
      .update({
        assessed_on: input.assessedOn,
        assessor_name: input.assessorName?.trim() || null,
        overall_memo: input.overallMemo?.trim() || null,
        next_goal: input.nextGoal?.trim() || null,
        homework: input.homework?.trim() || null,
      })
      .eq("id", input.assessmentId)
      .eq("clinic_id", clinicId);
    if (headErr) throw headErr;

    const rows = input.measurements
      .filter((m) => m.score != null || (m.memo && m.memo.trim()))
      .map((m) => ({
        assessment_id: input.assessmentId,
        clinic_id: clinicId,
        item_key: m.item_key,
        axis: m.axis,
        side: m.side,
        score: m.score ?? null,
        memo: m.memo?.trim() || null,
      }));

    if (rows.length) {
      // tenant-isolation-ignore: rows の各要素に clinic_id を含めて upsert している
      const { error: upErr } = await supabase
        .from("training_measurements")
        .upsert(rows, { onConflict: "assessment_id,item_key,axis,side" });
      if (upErr) throw upErr;
    }

    // 画面で解除されたセルを削除（残っている行 − 今回送られてきた行）
    const keep = new Set(rows.map((r) => `${r.item_key}|${r.axis}|${r.side}`));
    const { data: existing } = await supabase
      .from("training_measurements")
      .select("id, item_key, axis, side")
      .eq("clinic_id", clinicId)
      .eq("assessment_id", input.assessmentId);
    const staleIds = (existing ?? [])
      .filter((m: { item_key: string; axis: string; side: string }) => !keep.has(`${m.item_key}|${m.axis}|${m.side}`))
      .map((m: { id: string }) => m.id);
    if (staleIds.length) {
      const { error: delErr } = await supabase
        .from("training_measurements")
        .delete()
        .eq("clinic_id", clinicId)
        .in("id", staleIds);
      if (delErr) throw delErr;
    }

    revalidatePath("/admin/training");
    revalidatePath(`/admin/training/${head.customer_id}`);
    return { success: true, customerId: head.customer_id };
  } catch (err) {
    console.error("updateAssessment error:", err);
    return { success: false, error: "保存に失敗しました。" };
  }
}

// ───────────────────────── 患者レポート（LINE送信＋公開ページ） ─────────────────────────

function reportBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export type ReportPreview = {
  assessmentId: string;
  customerName: string;
  text: string;              // LINEで送る本文（リンク込み）
  url: string;               // 図つきレポートページ
  lineLinked: boolean;       // LINE連携済みか
  sentAt: string | null;     // 前回送信日時（重複送信の気づき用）
  linkRequestText: string;   // 未連携のときに使う「LINE連携のお願い」文
};

/** その患者のLINE user id（customers 優先、なければ連携テーブルの primary） */
async function findLineUserId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
  customerId: string,
  customerLineUserId: string | null,
): Promise<string | null> {
  if (customerLineUserId) return customerLineUserId;
  const { data } = await supabase
    .from("customer_line_links")
    .select("line_user_id, is_primary")
    .eq("clinic_id", clinicId)
    .eq("customer_id", customerId)
    .order("is_primary", { ascending: false })
    .limit(1);
  return (data?.[0] as any)?.line_user_id ?? null;
}

/** レポート本文を組み立てる（点数・左右差・前回からの伸び・宿題・目標） */
function buildReportText(a: Assessment, prev: Assessment | null, name: string, url: string): string {
  const lines: string[] = [];
  lines.push(`🏋️ ${name}さん トレーニング結果（${a.assessed_on}）`);
  lines.push("");

  const aa = axisAverages(a.measurements);
  const scoreLine = AXES.map((ax) => {
    const v = aa[ax.key];
    return v != null ? `${ax.label} ${v.toFixed(1)}` : null;
  }).filter(Boolean).join(" / ");
  if (scoreLine) {
    lines.push("【今日の点数（10点満点）】");
    lines.push(scoreLine);
  }

  // 左右差（一番大きいもの）
  const asym = asymmetries(a.measurements).filter((x) => x.diff >= 2);
  if (asym.length > 0) {
    const top = asym[0];
    lines.push("");
    lines.push(`⚖️ 左右差：${top.label}・${top.axisLabel} が${top.higher === "left" ? "右" : "左"}${top.diff}点ひくめ`);
  }

  // 前回からの伸び
  if (prev) {
    const g = growth(prev, a);
    if (g.overall != null && Math.abs(g.overall) >= 0.05) {
      lines.push("");
      lines.push(g.overall > 0
        ? `📈 前回から +${g.overall.toFixed(1)} アップ！よく頑張りました`
        : `📉 前回から ${g.overall.toFixed(1)}（体調や測り方の差もあります）`);
    }
  }

  if (a.overall_memo) { lines.push(""); lines.push("✅ 今日できたこと"); lines.push(a.overall_memo); }
  if (a.next_goal)    { lines.push(""); lines.push("🎯 次回の目標");   lines.push(a.next_goal); }
  if (a.homework)     { lines.push(""); lines.push("📓 今週の宿題");   lines.push(a.homework); }

  lines.push("");
  lines.push("くわしいグラフはこちら👇");
  lines.push(url);
  return lines.join("\n");
}

/** 送信前プレビュー。トークンが無ければ発行する（送信はまだしない）。 */
export async function getReportPreview(assessmentId: string): Promise<{ success: boolean; data?: ReportPreview; error?: string }> {
  const { clinicId } = await auth();
  const supabase = await createClient();
  try {
    const { data: head } = await supabase
      .from("training_assessments")
      .select("id, customer_id, assessed_on, assessor_name, overall_memo, next_goal, homework, report_token, report_sent_at")
      .eq("id", assessmentId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!head) return { success: false, error: "評価が見つかりません。" };

    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, line_user_id")
      .eq("id", (head as any).customer_id)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!customer) return { success: false, error: "患者が見つかりません。" };

    // トークン発行（未発行なら）
    let token: string = (head as any).report_token ?? "";
    if (!token) {
      token = randomBytes(16).toString("hex");
      const { error: tErr } = await supabase
        .from("training_assessments")
        .update({ report_token: token })
        .eq("id", assessmentId)
        .eq("clinic_id", clinicId);
      if (tErr) throw tErr;
    }

    // 本文組み立てに必要な履歴（前回比のため）
    const full = await getPatientTraining((head as any).customer_id);
    const list = full?.assessments ?? [];
    const current = list.find((x) => x.id === assessmentId) ?? null;
    if (!current) return { success: false, error: "評価データの取得に失敗しました。" };
    const idx = list.findIndex((x) => x.id === assessmentId);
    const prev = idx >= 0 && idx + 1 < list.length ? list[idx + 1] : null;

    const url = `${reportBaseUrl()}/report/training/${token}`;
    const name = (customer as any).name as string;
    const lineUserId = await findLineUserId(supabase, clinicId, (customer as any).id, (customer as any).line_user_id ?? null);

    return {
      success: true,
      data: {
        assessmentId,
        customerName: name,
        text: buildReportText(current, prev, name, url),
        url,
        lineLinked: !!lineUserId,
        sentAt: (head as any).report_sent_at ?? null,
        linkRequestText:
          `${name}さんへ\n\nトレーニングの結果レポートをLINEでお送りしたいのですが、まだLINE連携がお済みでないようです。\n` +
          `当院のLINEを友だち追加のうえ、お名前とお電話番号の下4桁をお送りいただくと連携できます。\n` +
          `連携後は、毎回の測定結果・宿題・次回の目標をLINEでお届けします🏋️`,
      },
    };
  } catch (err) {
    console.error("getReportPreview error:", err);
    return { success: false, error: "レポートの作成に失敗しました。" };
  }
}

/** 実際にLINEへ送信する（プレビューで確認した本文をそのまま送る） */
export async function sendTrainingReport(
  assessmentId: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await auth();
  const supabase = await createClient();
  try {
    const { data: head } = await supabase
      .from("training_assessments")
      .select("id, customer_id")
      .eq("id", assessmentId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!head) return { success: false, error: "評価が見つかりません。" };

    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, line_user_id")
      .eq("id", (head as any).customer_id)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!customer) return { success: false, error: "患者が見つかりません。" };

    const lineUserId = await findLineUserId(supabase, clinicId, (customer as any).id, (customer as any).line_user_id ?? null);
    if (!lineUserId) return { success: false, error: "この患者さんはLINE未連携です。連携をお願いしてください。" };

    const { pushLineText } = await import("@/lib/admin-notify");
    const push = await pushLineText(lineUserId, text, clinicId);
    if (!push.ok) {
      return { success: false, error: `LINE送信に失敗しました（${push.detail ?? "原因不明"}）` };
    }

    await supabase
      .from("training_assessments")
      .update({ report_sent_at: new Date().toISOString() })
      .eq("id", assessmentId)
      .eq("clinic_id", clinicId);

    revalidatePath(`/admin/training/${(head as any).customer_id}`);
    return { success: true };
  } catch (err) {
    console.error("sendTrainingReport error:", err);
    return { success: false, error: "送信に失敗しました。" };
  }
}

/**
 * 患者に送る前の下見用：同じ内容を「自分（管理者のLINE）」に送る。
 * 送り先は admin_notification_targets（例:「ぼーるくん LINE」）。患者には一切届かない。
 */
export async function sendTrainingReportTest(
  text: string,
): Promise<{ success: boolean; sentTo?: string[]; error?: string }> {
  const { clinicId } = await auth();
  const supabase = await createClient();
  try {
    const { data: targets } = await supabase
      .from("admin_notification_targets")
      .select("label, line_user_id, enabled")
      .eq("clinic_id", clinicId)
      .eq("enabled", true);

    const list = (targets ?? []).filter((t: any) => t.line_user_id);
    if (list.length === 0) {
      return { success: false, error: "テスト送信先が未設定です（管理者のLINE通知先を登録してください）。" };
    }

    const body = `【テスト送信】患者さんには届いていません\n──────────\n${text}`;
    const sentTo: string[] = [];
    let lastDetail = "";
    const { pushLineText } = await import("@/lib/admin-notify");
    for (const t of list as any[]) {
      const push = await pushLineText(t.line_user_id, body, clinicId);
      if (push.ok) sentTo.push(t.label ?? "管理者");
      else lastDetail = `${t.label ?? "管理者"} → ${push.detail ?? "原因不明"}`;
    }
    if (sentTo.length === 0) {
      return { success: false, error: `テスト送信に失敗しました（${lastDetail || "原因不明"}）` };
    }
    return { success: true, sentTo };
  } catch (err) {
    console.error("sendTrainingReportTest error:", err);
    return { success: false, error: "テスト送信に失敗しました。" };
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
