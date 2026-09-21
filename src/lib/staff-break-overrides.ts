/**
 * 先生の「その日だけの休憩」（staff_working_overrides の kind="break"）を読む共通部品。
 *
 * 🚨 予約の空き判定は複数の場所にある（患者さんのWeb予約・院内の登録・予約表）。
 * 休憩を日ごとに動かせるようにするなら、全部が同じデータを見ないと
 * 「予約表では休憩を動かしたのに、Web予約は元の時間で止まったまま」になる。
 * 必ずこの関数で読み、buildStaffSchedule の第5引数に渡すこと。
 *
 * 行の意味:
 *   start_time / end_time あり → その時間が休憩
 *   両方 null                 → その日は休憩なし
 */
import type { StaffDateBreak } from "@/lib/staff-availability";

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const hhmm = (v: string | null | undefined): string | null => (v ? String(v).slice(0, 5) : null);

/**
 * 先生ごとの「その日だけの休憩」を返す。
 * date を渡せばその日だけ、fromDate を渡せばその日以降ぜんぶ（カレンダー用）。
 */
export async function fetchStaffDateBreaks(
  db: Db,
  clinicId: string,
  opts: { date?: string; fromDate?: string; staffIds?: string[] } = {},
): Promise<Map<string, StaffDateBreak[]>> {
  const out = new Map<string, StaffDateBreak[]>();
  try {
    let q = db
      .from("staff_working_overrides")
      .select("staff_id, date, start_time, end_time, status")
      .eq("clinic_id", clinicId)
      .eq("kind", "break");
    if (opts.date) q = q.eq("date", opts.date);
    if (opts.fromDate) q = q.gte("date", opts.fromDate);
    if (opts.staffIds && opts.staffIds.length > 0) q = q.in("staff_id", opts.staffIds);
    const { data, error } = await q;
    if (error) {
      console.error("fetchStaffDateBreaks failed:", error);
      return out;
    }
    for (const r of (data ?? []) as { staff_id: string; date: string; start_time: string | null; end_time: string | null; status?: string | null }[]) {
      if (r.status && r.status !== "approved") continue;
      const list = out.get(r.staff_id) ?? [];
      list.push({ date: String(r.date).slice(0, 10), start: hhmm(r.start_time), end: hhmm(r.end_time) });
      out.set(r.staff_id, list);
    }
  } catch (e) {
    console.error("fetchStaffDateBreaks threw:", e);
  }
  return out;
}
