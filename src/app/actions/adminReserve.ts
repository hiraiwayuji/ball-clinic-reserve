"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { checkAdminAuth } from "./auth";
import { writeAudit, notifyOwnerOfStaffAction } from "@/lib/audit";
import { awardPoints } from "@/lib/gamification";
import { getLineAccessToken, pushLineToCustomer } from "@/lib/admin-notify";
import { getPushTargetsForCustomer, getPushTargetsForCustomers } from "@/lib/line-links";
import { isTimeWithinStaffHoursYmd, isStaffAvailableOnYmd, isStaffSpanBookableYmd, buildStaffSchedule, type StaffSchedule } from "@/lib/staff-availability";
import { formatDateTimeLine, formatVisitLabel } from "@/lib/appointment-summary";
import { getCurrentSlotDuration } from "@/app/actions/clinic-slot";
import { buildStaffSpans } from "@/lib/staff-spans";

/** DB の "HH:MM:SS" / "HH:MM" を "HH:MM" に正規化（未設定は null）。reserve.ts と同じ挙動。 */
function normStaffTime(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}

async function getSupabase() {
  return await createClient();
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key);
}

// ── PIIマスキング (server log用) ──
function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "(空)";
  const s = String(phone).replace(/\D/g, "");
  if (s.length < 4) return "***";
  return s.slice(0, 3) + "****" + s.slice(-2);
}

function maskName(name: string | null | undefined): string {
  if (!name) return "(空)";
  return name.charAt(0) + "*".repeat(Math.max(name.length - 1, 1));
}


/**
 * 「施術後に○○を追加」ボタン用のメニュー情報を返す（院ごとの設定 addon_course_id）。
 * 未設定なら null（ボタン非表示）。例: ボール=水素。
 */
export async function getAddonCourseInfo(): Promise<{ courseId: string; name: string; allowConcurrent: boolean } | null> {
  const { clinicId } = await checkAdminAuth();
  const supabase = getAdminSupabase();
  if (!supabase) return null;
  const { data: cs } = await supabase
    .from("clinic_settings")
    .select("addon_course_id")
    .eq("id", clinicId)
    .maybeSingle();
  const addonId = (cs?.addon_course_id as string | null) ?? null;
  if (!addonId) return null;
  const { data: c } = await supabase
    .from("reservation_courses")
    .select("id, name, allow_concurrent")
    .eq("id", addonId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!c) return null;
  // allow_concurrent=true（水素など）のメニューだけ「同時刻に追加」を許可。
  // それ以外は施術と別に時間が要るので施術後のみ。
  return { courseId: c.id as string, name: c.name as string, allowConcurrent: c.allow_concurrent === true };
}

/**
 * 既存予約に「設定された追加メニュー（addon_course_id）」を追加する（同一患者・同じ日に紐づける）。
 * timing: "before"=施術の直前 / "after"=施術の直後 / "same"=同時刻。
 * 新規追加ダイアログの「同じ日に2件」アラートを回避し、追加メニューの担当レーンの重複だけチェックする。
 */
export async function addAddonToAppointment(appointmentId: string, timing: "before" | "after" | "same") {
  const { clinicId } = await checkAdminAuth();
  const supabase = getAdminSupabase();
  if (!supabase) return { success: false, error: "サーバー設定エラー（service role key 未設定）" };
  try {
    const { data: apt } = await supabase
      .from("appointments")
      .select("id, customer_id, start_time, end_time")
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!apt || !apt.customer_id) return { success: false, error: "元の予約が見つかりませんでした" };

    // 院の設定から追加メニューを解決
    const { data: cs } = await supabase
      .from("clinic_settings")
      .select("addon_course_id")
      .eq("id", clinicId)
      .maybeSingle();
    const addonId = (cs?.addon_course_id as string | null) ?? null;
    if (!addonId) return { success: false, error: "「施術後に追加するメニュー」が設定されていません（設定画面で選んでください）" };

    const { data: addon } = await supabase
      .from("reservation_courses")
      .select("id, name, duration_minutes, required_staff_id, allow_concurrent")
      .eq("id", addonId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!addon) return { success: false, error: "追加メニューが見つかりませんでした" };

    // 「同時刻」は allow_concurrent（水素など別の時間が要らないもの）だけ許可。
    // それ以外は施術と時間が重ならないよう必ず施術後に回す。
    // 「施術前」は施術開始の直前に収める（水素を吸ってからトレーニング→施術など）。
    const effectiveTiming: "before" | "after" | "same" =
      timing === "same"
        ? (addon.allow_concurrent === true ? "same" : "after")
        : timing; // "before" or "after"
    const aDur = Number(addon.duration_minutes ?? 30) || 30;
    let aStartIso: string;
    let aEndIso: string;
    if (effectiveTiming === "before") {
      const aEnd = new Date(apt.start_time);
      const aStart = new Date(aEnd.getTime() - aDur * 60000);
      aStartIso = aStart.toISOString();
      aEndIso = aEnd.toISOString();
    } else {
      const baseIso = effectiveTiming === "same" ? apt.start_time : (apt.end_time ?? apt.start_time);
      const aStart = new Date(baseIso);
      aStartIso = aStart.toISOString();
      aEndIso = new Date(aStart.getTime() + aDur * 60000).toISOString();
    }
    const aStaffId = (addon.required_staff_id as string | null) ?? null;
    const aName = addon.name as string;

    // 担当(レーン)の表示名は担当者名にする。コース名を入れると
    // 森藤先生のレーンに「電気鍼」と出てしまう（患者側 reserve.ts と同じ扱いに揃える）
    let aStaffName: string | null = null;
    if (aStaffId) {
      const { data: aStaffRow } = await supabase
        .from("reservation_staff").select("name")
        .eq("id", aStaffId).eq("clinic_id", clinicId).maybeSingle();
      aStaffName = (aStaffRow?.name as string | null) ?? null;
    }

    // 追加メニューの担当レーンの重複チェック
    if (aStaffId) {
      const { data: conf } = await supabase
        .from("appointments")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("staff_id", aStaffId)
        .neq("status", "cancelled")
        .lt("start_time", aEndIso)
        .gt("end_time", aStartIso)
        .limit(1);
      if (conf && conf.length > 0) {
        return { success: false, error: `その時間は${aName}がすでに埋まっています。別の時間でお試しください。` };
      }
    }

    const { error } = await supabase.from("appointments").insert([{
      customer_id: apt.customer_id,
      start_time: aStartIso,
      end_time: aEndIso,
      memo: effectiveTiming === "same" ? `【${aName} 追加・同時刻】` : effectiveTiming === "before" ? `【${aName} 追加・施術前】` : `【${aName} 追加・施術後】`,
      is_first_visit: false,
      status: "confirmed",
      clinic_id: clinicId,
      course_id: addon.id,
      course_name: aName,
      ...(aStaffId ? { staff_id: aStaffId, staff_name: aStaffName } : {}),
    }]);
    if (error) {
      console.error("addAddonToAppointment insert error", error);
      return { success: false, error: "追加に失敗しました" };
    }
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (e) {
    console.error("addAddonToAppointment failed", e);
    return { success: false, error: "追加でエラーが発生しました" };
  }
}

/**
 * 同じ先生（レーン）の時間かぶりを探す共通ガード。当たったら「その予約」を返す。
 *
 * 予約を作る・動かす経路が複数あり、どれか1つでも素通りだと
 * 「休憩や勤務の設定をしている意味がない」状態になる（2026-08-22 ぼーるくん指摘）。
 * DB の除外制約は `reservation_staff.prevent_overlap = true` の担当にしか効かず、
 * からだ鍼灸整骨院は全員 false なので、アプリ側のこの関数が唯一の防波堤になる。
 *
 * excludeId: 自分自身（編集中の予約）を除外したいときに渡す。
 * staffId が null（担当なし）のときはレーンの概念がないので null を返す。
 */
async function findLaneConflict(
  db: any,
  clinicId: string,
  staffId: string | null | undefined,
  startIso: string,
  endIso: string,
  excludeId: string | undefined,
  /** 所要時間が分からない予約に使う既定値（呼び出し元で1回だけ引いて渡す） */
  slotMinutes: number,
): Promise<{ id: string; start_time: string; end_time: string; customerName: string | null } | null> {
  if (!staffId) return null;

  // その時間に重なりうる予約を、担当を絞らずに取る。
  // 担当で絞ってしまうと「主担当は別の先生だが、追加担当としてこの先生が入っている」予約を
  // 見落とす（例: 三浦様は主担当=森川／追加担当=藤川）。
  let q = db
    .from("appointments")
    .select("id, start_time, end_time, staff_id, course_id, additional_staff, additional_courses, customers(name)")
    .eq("clinic_id", clinicId)
    .neq("status", "cancelled")
    .lt("start_time", endIso)
    .gt("end_time", startIso);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  // 判定できなかったときは「かぶり無し」で通してはいけない（fail-closed）。
  if (error) {
    console.error("[findLaneConflict] 判定できませんでした", error);
    throw new Error("予約の重なりを確認できなかったため、処理を中止しました。もう一度お試しください。");
  }
  const rows: any[] = data ?? [];
  if (rows.length === 0) return null;

  // メニューの所要時間を引く（複数担当の予約を前後に分けるのに使う）
  const courseIds = new Set<string>();
  for (const r of rows) {
    if (r.course_id) courseIds.add(r.course_id);
    for (const ac of (r.additional_courses ?? []) as { course_id?: string }[]) {
      if (ac?.course_id) courseIds.add(ac.course_id);
    }
  }
  const durationById = new Map<string, number>();
  if (courseIds.size > 0) {
    const { data: courseRows } = await db
      .from("reservation_courses")
      .select("id, duration_minutes")
      .eq("clinic_id", clinicId)
      .in("id", [...courseIds]);
    for (const c of (courseRows ?? []) as { id: string; duration_minutes: number | null }[]) {
      if (c.duration_minutes && c.duration_minutes > 0) durationById.set(c.id, c.duration_minutes);
    }
  }
  const wantStart = new Date(startIso).getTime();
  const wantEnd = new Date(endIso).getTime();

  for (const r of rows) {
    // その予約のうち、この先生が実際に受け持つ時間帯だけを見る。
    // 接骨院では2人の先生が同時に入ることはなく、複数担当は前後に分かれるため
    //（例: 三浦様 19:00-20:00 は 森川 19:00-19:20／藤川 19:20-20:00）。
    const spans = buildStaffSpans({
      startTime: r.start_time,
      endTime: r.end_time ?? null,
      staffId: r.staff_id ?? null,
      mainMinutes: r.course_id ? (durationById.get(r.course_id) ?? null) : null,
      additionalStaff: (r.additional_staff ?? null) as { staff_id: string }[] | null,
      additionalCourses: (r.additional_courses ?? null) as { course_id: string }[] | null,
      additionalMinutes: ((r.additional_courses ?? []) as { course_id?: string }[])
        .map((ac) => (ac?.course_id ? (durationById.get(ac.course_id) ?? null) : null)),
      fallbackMinutes: slotMinutes,
    });
    const mine = spans.find((sp) => sp.staffId === staffId);
    if (!mine) continue; // この先生は担当していない
    const s = new Date(mine.startIso).getTime();
    const e = new Date(mine.endIso).getTime();
    if (s < wantEnd && e > wantStart) {
      const customerName = Array.isArray(r.customers)
        ? (r.customers[0]?.name ?? null)
        : (r.customers?.name ?? null);
      // 画面には「その先生が受け持っている時間」を出す（予約全体の時間ではない）
      return { id: r.id, start_time: mine.startIso, end_time: mine.endIso, customerName };
    }
  }
  return null;
}

/**
 * 担当かぶりを「承知のうえで」通してよいか。
 *
 * スタッフには判断できない事情（院長が2人まとめて診る、応援が入る等）があるため、
 * かぶりを通せるのは**オーナー（院長先生）が明示的に許可したときだけ**にする。
 * スタッフの画面からは許可フラグを送れないし、送られてきても role で弾く。
 * （2026-08-22 ぼーるくん「登録できない場合はオーナーの許可が必要ってことにして。
 *   スタッフレベルではわからないこともあるので」）
 */
function canOverrideOverlap(role: string | null | undefined, allowOverlap: boolean): boolean {
  return allowOverlap === true && role === "owner";
}

/**
 * 院長がかぶりを承知で通したことを、予約のメモに残す印。
 *
 * 承認ゲートを作っても、通した事実が残らないと後から「誰の判断だったか」を追えない。
 * カレンダー上でも一目で分かるようにメモの末尾に足す。
 */
function withOverlapStamp(memo: string | null | undefined): string {
  const stamp = `【重複承知・院長承認 ${new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric",
  }).format(new Date())}】`;
  const base = (memo ?? "").trim();
  if (base.includes("【重複承知・院長承認")) return base; // 二重には付けない
  return base ? `${base} ${stamp}` : stamp;
}

/** かぶり相手の時間帯を「14:00〜14:20」の形にする */
function describeLaneConflictRange(hit: { start_time: string; end_time: string }): string {
  const f = (iso: string) =>
    new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(iso));
  return `${f(hit.start_time)}〜${f(hit.end_time)}`;
}

/** かぶり相手を「14:00〜14:20 近藤様」の形にする（画面にそのまま出す文言用） */
function describeLaneConflict(
  hit: { start_time: string; end_time: string; customerName: string | null },
): string {
  return `${describeLaneConflictRange(hit)}${hit.customerName ? ` ${hit.customerName}様` : ""}`;
}

/**
 * 既存予約の直前・直後に任意のコースを追加予約として挿入する。
 * direction: "before" = 現在開始時刻の直前、"after" = 現在終了時刻の直後
 */
export async function addAdjacentAppointment(
  appointmentId: string,
  courseId: string,
  staffId: string | null,
  direction: "before" | "after",
  /** 担当かぶりを承知で通す（オーナーのみ有効） */
  allowOverlap: boolean = false,
): Promise<{ success: boolean; error?: string; overlap?: boolean; needsOwner?: boolean }> {
  const { clinicId, role } = await checkAdminAuth();
  const supabase = getAdminSupabase();
  if (!supabase) return { success: false, error: "サーバー設定エラー" };
  try {
    // 元予約を取得
    const { data: apt } = await supabase
      .from("appointments")
      .select("id, start_time, end_time, customer_id, is_first_visit, clinic_id")
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!apt) return { success: false, error: "元の予約が見つかりませんでした" };

    // コース情報を取得
    const { data: course } = await supabase
      .from("reservation_courses")
      .select("id, name, duration_minutes, price")
      .eq("id", courseId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!course) return { success: false, error: "コースが見つかりませんでした" };

    const dur = Number(course.duration_minutes ?? 30) || 30;

    let newStart: Date;
    let newEnd: Date;
    if (direction === "after") {
      newStart = new Date(apt.end_time ?? apt.start_time);
      newEnd = new Date(newStart.getTime() + dur * 60000);
    } else {
      newEnd = new Date(apt.start_time);
      newStart = new Date(newEnd.getTime() - dur * 60000);
    }

    // スタッフ名を解決
    let resolvedStaffName: string | null = null;
    if (staffId) {
      const { data: st } = await supabase
        .from("reservation_staff")
        .select("name")
        .eq("id", staffId)
        .eq("clinic_id", clinicId)
        .maybeSingle();
      resolvedStaffName = (st?.name as string) ?? null;
    }

    // 担当かぶりの確認。「直前に追加／直後に追加」は担当の初期値が元予約と同じ先生なので、
    // 何も見ずに入れると1つ前・1つ後の患者さんの枠にそのまま重なる（2026-08-22 検品指摘）。
    const slotMinutes = await getCurrentSlotDuration();
    const conflict = await findLaneConflict(
      supabase, clinicId, staffId, newStart.toISOString(), newEnd.toISOString(),
      undefined, slotMinutes,
    );
    if (conflict && !canOverrideOverlap(role, allowOverlap)) {
      return {
        success: false,
        overlap: true as const,
        needsOwner: true as const,
        error:
          `${resolvedStaffName ?? "担当"}さんは、この時間にすでに別のご予約が入っています（${describeLaneConflict(conflict)}）。\n` +
          `同じ担当の重複予約はできません。担当者を変えるか、別の時間に追加してください。`,
      };
    }

    const { error } = await supabase.from("appointments").insert([{
      customer_id: apt.customer_id,
      start_time: newStart.toISOString(),
      end_time: newEnd.toISOString(),
      ...(conflict ? { memo: withOverlapStamp(null) } : {}),
      is_first_visit: false,
      status: "confirmed",
      clinic_id: clinicId,
      course_id: course.id,
      course_name: course.name as string,
      ...(staffId ? { staff_id: staffId, staff_name: resolvedStaffName } : {}),
    }]);
    if (error) return { success: false, error: "追加に失敗しました" };
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch {
    return { success: false, error: "追加でエラーが発生しました" };
  }
}

/** Googleクチコミ依頼が使えるか（設定URLがあるか）＋URLを返す。 */
export async function getReviewRequestConfig(): Promise<{ enabled: boolean; url: string | null }> {
  const { clinicId } = await checkAdminAuth();
  const supabase = getAdminSupabase();
  if (!supabase) return { enabled: false, url: null };
  const { data } = await supabase
    .from("clinic_settings")
    .select("google_review_url")
    .eq("id", clinicId)
    .maybeSingle();
  const url = (data?.google_review_url as string | null) ?? null;
  return { enabled: !!url, url };
}

/** 来院後のGoogleクチコミお願いLINEを、その予約の患者へ送る。 */
export async function sendReviewRequest(appointmentId: string): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const supabase = getAdminSupabase();
  if (!supabase) return { success: false, error: "サーバー設定エラー" };

  const { data: settings } = await supabase
    .from("clinic_settings")
    .select("google_review_url, clinic_name")
    .eq("id", clinicId)
    .maybeSingle();
  const url = (settings?.google_review_url as string | null) ?? null;
  if (!url) return { success: false, error: "Googleクチコミのリンクが未設定です（設定画面で登録してください）" };

  const { data: apt } = await supabase
    .from("appointments")
    .select("id, customer_id, customers(name)")
    .eq("id", appointmentId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!apt || !apt.customer_id) return { success: false, error: "予約が見つかりません" };

  const lineUids = await getPushTargetsForCustomer(apt.customer_id as string, clinicId);
  if (lineUids.length === 0) return { success: false, error: "この患者さんはLINE未連携のため送れません" };

  const cust = Array.isArray((apt as any).customers) ? (apt as any).customers[0] : (apt as any).customers;
  const name = cust?.name ? `${cust.name}様\n` : "";
  const clinicName = (settings?.clinic_name as string | null) || "当院";
  const text = `${name}本日は${clinicName}にご来院いただきありがとうございました🙏\n\nもしよろしければ、Googleのクチコミで感想をいただけると、スタッフ一同とても励みになります！\n下のリンクから★を選ぶだけでカンタンに投稿できます👇\n${url}`;

  let sent = 0;
  for (const uid of lineUids) {
    try { await pushLineToCustomer(uid, text); sent++; } catch (e) { console.error("sendReviewRequest push error", e); }
  }
  if (sent === 0) return { success: false, error: "送信に失敗しました" };
  return { success: true };
}

/**
 * 受付スタッフが手入力でキャンセル待ちを登録する。
 * 予約サイト経由の waiting（createWaitlistReservation）と同じく
 * status="waiting" の appointment を作り、/admin/waitlist に並ぶ。
 * 患者は customers に名寄せ（カルテ番号/電話+氏名/電話単独）or 新規作成。
 */
export async function createWaitlistEntryByStaff(formData: FormData) {
  const { clinicId } = await checkAdminAuth();
  try {
    const rawDate = formData.get("date") as string;
    const time = (formData.get("time") as string) || "";
    const name = ((formData.get("name") as string) || "").trim();
    const phone = ((formData.get("phone") as string) || "").trim();
    const visitType = formData.get("visitType") as string;
    const note = ((formData.get("note") as string) || "").trim();
    const medicalRecordNumber = ((formData.get("medicalRecordNumber") as string) || "").trim() || null;

    if (!rawDate || !time || !name || !phone) {
      return { success: false, error: "氏名・電話番号・希望日・希望時間は必須です" };
    }

    const supabase = getAdminSupabase();
    if (!supabase) {
      return { success: false, error: "サーバー設定エラー（service role key 未設定）" };
    }

    // ── 顧客の名寄せ（createManualReservation と同じ優先順位） ──
    let existing: { id: string } | null = null;
    if (medicalRecordNumber) {
      const { data } = await supabase
        .from("customers").select("id")
        .eq("medical_record_number", medicalRecordNumber).eq("clinic_id", clinicId).maybeSingle();
      if (data) existing = data;
    }
    if (!existing) {
      const { data } = await supabase
        .from("customers").select("id")
        .eq("phone", phone).eq("name", name).eq("clinic_id", clinicId).maybeSingle();
      if (data) existing = data;
    }
    if (!existing) {
      const { data: byPhone } = await supabase
        .from("customers").select("id").eq("phone", phone).eq("clinic_id", clinicId);
      if (byPhone && byPhone.length === 1) existing = { id: byPhone[0].id };
    }

    let customerId: string;
    if (existing) {
      customerId = existing.id;
      const updateData: { name: string; medical_record_number?: string | null } = { name };
      if (medicalRecordNumber) updateData.medical_record_number = medicalRecordNumber;
      await supabase.from("customers").update(updateData).eq("id", customerId).eq("clinic_id", clinicId);
    } else {
      const insertData: { name: string; phone: string; clinic_id: string; medical_record_number?: string } = {
        name, phone, clinic_id: clinicId,
      };
      if (medicalRecordNumber) insertData.medical_record_number = medicalRecordNumber;
      // tenant-isolation-ignore: insertData に clinic_id: clinicId を含む（変数経由のため検知不可）
      const { data: newCustomer, error: customerErr } = await supabase
        .from("customers").insert([insertData]).select("id").single();
      if (customerErr || !newCustomer) {
        return { success: false, error: `顧客情報の登録に失敗しました: ${customerErr?.message ?? "不明なエラー"}` };
      }
      customerId = newCustomer.id;
    }

    // ── キャンセル待ち（waiting）を作成 ──
    const startDateTime = `${rawDate}T${time}:00+09:00`;
    const memo = `【キャンセル待ち・受付登録】${note ? ` ${note}` : ""}`.trim();
    // tenant-isolation-ignore: insert 行に clinic_id を明示設定済み
    const { error: aptErr } = await supabase
      .from("appointments")
      .insert([{
        customer_id: customerId,
        start_time: startDateTime,
        end_time: startDateTime,
        memo,
        is_first_visit: visitType === "new",
        status: "waiting",
        clinic_id: clinicId,
      }]);

    if (aptErr) {
      return { success: false, error: `キャンセル待ちの登録に失敗しました: ${aptErr.message}` };
    }

    revalidatePath("/admin/waitlist");
    return { success: true };
  } catch (err) {
    console.error("[createWaitlistEntryByStaff]", err);
    return { success: false, error: "エラーが発生しました" };
  }
}

export type AddOverlapResult =
  | { kind: "none" }
  | { kind: "warn"; staffName: string }
  | {
      kind: "reassign_sami";
      staffName: string;
      sami: {
        staffId: string;
        staffName: string;
        courseId: string;
        courseName: string;
        durationMinutes: number;
      };
    };

/**
 * 管理画面の新規予約追加で、選んだ担当レーンが時間かぶりしていないか調べる。
 * ・かぶっていなければ none。
 * ・「ボール」担当がかぶっていて、その日さみが出勤していて さみ枠が空いていれば
 *   さみ整体への振り替えを提案（reassign_sami）。
 * ・それ以外のかぶり（ボール以外／さみも埋まり／さみ休み）は警告（warn）。
 *
 * 注: 全担当（ボール含む）が prevent_overlap=true になり、DB の除外制約が同一レーンの
 *     時間かぶり（ダブルブッキング）を必ず弾く。ここは生のエラーを見せず、振替提案や
 *     分かりやすいダイアログに寄せるための事前チェック（登録の可否は最終的に DB が担保）。
 *     判定（出勤日・出勤時間）は患者予約側 reserve.ts と同じロジックをミラーする。
 */
export async function checkAddAppointmentOverlap(params: {
  date: string;               // "yyyy-MM-dd"
  time: string;               // "HH:MM"
  durationMinutes: number;
  staffId: string | null;
  courseId: string | null;
}): Promise<AddOverlapResult> {
  const { clinicId } = await checkAdminAuth();
  const supabase = getAdminSupabase();
  if (!supabase) return { kind: "none" };
  try {
    const { date, time } = params;
    if (!date || !time) return { kind: "none" };
    // 所要時間の既定は院の予約枠サイズ（30分決め打ちにしない。からだ鍼灸整骨院は20分）
    const durationMinutes = Number(params.durationMinutes) || (await getCurrentSlotDuration());

    // 1. 実効の担当レーンを決める（担当指定 > コースの required_staff_id）。
    //    どちらも無い（指定なし）ときはレーン重複の概念がないので none。
    let effStaffId = params.staffId || null;
    if (!effStaffId && params.courseId) {
      const { data: c } = await supabase
        .from("reservation_courses")
        .select("required_staff_id")
        .eq("id", params.courseId)
        .eq("clinic_id", clinicId)
        .maybeSingle();
      effStaffId = (c?.required_staff_id as string | null) ?? null;
    }
    if (!effStaffId) return { kind: "none" };

    const { data: effStaff } = await supabase
      .from("reservation_staff")
      .select("id, name")
      .eq("id", effStaffId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!effStaff) return { kind: "none" };
    const effStaffName = (effStaff.name as string) ?? "担当";

    // 2. その担当レーンで時間がかぶる予約があるか（キャンセル除く）。
    const start = new Date(`${date}T${time}:00+09:00`);
    const startIso = start.toISOString();
    const endIso = new Date(start.getTime() + durationMinutes * 60000).toISOString();
    const laneOccupied = async (staffId: string, sIso: string, eIso: string) => {
      const { data } = await supabase
        .from("appointments")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("staff_id", staffId)
        .neq("status", "cancelled")
        .lt("start_time", eIso)
        .gt("end_time", sIso)
        .limit(1);
      return !!(data && data.length > 0);
    };
    if (!(await laneOccupied(effStaffId, startIso, endIso))) return { kind: "none" };

    // 3. かぶっている。
    //    ここから先の「さみ整体へ振り替えますか？」の提案はボール接骨院だけの運用なので、
    //    ボール以外の担当は kind:"warn"（＝登録させない案内）を返して終わる。
    //
    //    2026-08-22 まで、ここは `effStaffName !== "ボール"` で **none を返して素通り**していた。
    //    さみ/水素/ヘッドスパは prevent_overlap=true で DB の除外制約が弾くため問題なかったが、
    //    からだ鍼灸整骨院のように全員 prevent_overlap=false の院では
    //    アプリも DB も止めない＝かぶり予約が入り放題になっていた（7〜8月で64件）。
    //    「注意メッセージを出しても読まない人がいるので、直さないと予約できないようにしてほしい」
    //    というぼーるくんの依頼にあわせ、院・担当を問わず必ず止める。
    if (effStaffName !== "ボール") {
      return { kind: "warn", staffName: effStaffName };
    }

    // さみ整体コース（さみ担当・有効）を探す。無ければ振替不可＝警告のみ。
    const { data: samiCourse } = await supabase
      .from("reservation_courses")
      .select("id, name, duration_minutes, required_staff_id")
      .eq("clinic_id", clinicId)
      .eq("name", "さみ整体")
      .eq("is_active", true)
      .maybeSingle();
    const samiStaffId = (samiCourse?.required_staff_id as string | null) ?? null;
    if (!samiCourse || !samiStaffId) return { kind: "warn", staffName: effStaffName };

    const { data: sami } = await supabase
      .from("reservation_staff")
      .select("id, name, schedule_based_booking, booking_weekdays, booking_start_time, booking_end_time")
      .eq("id", samiStaffId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!sami) return { kind: "warn", staffName: effStaffName };

    // さみは出勤日制。その日出勤していない／受付時間外なら振替不可＝警告のみ。
    if (sami.schedule_based_booking) {
      const weekdays = String(sami.booking_weekdays ?? "")
        .split(",").map((s) => s.trim()).filter(Boolean).map(Number);
      const { data: ovr } = await supabase
        .from("staff_booking_dates")
        .select("available, start_time, end_time")
        .eq("clinic_id", clinicId)
        .eq("staff_id", samiStaffId)
        .eq("date", date)
        .maybeSingle();
      const wd = new Date(`${date}T00:00:00`).getDay();
      const available = ovr ? !!ovr.available : weekdays.includes(wd);
      if (!available) return { kind: "warn", staffName: effStaffName };
      const sched: StaffSchedule = {
        weekdays,
        dates: ovr
          ? [{ date, available: true, start: normStaffTime(ovr.start_time), end: normStaffTime(ovr.end_time) }]
          : [],
        defaultStart: normStaffTime(sami.booking_start_time as string | null),
        defaultEnd: normStaffTime(sami.booking_end_time as string | null),
      };
      if (!isTimeWithinStaffHoursYmd(date, time, sched)) return { kind: "warn", staffName: effStaffName };
    }

    // さみ整体の所要時間でさみレーンの空きを確認。さみも埋まっていれば警告のみ。
    const samiDur = Number(samiCourse.duration_minutes ?? 30) || 30;
    const samiEndIso = new Date(start.getTime() + samiDur * 60000).toISOString();
    if (await laneOccupied(samiStaffId, startIso, samiEndIso)) {
      return { kind: "warn", staffName: effStaffName };
    }

    return {
      kind: "reassign_sami",
      staffName: effStaffName,
      sami: {
        staffId: samiStaffId,
        staffName: (sami.name as string) ?? "さみ",
        courseId: samiCourse.id as string,
        courseName: (samiCourse.name as string) ?? "さみ整体",
        durationMinutes: samiDur,
      },
    };
  } catch (e) {
    console.error("checkAddAppointmentOverlap failed", e);
    return { kind: "none" };
  }
}

export async function createManualReservation(formData: FormData) {
  const { clinicId, role } = await checkAdminAuth();
  // かぶりを承知で通すオーナー許可（スタッフの画面からは送られない。送られても role で弾く）
  const allowOverlap = formData.get("allowOverlap") === "true";
  try {
    const rawDate = formData.get("date") as string;
    const time = formData.get("time") as string;
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const visitType = formData.get("visitType") as string;
    const symptoms = (formData.get("symptoms") as string) || "";
    const recurringWeeksStr = formData.get("recurringWeeks") as string;
    const recurringWeeks = recurringWeeksStr ? parseInt(recurringWeeksStr, 10) : 1;
    const durationStr = formData.get("duration") as string;
    // 未指定なら院の予約枠サイズ（からだ鍼灸整骨院は20分。30分決め打ちにしない）
    const durationMinutes = durationStr ? parseInt(durationStr, 10) : await getCurrentSlotDuration();

    // コース・スタッフ・個室の選択（任意）
    // 患者側 reserve と同じく ID と snapshot 名を併存させる。
    // ID がマスタにない（別院/削除済み）場合は保存しないことで横断混入を防ぐ。
    const courseId = (formData.get("courseId") as string) || null;
    const staffId = (formData.get("staffId") as string) || null;
    const roomId = (formData.get("roomId") as string) || null;
    // 担当かぶり時の「さみ整体へ振替」など、報告として残したい注記（任意）。
    const reassignReport = ((formData.get("reassignReport") as string) || "").trim();

    if (!rawDate || !time || !name || !phone) {
      return { success: false, error: "必須項目が不足しています" };
    }

    // RLS をバイパスするために service role クライアントを使用
    const supabase = getAdminSupabase();
    if (!supabase) {
      return { success: false, error: "サーバー設定エラー（service role key 未設定）" };
    }

    // 1. 既存顧客の特定（同一院内）
    //    customer_id 明示 → カルテ番号 → (phone+name) → phone単独 の順でフォールバック。
    //    親子で同じ電話番号を共有しているケースや、電話番号が未整備（例: "080" だけ）の患者でも
    //    customer_id が分かっていれば確実に同一患者へひもづけられる（次回予約などで使用）。
    const medicalRecordNumber = ((formData.get("medicalRecordNumber") as string) || "").trim() || null;
    const explicitCustomerId = ((formData.get("customerId") as string) || "").trim() || null;

    let existing: { id: string } | null = null;

    // 1-0. customer_id が明示されていれば最優先。
    //      自院（clinicId）に属する場合のみ採用し、他院IDの混入を防ぐ（テナント分離）。
    if (explicitCustomerId) {
      const { data } = await supabase
        .from("customers")
        .select("id")
        .eq("id", explicitCustomerId)
        .eq("clinic_id", clinicId)
        .maybeSingle();
      if (data) existing = data;
    }

    // 1-a. カルテ番号があれば一意特定
    if (!existing && medicalRecordNumber) {
      const { data } = await supabase
        .from("customers")
        .select("id")
        .eq("medical_record_number", medicalRecordNumber)
        .eq("clinic_id", clinicId)
        .maybeSingle();
      if (data) existing = data;
    }

    // 1-b. カルテ番号で見つからなければ (phone + name) の組合せで検索
    if (!existing) {
      const { data } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", phone.trim())
        .eq("name", name.trim())
        .eq("clinic_id", clinicId)
        .maybeSingle();
      if (data) existing = data;
    }

    // 1-c. それでも見つからなければ phone 単独で検索（単一ヒット時のみ採用）
    //      複数ヒットなら親子別人と判断して新規作成
    if (!existing) {
      const { data: byPhone } = await supabase
        .from("customers")
        .select("id, name")
        .eq("phone", phone.trim())
        .eq("clinic_id", clinicId);
      if (byPhone && byPhone.length === 1) {
        existing = { id: byPhone[0].id };
      } else if (byPhone && byPhone.length > 1) {
        console.warn(
          `[addAppointmentByAdmin] multiple customers with phone ${phone.trim()} - creating new record for ${name.trim()}`,
        );
      }
    }

    let customerId: string;
    if (existing) {
      // 既存顧客を使用（名前とカルテ番号を最新に更新）
      customerId = existing.id;
      const updateData: { name: string; medical_record_number?: string | null } = { name: name.trim() };
      if (medicalRecordNumber) updateData.medical_record_number = medicalRecordNumber;
      await supabase
        .from("customers")
        .update(updateData)
        .eq("id", customerId)
        .eq("clinic_id", clinicId);
    } else {
      // 新規顧客を作成
      const insertData: { name: string; phone: string; clinic_id: string; medical_record_number?: string } = {
        name: name.trim(),
        phone: phone.trim(),
        clinic_id: clinicId,
      };
      if (medicalRecordNumber) insertData.medical_record_number = medicalRecordNumber;
      // tenant-isolation-ignore: insertData に clinic_id: clinicId を含む（変数経由のため検知不可）
      const { data: newCustomer, error: customerErr } = await supabase
        .from("customers")
        .insert([insertData])
        .select("id")
        .single();

      if (customerErr || !newCustomer) {
        console.error("Customer insertion error:", customerErr);
        return { success: false, error: `顧客情報の登録に失敗しました: ${customerErr?.message ?? "不明なエラー"}` };
      }
      customerId = newCustomer.id;
    }

    // 2. 予約を作成（管理側追加は即 confirmed）
    //
    // 予約する日時の一覧を組み立てる。1件目は date/time、「日時を追加」で選ばれた分は
    // extraDateTimes（[{date,time}] の JSON）で届く。事故の患者さんのように来院日が
    // バラバラでも、1回の登録でまとめて取れるようにするため。
    // recurringWeeks（毎週N週連続）は各日時から週送りで展開する（後方互換）。
    // staffId / courseId は行ごとに変えられる（日によって担当やメニューが違うケース）。
    // 空なら1件目と同じ担当・同じメニュー。
    let extraDateTimes: { date: string; time: string; staffId?: string; courseId?: string }[] = [];
    try {
      const raw = (formData.get("extraDateTimes") as string) || "";
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        extraDateTimes = parsed.filter(
          (s: unknown): s is { date: string; time: string; staffId?: string; courseId?: string } => {
            const v = s as { date?: unknown; time?: unknown } | null;
            return (
              !!v &&
              typeof v.date === "string" &&
              typeof v.time === "string" &&
              /^\d{4}-\d{2}-\d{2}$/.test(v.date) &&
              /^\d{2}:\d{2}$/.test(v.time)
            );
          },
        );
      }
    } catch (err) {
      console.warn("[addAppointmentByAdmin] failed to parse extraDateTimes:", err);
    }

    // 同じ日時が二重に入らないよう畳む（1件目と追加分が同じ日時、など）
    const seenSlotKeys = new Set<string>();
    const baseStarts: { start: Date; staffId: string | null; courseId: string | null }[] = [];
    for (const s of [
      { date: rawDate, time, staffId: staffId ?? undefined, courseId: courseId ?? undefined },
      ...extraDateTimes,
    ]) {
      const key = `${s.date}T${s.time}`;
      if (seenSlotKeys.has(key)) continue;
      const d = new Date(`${s.date}T${s.time}:00+09:00`);
      if (Number.isNaN(d.getTime())) continue;
      seenSlotKeys.add(key);
      const rowStaffId = (typeof s.staffId === "string" && s.staffId.trim()) || staffId || null;
      const rowCourseId = (typeof s.courseId === "string" && s.courseId.trim()) || courseId || null;
      baseStarts.push({ start: d, staffId: rowStaffId, courseId: rowCourseId });
    }
    if (baseStarts.length === 0) {
      return { success: false, error: "予約日時が正しくありません" };
    }

    // 毎週N週ぶんに展開したうえで、時系列に並べる。
    // 並べ替えるのは「初診フラグを一番早い予約に付ける」ため（追加した日の方が先、でも正しく動く）。
    const weeks = Number.isFinite(recurringWeeks) && recurringWeeks > 0 ? recurringWeeks : 1;
    const allStarts: { start: Date; staffId: string | null; courseId: string | null }[] = [];
    for (const b of baseStarts) {
      for (let i = 0; i < weeks; i++) {
        const d = new Date(b.start.getTime());
        d.setDate(d.getDate() + i * 7);
        allStarts.push({ start: d, staffId: b.staffId, courseId: b.courseId });
      }
    }
    allStarts.sort((a, b) => a.start.getTime() - b.start.getTime());

    const isFirstVisit = visitType === "new";

    // コース/スタッフ/個室のマスタ名を解決（clinic_id 指定で別院ID混入を防ぐ）
    const [courseRow, staffRow, roomRow] = await Promise.all([
      courseId
        ? supabase.from("reservation_courses").select("id,name").eq("id", courseId).eq("clinic_id", clinicId).maybeSingle()
        : Promise.resolve({ data: null as { id: string; name: string } | null }),
      staffId
        ? supabase.from("reservation_staff").select("id,name").eq("id", staffId).eq("clinic_id", clinicId).maybeSingle()
        : Promise.resolve({ data: null as { id: string; name: string } | null }),
      roomId
        ? supabase.from("reservation_rooms").select("id,name").eq("id", roomId).eq("clinic_id", clinicId).maybeSingle()
        : Promise.resolve({ data: null as { id: string; name: string } | null }),
    ]);
    const courseName = courseRow.data?.name ?? null;
    const staffName  = staffRow.data?.name ?? null;
    const roomName   = roomRow.data?.name ?? null;
    const courseExtra = courseId && courseName ? { course_id: courseId, course_name: courseName } : {};
    const roomExtra   = roomId   && roomName   ? { room_id:   roomId,   room_name:   roomName   } : {};

    // 担当は行ごとに変えられる（日によって担当が違うケース）。使われている担当の名前をまとめて解決する。
    // clinic_id 指定で引くので、自院にない ID（他院/削除済み）は名前が付かず、その行は担当なしで登録される。
    const rowStaffIds = Array.from(
      new Set(allStarts.map((s) => s.staffId).filter((v): v is string => !!v)),
    );
    const staffNameById = new Map<string, string>();
    if (rowStaffIds.length > 0) {
      const { data: rows } = await supabase
        .from("reservation_staff")
        .select("id, name")
        .in("id", rowStaffIds)
        .eq("clinic_id", clinicId);
      (rows ?? []).forEach((r) => staffNameById.set(r.id as string, r.name as string));
    }

    // メニューも行ごとに変えられる（1回目は鍼灸、2回目は水素、など）。
    // clinic_id 指定で引くので、自院にない ID はここで落ちてメニューなしで登録される。
    const rowCourseIds = Array.from(
      new Set(allStarts.map((s) => s.courseId).filter((v): v is string => !!v)),
    );
    const courseById = new Map<string, { name: string; durationMinutes: number }>();
    if (rowCourseIds.length > 0) {
      const { data: rows } = await supabase
        .from("reservation_courses")
        .select("id, name, duration_minutes")
        .in("id", rowCourseIds)
        .eq("clinic_id", clinicId);
      (rows ?? []).forEach((r) =>
        courseById.set(r.id as string, {
          name: r.name as string,
          durationMinutes: Number(r.duration_minutes) || durationMinutes,
        }),
      );
    }

    // 追加メニュー・追加担当（同一予約に複数項目を紐付け）
    let additionalCoursesJson: { course_id: string; course_name: string }[] = [];
    let additionalStaffJson:   { staff_id:  string; staff_name:  string }[] = [];
    try {
      const raw = (formData.get("additionalCourseIds") as string) || "";
      const ids: string[] = raw ? JSON.parse(raw).filter(Boolean) : [];
      if (ids.length > 0) {
        const { data: addCourses } = await supabase
          .from("reservation_courses")
          .select("id, name")
          .in("id", ids)
          .eq("clinic_id", clinicId);
        additionalCoursesJson = (addCourses ?? []).map((c) => ({ course_id: c.id, course_name: c.name }));
      }
    } catch (err) {
      console.warn("[addAppointmentByAdmin] failed to parse additionalCourseIds:", err);
    }
    try {
      const raw = (formData.get("additionalStaffIds") as string) || "";
      const ids: string[] = raw ? JSON.parse(raw).filter(Boolean) : [];
      if (ids.length > 0) {
        const { data: addStaff } = await supabase
          .from("reservation_staff")
          .select("id, name")
          .in("id", ids)
          .eq("clinic_id", clinicId);
        additionalStaffJson = (addStaff ?? []).map((s) => ({ staff_id: s.id, staff_name: s.name }));
      }
    } catch (err) {
      console.warn("[addAppointmentByAdmin] failed to parse additionalStaffIds:", err);
    }
    const additionalCoursesExtra = additionalCoursesJson.length > 0 ? { additional_courses: additionalCoursesJson } : {};
    const additionalStaffExtra   = additionalStaffJson.length   > 0 ? { additional_staff:   additionalStaffJson   } : {};

    // 2件以上をまとめて取るときは同一 series_id で束ねる（後で「この日以降を全削除」できるように）
    const seriesId = allStarts.length > 1
      ? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null)
      : null;

    const appointmentsToInsert = allStarts.map((slot, i) => {
      const targetDate = slot.start;
      // メニューはこの行のもの（行で指定がなければ1件目と同じメニューが入っている）。
      // 1件目と違うメニューにした行は、そのメニューの所要時間で終了時刻を決める。
      // 1件目と同じメニューの行は、フォームで選ばれた所要時間（手で伸ばした分も含む）をそのまま使う。
      const rowCourse = slot.courseId ? courseById.get(slot.courseId) ?? null : null;
      const rowCourseExtra = slot.courseId && rowCourse
        ? { course_id: slot.courseId, course_name: rowCourse.name }
        : {};
      const rowDuration = rowCourse && slot.courseId !== courseId
        ? rowCourse.durationMinutes
        : durationMinutes;
      const endDate = new Date(targetDate.getTime() + rowDuration * 60 * 1000);
      const memoBase = `[院内追加] ${symptoms}`.trim();
      const memoWithReport = reassignReport ? `${memoBase} 【${reassignReport}】`.trim() : memoBase;
      const memoText = allStarts.length > 1
        ? `${memoWithReport} (まとめ予約 ${i + 1}/${allStarts.length})`
        : memoWithReport;

      // 担当はこの行のもの（行で指定がなければ1件目と同じ担当が入っている）
      const rowStaffName = slot.staffId ? staffNameById.get(slot.staffId) ?? null : null;
      const rowStaffExtra = slot.staffId && rowStaffName
        ? { staff_id: slot.staffId, staff_name: rowStaffName }
        : {};

      return {
        customer_id: customerId,
        start_time: targetDate.toISOString(),
        end_time: endDate.toISOString(),
        memo: memoText,
        // 初診は一番早い1件だけ。2件目以降は再診として入れる。
        is_first_visit: i === 0 ? isFirstVisit : false,
        status: "confirmed",
        clinic_id: clinicId,
        series_id: seriesId,
        ...rowCourseExtra,
        ...rowStaffExtra,
        ...roomExtra,
        ...additionalCoursesExtra,
        ...additionalStaffExtra,
      };
    });

    // ── 担当かぶりの最終ガード（fail-closed・2026-08-22 ぼーるくん依頼） ──
    // 同じ先生の同じ時間に2件は入れさせない。
    // prevent_overlap=true の担当（さみ/水素/ヘッドスパ/ボール）は DB の除外制約が弾くが、
    // からだ鍼灸整骨院のように全員 false の院は DB では止まらない。
    // 画面の注意メッセージは読まれないことがあるので、サーバー側で必ず止める。
    {
      const conflicts: string[] = [];
      // かぶった行だけに承認スタンプを付けるための目印
      // （まとめ予約で1日だけ重なったとき、他の日の予約まで「重複承知」と記録されないように）
      const conflictRows = new Set<number>();
      const fmt = (iso: string) =>
        new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo", month: "numeric", day: "numeric",
          hour: "2-digit", minute: "2-digit", hour12: false,
        }).format(new Date(iso));
      const slotMinutesForSpans = await getCurrentSlotDuration();
      // 登録しようとしている行を「先生ごとの受け持ち時間」に分けておく。
      // 複数担当は前後に分かれるので、主担当が全時間を占有する扱いにすると誤判定になる
      //（2026-08-22 ぼーるくん指摘）。
      const rowSpans = await Promise.all(appointmentsToInsert.map(async (row: any) =>
        buildStaffSpans({
          startTime: row.start_time,
          endTime: row.end_time ?? null,
          staffId: row.staff_id ?? null,
          // 行ごとにメニューが違うことがあるので、その行の主メニューの所要時間を使う
          // （全行を durationMinutes 固定にすると比率が狂う。2026-08-22 検品指摘）
          mainMinutes: (row.course_id ? courseById.get(row.course_id)?.durationMinutes : null) ?? durationMinutes,
          additionalStaff: (row.additional_staff ?? null) as { staff_id: string }[] | null,
          additionalCourses: (row.additional_courses ?? null) as { course_id: string }[] | null,
          additionalMinutes: await Promise.all(
            ((row.additional_courses ?? []) as { course_id?: string }[]).map(async (ac) => {
              if (!ac?.course_id) return null;
              const { data } = await supabase
                .from("reservation_courses").select("duration_minutes")
                .eq("id", ac.course_id).eq("clinic_id", clinicId).maybeSingle();
              const d = (data as { duration_minutes?: number | null } | null)?.duration_minutes;
              return d && d > 0 ? d : null;
            }),
          ),
          fallbackMinutes: durationMinutes,
        }),
      ));

      for (let i = 0; i < appointmentsToInsert.length; i++) {
        const row = appointmentsToInsert[i] as any;
        if (!row.staff_id) continue; // 担当未設定はレーンの概念がないので対象外
        let hitLabel: string | null = null;
        for (const sp of rowSpans[i]) {
          const label = staffNameById.get(sp.staffId) ?? "担当者";
          // (a) いま登録しようとしている行どうしのかぶり（まとめ予約で同じ枠を2回選んだ場合）
          const selfHit = rowSpans.some((other, j) =>
            j < i && other.some((o) =>
              o.staffId === sp.staffId &&
              new Date(o.startIso) < new Date(sp.endIso) &&
              new Date(o.endIso) > new Date(sp.startIso)),
          );
          // (b) すでに入っている予約とのかぶり（他の経路と同じ共通ガードを使う）
          const conf = selfHit ? null : await findLaneConflict(
            supabase, clinicId, sp.staffId, sp.startIso, sp.endIso,
            undefined, slotMinutesForSpans,
          );
          if (selfHit || conf) { hitLabel = label; break; }
        }
        if (hitLabel) {
          conflictRows.add(i);
          const line = `${fmt(row.start_time)} ${hitLabel}さん`;
          if (!conflicts.includes(line)) conflicts.push(line);
        }
      }
      if (conflicts.length > 0 && canOverrideOverlap(role, allowOverlap)) {
        // 院長が承知のうえで通した記録を、実際にかぶった行だけに残す
        for (const i of conflictRows) {
          const row = appointmentsToInsert[i] as any;
          row.memo = withOverlapStamp(row.memo as string | null);
        }
      }
      if (conflicts.length > 0 && !canOverrideOverlap(role, allowOverlap)) {
        return {
          success: false,
          overlap: true as const,
          needsOwner: true as const,
          error:
            `同じ担当の時間かぶりがあるため登録できません。\n\n` +
            `${conflicts.join("\n")}\n\n` +
            `すでに別のご予約が入っています。担当者を変えるか、時間をずらしてから登録してください。`,
        };
      }
    }

    // tenant-isolation-ignore: appointmentsToInsert の各行に clinic_id を埋め込み済み（L143）
    const { error: appointmentErr } = await supabase
      .from("appointments")
      .insert(appointmentsToInsert);

    if (appointmentErr) {
      console.error("Appointment insertion error:", appointmentErr);
      // 除外制約（prevent_overlap の担当＝さみ/水素/ヘッドスパ が時間かぶり）を分かりやすい文言に。
      // PostgreSQL exclusion_violation = 23P01 / 制約名 appointments_single_resource_no_overlap。
      const isOverlap =
        (appointmentErr as any).code === "23P01" ||
        /single_resource_no_overlap|exclusion/i.test((appointmentErr as any).message ?? "");
      if (isOverlap) {
        const staffLabel = staffName || "担当者";
        // まとめ予約は1回の insert なので、1件でも重なると全件入らない（部分登録は起きない）。
        // どの日が重なったかは insert のエラーからは分からないため、見直しを促す文言にする。
        return {
          success: false,
          overlap: true as const,
          error: allStarts.length > 1
            ? `選んだ日時のどれかに、${staffLabel}さんの別のご予約が入っています。まとめ予約は1件でも重なると登録されないので、日時を見直してください。`
            : `${staffLabel}さんは、この時間にすでに別のご予約が入っています。担当者か時間を変えてください。`,
        };
      }
      return { success: false, error: `予約情報の登録に失敗しました: ${appointmentErr.message}` };
    }

    // ── 「施術前/後に○○を追加」（新規追加時）：設定の addon_course_id を、最初の予約の直前・直後 or 同時刻に入れる ──
    const addAddon = formData.get("addAddon") === "true";
    const rawAddonTiming = formData.get("addonTiming") as string;
    const addonTiming: "before" | "after" | "same" =
      rawAddonTiming === "same" ? "same" : rawAddonTiming === "before" ? "before" : "after";
    if (addAddon) {
      try {
        const { data: cs } = await supabase
          .from("clinic_settings")
          .select("addon_course_id")
          .eq("id", clinicId)
          .maybeSingle();
        const addonId = (cs?.addon_course_id as string | null) ?? null;
        const { data: addon } = addonId
          ? await supabase
              .from("reservation_courses")
              .select("id, name, duration_minutes, required_staff_id, allow_concurrent")
              .eq("id", addonId)
              .eq("clinic_id", clinicId)
              .maybeSingle()
          : { data: null as { id: string; name: string; duration_minutes: number | null; required_staff_id: string | null; allow_concurrent: boolean | null } | null };
        if (addon && addon.id !== courseId) {
          // 「同時刻」は allow_concurrent（水素など）だけ許可。それ以外は施術後に回す。
          // 「施術前」は施術開始の直前に収める（水素を吸ってからトレーニング→施術など）。
          const effectiveTiming: "before" | "after" | "same" =
            addonTiming === "same"
              ? (addon.allow_concurrent === true ? "same" : "after")
              : addonTiming; // "before" or "after"
          const aDur = Number(addon.duration_minutes ?? 30) || 30;
          const aStaffId = (addon.required_staff_id as string | null) ?? null;
          const aName = addon.name as string;

          // 担当(レーン)の表示名は担当者名にする（コース名だとレーンに「電気鍼」と出る）
          let aStaffName: string | null = null;
          if (aStaffId) {
            const { data: aStaffRow } = await supabase
              .from("reservation_staff").select("name")
              .eq("id", aStaffId).eq("clinic_id", clinicId).maybeSingle();
            aStaffName = (aStaffRow?.name as string | null) ?? null;
          }

          // まとめ予約では各回の施術それぞれに追加メニューを付ける（1回目だけ水素、では困るため）
          for (const slot of allStarts) {
            const mainStart = slot.start;
            let aStartIso: string;
            let aEndIso: string;
            if (effectiveTiming === "before") {
              aStartIso = new Date(mainStart.getTime() - aDur * 60 * 1000).toISOString();
              aEndIso = mainStart.toISOString();
            } else {
              const aBase = effectiveTiming === "same" ? mainStart : new Date(mainStart.getTime() + durationMinutes * 60 * 1000);
              aStartIso = aBase.toISOString();
              aEndIso = new Date(aBase.getTime() + aDur * 60 * 1000).toISOString();
            }
            let laneFree = true;
            if (aStaffId) {
              const { data: conf } = await supabase
                .from("appointments")
                .select("id")
                .eq("clinic_id", clinicId)
                .eq("staff_id", aStaffId)
                .neq("status", "cancelled")
                .lt("start_time", aEndIso)
                .gt("end_time", aStartIso)
                .limit(1);
              laneFree = !(conf && conf.length > 0);
            }
            if (!laneFree) continue;
            await supabase.from("appointments").insert([{
              customer_id: customerId,
              start_time: aStartIso,
              end_time: aEndIso,
              memo: effectiveTiming === "same" ? `【${aName} 追加・同時刻】` : effectiveTiming === "before" ? `【${aName} 追加・施術前】` : `【${aName} 追加・施術後】`,
              is_first_visit: false,
              status: "confirmed",
              clinic_id: clinicId,
              series_id: seriesId,
              course_id: addon.id,
              course_name: aName,
              ...(aStaffId ? { staff_id: aStaffId, staff_name: aStaffName } : {}),
            }]);
          }
        }
      } catch (e) {
        console.error("manual addon add failed", e);
      }
    }

    // ── 追加メニュー（担当つき）：施術の直後に、その担当の枠として連続で別レコードを作る ──
    // 同じ予約に additional_staff で2人ぶら下げると「誰が何分やったか」が分からず、
    // AI秘書の「複数担当が同時刻」アラートになる。メニュー単位で時間を分けて持たせる。
    const chainWarnings: string[] = [];
    try {
      const rawChain = (formData.get("chainedMenus") as string) || "";
      const items: { courseId: string; staffId: string }[] = rawChain
        ? (JSON.parse(rawChain) as { courseId?: string; staffId?: string }[])
            .filter((it) => it && it.courseId && it.staffId)
            .map((it) => ({ courseId: String(it.courseId), staffId: String(it.staffId) }))
        : [];
      if (items.length > 0) {
        const { data: chainCourses } = await supabase
          .from("reservation_courses")
          .select("id, name, duration_minutes")
          .in("id", [...new Set(items.map((it) => it.courseId))])
          .eq("clinic_id", clinicId);
        const { data: chainStaff } = await supabase
          .from("reservation_staff")
          .select("id, name")
          .in("id", [...new Set(items.map((it) => it.staffId))])
          .eq("clinic_id", clinicId);
        const courseMap = new Map((chainCourses ?? []).map((c) => [c.id as string, c]));
        const staffMap = new Map((chainStaff ?? []).map((s) => [s.id as string, s]));

        // まとめ予約では各回の施術それぞれに付ける（1回目だけ、では困るため）
        for (const slot of allStarts) {
          // 主施術の終わりから積み上げる
          let cursor = new Date(slot.start.getTime() + durationMinutes * 60 * 1000);
          for (const it of items) {
            const c = courseMap.get(it.courseId);
            const s = staffMap.get(it.staffId);
            // 他院IDや無効値は無視（fail-closed）
            if (!c || !s) continue;
            const dur = Number(c.duration_minutes ?? durationMinutes) || durationMinutes;
            const startIso = cursor.toISOString();
            const endIso = new Date(cursor.getTime() + dur * 60 * 1000).toISOString();
            cursor = new Date(cursor.getTime() + dur * 60 * 1000);

            // その担当の枠が空いているか（ダブルブッキング防止）
            const { data: conf } = await supabase
              .from("appointments")
              .select("id")
              .eq("clinic_id", clinicId)
              .eq("staff_id", it.staffId)
              .neq("status", "cancelled")
              .lt("start_time", endIso)
              .gt("end_time", startIso)
              .limit(1);
            if (conf && conf.length > 0) {
              const t = new Date(startIso).toLocaleTimeString("ja-JP", {
                timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false,
              });
              chainWarnings.push(`${s.name}／${c.name}（${t}〜）は先約があるため登録していません`);
              continue;
            }

            const { error: chainErr } = await supabase.from("appointments").insert([{
              customer_id: customerId,
              start_time: startIso,
              end_time: endIso,
              memo: `【${c.name} 続けて施術】`,
              is_first_visit: false,
              status: "confirmed",
              clinic_id: clinicId,
              series_id: seriesId,
              course_id: c.id,
              course_name: c.name,
              staff_id: s.id,
              staff_name: s.name,
            }]);
            if (chainErr) {
              console.error("chained menu insert failed", chainErr);
              chainWarnings.push(`${s.name}／${c.name} の登録に失敗しました`);
            }
          }
        }
      }
    } catch (e) {
      console.error("chained menus add failed", e);
    }

    // ── ダブル施術：相方の施術を「主施術の直後に連続」で別レコード作成する ──
    // 同時刻に2人で相乗りさせず、相方ぶんの時間をきちんと確保する（前後に時間が要るため）。
    const doublePartnerStaffId = (formData.get("doublePartnerStaffId") as string) || "";
    const doublePartnerCourseId = (formData.get("doublePartnerCourseId") as string) || "";
    if (doublePartnerStaffId) {
      try {
        // 相方の担当名・コース（あれば所要時間もコースに合わせる）
        const { data: pStaff } = await supabase
          .from("reservation_staff")
          .select("id, name")
          .eq("id", doublePartnerStaffId)
          .eq("clinic_id", clinicId)
          .maybeSingle();
        const { data: pCourse } = doublePartnerCourseId
          ? await supabase
              .from("reservation_courses")
              .select("id, name, duration_minutes")
              .eq("id", doublePartnerCourseId)
              .eq("clinic_id", clinicId)
              .maybeSingle()
          : { data: null as { id: string; name: string; duration_minutes: number | null } | null };
        const pDur = Number(pCourse?.duration_minutes ?? durationMinutes) || durationMinutes;
        const pStaffName = (pStaff?.name as string | null) ?? null;
        const pCourseName = (pCourse?.name as string | null) ?? pStaffName ?? "施術";

        for (const slot of allStarts) {
          // 相方は「主施術が終わった直後」から開始（連続）
          const pStart = new Date(slot.start.getTime() + durationMinutes * 60 * 1000);
          const pStartIso = pStart.toISOString();
          const pEndIso = new Date(pStart.getTime() + pDur * 60 * 1000).toISOString();

          // 相方レーンの時間帯が空いているときだけ入れる（埋まっていればスキップ）
          let laneFree = true;
          const { data: conf } = await supabase
            .from("appointments")
            .select("id")
            .eq("clinic_id", clinicId)
            .eq("staff_id", doublePartnerStaffId)
            .neq("status", "cancelled")
            .lt("start_time", pEndIso)
            .gt("end_time", pStartIso)
            .limit(1);
          laneFree = !(conf && conf.length > 0);
          if (!laneFree) continue;

          await supabase.from("appointments").insert([{
            customer_id: customerId,
            start_time: pStartIso,
            end_time: pEndIso,
            memo: "【ダブル施術・主施術の直後】",
            is_first_visit: false,
            status: "confirmed",
            clinic_id: clinicId,
            series_id: seriesId,
            staff_id: doublePartnerStaffId,
            staff_name: pStaffName ?? pCourseName,
            ...(pCourse ? { course_id: pCourse.id, course_name: pCourseName } : { course_name: pCourseName }),
          }]);
        }
      } catch (e) {
        console.error("double treatment partner add failed", e);
      }
    }

    // ── 監査ログ + スタッフ操作通知 ──
    const auth = await checkAdminAuth();
    await writeAudit({
      clinicId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      actionType: "appointment.create",
      targetTable: "appointments",
      targetId: customerId,
      after: { customerName: name.trim(), date: rawDate, time, count: appointmentsToInsert.length },
    });
    await notifyOwnerOfStaffAction({
      clinicId,
      actorRole: auth.role,
      actorEmail: auth.email,
      actionType: "予約の新規作成",
      summary: `${name.trim()}様の予約を作成（${rawDate} ${time}、${appointmentsToInsert.length}件）${reassignReport ? `\n※ ${reassignReport}` : ""}`,
    });
    // ポイント加算（予約作成 1 件につき 5pt × 件数）
    for (let i = 0; i < appointmentsToInsert.length; i++) {
      await awardPoints({
        clinicId,
        userId: auth.userId,
        userEmail: auth.email,
        reason: "appointment.create",
        sourceTable: "appointments",
        sourceId: customerId,
      });
    }

    revalidatePath("/admin/appointments");
    revalidatePath("/admin");
    return chainWarnings.length > 0
      ? { success: true, warning: chainWarnings.join("\n") }
      : { success: true };
  } catch (err: any) {
    console.error(err);
    return { success: false, error: err?.message ?? "予期せぬエラーが発生しました" };
  }
}

// 予約ステータスの変更アクション
export async function updateAppointmentStatus(appointmentId: string, newStatus: "confirmed" | "cancelled" | "pending" | "waiting") {
  const auth = await checkAdminAuth();
  try {
      const supabase = await getSupabase();
      // 変更前を保存（監査用）
      const { data: before } = await supabase
        .from("appointments")
        .select("id, status, start_time, customers(name)")
        .eq("id", appointmentId)
        .eq("clinic_id", auth.clinicId)
        .maybeSingle();

      const { error } = await supabase
        .from("appointments")
        .update({ status: newStatus })
        .eq("id", appointmentId)
        .eq("clinic_id", auth.clinicId);

      if (error) {
        console.error("Failed to update status:", error);
        return { success: false, error: "ステータスの更新に失敗しました" };
      }

      const customerName = Array.isArray(before?.customers) ? before?.customers[0]?.name : (before?.customers as any)?.name;
      await writeAudit({
        clinicId: auth.clinicId,
        actorUserId: auth.userId,
        actorEmail: auth.email,
        actorRole: auth.role,
        actionType: "appointment.status",
        targetTable: "appointments",
        targetId: appointmentId,
        before: { status: before?.status },
        after: { status: newStatus },
      });
      await notifyOwnerOfStaffAction({
        clinicId: auth.clinicId,
        actorRole: auth.role,
        actorEmail: auth.email,
        actionType: `予約ステータス変更（${before?.status ?? "?"} → ${newStatus}）`,
        summary: `${customerName ?? "(顧客名不明)"}様 / ${before?.start_time ?? ""}\nID: ${appointmentId}`,
      });

      revalidatePath("/admin/appointments");
      revalidatePath("/admin");
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

export async function updateAppointmentDetails(
  appointmentId: string,
  newDateStr: string,
  newTimeStr: string,
  memo: string,
  isFirstVisit: boolean,
  durationMinutes: number = 30,
  // コース・スタッフ・個室の更新（任意）
  // - undefined : この呼び出しでは変更しない（既存値を維持）
  // - null      : 明示的にクリア
  // - string    : この ID に変更（マスタにない場合は保存しない）
  options?: {
    courseId?: string | null;
    staffId?: string | null;
    roomId?: string | null;
    // 追加メニュー・追加担当（同じ予約にひもづく2件目以降）
    // - undefined  : 変更しない
    // - []         : 全部外す
    // - string[]   : この ID 群に置き換える（マスタにない ID は無視）
    additionalCourseIds?: string[];
    additionalStaffIds?: string[];
    /** 担当かぶりを承知で通す（オーナーのみ有効。スタッフが送っても role で弾く） */
    allowOverlap?: boolean;
  }
) {
  const auth = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    if (supabase) {
      // 変更前を保存
      const { data: before } = await supabase
        .from("appointments")
        .select("id, start_time, end_time, memo, is_first_visit, course_id, course_name, staff_id, staff_name, room_id, room_name, additional_courses, additional_staff, customers(name)")
        .eq("id", appointmentId)
        .eq("clinic_id", auth.clinicId)
        .maybeSingle();

      const startDateTimeStr = `${newDateStr}T${newTimeStr}:00+09:00`;
      const endDate = new Date(new Date(startDateTimeStr).getTime() + durationMinutes * 60 * 1000);

      // コース/スタッフ/個室のマスタ名解決
      const resolveName = async (table: string, id: string) => {
        const { data } = await supabase
          .from(table)
          .select("id,name")
          .eq("id", id)
          .eq("clinic_id", auth.clinicId)
          .maybeSingle();
        return data?.name ?? null;
      };

      const updatePayload: Record<string, unknown> = {
        start_time: startDateTimeStr,
        end_time: endDate.toISOString(),
        memo,
        is_first_visit: isFirstVisit,
      };

      if (options && "courseId" in options) {
        if (options.courseId === null) {
          updatePayload.course_id = null;
          updatePayload.course_name = null;
        } else if (typeof options.courseId === "string") {
          const name = await resolveName("reservation_courses", options.courseId);
          if (name) {
            updatePayload.course_id = options.courseId;
            updatePayload.course_name = name;
          }
        }
      }
      if (options && "staffId" in options) {
        if (options.staffId === null) {
          updatePayload.staff_id = null;
          updatePayload.staff_name = null;
        } else if (typeof options.staffId === "string") {
          const name = await resolveName("reservation_staff", options.staffId);
          if (name) {
            updatePayload.staff_id = options.staffId;
            updatePayload.staff_name = name;
          }
        }
      }
      if (options && "roomId" in options) {
        if (options.roomId === null) {
          updatePayload.room_id = null;
          updatePayload.room_name = null;
        } else if (typeof options.roomId === "string") {
          const name = await resolveName("reservation_rooms", options.roomId);
          if (name) {
            updatePayload.room_id = options.roomId;
            updatePayload.room_name = name;
          }
        }
      }

      // 追加メニュー・追加担当の置き換え。
      // 新規登録時（createManualReservation）と同じく、マスタから名前を引いて
      // {course_id, course_name} / {staff_id, staff_name} の形で保存する。
      // 他院の ID が混ざらないよう clinic_id 付きで引き、見つからない ID は落とす。
      const resolveRefs = async (
        table: "reservation_courses" | "reservation_staff",
        ids: string[],
      ): Promise<{ id: string; name: string }[]> => {
        const uniq = [...new Set(ids.filter(Boolean))];
        if (uniq.length === 0) return [];
        const { data } = await supabase
          .from(table)
          .select("id, name")
          .eq("clinic_id", auth.clinicId)
          .in("id", uniq);
        const byId = new Map((data ?? []).map((r: any) => [r.id as string, r.name as string]));
        // 画面で並べた順を保つ（マスタの返却順ではなく、選ばれた順）
        return uniq.flatMap((id) => {
          const name = byId.get(id);
          return name ? [{ id, name }] : [];
        });
      };

      if (options && Array.isArray(options.additionalCourseIds)) {
        const refs = await resolveRefs("reservation_courses", options.additionalCourseIds);
        updatePayload.additional_courses = refs.length > 0
          ? refs.map((r) => ({ course_id: r.id, course_name: r.name }))
          : null;
      }
      if (options && Array.isArray(options.additionalStaffIds)) {
        const refs = await resolveRefs("reservation_staff", options.additionalStaffIds);
        updatePayload.additional_staff = refs.length > 0
          ? refs.map((r) => ({ staff_id: r.id, staff_name: r.name }))
          : null;
      }

      // ── 担当かぶりの最終ガード（fail-closed・2026-08-22 ぼーるくん依頼） ──
      // 時間や担当を変えたときに、同じ先生の別の予約と重ならないか必ず確認する。
      // prevent_overlap=true の担当は DB の除外制約が弾くが、
      // からだ鍼灸整骨院のように全員 false の院は DB では止まらないため、ここで止める。
      // 自分自身（appointmentId）は当然重なるので除外する。
      {
        const effStaffId =
          ("staff_id" in updatePayload)
            ? (updatePayload.staff_id as string | null)
            : ((before?.staff_id as string | null) ?? null);
        // 時間も担当も変えていない（メモや初診/再診だけ直した）ときは確認しない。
        // すでにかぶっている予約のメモを直すだけなのに保存できない、では現場が詰む。
        // かぶりを増やす操作＝「時間を動かす」「担当を変える」だけを止める。
        const timeChanged =
          !before?.start_time ||
          new Date(before.start_time as string).getTime() !== new Date(startDateTimeStr).getTime() ||
          !before?.end_time ||
          new Date(before.end_time as string).getTime() !== endDate.getTime();
        const staffChanged = effStaffId !== ((before?.staff_id as string | null) ?? null);
        if (effStaffId && (timeChanged || staffChanged)) {
          // この予約を「先生ごとの受け持ち時間」に分けてから確認する。
          // 複数担当は前後に分かれるので、主担当が全時間を占有する扱いだと誤判定になる。
          const effCourseId = ("course_id" in updatePayload)
            ? (updatePayload.course_id as string | null)
            : ((before?.course_id as string | null) ?? null);
          const effAddStaff = ("additional_staff" in updatePayload)
            ? (updatePayload.additional_staff as { staff_id: string }[] | null)
            : ((before?.additional_staff as { staff_id: string }[] | null) ?? null);
          const effAddCourses = ("additional_courses" in updatePayload)
            ? (updatePayload.additional_courses as { course_id: string }[] | null)
            : ((before?.additional_courses as { course_id: string }[] | null) ?? null);
          const durationOf = async (courseId: string | null | undefined) => {
            if (!courseId) return null;
            const { data } = await supabase
              .from("reservation_courses").select("duration_minutes")
              .eq("id", courseId).eq("clinic_id", auth.clinicId).maybeSingle();
            const d = (data as { duration_minutes?: number | null } | null)?.duration_minutes;
            return d && d > 0 ? d : null;
          };
          // 既存予約の割れ方を左右するので、fallback は必ず院の枠サイズを使う
          // （編集中の予約の長さを渡すと相手側の割れ方まで変わる。2026-08-22 検品指摘）
          const editSlotMinutes = await getCurrentSlotDuration();
          const editSpans = buildStaffSpans({
            startTime: new Date(startDateTimeStr).toISOString(),
            endTime: endDate.toISOString(),
            staffId: effStaffId,
            mainMinutes: await durationOf(effCourseId),
            additionalStaff: effAddStaff,
            additionalCourses: effAddCourses,
            additionalMinutes: await Promise.all(
              (effAddCourses ?? []).map((ac) => durationOf(ac?.course_id)),
            ),
            fallbackMinutes: editSlotMinutes,
          });
          let hit: Awaited<ReturnType<typeof findLaneConflict>> = null;
          let hitStaffId: string | null = null;
          for (const sp of editSpans) {
            hit = await findLaneConflict(
              supabase, auth.clinicId, sp.staffId, sp.startIso, sp.endIso, appointmentId,
              editSlotMinutes,
            );
            if (hit) { hitStaffId = sp.staffId; break; }
          }
          if (hit && canOverrideOverlap(auth.role, options?.allowOverlap === true)) {
            // 院長が承知のうえで通した記録を残す
            updatePayload.memo = withOverlapStamp(memo);
          } else if (hit) {
            // かぶったのが追加担当の区間なら、その先生の名前を出す。
            // 主担当の名前で決め打ちすると「森川さんは…」と出てしまい、
            // 実際にかぶっている藤川先生のことだと分からない（2026-08-22 検品指摘）。
            let hitStaffName: string | null = null;
            if (hitStaffId) {
              const { data: hs } = await supabase
                .from("reservation_staff").select("name")
                .eq("id", hitStaffId).eq("clinic_id", auth.clinicId).maybeSingle();
              hitStaffName = (hs as { name?: string } | null)?.name ?? null;
            }
            const staffLabel =
              hitStaffName ||
              (updatePayload.staff_name as string | undefined) ||
              (before?.staff_name as string | undefined) ||
              "担当者";
            const other = hit.customerName;
            const range = describeLaneConflictRange(hit);
            return {
              success: false,
              overlap: true as const,
              needsOwner: true as const,
              error:
                `${staffLabel}さんは、この時間にすでに別のご予約が入っています（${range}${other ? ` ${other}様` : ""}）。\n` +
                `同じ担当の重複予約はできません。担当者を変えるか、時間をずらしてください。`,
            };
          }
        }
      }

      const { error } = await supabase
        .from("appointments")
        .update(updatePayload)
        .eq("id", appointmentId)
        .eq("clinic_id", auth.clinicId);

      if (error) {
        console.error("Failed to update appointment:", error);
        // 除外制約（同じ担当者の予約時間が重なる）を分かりやすい文言にする。
        // PostgreSQL exclusion_violation = 23P01 / 制約名 appointments_single_resource_no_overlap。
        const isOverlap =
          (error as any).code === "23P01" ||
          /single_resource_no_overlap|exclusion/i.test((error as any).message ?? "");
        if (isOverlap) {
          const staffLabel = (updatePayload.staff_name as string | undefined) || "担当者";
          return {
            success: false,
            overlap: true as const,
            error: `${staffLabel}さんは、この時間にすでに別のご予約が入っています。担当者か時間を変えてください。（同じ担当者の重複予約はできません）`,
          };
        }
        return { success: false, error: "予約の更新に失敗しました" };
      }

      const customerName = Array.isArray(before?.customers) ? before?.customers[0]?.name : (before?.customers as any)?.name;
      await writeAudit({
        clinicId: auth.clinicId,
        actorUserId: auth.userId,
        actorEmail: auth.email,
        actorRole: auth.role,
        actionType: "appointment.update",
        targetTable: "appointments",
        targetId: appointmentId,
        before: {
          start_time: before?.start_time, memo: before?.memo, is_first_visit: before?.is_first_visit,
          course_name: before?.course_name, staff_name: before?.staff_name, room_name: before?.room_name,
        },
        after: { ...updatePayload },
      });
      await notifyOwnerOfStaffAction({
        clinicId: auth.clinicId,
        actorRole: auth.role,
        actorEmail: auth.email,
        actionType: "予約の内容変更",
        summary: `${customerName ?? "(顧客名不明)"}様\n旧: ${before?.start_time ?? ""}\n新: ${newDateStr} ${newTimeStr}\nメモ: ${memo}`,
      });

      revalidatePath("/admin/appointments");
      revalidatePath("/admin/counter");
      revalidatePath("/admin");
    }
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

// 患者のLINEに予約確認メッセージを送信するアクション
export async function sendLineConfirmation(appointmentId: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    if (!supabase) return { success: false, error: "DB接続エラー" };

    // 予約と顧客情報を取得（自院のみ）
    const { data: apt, error } = await supabase
      .from("appointments")
      .select("id, customer_id, start_time, end_time, is_first_visit, status, course_name, additional_courses, customers(name)")
      .eq("clinic_id", clinicId)
      .eq("id", appointmentId)
      .single();

    if (error || !apt) return { success: false, error: "予約情報の取得に失敗しました" };

    const customer = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;

    // 送信先は customer_line_links（家族紐付け）と customers.line_user_id の両方から取る。
    // 片方だけ見ると、兄弟の2人目など is_primary=false の人が「未連携」で送れなくなる。
    const lineUserIds = await getPushTargetsForCustomer(apt.customer_id as string, clinicId);

    if (lineUserIds.length === 0) {
      return { success: false, error: "この患者のLINE IDが未登録です。患者がLINE公式アカウントにメッセージを送ると登録されます。" };
    }

    // 動的トークン取得（LINE_CHANNEL_ID/SECRET 経由が優先、static token はフォールバック）
    const token = await getLineAccessToken();
    if (!token) {
      return { success: false, error: "LINE トークンが取得できません。env LINE_CHANNEL_ID/SECRET または LINE_CHANNEL_ACCESS_TOKEN を確認してください。" };
    }

    // 施術時間は end_time から実データで出す。初診/再診からの決め打ちは事故のもと（appointment-summary.ts 参照）
    const dateTimeStr = formatDateTimeLine(apt);
    const visitLabel = formatVisitLabel(apt);
    const statusLabel = apt.status === "confirmed" ? "✅ 予約確定" : "⏳ 確認待ち";
    const reservationNumber = apt.id.split("-")[0].toUpperCase();

    const messageText = `${statusLabel}\n\n${customer?.name || ""}様の予約内容をお知らせします。\n\n📅 日時: ${dateTimeStr}\n🏥 種別: ${visitLabel}\n📋 予約番号: ${reservationNumber}\n\nご来院をお待ちしております。`;

    // 紐付いている LINE すべてへ送る（親のLINEに兄弟2人分が紐付いている場合など）
    let sent = 0;
    let lastError: { success: false; error: string } | null = null;
    for (const lineUserId of lineUserIds) {
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: messageText }] }),
      });

      if (res.ok) {
        sent++;
        continue;
      }

      const errBody = await res.json().catch(() => ({}));
      console.error(`[LINE送信失敗] status=${res.status}`, errBody);
      // status code に応じた具体的なエラー（友だち追加してないと一律で返さない）
      if (res.status === 401) {
        lastError = { success: false, error: "LINE 認証エラー。設定の LINE_CHANNEL_ID/SECRET が正しいか確認してください。" };
      } else if (res.status === 403) {
        lastError = { success: false, error: "この患者は LINE 公式アカウントの友だち登録が解除されているか、まだ追加していません。患者に友だち追加を案内してください。" };
      } else {
        const detail = errBody?.message ? `（${errBody.message}）` : "";
        lastError = { success: false, error: `LINE 送信失敗 (HTTP ${res.status})${detail}` };
      }
    }

    if (sent === 0 && lastError) return lastError;

    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

// ===== 受付カウンター：チェックインステータス更新 =====

export type CheckinStatus = "arrived" | "in_treatment" | "done" | null;

export async function updateCheckinStatus(
  appointmentId: string,
  status: CheckinStatus,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { clinicId } = await checkAdminAuth();
    const supabase = getAdminSupabase();
    if (!supabase) return { success: false, error: "サーバー設定エラー" };

    const { error } = await supabase
      .from("appointments")
      .update({ checkin_status: status })
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/admin/counter");
    return { success: true };
  } catch (err) {
    console.error("updateCheckinStatus error:", err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

/**
 * 同じ人の同じ日の予約をまとめて会計済（などのステータス）にする。
 *
 * 日計表は「同じ人・同じ日」を1行にまとめて表示するため、保険＋鍼灸のように
 * その日に2件予約がある方は、1件目だけ done にしても行の表示は未会計のままだった
 * （表示はその人の一番手前のステータスを採用しているため）。
 * 会計は人単位なので、その行にぶら下がる予約を全部まとめて更新する。
 */
export async function updateCheckinStatusMany(
  appointmentIds: string[],
  status: CheckinStatus,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ids = Array.from(new Set((appointmentIds ?? []).filter(Boolean)));
    if (ids.length === 0) return { success: true };

    const { clinicId } = await checkAdminAuth();
    const supabase = getAdminSupabase();
    if (!supabase) return { success: false, error: "サーバー設定エラー" };

    const { error } = await supabase
      .from("appointments")
      .update({ checkin_status: status })
      .in("id", ids)
      .eq("clinic_id", clinicId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/admin/counter");
    return { success: true };
  } catch (err) {
    console.error("updateCheckinStatusMany error:", err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

// ── 初診受付チェックリスト ──────────────────────────────────────────────

export type IntakeCheckKey =
  | "explanation"   // 回答書の説明
  | "personal_info" // レセコンに個人情報入力
  | "injury_info"   // 負傷名・負傷原因入力
  | "karte_print"   // カルテ印刷
  | "insurance_confirm"; // 印刷物と保険証の確認

export type IntakeCheckItem = { checked: boolean; by?: string; at?: string };
export type IntakeChecklist = Partial<Record<IntakeCheckKey, IntakeCheckItem>>;

/** 指定した項目にチェックを入れる（staffName = チェックした人）。チェック済みを再度押すと解除。 */
export async function updateIntakeChecklistItem(
  appointmentId: string,
  key: IntakeCheckKey,
  staffName: string,
): Promise<{ success: boolean; error?: string; checklist?: IntakeChecklist }> {
  try {
    const { clinicId } = await checkAdminAuth();
    const supabase = getAdminSupabase();
    if (!supabase) return { success: false, error: "サーバー設定エラー" };

    const { data: apt } = await supabase
      .from("appointments")
      .select("intake_checklist")
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId)
      .maybeSingle();

    const current = ((apt?.intake_checklist ?? {}) as IntakeChecklist);
    const wasChecked = current[key]?.checked === true;

    const updated: IntakeChecklist = {
      ...current,
      [key]: wasChecked
        ? { checked: false }
        : { checked: true, by: staffName, at: new Date().toISOString() },
    };

    const { error } = await supabase
      .from("appointments")
      .update({ intake_checklist: updated })
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId);

    if (error) return { success: false, error: error.message };
    return { success: true, checklist: updated };
  } catch {
    return { success: false, error: "チェックの保存に失敗しました" };
  }
}

/** 保険証変更フラグをトグルする（ONにすると初診チェックリストが表示される）。 */
export async function toggleInsuranceChanged(
  appointmentId: string,
  value: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { clinicId } = await checkAdminAuth();
    const supabase = getAdminSupabase();
    if (!supabase) return { success: false, error: "サーバー設定エラー" };

    const { error } = await supabase
      .from("appointments")
      .update({ insurance_changed: value })
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch {
    return { success: false, error: "更新に失敗しました" };
  }
}

export async function markAppointmentNoShow(
  appointmentId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await checkAdminAuth();
    const supabase = getAdminSupabase();
    if (!supabase) return { success: false, error: "サーバー設定エラー" };

    const { data: before } = await supabase
      .from("appointments")
      .select("id, start_time, status, customers(name)")
      .eq("id", appointmentId)
      .eq("clinic_id", auth.clinicId)
      .maybeSingle();

    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled", checkin_status: null, no_show: true })
      .eq("id", appointmentId)
      .eq("clinic_id", auth.clinicId);

    if (error) return { success: false, error: error.message };

    const customerName = Array.isArray(before?.customers) ? before?.customers[0]?.name : (before?.customers as any)?.name;
    await writeAudit({
      clinicId: auth.clinicId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      actionType: "appointment.no_show",
      targetTable: "appointments",
      targetId: appointmentId,
      before,
      after: { status: "cancelled" },
    });
    await notifyOwnerOfStaffAction({
      clinicId: auth.clinicId,
      actorRole: auth.role,
      actorEmail: auth.email,
      actionType: "予約を未来院（NoShow）扱いに",
      summary: `${customerName ?? "(顧客名不明)"}様\n日時: ${before?.start_time ?? ""}\nID: ${appointmentId}`,
    });
    await awardPoints({
      clinicId: auth.clinicId,
      userId: auth.userId,
      userEmail: auth.email,
      reason: "appointment.no_show",
      sourceTable: "appointments",
      sourceId: appointmentId,
    });

    revalidatePath("/admin/counter");
    revalidatePath("/admin/appointments");
    revalidatePath("/admin/sales");
    return { success: true };
  } catch (err) {
    console.error("markAppointmentNoShow error:", err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

/**
 * 院都合キャンセル。
 * 本人はキャンセルしていないが、院側の都合（水素を当日できなかった等）で
 * やむなくキャンセル扱いにするケース。
 * cancel_kind='clinic_reason' で記録し、no_show は付けない。
 * → 顧客一覧のキャンセル回数にも未来院にも数えない。仕分け不要。
 */
export async function markAppointmentClinicCancel(
  appointmentId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await checkAdminAuth();
    const supabase = getAdminSupabase();
    if (!supabase) return { success: false, error: "サーバー設定エラー" };

    const { data: before } = await supabase
      .from("appointments")
      .select("id, start_time, status, no_show, cancel_kind, customers(name)")
      .eq("id", appointmentId)
      .eq("clinic_id", auth.clinicId)
      .maybeSingle();

    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled", checkin_status: null, no_show: false, cancel_kind: "clinic_reason" })
      .eq("id", appointmentId)
      .eq("clinic_id", auth.clinicId);

    if (error) return { success: false, error: error.message };

    await writeAudit({
      clinicId: auth.clinicId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      actionType: "appointment.clinic_cancel",
      targetTable: "appointments",
      targetId: appointmentId,
      before,
      after: { status: "cancelled", no_show: false, cancel_kind: "clinic_reason" },
    });

    revalidatePath("/admin/counter");
    revalidatePath("/admin/appointments");
    revalidatePath("/admin/sales");
    revalidatePath("/admin/customers");
    return { success: true };
  } catch (err) {
    console.error("markAppointmentClinicCancel error:", err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

export async function completeAllActiveAppointments(
  appointmentIds: string[],
): Promise<{ success: boolean; updatedCount?: number; error?: string }> {
  try {
    const { clinicId } = await checkAdminAuth();
    const supabase = getAdminSupabase();
    if (!supabase) return { success: false, error: "サーバー設定エラー" };

    const uniqueIds = Array.from(new Set(appointmentIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return { success: false, error: "対象の予約がありません" };
    }

    const { error } = await supabase
      .from("appointments")
      .update({ checkin_status: "done" })
      .eq("clinic_id", clinicId)
      .neq("status", "cancelled")
      .in("id", uniqueIds);

    if (error) return { success: false, error: error.message };
    revalidatePath("/admin/counter");
    revalidatePath("/admin/sales");
    return { success: true, updatedCount: uniqueIds.length };
  } catch (err) {
    console.error("completeAllActiveAppointments error:", err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

// ===== 受付カウンター：今日の予約一覧取得 =====

export async function getTodayAppointments() {
  try {
    const { clinicId } = await checkAdminAuth();
    const supabase = getAdminSupabase();
    if (!supabase) return { success: false, data: [] };

    const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const todayStart = `${todayStr}T00:00:00+09:00`;
    const todayEnd   = `${todayStr}T23:59:59+09:00`;

    const { data, error } = await supabase
      .from("appointments")
      .select(`
        id, start_time, end_time, status, checkin_status,
        is_first_visit, memo, course_id, course_name, staff_id, staff_name, room_name,
        customers(id, name, phone, line_user_id, medical_record_number, birth_date, city_name)
      `)
      .eq("clinic_id", clinicId)
      .neq("status", "cancelled")
      .gte("start_time", todayStart)
      .lte("start_time", todayEnd)
      .order("start_time", { ascending: true });

    if (error) return { success: false, data: [] };
    return { success: true, data: data ?? [] };
  } catch (err) {
    console.error("getTodayAppointments error:", err);
    return { success: false, data: [] };
  }
}

export async function getAppointmentsByDate(dateStr: string) {
  try {
    const { clinicId } = await checkAdminAuth();
    const supabase = getAdminSupabase();
    if (!supabase) return { success: false, data: [] };

    const dayStart = `${dateStr}T00:00:00+09:00`;
    const dayEnd   = `${dateStr}T23:59:59+09:00`;

    const { data, error } = await supabase
      .from("appointments")
      .select(`
        id, start_time, end_time, status, checkin_status,
        is_first_visit, insurance_changed, intake_checklist,
        memo, course_id, course_name, staff_id, staff_name, room_name,
        customers(id, name, phone, line_user_id, medical_record_number, birth_date, city_name)
      `)
      .eq("clinic_id", clinicId)
      .neq("status", "cancelled")
      .gte("start_time", dayStart)
      .lte("start_time", dayEnd)
      .order("start_time", { ascending: true });

    if (error) return { success: false, data: [] };

    // 各予約に「前回来院からの経過日数(last_visit_days)」を付与する。
    // → 1ヶ月以上ぶりに来院した患者を「再新患」として受付チェック（傷病理由の再入力）に
    //   回すため。前回の負傷理由と今回が違うことがあるため毎回聞き直す運用に対応。
    const rows = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        start_time: string;
        customers: { id: string } | { id: string }[] | null;
      }
    >;
    // customers はSupabaseの型上は配列だが、実データは to-one の単一オブジェクト。両対応。
    const custId = (c: (typeof rows)[number]["customers"]): string | undefined => {
      if (!c) return undefined;
      const obj = Array.isArray(c) ? c[0] : c;
      return obj?.id;
    };
    const customerIds = Array.from(
      new Set(
        rows.map((a) => custId(a.customers)).filter((v): v is string => !!v),
      ),
    );

    // customerId -> 直近の過去来院 start_time(ISO)
    const lastVisitByCustomer = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: prior } = await supabase
        .from("appointments")
        .select("customer_id, start_time")
        .eq("clinic_id", clinicId)
        .neq("status", "cancelled")
        .in("customer_id", customerIds)
        .lt("start_time", dayStart) // 当日より前の来院のみ
        .order("start_time", { ascending: false });
      for (const p of (prior ?? []) as Array<{ customer_id: string | null; start_time: string }>) {
        if (!p.customer_id) continue;
        // 降順なので最初にヒットしたものが直近の来院
        if (!lastVisitByCustomer.has(p.customer_id)) {
          lastVisitByCustomer.set(p.customer_id, p.start_time);
        }
      }
    }

    const withGap = rows.map((a) => {
      const cid = custId(a.customers);
      const prev = cid ? lastVisitByCustomer.get(cid) : undefined;
      const last_visit_days = prev
        ? Math.floor(
            (new Date(a.start_time).getTime() - new Date(prev).getTime()) / 86_400_000,
          )
        : null;
      return { ...a, last_visit_days };
    });

    return { success: true, data: withGap };
  } catch (err) {
    console.error("getAppointmentsByDate error:", err);
    return { success: false, data: [] };
  }
}

/**
 * 顧客名で直近の予約を1件取得（次回予約のプリセット用）。
 * 売上登録画面の「次回予約」ボタン押下時、過去の予約から
 *   course_id / course_name / staff_id / staff_name / 時刻(hh:mm) / customer_id
 * を取り出して AddAppointmentDialog にプリセット出来るようにする。
 *
 * 同名異人が居る可能性は customer_name 完全一致 + 直近 1件で実用上問題なし
 * （より厳密に絞りたい場合は customer_id 経由で呼ぶこと）。
 */
export async function getLastAppointmentByCustomerName(
  customerName: string,
): Promise<{
  success: boolean;
  data?: {
    customerId: string | null;
    courseId: string | null;
    courseName: string | null;
    staffId: string | null;
    staffName: string | null;
    timeOfDay: string | null; // "HH:mm" JST
  } | null;
  error?: string;
}> {
  try {
    const { clinicId } = await checkAdminAuth();
    const name = customerName.trim();
    if (!name) return { success: true, data: null };

    const supabase = getAdminSupabase();
    if (!supabase) return { success: false, error: "サーバー設定エラー" };

    // 1) 同名 customer を引く（複数ヒット可、最初の1件を採用）
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("name", name)
      .limit(1)
      .maybeSingle();

    const customerId = customer?.id ?? null;

    // 2) 同名の直近 appointment を取得（cancelled は除外）
    let q = supabase
      .from("appointments")
      .select("course_id, course_name, staff_id, staff_name, start_time, customer_id, customers(name)")
      .eq("clinic_id", clinicId)
      .neq("status", "cancelled")
      .order("start_time", { ascending: false })
      .limit(1);

    if (customerId) {
      q = q.eq("customer_id", customerId);
    }

    const { data: aptRows, error: aptErr } = await q;
    if (aptErr) {
      return { success: false, error: aptErr.message };
    }

    // customer_id 経由で取れなかった場合、名前一致で再検索
    let apt = aptRows?.[0] as any | undefined;
    if (!apt && !customerId) {
      const { data: byName } = await supabase
        .from("appointments")
        .select("course_id, course_name, staff_id, staff_name, start_time, customer_id, customers(name)")
        .eq("clinic_id", clinicId)
        .neq("status", "cancelled")
        .order("start_time", { ascending: false })
        .limit(20);
      apt = (byName ?? []).find((r: any) => {
        const n = Array.isArray(r.customers) ? r.customers[0]?.name : r.customers?.name;
        return n === name;
      });
    }

    if (!apt) {
      return { success: true, data: { customerId, courseId: null, courseName: null, staffId: null, staffName: null, timeOfDay: null } };
    }

    // 時刻部分（JST hh:mm）
    let timeOfDay: string | null = null;
    try {
      const t = new Date(apt.start_time);
      const hh = t.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", hour12: false }).padStart(2, "0");
      const mm = t.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", minute: "2-digit" }).padStart(2, "0");
      timeOfDay = `${hh}:${mm}`;
    } catch {}

    return {
      success: true,
      data: {
        customerId: customerId ?? apt.customer_id ?? null,
        courseId: apt.course_id ?? null,
        courseName: apt.course_name ?? null,
        staffId: apt.staff_id ?? null,
        staffName: apt.staff_name ?? null,
        timeOfDay,
      },
    };
  } catch (e: any) {
    console.error("getLastAppointmentByCustomerName error:", e);
    return { success: false, error: e?.message ?? "取得失敗" };
  }
}

// 予約の削除アクション
// scope:
//   "one"    - この予約 1 件のみ削除（既定）
//   "future" - この予約と、同じ series_id を持つこの日以降の連続予約を全削除
export type DeleteAppointmentScope = "one" | "future";

export async function deleteAppointment(
  appointmentId: string,
  scope: DeleteAppointmentScope = "one",
) {
  const auth = await checkAdminAuth();
  try {
    const supabase = getAdminSupabase() || await getSupabase();

    // 削除前に内容を保存（監査・通知用）。series_id と start_time も取得して連続削除に使う。
    const { data: before } = await supabase
      .from("appointments")
      .select("id, start_time, end_time, status, memo, series_id, customers(name, phone)")
      .eq("id", appointmentId)
      .eq("clinic_id", auth.clinicId)
      .maybeSingle();

    if (!before) {
      return { success: false, error: "対象の予約が見つかりませんでした" };
    }

    let deletedCount = 1;

    if (scope === "future" && before.series_id) {
      // 同一シリーズかつこの日時以降を全削除（自分自身も含む）
      const { error, count } = await supabase
        .from("appointments")
        .delete({ count: "exact" })
        .eq("clinic_id", auth.clinicId)
        .eq("series_id", before.series_id)
        .gte("start_time", before.start_time);
      if (error) {
        console.error("Failed to delete appointment series:", error);
        return { success: false, error: "連続予約の削除に失敗しました" };
      }
      deletedCount = count ?? 1;
    } else {
      // 単発削除（series_id が無い、または scope が "one"）
      const { error } = await supabase
        .from("appointments")
        .delete()
        .eq("id", appointmentId)
        .eq("clinic_id", auth.clinicId);
      if (error) {
        console.error("Failed to delete appointment:", error);
        return { success: false, error: "予約の削除に失敗しました" };
      }
    }

    const customerName = Array.isArray(before?.customers) ? before?.customers[0]?.name : (before?.customers as any)?.name;
    await writeAudit({
      clinicId: auth.clinicId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      actionType: scope === "future" ? "appointment.delete_series" : "appointment.delete",
      targetTable: "appointments",
      targetId: appointmentId,
      before: { ...before, deletedCount, scope },
    });
    await notifyOwnerOfStaffAction({
      clinicId: auth.clinicId,
      actorRole: auth.role,
      actorEmail: auth.email,
      actionType: scope === "future" ? "⚠️ 連続予約の一括削除" : "⚠️ 予約の削除",
      summary: scope === "future"
        ? `${customerName ?? "(顧客名不明)"}様\n${before?.start_time ?? ""} 以降の連続予約 ${deletedCount} 件を削除\nメモ: ${before?.memo ?? ""}`
        : `${customerName ?? "(顧客名不明)"}様\n日時: ${before?.start_time ?? ""}\nメモ: ${before?.memo ?? ""}\nID: ${appointmentId}`,
    });

    revalidatePath("/admin/appointments");
    revalidatePath("/admin");

    // キャンセルで枠が空いたので、同日のキャンセル待ち（status="waiting"）がいれば候補を返す。
    // → UI 側で「この方に空きをお知らせしましょう」ポップアップを出し、ワンタップ LINE 通知へ。
    const waitlistCandidates = await findWaitlistCandidatesForDay(supabase, auth.clinicId, before?.start_time ?? null);

    return { success: true, deletedCount, waitlistCandidates };
  } catch (err) {
    console.error(err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

export type WaitlistCandidate = {
  appointmentId: string;
  customerName: string;
  hasLine: boolean;
  startTime: string;
  isFirstVisit: boolean;
};

// 枠が空いたとき、その日のキャンセル待ち（status="waiting"）候補を返す共通処理。
// deleteAppointment と cancelAppointmentKeepRecord の両方から使う。
async function findWaitlistCandidatesForDay(
  supabase: any,
  clinicId: string,
  startTime: string | null,
): Promise<WaitlistCandidate[]> {
  try {
    if (!startTime) return [];
    const freed = new Date(startTime);
    // JST の当日範囲（UTC 換算）を作る
    const jst = new Date(freed.getTime() + 9 * 3600 * 1000);
    const y = jst.getUTCFullYear(), mo = jst.getUTCMonth(), da = jst.getUTCDate();
    const dayStartUtc = new Date(Date.UTC(y, mo, da, 0, 0, 0) - 9 * 3600 * 1000);
    const dayEndUtc = new Date(Date.UTC(y, mo, da + 1, 0, 0, 0) - 9 * 3600 * 1000);
    const { data: waiting } = await supabase
      .from("appointments")
      .select("id, customer_id, start_time, is_first_visit, customers(name)")
      .eq("clinic_id", clinicId)
      .eq("status", "waiting")
      .gte("start_time", dayStartUtc.toISOString())
      .lt("start_time", dayEndUtc.toISOString())
      .order("start_time");
    // LINE連携の有無は links と customers.line_user_id の両方で判定（片方だけだと未連携表示になる）
    const targets = await getPushTargetsForCustomers(
      (waiting ?? []).map((w: any) => w.customer_id as string).filter(Boolean),
      clinicId,
    );
    return (waiting ?? []).map((w: any) => {
      const c = Array.isArray(w.customers) ? w.customers[0] : w.customers;
      return {
        appointmentId: w.id as string,
        customerName: (c?.name as string) ?? "(お名前未登録)",
        hasLine: (targets.get(w.customer_id as string) ?? []).length > 0,
        startTime: w.start_time as string,
        isFirstVisit: !!w.is_first_visit,
      };
    });
  } catch (e) {
    console.error("waitlist lookup after cancel failed:", e);
    return [];
  }
}

/**
 * 予約を「キャンセル」として記録に残す（行は消さない）。
 * カレンダーには薄い文字で「○○様（キャンセル）」と表示され、
 * 患者側の予約サイトではその枠は空きとして扱われる。
 * 「毎週予約の方が今週だけお休み」のようなケースはこちらを使う。
 * 患者了承済みのキャンセル（cancel_kind='approved'）として仕分け済みにするので、
 * しめ作業の未仕分けリストには出ない。
 */
export async function cancelAppointmentKeepRecord(appointmentId: string) {
  const auth = await checkAdminAuth();
  try {
    const supabase = getAdminSupabase() || await getSupabase();

    const { data: before } = await supabase
      .from("appointments")
      .select("id, start_time, status, memo, series_id, customers(name)")
      .eq("id", appointmentId)
      .eq("clinic_id", auth.clinicId)
      .maybeSingle();
    if (!before) return { success: false, error: "対象の予約が見つかりませんでした" };
    if (before.status === "cancelled") return { success: false, error: "すでにキャンセル済みの予約です" };

    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled", checkin_status: null, no_show: false, cancel_kind: "approved" })
      .eq("id", appointmentId)
      .eq("clinic_id", auth.clinicId);
    if (error) {
      console.error("Failed to cancel appointment:", error);
      return { success: false, error: "キャンセルに失敗しました" };
    }

    const customerName = Array.isArray(before?.customers) ? before?.customers[0]?.name : (before?.customers as any)?.name;
    await writeAudit({
      clinicId: auth.clinicId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      actionType: "appointment.cancel_by_staff",
      targetTable: "appointments",
      targetId: appointmentId,
      before: { status: before.status },
      after: { status: "cancelled", cancel_kind: "approved" },
    });
    await notifyOwnerOfStaffAction({
      clinicId: auth.clinicId,
      actorRole: auth.role,
      actorEmail: auth.email,
      actionType: "予約をキャンセル（記録あり）",
      summary: `${customerName ?? "(顧客名不明)"}様\n日時: ${before?.start_time ?? ""}\nメモ: ${before?.memo ?? ""}\nID: ${appointmentId}`,
    });

    revalidatePath("/admin/appointments");
    revalidatePath("/admin");

    const waitlistCandidates = await findWaitlistCandidatesForDay(supabase, auth.clinicId, before.start_time);
    return { success: true, waitlistCandidates };
  } catch (err) {
    console.error("cancelAppointmentKeepRecord error:", err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

/**
 * キャンセル済みの予約を元に戻す（status='confirmed'、仕分け・未来院フラグもクリア）。
 * 同じ担当の同じ時間に別の予約がすでに入っている場合は、
 * DB の重複防止制約（23P01）で弾かれるため、わかりやすいエラーで返す。
 */
export async function restoreCancelledAppointment(
  appointmentId: string,
  /** 担当かぶりを承知で通す（オーナーのみ有効） */
  allowOverlap: boolean = false,
) {
  const auth = await checkAdminAuth();
  try {
    const supabase = getAdminSupabase() || await getSupabase();

    const { data: before } = await supabase
      .from("appointments")
      .select("id, start_time, end_time, staff_id, staff_name, status, memo, customers(name)")
      .eq("id", appointmentId)
      .eq("clinic_id", auth.clinicId)
      .maybeSingle();
    if (!before) return { success: false, error: "対象の予約が見つかりませんでした" };
    if (before.status !== "cancelled") return { success: false, error: "キャンセル済みの予約ではありません" };

    const restoreSlotMinutes = await getCurrentSlotDuration();
    let overlapApproved = false;
    // 復活させると、その間に入った別の予約とかぶることがある。
    // 23P01 は prevent_overlap=true の担当にしか効かないので、ここでも確認する
    // （からだ鍼灸整骨院は全員 false＝DBでは止まらない。2026-08-22 検品指摘）。
    {
      // end_time が欠けている古い予約でも判定できるよう、院の予約枠サイズで補う。
      // ここで null をそのまま渡すとクエリが 400 になり、ガードが働かない。
      const restoreEndIso = before.end_time
        ? (before.end_time as string)
        : new Date(
            new Date(before.start_time as string).getTime() +
              restoreSlotMinutes * 60 * 1000,
          ).toISOString();
      const hit = await findLaneConflict(
        supabase, auth.clinicId, before.staff_id as string | null,
        before.start_time as string, restoreEndIso, appointmentId,
        restoreSlotMinutes,
      );
      if (hit && canOverrideOverlap(auth.role, allowOverlap)) {
        // 院長が承知のうえで戻した記録を残す
        overlapApproved = true;
      }
      if (hit && !canOverrideOverlap(auth.role, allowOverlap)) {
        return {
          success: false,
          overlap: true as const,
          needsOwner: true as const,
          error:
            `${(before.staff_name as string) ?? "担当"}さんは、この時間にすでに別のご予約が入っています（${describeLaneConflict(hit)}）。
` +
            `元に戻すと重なってしまうため、戻せません。別の時間で新しく予約を取り直してください。`,
        };
      }
    }

    const { error } = await supabase
      .from("appointments")
      .update({
        status: "confirmed", cancel_kind: null, no_show: false, cancel_hidden: false,
        ...(overlapApproved ? { memo: withOverlapStamp(before.memo as string | null) } : {}),
      })
      .eq("id", appointmentId)
      .eq("clinic_id", auth.clinicId);
    if (error) {
      if ((error as any).code === "23P01") {
        return { success: false, error: "同じ担当の同じ時間に別の予約が入っているため、元に戻せません。時間を変更して新しく予約を入れてください。" };
      }
      console.error("Failed to restore appointment:", error);
      return { success: false, error: "予約の復活に失敗しました" };
    }

    const customerName = Array.isArray(before?.customers) ? before?.customers[0]?.name : (before?.customers as any)?.name;
    await writeAudit({
      clinicId: auth.clinicId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      actionType: "appointment.restore",
      targetTable: "appointments",
      targetId: appointmentId,
      before: { status: "cancelled" },
      after: { status: "confirmed" },
    });
    await notifyOwnerOfStaffAction({
      clinicId: auth.clinicId,
      actorRole: auth.role,
      actorEmail: auth.email,
      actionType: "キャンセル済み予約を復活",
      summary: `${customerName ?? "(顧客名不明)"}様\n日時: ${before?.start_time ?? ""}\nID: ${appointmentId}`,
    });

    revalidatePath("/admin/appointments");
    revalidatePath("/admin");
    return { success: true };
  } catch (err) {
    console.error("restoreCancelledAppointment error:", err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

/**
 * キャンセル済み予約の「薄い表示」をカレンダーから隠す／再表示する。
 * 削除ではないので記録は残る（しめ作業・顧客のキャンセル履歴からは見える）。
 * 隠せるのは仕分け済み（承諾済み／院都合）のキャンセルだけ。
 */
export async function setCancelledGhostHidden(appointmentId: string, hidden: boolean) {
  const auth = await checkAdminAuth();
  try {
    const supabase = getAdminSupabase() || await getSupabase();

    const { data: before } = await supabase
      .from("appointments")
      .select("id, status, cancel_kind, no_show, cancel_hidden, customers(name)")
      .eq("id", appointmentId)
      .eq("clinic_id", auth.clinicId)
      .maybeSingle();
    if (!before) return { success: false, error: "対象の予約が見つかりませんでした" };
    if (before.status !== "cancelled") return { success: false, error: "キャンセル済みの予約ではありません" };
    if (hidden && before.cancel_kind !== "approved" && before.cancel_kind !== "clinic_reason") {
      return { success: false, error: "隠せるのは承諾済み・院都合のキャンセルだけです（無断キャンセルは見えるまま残します）" };
    }

    const { error } = await supabase
      .from("appointments")
      .update({ cancel_hidden: hidden })
      .eq("id", appointmentId)
      .eq("clinic_id", auth.clinicId);
    if (error) {
      console.error("Failed to set cancel_hidden:", error);
      return { success: false, error: "更新に失敗しました" };
    }

    await writeAudit({
      clinicId: auth.clinicId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      actionType: hidden ? "appointment.cancel_hide" : "appointment.cancel_unhide",
      targetTable: "appointments",
      targetId: appointmentId,
      before: { cancel_hidden: before.cancel_hidden },
      after: { cancel_hidden: hidden },
    });

    revalidatePath("/admin/appointments");
    revalidatePath("/admin");
    return { success: true };
  } catch (err) {
    console.error("setCancelledGhostHidden error:", err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

export type EndingSeriesAlert = {
  seriesId: string;
  customerId: string | null;
  customerName: string;
  lastStartTime: string; // シリーズ最終回の日時（ISO）
  weekday: string;       // 例: "水"
  timeLabel: string;     // 例: "17:00"
  occurrenceCount: number;
};

/**
 * 「毎週予約（連続予約）がもうすぐ終わる／終わったばかり」の患者一覧。
 * 連続予約はまとめて N 週分の行を作る仕組みなので、最終回が近づいたら
 * 次のぶんを入れ忘れないようカレンダー上部にお知らせを出すために使う。
 * 対象: シリーズの最終回が「今日の7日前〜7日後」にあり、2回以上来ている患者。
 * ただし、そのシリーズの最終回より後に予約が入っている人は「対応済み」として除外する。
 */
export async function getEndingSeriesAlerts(): Promise<EndingSeriesAlert[]> {
  try {
    const { clinicId } = await checkAdminAuth();
    const supabase = getAdminSupabase() || await getSupabase();

    // 直近90日〜未来のシリーズ予約を取得して JS 側でシリーズごとに集計する
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from("appointments")
      .select("series_id, customer_id, start_time, status, customers(name)")
      .eq("clinic_id", clinicId)
      .not("series_id", "is", null)
      .neq("status", "cancelled")
      .gte("start_time", since)
      .order("start_time", { ascending: true });
    if (error || !data) return [];

    const bySeries = new Map<string, { customerId: string | null; name: string; last: string; count: number }>();
    for (const row of data as any[]) {
      const c = Array.isArray(row.customers) ? row.customers[0] : row.customers;
      const cur = bySeries.get(row.series_id);
      if (!cur) {
        bySeries.set(row.series_id, {
          customerId: row.customer_id ?? null,
          name: c?.name ?? "(お名前未登録)",
          last: row.start_time,
          count: 1,
        });
      } else {
        cur.count += 1;
        if (row.start_time > cur.last) cur.last = row.start_time;
      }
    }

    const now = Date.now();
    const windowMs = 7 * 24 * 3600 * 1000;
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    let out: EndingSeriesAlert[] = [];
    for (const [seriesId, s] of bySeries) {
      if (s.count < 2) continue; // 単発〜2回未満は「毎週の人」とみなさない
      const lastMs = new Date(s.last).getTime();
      if (lastMs < now - windowMs || lastMs > now + windowMs) continue;
      const d = new Date(lastMs + 9 * 3600 * 1000); // JST
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      out.push({
        seriesId,
        customerId: s.customerId,
        customerName: s.name,
        lastStartTime: s.last,
        weekday: weekdays[d.getUTCDay()],
        timeLabel: `${hh}:${mm}`,
        occurrenceCount: s.count,
      });
    }
    // すでに「次の予約」が入っている方は対応済みとみなして一覧から外す。
    // 判定: そのシリーズの最終回より後に、キャンセル以外の予約が1件でもあるか。
    // （別シリーズの継続でも、単発の次回予約でも、どちらも対応済み扱い）
    const customerIds = Array.from(
      new Set(out.map((o) => o.customerId).filter((id): id is string => !!id)),
    );
    if (customerIds.length > 0) {
      const { data: laterRows } = await supabase
        .from("appointments")
        .select("customer_id, start_time")
        .eq("clinic_id", clinicId)
        .neq("status", "cancelled")
        .in("customer_id", customerIds)
        .gt("start_time", new Date(now - windowMs).toISOString());

      // 日時の表記ゆれで取りこぼさないよう、比較はミリ秒に直して行う
      const latestByCustomer = new Map<string, number>();
      for (const row of (laterRows ?? []) as any[]) {
        const ms = new Date(row.start_time).getTime();
        const cur = latestByCustomer.get(row.customer_id);
        if (cur === undefined || ms > cur) latestByCustomer.set(row.customer_id, ms);
      }

      out = out.filter((o) => {
        if (!o.customerId) return true; // 患者未紐付けは判定できないので残す
        const latest = latestByCustomer.get(o.customerId);
        return !(latest !== undefined && latest > new Date(o.lastStartTime).getTime());
      });
    }

    // 最終回が近い順
    out.sort((a, b) => a.lastStartTime.localeCompare(b.lastStartTime));
    return out;
  } catch (err) {
    console.error("getEndingSeriesAlerts error:", err);
    return [];
  }
}

/**
 * キャンセル待ちの方へ「空きが出ました」を LINE で通知する。
 * deleteAppointment が返した waitlistCandidates の appointmentId を渡す。
 */
export async function notifyWaitlistOpening(waitingAppointmentId: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    if (!supabase) return { success: false, error: "DB接続エラー" };

    const { data: apt, error } = await supabase
      .from("appointments")
      .select("id, customer_id, customers(name)")
      .eq("clinic_id", clinicId)
      .eq("id", waitingAppointmentId)
      .single();
    if (error || !apt) return { success: false, error: "キャンセル待ち情報の取得に失敗しました" };

    const customer = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
    // 家族紐付け（is_primary=false）も送信先に含める
    const lineUserIds = await getPushTargetsForCustomer(apt.customer_id as string, clinicId);
    if (lineUserIds.length === 0) {
      return { success: false, error: "この方のLINE IDが未登録のため自動送信できません。お電話でご連絡ください。" };
    }

    // 院名（メッセージ見出し用）
    let clinicName = "当院";
    try {
      const { data: cs } = await supabase
        .from("clinic_settings")
        .select("clinic_name")
        .eq("id", clinicId)
        .maybeSingle();
      if (cs?.clinic_name) clinicName = cs.clinic_name as string;
    } catch {}

    const token = await getLineAccessToken();
    if (!token) {
      return { success: false, error: "LINE トークンが取得できません。設定の LINE_CHANNEL_ID/SECRET をご確認ください。" };
    }

    const name = customer?.name ? `${customer.name}様` : "お客様";
    const messageText =
      `【${clinicName}】\n\n` +
      `${name}\n\n` +
      `お待たせいたしました。キャンセルが出て、ご予約をお取りできる空きが出ました！\n\n` +
      `ご希望の場合は、お早めにこのLINEにてご連絡ください。\n` +
      `先着順でのご案内となりますので、あらかじめご了承ください。\n\n` +
      `スタッフ一同、ご来院を心よりお待ちしております。`;

    let sent = 0;
    let lastError: { success: false; error: string } | null = null;
    for (const lineUserId of lineUserIds) {
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: messageText }] }),
      });

      if (res.ok) {
        sent++;
        continue;
      }

      const errBody = await res.json().catch(() => ({}));
      console.error(`[キャンセル待ちLINE送信失敗] status=${res.status}`, errBody);
      if (res.status === 403) {
        lastError = { success: false, error: "この方はLINE公式アカウントの友だち登録がないため送信できません。お電話でご連絡ください。" };
      } else {
        const detail = errBody?.message ? `（${errBody.message}）` : "";
        lastError = { success: false, error: `LINE送信に失敗しました (HTTP ${res.status})${detail}` };
      }
    }

    if (sent === 0 && lastError) return lastError;

    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

export async function bulkCreateManualReservations(reservations: any[]) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = getAdminSupabase();
    if (!supabase) return { success: false, error: "サーバー設定エラー" };

    const results = [];
    let successCount = 0;
    // 施術時間の既定に使う院の予約枠サイズ（ループの外で1回だけ取る）
    const bulkSlotMinutes = await getCurrentSlotDuration();

    // ── マスタ一括取得 (N+1解消・clinic_id フィルタ付き) ──
    const courseIds = [...new Set(reservations.map((r: any) => r.courseId).filter(Boolean) as string[])];
    const staffIds  = [...new Set(reservations.map((r: any) => r.staffId).filter(Boolean) as string[])];
    const roomIds   = [...new Set(reservations.map((r: any) => r.roomId).filter(Boolean) as string[])];

    const [coursesRes, staffRes, roomsRes] = await Promise.all([
      courseIds.length
        ? supabase.from("reservation_courses").select("id,name").in("id", courseIds).eq("clinic_id", clinicId)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      staffIds.length
        ? supabase.from("reservation_staff").select("id,name").in("id", staffIds).eq("clinic_id", clinicId)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      roomIds.length
        ? supabase.from("reservation_rooms").select("id,name").in("id", roomIds).eq("clinic_id", clinicId)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const courseMap = new Map((coursesRes.data ?? []).map((c) => [c.id, c.name]));
    const staffMap  = new Map((staffRes.data  ?? []).map((s) => [s.id, s.name]));
    const roomMap   = new Map((roomsRes.data  ?? []).map((r) => [r.id, r.name]));

    for (const r of reservations) {
      // 必須項目チェック（phone を除外）
      if (!r.date || !r.time || !r.name) {
        const missing = [
          !r.date && "日付",
          !r.time && "時間",
          !r.name && "氏名"
        ].filter(Boolean).join("/");
        console.warn("[bulkCreateManualReservations] スキップ", {
          name: maskName(r.name),
          date: r.date,
          time: r.time,
          hasPhone: !!(r.phone || "").trim(),
          missing,
        });
        results.push({
          name: r.name || "名称不明",
          success: false,
          error: `必須項目不足(${missing})`
        });
        continue;
      }

      const phoneTrimmed = (r.phone || "").trim();
      const nameTrimmed = r.name.trim();
      const hasPhone = phoneTrimmed.length > 0;

      let existing: { id: string } | null = null;
      // ① 電話＋氏名（createManualReservation と同じ優先順位）
      //    電話単独の maybeSingle だと、"080" だけの仮番号を大勢が共有している院で
      //    「複数行ヒット→エラー→既存なし扱い→新規作成」となり、同じ患者さんの
      //    レコードが受診のたびに増えていた（2026-07-28 修正）。
      if (hasPhone) {
        const { data } = await supabase
          .from("customers")
          .select("id")
          .eq("phone", phoneTrimmed)
          .eq("name", nameTrimmed)
          .eq("clinic_id", clinicId)
          .limit(1);
        if (data && data.length > 0) existing = data[0];
      }
      // ② 電話単独 - 1件のみヒットなら既存扱い（複数なら親子で共有中とみなし採用しない）
      if (!existing && hasPhone) {
        const { data } = await supabase
          .from("customers")
          .select("id")
          .eq("phone", phoneTrimmed)
          .eq("clinic_id", clinicId);
        if (data && data.length === 1) existing = data[0];
      }
      // ③ 同名検索 - 1件のみヒットなら既存扱い、複数なら新規作成（別人混同を避けるため）
      if (!existing) {
        const { data } = await supabase
          .from("customers")
          .select("id")
          .eq("name", nameTrimmed)
          .eq("clinic_id", clinicId);
        if (data && data.length === 1) {
          existing = data[0];
        }
      }

      let customerId: string;
      if (existing) {
        customerId = existing.id;
        // 名前を最新に更新（読み仮名があればそれも）
        const updateData: any = { name: nameTrimmed };
        if (r.name_kana) updateData.name_kana = r.name_kana;
        // 電話番号が空でパース結果に電話番号があれば更新
        if (hasPhone) updateData.phone = phoneTrimmed;
        
        await supabase.from("customers").update(updateData).eq("id", customerId).eq("clinic_id", clinicId);
      } else {
        const { data: newCustomer, error: customerErr } = await supabase
          .from("customers")
          .insert([{
            name: nameTrimmed,
            phone: hasPhone ? phoneTrimmed : "", // phone は NOT NULL なので空文字を入れる
            name_kana: r.name_kana || null,
            clinic_id: clinicId
          }])
          .select("id")
          .single();
        if (customerErr || !newCustomer) {
          console.error("[bulkCreateManualReservations] customer insert失敗", {
            name: maskName(r.name),
            phone: maskPhone(phoneTrimmed),
            error: customerErr?.message,
          });
          results.push({ name: r.name, success: false, error: "顧客登録失敗" });
          continue;
        }
        customerId = newCustomer.id;
      }

      const startDateTimeStr = `${r.date}T${r.time}:00+09:00`;
      // 施術時間は院の予約枠サイズぶん（からだ鍼灸整骨院は20分。30分決め打ちにしない）
      const endDate = new Date(new Date(startDateTimeStr).getTime() + bulkSlotMinutes * 60 * 1000);

      const memo = `[AI一括登録] ${r.symptoms || ""}`.trim();

      // マスタ一括取得結果から名前を解決（クリニック横断混入を防止）
      const courseName = r.courseId ? courseMap.get(r.courseId) ?? null : null;
      const staffName  = r.staffId  ? staffMap.get(r.staffId)   ?? null : null;
      const roomName   = r.roomId   ? roomMap.get(r.roomId)     ?? null : null;

      // ID がマスタに存在しない場合はそのフィールドを保存しない（別院ID混入の保険）
      const courseIdValid = r.courseId && courseName !== null;
      const staffIdValid  = r.staffId  && staffName  !== null;
      const roomIdValid   = r.roomId   && roomName   !== null;

      // 担当かぶりの確認（他の登録経路と同じガード）。
      // いまは呼び出し元が無い経路だが、素通りの登録口を残さない（2026-08-22 検品指摘）。
      if (staffIdValid) {
        let hit: Awaited<ReturnType<typeof findLaneConflict>> = null;
        try {
          hit = await findLaneConflict(
            supabase, clinicId, r.staffId, startDateTimeStr, endDate.toISOString(),
            undefined, bulkSlotMinutes,
          );
        } catch {
          // 判定できないときは通さない。1件失敗しても残りの登録は続ける。
          results.push({
            name: r.name,
            success: false,
            error: "予約の重なりを確認できなかったため、登録を見送りました。もう一度お試しください。",
          });
          continue;
        }
        if (hit) {
          results.push({
            name: r.name,
            success: false,
            error: `${staffName ?? "担当"}さんは、この時間にすでに別のご予約が入っています（${describeLaneConflict(hit)}）。担当者か時間を変えてください。`,
          });
          continue;
        }
      }

      const { error: appointmentErr } = await supabase
        .from("appointments")
        .insert([{
          customer_id: customerId,
          start_time: startDateTimeStr,
          end_time: endDate.toISOString(),
          memo: memo,
          is_first_visit: r.visitType === "new",
          status: "confirmed",
          clinic_id: clinicId,
          ...(courseIdValid ? { course_id: r.courseId, course_name: courseName } : {}),
          ...(staffIdValid  ? { staff_id:  r.staffId,  staff_name:  staffName  } : {}),
          ...(roomIdValid   ? { room_id:   r.roomId,   room_name:   roomName   } : {}),
        }]);

      if (appointmentErr) {
        console.error("[bulkCreateManualReservations] appointment insert失敗", {
          name: maskName(r.name),
          phone: maskPhone(phoneTrimmed),
          error: appointmentErr.message,
          code: appointmentErr.code,
        });
        results.push({
          name: r.name,
          success: false,
          error: `予約登録失敗: ${appointmentErr.message || "不明なエラー"}`
        });
      } else {
        results.push({ name: r.name, success: true });
        successCount++;
      }
    }

    revalidatePath("/admin/appointments");
    revalidatePath("/admin/counter");
    revalidatePath("/admin");
    
    return { 
      success: successCount > 0, 
      count: successCount, 
      total: reservations.length, 
      results,
      error: successCount === 0 
        ? `登録できませんでした(失敗:${reservations.length}件)` 
        : undefined
    };
  } catch (err: any) {
    console.error(err);
    return { success: false, error: err?.message ?? "予期せぬエラーが発生しました" };
  }
}

// ─────────────────────────────────────────────────────────
// キャンセルの仕分け（毎日のしめ作業）
//   無断・未確認 (unexcused) / 連絡あり・院承諾済み (approved) /
//   施術+水素などセット解除 (set_removed＝キャンセル・未来院に数えない)
// ─────────────────────────────────────────────────────────

export type UnclassifiedCancellation = {
  id: string;
  start_time: string;
  course_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  no_show: boolean;
};

export type CustomerCancellation = {
  id: string;
  start_time: string;
  course_name: string | null;
  cancel_kind: string | null;
  no_show: boolean;
};

/** 指定した患者の「キャンセル」一覧（期間制限なし・新しい順）。院都合の付け外しに使う。 */
export async function getCustomerCancellations(customerId: string): Promise<CustomerCancellation[]> {
  try {
    const { clinicId } = await checkAdminAuth();
    const supabase = getAdminSupabase();
    if (!supabase || !customerId) return [];
    const { data } = await supabase
      .from("appointments")
      .select("id, start_time, course_name, cancel_kind, no_show")
      .eq("clinic_id", clinicId)
      .eq("customer_id", customerId)
      .eq("status", "cancelled")
      .order("start_time", { ascending: false })
      .limit(200);
    return (data ?? []).map((a: any) => ({
      id: a.id,
      start_time: a.start_time,
      course_name: a.course_name ?? null,
      cancel_kind: a.cancel_kind ?? null,
      no_show: !!a.no_show,
    }));
  } catch (err) {
    console.error("getCustomerCancellations error:", err);
    return [];
  }
}

/**
 * 過去のキャンセル1件を「院都合（カウントしない）」に切り替える／戻す。
 *   on=true  → cancel_kind='clinic_reason', no_show=false（キャンセル回数・未来院から外す）
 *   on=false → cancel_kind=null（未仕分けに戻す。再びキャンセル回数に数える）
 */
export async function setCancellationClinicReason(
  appointmentId: string,
  on: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await checkAdminAuth();
    const supabase = getAdminSupabase();
    if (!supabase) return { success: false, error: "サーバー設定エラー" };

    const { data: before } = await supabase
      .from("appointments")
      .select("id, status, no_show, cancel_kind")
      .eq("id", appointmentId)
      .eq("clinic_id", auth.clinicId)
      .maybeSingle();
    if (!before) return { success: false, error: "予約が見つかりません" };
    if (before.status !== "cancelled") return { success: false, error: "キャンセル済みの予約ではありません" };

    const patch = on
      ? { cancel_kind: "clinic_reason", no_show: false }
      : { cancel_kind: null, no_show: false };
    const { error } = await supabase
      .from("appointments")
      .update(patch)
      .eq("id", appointmentId)
      .eq("clinic_id", auth.clinicId);
    if (error) return { success: false, error: error.message };

    await writeAudit({
      clinicId: auth.clinicId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      actionType: on ? "appointment.clinic_cancel" : "appointment.clinic_cancel_undo",
      targetTable: "appointments",
      targetId: appointmentId,
      before: { no_show: before.no_show, cancel_kind: before.cancel_kind },
      after: patch,
    });

    revalidatePath("/admin/customers");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (err) {
    console.error("setCancellationClinicReason error:", err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

/** 直近30日の「未仕分け」キャンセル一覧（status=cancelled かつ cancel_kind 未設定） */
export async function getUnclassifiedCancellations(): Promise<UnclassifiedCancellation[]> {
  try {
    const { clinicId } = await checkAdminAuth();
    const supabase = getAdminSupabase();
    if (!supabase) return [];
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data } = await supabase
      .from("appointments")
      .select("id, start_time, course_name, no_show, customer_id, customers(name)")
      .eq("clinic_id", clinicId)
      .eq("status", "cancelled")
      .is("cancel_kind", null)
      .gte("start_time", since)
      .order("start_time", { ascending: false })
      .limit(50);
    return (data ?? []).map((a: any) => ({
      id: a.id,
      start_time: a.start_time,
      course_name: a.course_name ?? null,
      customer_id: a.customer_id ?? null,
      customer_name: (Array.isArray(a.customers) ? a.customers[0]?.name : a.customers?.name) ?? null,
      no_show: !!a.no_show,
    }));
  } catch (err) {
    console.error("getUnclassifiedCancellations error:", err);
    return [];
  }
}

/**
 * キャンセルを仕分ける。
 * kind='unexcused' のときは院の運用設定（noshow_block_*）に従い、
 * 期間内の無断回数が規定以上ならオンライン予約を期限付きで自動停止する。
 */
export async function classifyCancellation(
  appointmentId: string,
  kind: "unexcused" | "approved" | "set_removed" | "clinic_reason",
): Promise<{ success: boolean; error?: string; blockedUntil?: string | null; customerName?: string | null }> {
  try {
    const auth = await checkAdminAuth();
    const supabase = getAdminSupabase();
    if (!supabase) return { success: false, error: "サーバー設定エラー" };

    const { data: apt } = await supabase
      .from("appointments")
      .select("id, customer_id, start_time, status, no_show, cancel_kind, customers(name)")
      .eq("id", appointmentId)
      .eq("clinic_id", auth.clinicId)
      .maybeSingle();
    if (!apt) return { success: false, error: "予約が見つかりません" };

    // 仕分けに合わせて no_show も正規化する（無断のみ未来院フラグON）
    const { error } = await supabase
      .from("appointments")
      .update({ cancel_kind: kind, no_show: kind === "unexcused" })
      .eq("id", appointmentId)
      .eq("clinic_id", auth.clinicId);
    if (error) return { success: false, error: error.message };

    await writeAudit({
      clinicId: auth.clinicId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      actionType: "appointment.cancel_classify",
      targetTable: "appointments",
      targetId: appointmentId,
      before: { no_show: apt.no_show, cancel_kind: apt.cancel_kind },
      after: { cancel_kind: kind, no_show: kind === "unexcused" },
    });

    const customerName =
      (Array.isArray(apt.customers) ? (apt.customers[0] as any)?.name : (apt.customers as any)?.name) ?? null;
    let blockedUntil: string | null = null;

    // ── 無断キャンセル制限（院ごとの運用設定。使わない院は enabled=false のまま） ──
    if (kind === "unexcused" && apt.customer_id) {
      const { data: cs } = await supabase
        .from("clinic_settings")
        .select("noshow_block_enabled, noshow_block_threshold, noshow_block_window_days, noshow_block_days")
        .eq("id", auth.clinicId)
        .maybeSingle();
      if (cs?.noshow_block_enabled) {
        const windowDays = Number(cs.noshow_block_window_days ?? 90) || 90;
        const threshold = Number(cs.noshow_block_threshold ?? 3) || 3;
        const blockDays = Number(cs.noshow_block_days ?? 30) || 30;
        const since = new Date(Date.now() - windowDays * 86400000).toISOString();
        const { data: recent } = await supabase
          .from("appointments")
          .select("id, no_show, cancel_kind")
          .eq("clinic_id", auth.clinicId)
          .eq("customer_id", apt.customer_id)
          .eq("status", "cancelled")
          .gte("start_time", since);
        const unexcusedCount = (recent ?? []).filter(
          (r: any) => r.cancel_kind === "unexcused" || (r.no_show === true && r.cancel_kind == null),
        ).length;
        if (unexcusedCount >= threshold) {
          const until = new Date(Date.now() + blockDays * 86400000).toISOString();
          await supabase
            .from("customers")
            .update({ booking_suspended_until: until })
            .eq("id", apt.customer_id)
            .eq("clinic_id", auth.clinicId);
          blockedUntil = until;
          await writeAudit({
            clinicId: auth.clinicId,
            actorUserId: auth.userId,
            actorEmail: auth.email,
            actorRole: auth.role,
            actionType: "customer.noshow_auto_block",
            targetTable: "customers",
            targetId: apt.customer_id,
            before: null,
            after: { booking_suspended_until: until, unexcusedCount, threshold },
          });
        }
      }
    }

    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/customers");
    return { success: true, blockedUntil, customerName };
  } catch (err) {
    console.error("classifyCancellation error:", err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

/**
 * 未仕分けキャンセルのうち「未来院マークが付いていないもの」を一括で承諾済みにする。
 * 初回導入時に過去分が大量に並ぶのを一掃するための補助。
 * 未来院マーク付き（no_show=true）は無断の可能性が高いため一括対象にせず、個別に仕分けてもらう。
 */
export async function classifyRemainingAsApproved(): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const auth = await checkAdminAuth();
    const supabase = getAdminSupabase();
    if (!supabase) return { success: false, count: 0, error: "サーバー設定エラー" };
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await supabase
      .from("appointments")
      .update({ cancel_kind: "approved" })
      .eq("clinic_id", auth.clinicId)
      .eq("status", "cancelled")
      .is("cancel_kind", null)
      .not("no_show", "is", true)
      .gte("start_time", since)
      .select("id");
    if (error) return { success: false, count: 0, error: error.message };
    const count = data?.length ?? 0;
    await writeAudit({
      clinicId: auth.clinicId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      actionType: "appointment.cancel_classify_bulk",
      targetTable: "appointments",
      targetId: null,
      before: null,
      after: { cancel_kind: "approved", count },
    });
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/customers");
    return { success: true, count };
  } catch (err) {
    console.error("classifyRemainingAsApproved error:", err);
    return { success: false, count: 0, error: "予期せぬエラーが発生しました" };
  }
}

/** 指定IDのキャンセルをまとめて仕分け */
export async function classifyByIds(
  ids: string[],
  kind: "unexcused" | "approved" | "set_removed" | "clinic_reason",
): Promise<{ success: boolean; count: number; blockedPatients?: { name: string; until: string }[]; error?: string }> {
  if (!ids.length) return { success: true, count: 0 };
  try {
    const auth = await checkAdminAuth();
    const supabase = getAdminSupabase();
    if (!supabase) return { success: false, count: 0, error: "サーバー設定エラー" };
    const { data, error } = await supabase
      .from("appointments")
      .update({ cancel_kind: kind })
      .eq("clinic_id", auth.clinicId)
      .in("id", ids)
      .select("id, customer_id");
    if (error) return { success: false, count: 0, error: error.message };
    const count = data?.length ?? 0;
    await writeAudit({
      clinicId: auth.clinicId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      actionType: "appointment.cancel_classify_bulk",
      targetTable: "appointments",
      targetId: null,
      before: null,
      after: { cancel_kind: kind, ids, count },
    });
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/customers");

    // 無断の場合のみ自動停止チェック
    const blockedPatients: { name: string; until: string }[] = [];
    if (kind === "unexcused") {
      const customerIds = [...new Set((data ?? []).map((r) => r.customer_id).filter(Boolean))];
      for (const customerId of customerIds) {
        const res = await classifyCancellation(ids[0], kind); // 個別チェック用に再利用
        if (res.blockedUntil && res.customerName) {
          blockedPatients.push({ name: res.customerName, until: res.blockedUntil });
        }
      }
    }
    return { success: true, count, blockedPatients };
  } catch (err) {
    console.error("classifyByIds error:", err);
    return { success: false, count: 0, error: "予期せぬエラーが発生しました" };
  }
}

/**
 * 「月またぎ」バッジ用: 指定期間の予約のうち、
 * 「先月も来院があり、かつその予約がその患者の今月最初の来院」になっている予約IDを返す。
 * 月初の保険証確認・署名などの月またぎ対応を、受付でひと目で分かるようにする。
 * 月の判定は JST（Asia/Tokyo）基準。キャンセル済みは来院に数えない。
 */
export async function getMonthCrossingFirstVisits(
  rangeStartISO: string,
  rangeEndISO: string,
): Promise<string[]> {
  try {
    const { clinicId } = await checkAdminAuth();
    const supabase = getAdminSupabase() || await getSupabase();
    if (!supabase) return [];

    const { data: rangeApts, error } = await supabase
      .from("appointments")
      .select("id, customer_id, start_time")
      .eq("clinic_id", clinicId)
      .neq("status", "cancelled")
      .not("customer_id", "is", null)
      .gte("start_time", rangeStartISO)
      .lt("start_time", rangeEndISO);
    if (error || !rangeApts || rangeApts.length === 0) return [];

    const customerIds = [...new Set(rangeApts.map((a) => a.customer_id as string))];

    const JST_MS = 9 * 3600 * 1000;
    const monthKeyJst = (iso: string) => {
      const d = new Date(new Date(iso).getTime() + JST_MS);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    };
    const prevMonthKey = (key: string) => {
      const [y, m] = key.split("-").map(Number);
      return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    };

    // 履歴の取得開始 = 期間内で最も早い予約がある月の「前月1日 0:00 JST」
    const earliest = rangeApts.reduce(
      (min, a) => (a.start_time < min ? a.start_time : min),
      rangeApts[0].start_time,
    );
    const e = new Date(new Date(earliest).getTime() + JST_MS);
    const historyStart = new Date(
      Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - 1, 1) - JST_MS,
    ).toISOString();

    // 対象患者の来院履歴（前月1日〜期間終わり）。IN句が長くなりすぎないよう分割。
    // 週ぶんをまとめて見るときは分割数が増えるので、逐次ではなく並列で投げる。
    const chunks: string[][] = [];
    for (let i = 0; i < customerIds.length; i += 200) {
      chunks.push(customerIds.slice(i, i + 200));
    }
    const chunkResults = await Promise.all(
      chunks.map((chunk) =>
        supabase
          .from("appointments")
          .select("customer_id, start_time")
          .eq("clinic_id", clinicId)
          .neq("status", "cancelled")
          .in("customer_id", chunk)
          .gte("start_time", historyStart)
          .lt("start_time", rangeEndISO),
      ),
    );
    const history: Array<{ customer_id: string; start_time: string }> = chunkResults.flatMap(
      (r) => (r.data ?? []) as Array<{ customer_id: string; start_time: string }>,
    );

    // 患者×月 → その月の最初の来院時刻
    const firstOfMonth = new Map<string, string>();
    for (const h of history) {
      const key = `${h.customer_id}|${monthKeyJst(h.start_time)}`;
      const cur = firstOfMonth.get(key);
      if (!cur || h.start_time < cur) firstOfMonth.set(key, h.start_time);
    }

    // 同時刻の重複予約（同時追加メニュー等）で二重にマークしないよう、患者×月につき1件だけ
    const flagged = new Map<string, { id: string; start: string }>();
    for (const a of rangeApts) {
      const mk = monthKeyJst(a.start_time);
      const key = `${a.customer_id}|${mk}`;
      if (!firstOfMonth.has(`${a.customer_id}|${prevMonthKey(mk)}`)) continue; // 先月来院なし
      if (firstOfMonth.get(key) !== a.start_time) continue; // 今月最初の来院ではない
      const cur = flagged.get(key);
      if (!cur || a.start_time < cur.start || (a.start_time === cur.start && a.id < cur.id)) {
        flagged.set(key, { id: a.id, start: a.start_time });
      }
    }
    return [...flagged.values()].map((f) => f.id);
  } catch (err) {
    console.error("getMonthCrossingFirstVisits error:", err);
    return [];
  }
}

/* ============================================================================
 * かぶったときに「代わりにこの時間なら取れます」を出すための計算
 *
 * かぶりを止めるだけだと、スタッフは直しようがなくて院長先生に聞くしかない。
 * 院長先生が全部の判断を引き受けるのは現実的ではない（2026-08-22 ぼーるくん）。
 * だから「だめ」と言うだけでなく、その場で取れる候補を出して、
 * スタッフが自分で正しい予約に直せるようにする。
 * 強引に通す道はオーナーだけに残したまま、使わなくて済むようにするのが狙い。
 * ========================================================================== */

export type OverlapFix = {
  /** time = 同じ先生で別の時間 ／ staff = 同じ時間で別の先生 */
  kind: "time" | "staff";
  staffId: string;
  staffName: string | null;
  startIso: string;
  endIso: string;
  /** 画面にそのまま出す文字（例「17:00〜17:20」） */
  timeLabel: string;
};

export type OverlapFixes = { sameStaff: OverlapFix[]; otherStaff: OverlapFix[] };

const JST_MS = 9 * 60 * 60 * 1000;
const jstYmd = (iso: string) => new Date(new Date(iso).getTime() + JST_MS).toISOString().slice(0, 10);
const jstHm = (iso: string) => new Date(new Date(iso).getTime() + JST_MS).toISOString().slice(11, 16);
const isoOfJst = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+09:00`).toISOString();
const hmToMin = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};
const minToHm = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/**
 * かぶりを直すための候補を出す。
 *
 * ・sameStaff … 同じ先生で、その日のうちに空いている枠（近い順に最大4件）
 * ・otherStaff … 同じ時間で受けられる別の先生（最大4件）
 *
 * 候補は「その先生の勤務時間・休憩・お休み」と「すでに入っている予約」の両方を見て出す。
 * 出した候補をそのまま登録して、また止まる、ということが起きないようにする。
 * 候補が出せなくても登録は止めたままにする（ここは案内であって、許可ではない）。
 */
export async function suggestOverlapFixes(input: {
  staffId: string | null;
  startIso: string;
  durationMinutes: number;
  /** 編集中の予約。自分自身とのかぶりを候補から除くために渡す */
  excludeAppointmentId?: string | null;
  /** メニュー。担当が固定のメニューでは「別の先生」を出さない */
  courseId?: string | null;
}): Promise<OverlapFixes> {
  const empty: OverlapFixes = { sameStaff: [], otherStaff: [] };
  try {
    const { clinicId } = await checkAdminAuth();
    const meStaffId = input.staffId;
    if (!meStaffId || !input.startIso) return empty;
    const duration = input.durationMinutes > 0 ? input.durationMinutes : 20;
    const ymd = jstYmd(input.startIso);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return empty;
    const wantStartMin = hmToMin(jstHm(input.startIso));

    const db = getAdminSupabase();
    if (!db) return empty;
    const dayStart = isoOfJst(ymd, "00:00");
    const dayEnd = new Date(new Date(dayStart).getTime() + 24 * 60 * 60 * 1000).toISOString();

    const [
      settingsRes,
      staffRes,
      weeklyRes,
      dateRes,
      offRes,
      aptRes,
      courseRes,
      holidayRes,
    ] = await Promise.all([
      db.from("clinic_settings")
        .select("slot_duration_minutes, closed_weekdays, business_open_weekday, business_close_weekday, business_open_saturday, business_close_saturday")
        .eq("id", clinicId).maybeSingle(),
      db.from("reservation_staff")
        .select("id, name, sort_order, schedule_based_booking, booking_weekdays, booking_start_time, booking_end_time, booking_break_start, booking_break_end, booking_until")
        .eq("clinic_id", clinicId).eq("is_active", true),
      db.from("staff_working_hours")
        .select("staff_id, day_of_week, start_time, end_time, break_start, break_end")
        .eq("clinic_id", clinicId),
      db.from("staff_booking_dates")
        .select("staff_id, available, start_time, end_time")
        .eq("clinic_id", clinicId).eq("date", ymd),
      db.from("staff_working_overrides")
        .select("staff_id, kind, start_time, blocks_booking")
        .eq("clinic_id", clinicId).eq("date", ymd),
      db.from("appointments")
        .select("id, start_time, end_time, staff_id, course_id, additional_staff, additional_courses")
        .eq("clinic_id", clinicId).neq("status", "cancelled")
        .gte("start_time", dayStart).lt("start_time", dayEnd),
      input.courseId
        ? db.from("reservation_courses").select("required_staff_id")
            .eq("clinic_id", clinicId).eq("id", input.courseId).maybeSingle()
        : Promise.resolve({ data: null }),
      db.from("clinic_holidays").select("date").eq("clinic_id", clinicId).eq("date", ymd).maybeSingle(),
    ]);

    const settings: any = settingsRes?.data ?? null;
    const staffRows: any[] = staffRes?.data ?? [];
    const weeklyRows: any[] = weeklyRes?.data ?? [];
    const dateRows: any[] = dateRes?.data ?? [];
    const offRows: any[] = offRes?.data ?? [];
    const aptRows: any[] = aptRes?.data ?? [];
    if (staffRows.length === 0) return empty;

    const slotMinutes = Number(settings?.slot_duration_minutes) > 0 ? Number(settings.slot_duration_minutes) : 30;
    // 曜日は UTC 0時で見る。JST 0時（=UTC 前日15時）で getUTCDay() すると1日ずれる
    // （2026-08-23 検品指摘。土曜だけ営業時間が違う院で、閉院後を「取れます」と出していた）。
    const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
    const isSaturday = dow === 6;
    const openHm = normStaffTime(isSaturday ? settings?.business_open_saturday : settings?.business_open_weekday) ?? "09:00";
    const closeHm = normStaffTime(isSaturday ? settings?.business_close_saturday : settings?.business_close_weekday) ?? "20:00";
    const closedDows = String(settings?.closed_weekdays ?? "")
      .split(",").map((v: string) => Number(v.trim())).filter((n: number) => Number.isInteger(n));
    if (closedDows.includes(dow)) return empty;
    if ((holidayRes as any)?.data) return empty; // 臨時休診の日は勧めない
    const openMin = hmToMin(openHm);
    const closeMin = hmToMin(closeHm);
    if (!(closeMin > openMin)) return empty;

    // その日の予約を「先生ごとの受け持ち時間」に割ってから、埋まっている時間の一覧にする
    const rows = aptRows.filter((r) => r.id !== input.excludeAppointmentId);
    const courseIds = new Set<string>();
    for (const r of rows) {
      if (r.course_id) courseIds.add(r.course_id);
      for (const ac of (r.additional_courses ?? []) as { course_id?: string }[]) {
        if (ac?.course_id) courseIds.add(ac.course_id);
      }
    }
    const durationById = new Map<string, number>();
    if (courseIds.size > 0) {
      const { data: cs } = await db.from("reservation_courses")
        .select("id, duration_minutes").eq("clinic_id", clinicId).in("id", [...courseIds]);
      for (const c of (cs ?? []) as { id: string; duration_minutes: number | null }[]) {
        if (c.duration_minutes && c.duration_minutes > 0) durationById.set(c.id, c.duration_minutes);
      }
    }
    const busy = new Map<string, { s: number; e: number }[]>();
    for (const r of rows) {
      const spans = buildStaffSpans({
        startTime: r.start_time,
        endTime: r.end_time ?? null,
        staffId: r.staff_id ?? null,
        mainMinutes: r.course_id ? (durationById.get(r.course_id) ?? null) : null,
        additionalStaff: (r.additional_staff ?? null) as { staff_id: string }[] | null,
        additionalCourses: (r.additional_courses ?? null) as { course_id: string }[] | null,
        additionalMinutes: ((r.additional_courses ?? []) as { course_id?: string }[])
          .map((ac) => (ac?.course_id ? (durationById.get(ac.course_id) ?? null) : null)),
        fallbackMinutes: slotMinutes,
      });
      for (const sp of spans) {
        const list = busy.get(sp.staffId) ?? [];
        list.push({ s: new Date(sp.startIso).getTime(), e: new Date(sp.endIso).getTime() });
        busy.set(sp.staffId, list);
      }
    }

    // 終日休みで登録されている先生は候補から外す
    const offSet = new Set(
      offRows
        .filter((o) => (o.kind === "off" || o.kind === "leave") && !o.start_time && o.blocks_booking !== false)
        .map((o) => o.staff_id as string),
    );

    // 管理画面からの登録なので、ネット予約用の「準備時間」は差し引かない（prep=0）。
    // 受付時間ぎりぎりの枠も、スタッフが手で入れるぶんには取れるべきなので。
    const schedOf = new Map<string, StaffSchedule | null>();
    for (const st of staffRows) {
      const ovr = dateRows.find((d) => d.staff_id === st.id);
      schedOf.set(st.id, buildStaffSchedule(
        st,
        ovr ? [{ date: ymd, available: !!ovr.available, start: normStaffTime(ovr.start_time), end: normStaffTime(ovr.end_time) }] : [],
        weeklyRows.filter((w) => w.staff_id === st.id),
        0,
      ));
    }

    // 勤務表（staff_working_hours）に行がある先生は、行が無い曜日は出勤していないとみなす。
    // buildStaffSchedule は schedule_based_booking=false の院で曜日を見ないため、
    // それだけに任せると「月火だけ勤務の先生」を土曜の候補に出してしまう（2026-08-23 検品指摘）。
    const workDows = new Map<string, Set<number>>();
    for (const w of weeklyRows) {
      const d = Number(w.day_of_week);
      if (!Number.isInteger(d)) continue;
      const set = workDows.get(w.staff_id) ?? new Set<number>();
      set.add(d);
      workDows.set(w.staff_id, set);
    }
    /** 勤務表からその日に出勤していると分かるか。null = 勤務表そのものが無くて分からない */
    const worksToday = (staffId: string): boolean | null => {
      const set = workDows.get(staffId);
      if (!set) return null;
      return set.has(dow);
    };

    const isFree = (staffId: string, startMin: number): boolean => {
      if (offSet.has(staffId)) return false;
      if (worksToday(staffId) === false) return false;
      if (startMin < openMin || startMin + duration > closeMin) return false;
      const sched = schedOf.get(staffId);
      if (sched) {
        if (!isStaffAvailableOnYmd(ymd, sched)) return false;
        if (!isStaffSpanBookableYmd(ymd, minToHm(startMin), duration, sched)) return false;
      }
      const s = new Date(isoOfJst(ymd, minToHm(startMin))).getTime();
      const e = s + duration * 60000;
      for (const b of busy.get(staffId) ?? []) {
        if (b.s < e && b.e > s) return false;
      }
      return true;
    };

    const fixOf = (
      kind: "time" | "staff",
      staffId: string,
      staffName: string | null,
      startMin: number,
    ): OverlapFix => {
      const startIso = isoOfJst(ymd, minToHm(startMin));
      const endIso = new Date(new Date(startIso).getTime() + duration * 60000).toISOString();
      return {
        kind, staffId, staffName, startIso, endIso,
        timeLabel: `${minToHm(startMin)}〜${minToHm(startMin + duration)}`,
      };
    };

    // ① 同じ先生で、空いている枠を近い順に
    const meName = staffRows.find((s) => s.id === meStaffId)?.name ?? null;
    const candidates: number[] = [];
    for (let t = openMin; t + duration <= closeMin; t += slotMinutes) {
      if (t === wantStartMin) continue;
      if (isFree(meStaffId, t)) candidates.push(t);
    }
    candidates.sort((a, b) => Math.abs(a - wantStartMin) - Math.abs(b - wantStartMin) || a - b);
    const sameStaff = candidates.slice(0, 4)
      .sort((a, b) => a - b)
      .map((t) => fixOf("time", meStaffId, meName, t));

    // ② 同じ時間で受けられる別の先生。担当が固定のメニューでは出さない
    const requiredStaffId = (courseRes?.data as { required_staff_id?: string | null } | null)?.required_staff_id ?? null;
    let otherStaff: OverlapFix[] = [];
    if (!requiredStaffId) {
      otherStaff = staffRows
        .filter((st) => st.id !== meStaffId && worksToday(st.id) === true && isFree(st.id, wantStartMin))
        .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
        .slice(0, 4)
        .map((st) => fixOf("staff", st.id, st.name ?? null, wantStartMin));
    }

    return { sameStaff, otherStaff };
  } catch (e) {
    // 候補が出せなくても、かぶりを止めること自体は変わらない
    console.error("suggestOverlapFixes failed", e);
    return empty;
  }
}
