"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { checkAdminAuth } from "./auth";
import { writeAudit, notifyOwnerOfStaffAction } from "@/lib/audit";
import { awardPoints } from "@/lib/gamification";
import { getLineAccessToken } from "@/lib/admin-notify";

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
export async function getAddonCourseInfo(): Promise<{ courseId: string; name: string } | null> {
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
    .select("id, name")
    .eq("id", addonId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!c) return null;
  return { courseId: c.id as string, name: c.name as string };
}

/**
 * 既存予約に「設定された追加メニュー（addon_course_id）」を追加する（同一患者・同じ日に紐づける）。
 * timing: "after"=施術の直後 / "same"=同時刻。
 * 新規追加ダイアログの「同じ日に2件」アラートを回避し、追加メニューの担当レーンの重複だけチェックする。
 */
export async function addAddonToAppointment(appointmentId: string, timing: "after" | "same") {
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
      .select("id, name, duration_minutes, required_staff_id")
      .eq("id", addonId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!addon) return { success: false, error: "追加メニューが見つかりませんでした" };

    const aDur = Number(addon.duration_minutes ?? 30) || 30;
    const baseIso = timing === "same" ? apt.start_time : (apt.end_time ?? apt.start_time);
    const aStart = new Date(baseIso);
    const aStartIso = aStart.toISOString();
    const aEndIso = new Date(aStart.getTime() + aDur * 60000).toISOString();
    const aStaffId = (addon.required_staff_id as string | null) ?? null;
    const aName = addon.name as string;

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
      memo: timing === "same" ? `【${aName} 追加・同時刻】` : `【${aName} 追加・施術後】`,
      is_first_visit: false,
      status: "confirmed",
      clinic_id: clinicId,
      course_id: addon.id,
      course_name: aName,
      ...(aStaffId ? { staff_id: aStaffId, staff_name: aName } : {}),
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

export async function createManualReservation(formData: FormData) {
  const { clinicId } = await checkAdminAuth();
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
    const durationMinutes = durationStr ? parseInt(durationStr, 10) : 30;

    // コース・スタッフ・個室の選択（任意）
    // 患者側 reserve と同じく ID と snapshot 名を併存させる。
    // ID がマスタにない（別院/削除済み）場合は保存しないことで横断混入を防ぐ。
    const courseId = (formData.get("courseId") as string) || null;
    const staffId = (formData.get("staffId") as string) || null;
    const roomId = (formData.get("roomId") as string) || null;

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
    const baseDate = new Date(`${rawDate}T${time}:00+09:00`);
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
    const staffExtra  = staffId  && staffName  ? { staff_id:  staffId,  staff_name:  staffName  } : {};
    const roomExtra   = roomId   && roomName   ? { room_id:   roomId,   room_name:   roomName   } : {};

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

    // 連続予約は同一 series_id で束ねる（後で「この日以降を全削除」できるように）
    const seriesId = recurringWeeks > 1
      ? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null)
      : null;

    const appointmentsToInsert = [];
    for (let i = 0; i < recurringWeeks; i++) {
      const targetDate = new Date(baseDate.getTime());
      targetDate.setDate(targetDate.getDate() + i * 7);

      const startDateTimeStr = targetDate.toISOString();
      const endDate = new Date(targetDate.getTime() + durationMinutes * 60 * 1000);
      const memoBase = `[院内追加] ${symptoms}`.trim();
      const memoText = recurringWeeks > 1 ? `${memoBase} (定期予約 ${i + 1}/${recurringWeeks})` : memoBase;

      appointmentsToInsert.push({
        customer_id: customerId,
        start_time: startDateTimeStr,
        end_time: endDate.toISOString(),
        memo: memoText,
        is_first_visit: i === 0 ? isFirstVisit : false,
        status: "confirmed",
        clinic_id: clinicId,
        series_id: seriesId,
        ...courseExtra,
        ...staffExtra,
        ...roomExtra,
        ...additionalCoursesExtra,
        ...additionalStaffExtra,
      });
    }

    // tenant-isolation-ignore: appointmentsToInsert の各行に clinic_id を埋め込み済み（L143）
    const { error: appointmentErr } = await supabase
      .from("appointments")
      .insert(appointmentsToInsert);

    if (appointmentErr) {
      console.error("Appointment insertion error:", appointmentErr);
      return { success: false, error: `予約情報の登録に失敗しました: ${appointmentErr.message}` };
    }

    // ── 「施術後に○○を追加」（新規追加時）：設定の addon_course_id を、最初の予約の直後 or 同時刻に入れる ──
    const addAddon = formData.get("addAddon") === "true";
    const addonTiming = (formData.get("addonTiming") as string) === "same" ? "same" : "after";
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
              .select("id, name, duration_minutes, required_staff_id")
              .eq("id", addonId)
              .eq("clinic_id", clinicId)
              .maybeSingle()
          : { data: null as { id: string; name: string; duration_minutes: number | null; required_staff_id: string | null } | null };
        if (addon && addon.id !== courseId) {
          const aDur = Number(addon.duration_minutes ?? 30) || 30;
          const aBase = addonTiming === "same" ? baseDate : new Date(baseDate.getTime() + durationMinutes * 60 * 1000);
          const aStartIso = aBase.toISOString();
          const aEndIso = new Date(aBase.getTime() + aDur * 60 * 1000).toISOString();
          const aStaffId = (addon.required_staff_id as string | null) ?? null;
          const aName = addon.name as string;
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
          if (laneFree) {
            await supabase.from("appointments").insert([{
              customer_id: customerId,
              start_time: aStartIso,
              end_time: aEndIso,
              memo: addonTiming === "same" ? `【${aName} 追加・同時刻】` : `【${aName} 追加・施術後】`,
              is_first_visit: false,
              status: "confirmed",
              clinic_id: clinicId,
              course_id: addon.id,
              course_name: aName,
              ...(aStaffId ? { staff_id: aStaffId, staff_name: aName } : {}),
            }]);
          }
        }
      } catch (e) {
        console.error("manual addon add failed", e);
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
      summary: `${name.trim()}様の予約を作成（${rawDate} ${time}、${appointmentsToInsert.length}件）`,
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
    return { success: true };
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
  }
) {
  const auth = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    if (supabase) {
      // 変更前を保存
      const { data: before } = await supabase
        .from("appointments")
        .select("id, start_time, end_time, memo, is_first_visit, course_id, course_name, staff_id, staff_name, room_id, room_name, customers(name)")
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

      const { error } = await supabase
        .from("appointments")
        .update(updatePayload)
        .eq("id", appointmentId)
        .eq("clinic_id", auth.clinicId);

      if (error) {
        console.error("Failed to update appointment:", error);
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

    // 予約と顧客情報（line_user_id含む）を取得（自院のみ）
    const { data: apt, error } = await supabase
      .from("appointments")
      .select("id, start_time, is_first_visit, status, customers(name, line_user_id)")
      .eq("clinic_id", clinicId)
      .eq("id", appointmentId)
      .single();

    if (error || !apt) return { success: false, error: "予約情報の取得に失敗しました" };

    const customer = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
    const lineUserId = customer?.line_user_id;

    if (!lineUserId) {
      return { success: false, error: "この患者のLINE IDが未登録です。患者がLINE公式アカウントにメッセージを送ると登録されます。" };
    }

    // 動的トークン取得（LINE_CHANNEL_ID/SECRET 経由が優先、static token はフォールバック）
    const token = await getLineAccessToken();
    if (!token) {
      return { success: false, error: "LINE トークンが取得できません。env LINE_CHANNEL_ID/SECRET または LINE_CHANNEL_ACCESS_TOKEN を確認してください。" };
    }

    const startTime = new Date(apt.start_time);
    const dateStr = startTime.toLocaleDateString("ja-JP", {
      year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo",
    });
    const timeStr = startTime.toLocaleTimeString("ja-JP", {
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo",
    });
    const visitLabel = apt.is_first_visit ? "初診（60分）" : "再診（30分）";
    const statusLabel = apt.status === "confirmed" ? "✅ 予約確定" : "⏳ 確認待ち";
    const reservationNumber = apt.id.split("-")[0].toUpperCase();

    const messageText = `${statusLabel}\n\n${customer?.name || ""}様の予約内容をお知らせします。\n\n📅 日時: ${dateStr} ${timeStr}\n🏥 種別: ${visitLabel}\n📋 予約番号: ${reservationNumber}\n\nご来院をお待ちしております。`;

    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: messageText }] }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error(`[LINE送信失敗] status=${res.status}`, errBody);
      // status code に応じた具体的なエラー（友だち追加してないと一律で返さない）
      if (res.status === 401) {
        return { success: false, error: "LINE 認証エラー。設定の LINE_CHANNEL_ID/SECRET が正しいか確認してください。" };
      }
      if (res.status === 403) {
        return { success: false, error: "この患者は LINE 公式アカウントの友だち登録が解除されているか、まだ追加していません。患者に友だち追加を案内してください。" };
      }
      const detail = errBody?.message ? `（${errBody.message}）` : "";
      return { success: false, error: `LINE 送信失敗 (HTTP ${res.status})${detail}` };
    }

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
        is_first_visit, memo, course_id, course_name, staff_id, staff_name, room_name,
        customers(id, name, phone, line_user_id, medical_record_number, birth_date, city_name)
      `)
      .eq("clinic_id", clinicId)
      .neq("status", "cancelled")
      .gte("start_time", dayStart)
      .lte("start_time", dayEnd)
      .order("start_time", { ascending: true });

    if (error) return { success: false, data: [] };
    return { success: true, data: data ?? [] };
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
    let waitlistCandidates: WaitlistCandidate[] = [];
    try {
      if (before?.start_time) {
        const freed = new Date(before.start_time);
        // JST の当日範囲（UTC 換算）を作る
        const jst = new Date(freed.getTime() + 9 * 3600 * 1000);
        const y = jst.getUTCFullYear(), mo = jst.getUTCMonth(), da = jst.getUTCDate();
        const dayStartUtc = new Date(Date.UTC(y, mo, da, 0, 0, 0) - 9 * 3600 * 1000);
        const dayEndUtc = new Date(Date.UTC(y, mo, da + 1, 0, 0, 0) - 9 * 3600 * 1000);
        const { data: waiting } = await supabase
          .from("appointments")
          .select("id, start_time, is_first_visit, customers(name, line_user_id)")
          .eq("clinic_id", auth.clinicId)
          .eq("status", "waiting")
          .gte("start_time", dayStartUtc.toISOString())
          .lt("start_time", dayEndUtc.toISOString())
          .order("start_time");
        waitlistCandidates = (waiting ?? []).map((w: any) => {
          const c = Array.isArray(w.customers) ? w.customers[0] : w.customers;
          return {
            appointmentId: w.id as string,
            customerName: (c?.name as string) ?? "(お名前未登録)",
            hasLine: !!c?.line_user_id,
            startTime: w.start_time as string,
            isFirstVisit: !!w.is_first_visit,
          };
        });
      }
    } catch (e) {
      console.error("waitlist lookup after cancel failed:", e);
    }

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
      .select("id, customers(name, line_user_id)")
      .eq("clinic_id", clinicId)
      .eq("id", waitingAppointmentId)
      .single();
    if (error || !apt) return { success: false, error: "キャンセル待ち情報の取得に失敗しました" };

    const customer = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
    const lineUserId = customer?.line_user_id;
    if (!lineUserId) {
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

    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: messageText }] }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error(`[キャンセル待ちLINE送信失敗] status=${res.status}`, errBody);
      if (res.status === 403) {
        return { success: false, error: "この方はLINE公式アカウントの友だち登録がないため送信できません。お電話でご連絡ください。" };
      }
      const detail = errBody?.message ? `（${errBody.message}）` : "";
      return { success: false, error: `LINE送信に失敗しました (HTTP ${res.status})${detail}` };
    }

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
      if (hasPhone) {
        const { data } = await supabase
          .from("customers")
          .select("id")
          .eq("phone", phoneTrimmed)
          .eq("clinic_id", clinicId)
          .maybeSingle();
        existing = data ?? null;
      } else {
        // 同名検索 - 1件のみヒットなら既存扱い、複数なら新規作成（別人混同を避けるため）
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
      const endDate = new Date(new Date(startDateTimeStr).getTime() + 30 * 60 * 1000);

      const memo = `[AI一括登録] ${r.symptoms || ""}`.trim();

      // マスタ一括取得結果から名前を解決（クリニック横断混入を防止）
      const courseName = r.courseId ? courseMap.get(r.courseId) ?? null : null;
      const staffName  = r.staffId  ? staffMap.get(r.staffId)   ?? null : null;
      const roomName   = r.roomId   ? roomMap.get(r.roomId)     ?? null : null;

      // ID がマスタに存在しない場合はそのフィールドを保存しない（別院ID混入の保険）
      const courseIdValid = r.courseId && courseName !== null;
      const staffIdValid  = r.staffId  && staffName  !== null;
      const roomIdValid   = r.roomId   && roomName   !== null;

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
