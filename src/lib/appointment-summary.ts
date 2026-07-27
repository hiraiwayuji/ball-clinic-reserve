/**
 * 患者さんに見せる「予約内容」の文言を、予約レコードの実データだけから組み立てる。
 *
 * 【この共通部品を作った理由】
 * もともと確定LINEの本文は `is_first_visit ? "初診（60分）" : "再診（30分）"` と
 * 決め打ちで組み立てていた。実際の施術時間（end_time - start_time）を一切見ないため、
 * 60分で確定した再診の予約に「再診（30分）」と書いたLINEが届く事故が起きた（2026-07-27）。
 * ボール接骨院の直近90日では 995件中 403件が決め打ちと実時間が食い違っており、
 * 偶発ではなく確定LINEを送るたびに起こりうる状態だった。
 *
 * ルール:
 *   1. 施術時間は end_time - start_time «だけ» を正とする。初診/再診から推測しない。
 *   2. end_time が無い・壊れている場合は分数を «書かない»（憶測の数字を患者さんに出さない）。
 *   3. 患者さん向けの画面・LINE・APIは、必ずこのファイルの関数を通す。
 */

const JST = "Asia/Tokyo";

export type AppointmentForSummary = {
  start_time: string;
  end_time?: string | null;
  is_first_visit?: boolean | null;
  course_name?: string | null;
  additional_courses?: { course_name?: string | null }[] | null;
};

/** 実際の施術時間（分）。end_time が無い・不正なら null（＝分数を表示しない）。 */
export function getDurationMinutes(apt: AppointmentForSummary): number | null {
  if (!apt.end_time) return null;
  const start = new Date(apt.start_time).getTime();
  const end = new Date(apt.end_time).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const minutes = Math.round((end - start) / 60000);
  return minutes > 0 ? minutes : null;
}

/** 「2026年7月27日(月)」 */
export function formatDateJa(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: JST,
  });
}

/** 「18:30」 */
export function formatTimeJa(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", {
    hour: "2-digit", minute: "2-digit", timeZone: JST,
  });
}

/**
 * 「18:30〜19:30（60分）」。
 * end_time が取れないときは「18:30」だけを返し、分数は書かない。
 */
export function formatTimeRange(apt: AppointmentForSummary): string {
  const start = formatTimeJa(apt.start_time);
  const minutes = getDurationMinutes(apt);
  if (minutes === null || !apt.end_time) return start;
  return `${start}〜${formatTimeJa(apt.end_time)}（${minutes}分）`;
}

/**
 * 「再診・さみ整体 ロング」。メニュー未設定なら「再診」だけ。
 * 追加メニューがあれば「＋」でつなぐ。分数はここには入れない（時間は formatTimeRange 側）。
 */
export function formatVisitLabel(apt: AppointmentForSummary): string {
  const base = apt.is_first_visit ? "初診" : "再診";
  const names = [
    apt.course_name,
    ...(apt.additional_courses ?? []).map((c) => c?.course_name),
  ]
    .map((n) => (typeof n === "string" ? n.trim() : ""))
    .filter((n) => n.length > 0);
  return names.length > 0 ? `${base}・${names.join(" ＋ ")}` : base;
}

/** 患者さん向けの「📅 日時」1行。日付＋時間帯＋実時間。 */
export function formatDateTimeLine(apt: AppointmentForSummary): string {
  return `${formatDateJa(apt.start_time)} ${formatTimeRange(apt)}`;
}
