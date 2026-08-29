"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { checkAdminAuth } from "./auth";
import { getTimeSlots, type SlotMinutes } from "@/lib/time-slots";

/**
 * 院内の予約追加ダイアログ用の空き枠取得。
 *
 * NOTE: 本ファイルは adminReserve.ts から意図的に切り出してある。
 * adminReserve.ts に新規 export を追加すると Next.js 16 が同ファイル内の Action ID を
 * 再計算して、既にロード済みのクライアント bundle と mismatch を起こす（=「通信エラー」）。
 * duplicateCheck.ts と同じ理由・同じ方針。
 */

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key);
}

/** DB の "HH:MM:SS" / "HH:MM" を "HH:MM" に正規化（未設定は null）。 */
function normTime(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export type AdminDaySlot = {
  time: string; // "HH:MM"
  /** true = 選ばせない（重複NG(prevent_overlap)の担当レーンにすでに予約が入っている枠） */
  blocked: boolean;
  /** 補足ラベル（"12:00に予約あり・20分ならOK" / "休憩" / "休診日"）。null なら普通の空き。 */
  note: string | null;
  /**
   * 予約とぶつかる枠で「この所要時間までなら重ならない」分数。
   * 枠の頭からすでに施術中なら null（時間を短くしても入らない）。
   */
  fitMinutes?: number | null;
  /**
   * true = DB の除外制約（appointments_single_resource_no_overlap）が効く担当。
   * この枠は院長先生でも登録できない（DB が 23P01 で弾く）ので、承認ルートを出さない。
   * false = アプリのガードだけで止めている枠。院長先生は承知のうえで登録できる。
   */
  dbEnforced?: boolean;
};

/**
 * 指定日の時間スロットを「担当レーンの埋まり具合」つきで返す。
 *
 * ・担当レーン（担当指定 > コースの required_staff_id）に予約が重なる枠は
 *   ぶつかっている予約の時間そのものを note に添える。ただ"予約あり"とだけ出すと、
 *   所要時間が長いときに「選んだ時刻には何も無いのに後ろでぶつかる」理由が分からないため。
 *   - 枠の頭からすでに施術中: "10:00〜11:00に予約あり"
 *   - 後ろの予約に食い込むだけ: "12:00に予約あり・20分ならOK"（短くすれば取れる）
 *   選ばせないか（blocked=true）は担当の prevent_overlap で決まる。
 *   - prevent_overlap=true（ボール）: 1人ずつしか診ない運用。DB の除外制約も効く担当なので、
 *     ここで選ばせないことがダブルブッキングの手前の防波堤になる。
 *   - prevent_overlap=false（からだ・マッスル等）: 同時に複数人を診る運用で、DB の除外制約も
 *     掛からない。埋まっていても正当な枠なので blocked にせず、注記を添えるだけにする。
 * ・休憩枠・休診日は note を付けるだけで blocked にしない。院内は「休憩中でも例外的にねじ込む」
 *   運用があり、これまで院内追加はこの2つを一切見ていなかったため、止めずに注意だけ促す。
 * ・レーンが決まらない（担当もコースも未選択）ときは埋まり判定ができないので全枠を空きとして返す。
 * ・失敗時は fail-open（全枠を空き扱い）。院内の登録を止めないことを優先し、
 *   最終的な担当かぶりは送信時の checkAddAppointmentOverlap と DB 制約で拾う。
 */
export async function getAdminDaySlots(params: {
  date: string; // "yyyy-MM-dd"
  staffId: string | null;
  courseId: string | null;
  durationMinutes: number;
  slotMinutes: number;
}): Promise<AdminDaySlot[]> {
  const { clinicId } = await checkAdminAuth();

  const dateStr = params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return [];
  // クライアントから届く値なので、想定内の刻みだけ通す（想定外は30分に丸める）
  const allowedSlotMinutes: readonly number[] = [10, 15, 20, 30];
  const slotMinutes: SlotMinutes = allowedSlotMinutes.includes(Number(params.slotMinutes))
    ? (Number(params.slotMinutes) as SlotMinutes)
    : 30;
  const durationMinutes = Number(params.durationMinutes) || slotMinutes;

  // 院内追加はこれまでどおり営業時間に縛られない広い枠（09:00〜23:00）から選ばせる。
  const times = getTimeSlots(new Date(`${dateStr}T00:00:00+09:00`), {
    bypassRestrictions: true,
    slotMinutes,
  });
  const openSlots: AdminDaySlot[] = times.map((t) => ({ time: t, blocked: false, note: null }));

  const supabase = getAdminSupabase();
  if (!supabase) return openSlots;

  try {
    // 実効レーンを決める（担当指定 > コースの担当）。どちらも無ければレーン重複の概念がない。
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

    const dayStartIso = `${dateStr}T00:00:00+09:00`;
    const dayEndIso = `${dateStr}T23:59:59+09:00`;

    const { data: holiday } = await supabase
      .from("clinic_holidays")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("date", dateStr)
      .maybeSingle();

    const { data: breakRows } = await supabase
      .from("clinic_blocked_slots")
      .select("start_time, end_time, reason, staff_id")
      .eq("clinic_id", clinicId)
      .eq("date", dateStr);

    // 担当が埋まっている枠は、院を問わず選ばせない。
    //
    // 2026-08-22 まではここを `reservation_staff.prevent_overlap` で切り替えており、
    // false の院（からだ・マッスル・AILUS）は埋まっていても枠を選べていた。
    // その結果、同じ先生の同じ時間に2件入る「かぶり予約」が7〜8月だけで64組発生した。
    // ぼーるくんの依頼（2026-08-22）で、登録・編集の全経路をサーバー側で止めるようにしたため、
    // ここで選べたままだと「選べるのに登録すると弾かれる」という食い違いになる。
    // 重ねて診たいときは担当を分ける運用にそろえる。
    const laneExclusive = true;

    // その担当が DB の除外制約の対象か（prevent_overlap=true = 1人ずつしか診ない担当）。
    // true なら院長先生でも登録できない（DB が弾く）ので、承認ルートを出してはいけない。
    // false（からだ・マッスル等、同時に複数人を診る運用）はアプリのガードだけなので、
    // 院長先生は「重なりを承知で登録する」で通せる ＝ 選ばせないと承認ルートが死ぬ。
    let dbEnforced = false;
    if (effStaffId) {
      const { data: st } = await supabase
        .from("reservation_staff")
        .select("prevent_overlap")
        .eq("id", effStaffId)
        .eq("clinic_id", clinicId)
        .maybeSingle();
      dbEnforced = st?.prevent_overlap === true;
    }

    // レーンの既存予約。キャンセルは無視。
    // C待ち(waiting)は「その時間帯に空きが出たら」の希望登録で枠を持たないので除外する
    // （reserve.ts の getDailyAvailability と同じ考え方）。
    let laneRows: { start_time: string; end_time: string | null }[] = [];
    if (effStaffId) {
      const { data } = await supabase
        .from("appointments")
        .select("start_time, end_time")
        .eq("clinic_id", clinicId)
        .eq("staff_id", effStaffId)
        .neq("status", "cancelled")
        .neq("status", "waiting")
        .gte("start_time", dayStartIso)
        .lte("start_time", dayEndIso);
      laneRows = (data ?? []) as { start_time: string; end_time: string | null }[];
    }

    const isHoliday = !!holiday;
    // 先生1人だけの予約NG枠（staff_id あり）は、今まさにその先生で組もうとしているときだけ効かせる。
    // 院ぜんたいの休憩（staff_id 無し）は従来どおり全レーンに注記する。
    const breaks = ((breakRows ?? []) as { start_time: string; end_time: string; reason: string | null; staff_id: string | null }[])
      .filter((b) => !b.staff_id || b.staff_id === effStaffId)
      .map((b) => ({
        start: new Date(`${dateStr}T${normTime(b.start_time) ?? "00:00"}:00+09:00`).getTime(),
        end: new Date(`${dateStr}T${normTime(b.end_time) ?? "00:00"}:00+09:00`).getTime(),
        reason: (b.reason || "休憩").trim(),
      }));
    // 注記に出す時刻は必ず日本時間で（Vercel の実行環境は UTC）。
    const jstHm = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const booked = laneRows.map((a) => {
      const start = new Date(a.start_time).getTime();
      // 終了時刻が入っていない予約は院の枠サイズぶんとみなす（30分決め打ちにしない）
      const end = a.end_time ? new Date(a.end_time).getTime() : start + slotMinutes * 60 * 1000;
      return { start, end, label: `${jstHm.format(start)}〜${jstHm.format(end)}` };
    });

    return times.map((t) => {
      const s = new Date(`${dateStr}T${t}:00+09:00`).getTime();
      const e = s + durationMinutes * 60 * 1000;
      // ぶつかっている予約の時間をそのまま出す。
      const hits = booked.filter((b) => s < b.end && e > b.start).sort((x, y) => x.start - y.start);
      if (hits.length > 0) {
        // 枠の頭からすでに施術中か（＝時間を短くしても入らない）。
        const covering = hits.find((b) => b.start <= s);
        if (covering) {
          const more = hits.length > 1 ? ` 他${hits.length - 1}件` : "";
          return { time: t, blocked: laneExclusive, note: `${covering.label}に予約あり${more}`, fitMinutes: null, dbEnforced };
        }
        // 枠の頭は空いていて、後ろの予約に食い込んでいるだけ。
        // 「何分までなら重ならないか」を、実際に選べる所要時間（slotMinutes の倍数）に丸めて出す。
        const next = hits[0];
        const gapMinutes = Math.floor((next.start - s) / 60000);
        const fit = Math.floor(gapMinutes / slotMinutes) * slotMinutes;
        const head = `${jstHm.format(next.start)}に予約あり`;
        const note =
          fit >= slotMinutes
            ? laneExclusive
              ? `${head}・${fit}分ならOK`
              : `${head}・${fit}分なら重なりません`
            : head;
        return { time: t, blocked: laneExclusive, note, fitMinutes: fit >= slotMinutes ? fit : null, dbEnforced };
      }
      const hitBreak = breaks.find((b) => s < b.end && e > b.start);
      if (hitBreak) return { time: t, blocked: false, note: hitBreak.reason };
      if (isHoliday) return { time: t, blocked: false, note: "休診日" };
      return { time: t, blocked: false, note: null };
    });
  } catch (e) {
    console.error("[getAdminDaySlots] failed, falling back to open slots:", e);
    return openSlots;
  }
}
