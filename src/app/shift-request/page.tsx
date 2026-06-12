"use client";

import { useEffect, useMemo, useState } from "react";
import {
  format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, addDays, isSameMonth,
} from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";
import { Loader2, CalendarClock, ChevronLeft, ChevronRight, CheckCircle2, Clock } from "lucide-react";
import {
  listShiftStaff, getShiftRequest, submitShiftRequest,
  type ShiftStaff, type ShiftDays,
} from "@/app/actions/staff-shift-requests";
import { CLINIC_CONFIG } from "@/lib/clinic-config";

type Cell = "none" | "work" | "off";

const DEFAULT_START = "09:00";
const DEFAULT_END = "18:00";
const TIMES = (() => {
  const out: string[] = [];
  for (let h = 7; h <= 22; h++) for (const m of [0, 30]) out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  return out;
})();

export default function ShiftRequestPage() {
  const clinicName = CLINIC_CONFIG.name; // ビルド時固定（/ と同じ。実行時env依存にしない＝ボール混入防止）
  const [staffList, setStaffList] = useState<ShiftStaff[]>([]);
  const [staffId, setStaffId] = useState("");
  const [month, setMonth] = useState<Date | null>(null);
  const [days, setDays] = useState<ShiftDays>({});
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setMonth(addMonths(new Date(), 1)); // 既定：翌月
    listShiftStaff().then(setStaffList).catch(() => {});
  }, []);

  const monthStr = useMemo(
    () => (month ? `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}` : ""),
    [month],
  );

  // 名前・月が決まったら既存希望を読み込む
  useEffect(() => {
    if (!staffId || !monthStr) { setDays({}); setNote(""); setSubmittedAt(null); return; }
    setLoading(true);
    getShiftRequest(staffId, monthStr)
      .then((r) => {
        setDays(r?.days ?? {});
        setNote(r?.note ?? "");
        setSubmittedAt(r?.submittedAt ?? null);
      })
      .finally(() => setLoading(false));
  }, [staffId, monthStr]);

  const grid = useMemo(() => {
    if (!month) return [] as Date[];
    const s = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const e = startOfWeek(addDays(endOfMonth(month), 6), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: s, end: e });
  }, [month]);

  const cycle = (key: string) => {
    setDays((prev) => {
      const cur = prev[key];
      const next: ShiftDays = { ...prev };
      if (!cur) {
        // 未入力 → 出勤可能（既定フル時間）
        next[key] = { available: true, start: DEFAULT_START, end: DEFAULT_END };
      } else if (cur.available) {
        // 出勤 → 休み
        next[key] = { available: false };
      } else {
        // 休み → 未入力
        delete next[key];
      }
      return next;
    });
  };

  const setTime = (key: string, field: "start" | "end", value: string) => {
    setDays((prev) => ({ ...prev, [key]: { ...prev[key], available: true, [field]: value } }));
  };

  const workDays = useMemo(
    () => Object.entries(days).filter(([, v]) => v.available).map(([k]) => k).sort(),
    [days],
  );
  const offCount = Object.values(days).filter((v) => !v.available).length;

  const handleSubmit = async () => {
    if (!staffId) { toast.error("お名前を選んでください"); return; }
    if (workDays.length === 0 && offCount === 0) {
      toast.error("出勤できる日を1日以上選んでください");
      return;
    }
    setSubmitting(true);
    const r = await submitShiftRequest({ staffId, month: monthStr, days, note });
    setSubmitting(false);
    if (r.success) setDone(true);
    else toast.error(r.error ?? "送信に失敗しました");
  };

  if (done) {
    const staff = staffList.find((s) => s.id === staffId);
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-9 h-9 text-emerald-500" />
          </div>
          <h1 className="text-xl font-black text-slate-800">提出しました！</h1>
          <p className="text-slate-500 mt-2 text-sm leading-relaxed">
            {staff?.name}さんの{month && format(month, "yyyy年M月", { locale: ja })}の出勤希望を受け付けました。<br />
            院長へお知らせが届きます。ありがとうございました。
          </p>
          <button
            onClick={() => { setDone(false); }}
            className="mt-6 text-sm font-bold text-blue-600 hover:underline"
          >
            内容を修正する
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* ヘッダー */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-blue-600 font-black">
            <CalendarClock className="w-5 h-5" />
            出勤希望の提出
          </div>
          <p className="text-slate-500 text-sm mt-1">{clinicName}</p>
        </div>

        {/* 名前選択 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-sm">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">① お名前を選んでください</span>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="mt-1.5 w-full h-12 rounded-xl border border-slate-300 px-3 text-base bg-white"
            >
              <option value="">― 選択してください ―</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          {/* 月切替 */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">② 対象の月</span>
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
              <button onClick={() => setMonth((d) => (d ? addMonths(d, -1) : d))} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white"><ChevronLeft className="w-4 h-4" /></button>
              <span className="px-2 text-sm font-bold min-w-[96px] text-center">{month && format(month, "yyyy年M月", { locale: ja })}</span>
              <button onClick={() => setMonth((d) => (d ? addMonths(d, 1) : d))} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {staffId && submittedAt && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
            この月はすでに提出済みです（{format(new Date(submittedAt), "M/d HH:mm", { locale: ja })}）。修正して再提出できます。
          </div>
        )}

        {/* カレンダー */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-600 mb-1">③ 出勤できる日をタップ</p>
          <p className="text-[11px] text-slate-400 mb-3">タップで切替：未入力 → <span className="text-emerald-600 font-bold">出勤OK</span> → <span className="text-rose-500 font-bold">休み希望</span> → 未入力</p>
          {loading ? (
            <div className="h-40 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
          ) : (
            <div className="grid grid-cols-7 gap-1.5">
              {["月", "火", "水", "木", "金", "土", "日"].map((d, i) => (
                <div key={d} className={`text-center text-[11px] font-bold py-1 ${i === 5 ? "text-blue-500" : i === 6 ? "text-rose-500" : "text-slate-400"}`}>{d}</div>
              ))}
              {grid.map((date) => {
                const inMonth = month && isSameMonth(date, month);
                const key = format(date, "yyyy-MM-dd");
                const cell = days[key];
                const state: Cell = !cell ? "none" : cell.available ? "work" : "off";
                let cls = "bg-white border-slate-200 text-slate-700 hover:bg-slate-50";
                if (!inMonth) cls = "bg-slate-50 border-transparent text-slate-300";
                else if (state === "work") cls = "bg-emerald-100 border-emerald-400 text-emerald-800";
                else if (state === "off") cls = "bg-rose-100 border-rose-300 text-rose-700";
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!inMonth}
                    onClick={() => inMonth && cycle(key)}
                    className={`min-h-[54px] rounded-lg border p-1 text-left transition-all ${cls}`}
                  >
                    <div className="text-xs font-bold">{format(date, "d")}</div>
                    {inMonth && state === "work" && (
                      <div className="text-[9px] leading-tight mt-0.5 font-bold">{cell?.start}〜{cell?.end}</div>
                    )}
                    {inMonth && state === "off" && <div className="text-[9px] mt-0.5 font-bold">休</div>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 出勤日の時間調整 */}
        {workDays.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-2">
            <p className="text-xs font-bold text-slate-600 flex items-center gap-1"><Clock className="w-3.5 h-3.5" />④ 出勤できる時間（必要な日だけ調整）</p>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {workDays.map((key) => {
                const d = days[key];
                return (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <span className="w-20 font-bold text-slate-700">{format(new Date(key), "M/d(E)", { locale: ja })}</span>
                    <select value={d.start ?? DEFAULT_START} onChange={(e) => setTime(key, "start", e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 bg-white">
                      {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span className="text-slate-400">〜</span>
                    <select value={d.end ?? DEFAULT_END} onChange={(e) => setTime(key, "end", e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 bg-white">
                      {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* メモ */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">⑤ 連絡事項（任意）</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="例：第2土曜は午前のみ希望、など"
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
            />
          </label>
        </div>

        {/* 提出 */}
        <div className="sticky bottom-0 pb-4 pt-2 bg-gradient-to-t from-slate-50 to-transparent">
          <div className="text-center text-xs text-slate-500 mb-2">
            出勤OK <span className="font-bold text-emerald-600">{workDays.length}日</span> / 休み希望 <span className="font-bold text-rose-500">{offCount}日</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || !staffId}
            className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-base font-black shadow-lg"
          >
            {submitting ? "送信中..." : "この内容で提出する"}
          </button>
        </div>
      </div>
    </div>
  );
}
