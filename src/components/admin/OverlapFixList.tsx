"use client";

/**
 * 担当がかぶって登録を止めたときに、「代わりにこの時間なら取れます」を並べる部品。
 *
 * 止めるだけだと、スタッフは自分で直しようがなくて院長先生に聞くしかなくなる。
 * 院長先生が全部の判断を引き受けるのは現実的ではない
 * （2026-08-22 ぼーるくん「これはだめだけど、こうしたら予約がうまくとれます、
 *   という風に修正できるようにしたい」）。
 *
 * ここに出す候補は、その先生の勤務時間・休憩・お休みと、すでに入っている予約の
 * 両方を見たうえでの「本当に取れる枠」だけ。押したら入力欄がその値に変わる。
 * 候補が1つも出せないときは、その旨をはっきり書く（黙って空にしない）。
 */

import { useEffect, useState } from "react";
import { Loader2, Clock, UserRound } from "lucide-react";
import { suggestOverlapFixes, type OverlapFixes } from "@/app/actions/adminReserve";

type Props = {
  /** かぶった担当 */
  staffId: string | null;
  /** 希望日 "yyyy-MM-dd" */
  dateStr: string;
  /** 希望時刻 "HH:mm" */
  time: string;
  durationMinutes: number;
  /** 編集中の予約（自分自身を候補計算から外す） */
  excludeAppointmentId?: string | null;
  courseId?: string | null;
  /** 「この時間なら取れます」を押したとき。hm は "HH:mm" */
  onPickTime: (hm: string) => void;
  /** 「この先生なら取れます」を押したとき */
  onPickStaff: (staffId: string, staffName: string | null) => void;
  /**
   * 見ている人が院長先生（オーナー）か。
   * 院長本人の画面で「院長先生にご相談ください」と出すと意味が通らないので、
   * 候補が1つも無いときの文面を変えるためだけに使う（2026-08-29）。
   */
  viewerIsOwner?: boolean;
};

const hmOf = (iso: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));

export function OverlapFixList({
  staffId,
  dateStr,
  time,
  durationMinutes,
  excludeAppointmentId,
  courseId,
  onPickTime,
  onPickStaff,
  viewerIsOwner = false,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [fixes, setFixes] = useState<OverlapFixes | null>(null);

  useEffect(() => {
    let alive = true;
    if (!staffId || !dateStr || !time) { setLoading(false); return; }
    setLoading(true);
    suggestOverlapFixes({
      staffId,
      startIso: new Date(`${dateStr}T${time}:00+09:00`).toISOString(),
      durationMinutes,
      excludeAppointmentId: excludeAppointmentId ?? null,
      courseId: courseId ?? null,
    })
      .then((r) => { if (alive) setFixes(r); })
      .catch(() => { if (alive) setFixes({ sameStaff: [], otherStaff: [] }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [staffId, dateStr, time, durationMinutes, excludeAppointmentId, courseId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        空いている時間を探しています…
      </div>
    );
  }

  const same = fixes?.sameStaff ?? [];
  const other = fixes?.otherStaff ?? [];

  if (same.length === 0 && other.length === 0) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-slate-600 leading-relaxed dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
        この日は、代わりに取れる時間が見つかりませんでした。
        <br />
        {viewerIsOwner
          ? "別の日でお取りいただくか、担当の先生を変えてください。"
          : "別の日でお取りいただくか、院長先生にご相談ください。"}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {same.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
            <Clock className="w-3.5 h-3.5" />
            {same[0].staffName ? `${same[0].staffName}さんなら、この時間が空いています` : "この時間が空いています"}
          </p>
          <div className="flex flex-wrap gap-2">
            {same.map((f) => (
              <button
                key={`t-${f.startIso}`}
                type="button"
                onClick={() => onPickTime(hmOf(f.startIso))}
                className="h-10 px-3 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 text-sm font-bold tabular-nums hover:bg-emerald-100 dark:bg-emerald-900/25 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
              >
                {f.timeLabel}
              </button>
            ))}
          </div>
        </div>
      )}

      {other.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-bold text-blue-800 dark:text-blue-300">
            <UserRound className="w-3.5 h-3.5" />
            {time} のままなら、この先生が空いています
          </p>
          <div className="flex flex-wrap gap-2">
            {other.map((f) => (
              <button
                key={`s-${f.staffId}`}
                type="button"
                onClick={() => onPickStaff(f.staffId, f.staffName)}
                className="h-10 px-3 rounded-xl border border-blue-300 bg-blue-50 text-blue-800 text-sm font-bold hover:bg-blue-100 dark:bg-blue-900/25 dark:border-blue-700 dark:text-blue-200 dark:hover:bg-blue-900/40"
              >
                {f.staffName ?? "担当"}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
        押すと、入力欄がその内容に変わります。そのまま登録してください。
      </p>
    </div>
  );
}
