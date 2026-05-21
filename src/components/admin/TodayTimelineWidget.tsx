"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getTimelineForDate, type TimelineData, type TimelineAppointment } from "@/app/actions/timeline";

// スタッフ未指定の予約をまとめる仮想列
const UNASSIGNED_KEY = "__unassigned__";

function jstHourMinute(iso: string): { hour: number; minute: number } {
  // ISO 文字列を Asia/Tokyo の時刻として解釈
  const d = new Date(iso);
  // toLocaleString で 'Asia/Tokyo' に変換 → 解析
  const parts = d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).split(":");
  return { hour: parseInt(parts[0], 10) || 0, minute: parseInt(parts[1], 10) || 0 };
}

function minuteOfDayJst(iso: string): number {
  const { hour, minute } = jstHourMinute(iso);
  return hour * 60 + minute;
}

function fmtTime(iso: string): string {
  const { hour, minute } = jstHourMinute(iso);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function statusColor(status: string, checkin: string | null, isFirstVisit: boolean): string {
  if (status === "waiting") return "bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100";
  if (checkin === "arrived") return "bg-emerald-100 border-emerald-400 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100";
  if (checkin === "done") return "bg-slate-100 border-slate-300 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300";
  if (isFirstVisit) return "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100";
  return "bg-sky-50 border-sky-300 text-sky-900 dark:bg-sky-900/30 dark:text-sky-100";
}

export default function TodayTimelineWidget() {
  const [date, setDate] = useState<Date | null>(null);
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedApt, setSelectedApt] = useState<TimelineAppointment | null>(null);

  useEffect(() => { setDate(new Date()); }, []);

  const fetchData = useCallback(async (d: Date) => {
    setLoading(true);
    setError(null);
    const res = await getTimelineForDate(format(d, "yyyy-MM-dd"));
    if (res.success && res.data) {
      setData(res.data);
    } else {
      setError(res.error ?? "取得失敗");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!date) return;
    fetchData(date);
  }, [date, fetchData]);

  // Realtime: appointments 変更で再取得
  useEffect(() => {
    if (!date) return;
    const sb = createClient();
    const ch = sb.channel("timeline-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => fetchData(date))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [date, fetchData]);

  const goPrev = () => date && setDate(new Date(date.getTime() - 24 * 3600 * 1000));
  const goNext = () => date && setDate(new Date(date.getTime() + 24 * 3600 * 1000));
  const goToday = () => setDate(new Date());

  // スタッフ未指定の予約があれば仮想列を末尾に追加
  const staffWithUnassigned = useMemo(() => {
    if (!data) return [];
    const hasUnassigned = data.appointments.some(a => !a.staff_id);
    const rows = data.staff.map(s => ({ id: s.id, name: s.name }));
    if (hasUnassigned) rows.push({ id: UNASSIGNED_KEY, name: "未指定" });
    return rows;
  }, [data]);

  // 時間軸の刻みリスト（9:00-20:00 など、slotMinutes 単位）
  const timeMarks = useMemo(() => {
    if (!data) return [] as { label: string; minute: number }[];
    const out: { label: string; minute: number }[] = [];
    const startMin = data.scheduleStartHour * 60;
    const endMin = data.scheduleEndHour * 60;
    for (let m = startMin; m < endMin; m += data.slotMinutes) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      out.push({
        label: mm === 0 ? `${h}:00` : `:${String(mm).padStart(2, "0")}`,
        minute: m,
      });
    }
    return out;
  }, [data]);

  // 予約をスタッフごとにグループ化
  const aptsByStaff = useMemo(() => {
    const map = new Map<string, TimelineAppointment[]>();
    if (!data) return map;
    for (const a of data.appointments) {
      const key = a.staff_id ?? UNASSIGNED_KEY;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [data]);

  if (!date) return null;

  return (
    <Card className="shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">
            予約タイムテーブル ({format(date, "M/d (E)", { locale: ja })})
          </CardTitle>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={goPrev} aria-label="前日">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" />今日
          </Button>
          <Button variant="outline" size="sm" onClick={goNext} aria-label="翌日">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />読込中...
          </div>
        ) : error ? (
          <div className="text-rose-600 text-sm py-6 text-center">エラー: {error}</div>
        ) : data && data.staff.length === 0 ? (
          <div className="text-slate-500 text-sm py-6 text-center">
            スタッフが登録されていません。設定 → スタッフから追加してください。
          </div>
        ) : data && (
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* 時間軸ヘッダ */}
              <div
                className="grid items-center text-[10px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700"
                style={{ gridTemplateColumns: `80px repeat(${timeMarks.length}, minmax(28px, 1fr))` }}
              >
                <div className="px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">先生</div>
                {timeMarks.map((m, i) => (
                  <div
                    key={i}
                    className={`text-center py-1 ${m.label.includes(":00") ? "border-l border-slate-300 dark:border-slate-600 font-semibold text-slate-700 dark:text-slate-200" : ""}`}
                  >
                    {m.label}
                  </div>
                ))}
              </div>

              {/* スタッフ行 */}
              {staffWithUnassigned.map((s) => {
                const apts = aptsByStaff.get(s.id) ?? [];
                return (
                  <div
                    key={s.id}
                    className="grid relative border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                    style={{
                      gridTemplateColumns: `80px repeat(${timeMarks.length}, minmax(28px, 1fr))`,
                      minHeight: "48px",
                    }}
                  >
                    <div className="px-2 py-1 text-sm font-medium text-slate-800 dark:text-slate-100 flex items-center sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-200 dark:border-slate-700">
                      {s.name}
                    </div>
                    {/* グリッド線 */}
                    {timeMarks.map((m, i) => (
                      <div
                        key={i}
                        className={`h-full ${m.label.includes(":00") ? "border-l border-slate-300 dark:border-slate-600" : "border-l border-slate-100 dark:border-slate-800"}`}
                      />
                    ))}
                    {/* 予約バー（absolute 配置） */}
                    {apts.map((a) => {
                      const startMin = minuteOfDayJst(a.start_time);
                      const endMinRaw = a.end_time ? minuteOfDayJst(a.end_time) : startMin + data.slotMinutes;
                      const endMin = Math.max(endMinRaw, startMin + data.slotMinutes);
                      const scheduleStart = data.scheduleStartHour * 60;
                      const scheduleEnd = data.scheduleEndHour * 60;
                      // 範囲外ならスキップ
                      if (endMin <= scheduleStart || startMin >= scheduleEnd) return null;
                      const clippedStart = Math.max(startMin, scheduleStart);
                      const clippedEnd = Math.min(endMin, scheduleEnd);
                      const totalCols = timeMarks.length;
                      const colStart = ((clippedStart - scheduleStart) / data.slotMinutes); // 0-index
                      const colSpan = Math.max(1, Math.round((clippedEnd - clippedStart) / data.slotMinutes));
                      // CSS grid 上での位置: 1列目がスタッフ名なので +2
                      const gridColStart = colStart + 2;
                      const cls = statusColor(a.status, a.checkin_status, a.is_first_visit);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setSelectedApt(a)}
                          className={`text-[11px] leading-tight rounded border px-1 py-0.5 my-0.5 text-left truncate hover:ring-2 hover:ring-blue-400 transition-all ${cls}`}
                          style={{
                            gridColumn: `${gridColStart} / span ${colSpan}`,
                            gridRow: 1,
                            alignSelf: "stretch",
                          }}
                          title={`${fmtTime(a.start_time)} ${a.customer_name ?? ""} ${a.course_name ?? ""}`}
                        >
                          <div className="truncate font-semibold">{a.customer_name ?? "(顧客名なし)"}{a.is_first_visit ? " ⓢ" : ""}</div>
                          {a.course_name && <div className="truncate opacity-80">{a.course_name}</div>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>

      {/* 予約詳細モーダル（簡易） */}
      {selectedApt && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedApt(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-5 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {selectedApt.customer_name ?? "(顧客名なし)"}
                </div>
                <div className="text-sm text-slate-500">
                  {fmtTime(selectedApt.start_time)}
                  {selectedApt.end_time && ` - ${fmtTime(selectedApt.end_time)}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedApt(null)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
              >×</button>
            </div>
            <div className="space-y-1.5 text-sm">
              {selectedApt.course_name && <div><span className="text-slate-500">コース:</span> {selectedApt.course_name}</div>}
              {selectedApt.staff_name && <div><span className="text-slate-500">担当:</span> {selectedApt.staff_name}</div>}
              {selectedApt.room_name && <div><span className="text-slate-500">部屋:</span> {selectedApt.room_name}</div>}
              <div><span className="text-slate-500">状態:</span> {selectedApt.status}{selectedApt.is_first_visit && " (初診)"}</div>
              {selectedApt.memo && <div><span className="text-slate-500">メモ:</span> <span className="whitespace-pre-wrap">{selectedApt.memo}</span></div>}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
