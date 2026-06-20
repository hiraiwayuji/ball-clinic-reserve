"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Loader2, X } from "lucide-react";
import Link from "next/link";
import { getDayStaffSummary, type DayStaffSummary } from "@/app/actions/staff-schedule";

// display_color 名 → HEX
const COLOR: Record<string, string> = {
  blue: "#3b82f6", sky: "#0ea5e9", indigo: "#6366f1", violet: "#8b5cf6", purple: "#a855f7",
  pink: "#ec4899", rose: "#f43f5e", red: "#ef4444", orange: "#f97316", amber: "#f59e0b",
  yellow: "#eab308", lime: "#84cc16", green: "#22c55e", emerald: "#10b981", teal: "#14b8a6", cyan: "#06b6d4",
  slate: "#64748b", gray: "#6b7280",
};

function hmToMin(hm: string | null): number {
  if (!hm) return 0;
  const [h, m] = hm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

type Props = {
  dateStr: string;
  onClose: () => void;
};

export function DayDetailPanel({ dateStr, onClose }: Props) {
  const [summaries, setSummaries] = useState<DayStaffSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getDayStaffSummary(dateStr)
      .then((r) => { if (r.success) setSummaries(r.summaries ?? []); })
      .finally(() => setLoading(false));
  }, [dateStr]);

  const BAR_START = 8 * 60;
  const BAR_END   = 20 * 60;
  const BAR_RANGE = BAR_END - BAR_START;
  const marks = [8, 10, 12, 14, 16, 18, 20];

  const pct = (min: number) =>
    `${Math.max(0, Math.min(100, ((min - BAR_START) / BAR_RANGE) * 100)).toFixed(1)}%`;

  const dateObj = new Date(dateStr + "T00:00:00+09:00");
  const label = format(dateObj, "M月d日（E）", { locale: ja });

  const staff = summaries.filter((s) => s.showInTimeline !== false || s.role === "reception");

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden">
      {/* ヘッダ */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-slate-800 dark:text-slate-100">{label} 出勤詳細</span>
          <Link
            href={`/admin/appointments?date=${dateStr}`}
            className="text-[11px] text-blue-600 dark:text-blue-400 underline hover:no-underline"
          >
            予約表を開く →
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        </div>
      ) : staff.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-400 text-center">スタッフ情報がありません</p>
      ) : (
        <div className="p-3 space-y-1.5 overflow-x-auto">
          {/* 時間目盛り行 */}
          <div className="flex">
            <div className="w-24 shrink-0" />
            <div className="flex-1 relative h-4">
              {marks.map((h) => (
                <span
                  key={h}
                  className="absolute text-[9px] text-slate-400 font-bold -translate-x-1/2"
                  style={{ left: pct(h * 60) }}
                >
                  {h}時
                </span>
              ))}
            </div>
          </div>

          {/* スタッフ行 */}
          {staff.map((s) => {
            const startMin = hmToMin(s.startTime);
            const endMin   = hmToMin(s.endTime);
            const brkStart = hmToMin(s.breakStart);
            const brkEnd   = hmToMin(s.breakEnd);
            const color    = (s.displayColor && COLOR[s.displayColor]) || "#64748b";

            const barLeft  = pct(startMin);
            const barWidth = s.startTime && s.endTime
              ? `${Math.max(1, ((Math.min(endMin, BAR_END) - Math.max(startMin, BAR_START)) / BAR_RANGE) * 100).toFixed(1)}%`
              : "0%";

            const brkLeft  = brkStart > 0 ? pct(brkStart) : null;
            const brkWidth = (brkStart > 0 && brkEnd > brkStart)
              ? `${((brkEnd - brkStart) / BAR_RANGE * 100).toFixed(1)}%`
              : null;

            return (
              <div key={s.staffId} className="flex items-center gap-2 min-h-[34px]">
                <div className="w-24 shrink-0 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                    {s.staffName}
                  </span>
                </div>

                <div className="flex-1 relative h-7 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden">
                  {marks.map((h) => (
                    <div
                      key={h}
                      className="absolute top-0 bottom-0 border-l border-slate-200 dark:border-slate-700 pointer-events-none"
                      style={{ left: pct(h * 60) }}
                    />
                  ))}

                  {s.isOff ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-slate-400">休み</span>
                    </div>
                  ) : s.startTime && s.endTime ? (
                    <>
                      <div
                        className="absolute top-1 bottom-1 rounded"
                        style={{ left: barLeft, width: barWidth, background: color, opacity: 0.25 }}
                      />
                      <div
                        className="absolute top-1.5 bottom-1.5 rounded"
                        style={{ left: barLeft, width: barWidth, background: color, opacity: 0.55 }}
                      />
                      {brkLeft && brkWidth && (
                        <div
                          className="absolute top-0.5 bottom-0.5 rounded border border-slate-400/70 flex items-center justify-center overflow-hidden"
                          style={{
                            left: brkLeft,
                            width: brkWidth,
                            backgroundColor: "rgba(248, 250, 252, 0.92)",
                            backgroundImage:
                              "repeating-linear-gradient(45deg, rgba(100,116,139,0.35) 0, rgba(100,116,139,0.35) 3px, transparent 3px, transparent 7px)",
                          }}
                        >
                          <span className="text-[8px] font-black text-slate-600 select-none bg-white/80 rounded px-0.5 leading-none">休憩</span>
                        </div>
                      )}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 text-[9px] font-black text-white pointer-events-none"
                        style={{ left: `calc(${barLeft} + 3px)` }}
                      >
                        {s.startTime}〜{s.endTime}
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] text-slate-400">未設定</span>
                    </div>
                  )}
                </div>

                {!s.isOff && (
                  <div className={`shrink-0 w-10 text-center text-xs font-black rounded-full px-1.5 py-0.5 ${
                    s.appointmentCount > 0
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                      : "text-slate-300"
                  }`}>
                    {s.appointmentCount > 0 ? `${s.appointmentCount}件` : "－"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
