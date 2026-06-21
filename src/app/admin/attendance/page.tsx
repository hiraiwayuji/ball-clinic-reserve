"use client";

import { useEffect, useMemo, useState } from "react";
import { format, addMonths } from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";
import {
  Loader2, Clock, ChevronLeft, ChevronRight, AlertTriangle, Copy, Link2,
  Save, Coins, Settings2, CheckCircle2, TrendingDown,
} from "lucide-react";
import {
  getAttendanceSettings, setAttendanceSettings, listStaffWages, setStaffWage, getAttendanceReport,
  type AttendanceConfig, type OwnerStaffWage, type AttendanceReportRecord, type AttendanceSummary, type AttendanceJudgment,
} from "@/app/actions/attendance";
import { JUDGMENT_LABEL } from "@/lib/attendance-constants";

const COLOR: Record<string, string> = {
  blue: "#3b82f6", sky: "#0ea5e9", indigo: "#6366f1", violet: "#8b5cf6", purple: "#a855f7",
  pink: "#ec4899", rose: "#f43f5e", red: "#ef4444", orange: "#f97316", amber: "#f59e0b",
  yellow: "#eab308", lime: "#84cc16", green: "#22c55e", emerald: "#10b981", teal: "#14b8a6", cyan: "#06b6d4",
  slate: "#64748b", gray: "#6b7280",
};
const colorOf = (c: string | null) => (c && COLOR[c]) || "#64748b";
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const JUDGMENT_STYLE: Record<AttendanceJudgment, string> = {
  requested: "bg-sky-50 text-sky-700 border-sky-200",
  reservation: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closing: "bg-indigo-50 text-indigo-700 border-indigo-200",
  valid: "bg-slate-50 text-slate-600 border-slate-200",
  wasteful: "bg-rose-50 text-rose-700 border-rose-300",
};
const TIMES = (() => {
  const out: string[] = [];
  for (let h = 17; h <= 23; h++) for (const m of [0, 15, 30, 45]) out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  return out;
})();

export default function AttendanceAdminPage() {
  const [month, setMonth] = useState(new Date());
  const [config, setConfig] = useState<AttendanceConfig | null>(null);
  const [wages, setWages] = useState<OwnerStaffWage[]>([]);
  const [records, setRecords] = useState<AttendanceReportRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCfg, setSavingCfg] = useState(false);
  const [attendUrl, setAttendUrl] = useState("");

  const monthStr = useMemo(
    () => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`,
    [month],
  );

  useEffect(() => {
    if (typeof window !== "undefined") setAttendUrl(`${window.location.origin}/attendance`);
    Promise.all([getAttendanceSettings(), listStaffWages()])
      .then(([cfg, w]) => { setConfig(cfg); setWages(w); })
      .catch(() => toast.error("読み込みに失敗しました"));
  }, []);

  useEffect(() => {
    setLoading(true);
    getAttendanceReport(monthStr)
      .then((r) => { setRecords(r.success ? r.records ?? [] : []); setSummary(r.success ? r.summary ?? null : null); })
      .finally(() => setLoading(false));
  }, [monthStr]);

  const saveConfig = async () => {
    if (!config) return;
    setSavingCfg(true);
    const r = await setAttendanceSettings(config);
    setSavingCfg(false);
    if (r.success) toast.success("設定を保存しました");
    else toast.error(r.error ?? "保存に失敗しました");
  };

  const saveWage = async (staffId: string, value: string) => {
    const wage = value.trim() === "" ? null : Number(value);
    const r = await setStaffWage(staffId, wage);
    if (r.success) {
      setWages((prev) => prev.map((w) => (w.id === staffId ? { ...w, hourlyWage: wage } : w)));
      toast.success("時給を保存しました");
    } else toast.error(r.error ?? "保存に失敗しました");
  };

  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(attendUrl); toast.success("打刻ページのリンクをコピーしました"); }
    catch { toast.error("コピーに失敗しました"); }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <Clock className="w-6 h-6 text-blue-600" />
        <h1 className="text-xl font-black text-slate-800">勤怠（残業の見える化）</h1>
      </div>

      {/* 運用設定 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-sm font-black text-slate-700">
          <Settings2 className="w-4 h-4 text-slate-500" /> 運用設定
        </div>

        {config && (
          <>
            {/* ON/OFF */}
            <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
              <span className="text-sm font-bold text-slate-700">
                勤怠の打刻を使う
                <span className="block text-[11px] font-normal text-slate-500">オンにするとスタッフが打刻できるようになります</span>
              </span>
              <button
                onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                className={`relative w-12 h-7 rounded-full transition-colors ${config.enabled ? "bg-emerald-500" : "bg-slate-300"}`}
              >
                <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${config.enabled ? "translate-x-5" : ""}`} />
              </button>
            </label>

            {/* しきい値 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <TimeField label="原則退社の目標" value={config.workEndTarget} onChange={(v) => setConfig({ ...config, workEndTarget: v })} />
              <TimeField label="この時刻以降は理由必須" value={config.overtimeReasonAfter} onChange={(v) => setConfig({ ...config, overtimeReasonAfter: v })} />
              <TimeField label="締めの許容時刻" value={config.closingAllowanceUntil} onChange={(v) => setConfig({ ...config, closingAllowanceUntil: v })} />
            </div>

            {/* 締め担当 */}
            <label className="block">
              <span className="text-xs font-bold text-slate-600">締め作業の担当（1人で締めてよい人）</span>
              <select
                value={config.closingStaffId ?? ""}
                onChange={(e) => setConfig({ ...config, closingStaffId: e.target.value || null })}
                className="mt-1.5 w-full h-11 rounded-xl border border-slate-300 px-3 text-sm bg-white"
              >
                <option value="">― 未設定 ―</option>
                {wages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>

            <button
              onClick={saveConfig}
              disabled={savingCfg}
              className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black text-sm flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" /> {savingCfg ? "保存中..." : "設定を保存"}
            </button>
          </>
        )}

        {/* 打刻ページのリンク */}
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm">
          <div className="flex items-center gap-1.5 font-bold text-blue-700 mb-1"><Link2 className="w-3.5 h-3.5" /> スタッフ用の打刻ページ</div>
          <p className="text-[11px] text-blue-600/80 mb-2">受付PCのブックマーク、または各自スマホに送ってお使いください。</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate bg-white rounded-lg border border-blue-200 px-2 py-1.5 text-xs">{attendUrl}</code>
            <button onClick={copyUrl} className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> コピー</button>
          </div>
        </div>
      </div>

      {/* 時給（owner専用） */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-sm font-black text-slate-700">
          <Coins className="w-4 h-4 text-amber-500" /> スタッフの時給（院長だけが見られます）
        </div>
        <p className="text-[11px] text-slate-500">後ほどコスト計算（ムダになった残業の金額・折半額）に使います。空欄でもかまいません。</p>
        <div className="space-y-2">
          {wages.map((s) => (
            <div key={s.id} className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: colorOf(s.display_color) }} />
              <span className="flex-1 text-sm font-bold text-slate-700">{s.name}</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  defaultValue={s.hourlyWage ?? ""}
                  onBlur={(e) => { if (String(s.hourlyWage ?? "") !== e.target.value) saveWage(s.id, e.target.value); }}
                  placeholder="—"
                  className="w-24 h-10 rounded-lg border border-slate-300 px-2 text-right text-sm bg-white"
                />
                <span className="text-xs text-slate-500">円/時</span>
              </div>
            </div>
          ))}
          {wages.length === 0 && <p className="text-sm text-slate-400">スタッフが登録されていません。</p>}
        </div>
      </div>

      {/* 月切替 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-700">勤怠の記録</h2>
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          <button onClick={() => setMonth((d) => addMonths(d, -1))} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white"><ChevronLeft className="w-4 h-4" /></button>
          <span className="px-2 text-sm font-bold min-w-[96px] text-center">{format(month, "yyyy年M月", { locale: ja })}</span>
          <button onClick={() => setMonth((d) => addMonths(d, 1))} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* サマリ */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="記録日数" value={`${summary?.recordDays ?? 0}`} tone="slate" />
        <SummaryCard label="残業の退社" value={`${summary?.overtimeCount ?? 0}`} tone="amber" />
        <SummaryCard label="ムダな被り" value={`${summary?.wastefulCount ?? 0}`} tone="rose" hint="依頼/予約/正当以外" />
      </div>

      {/* コスト（Phase 3） */}
      {summary && summary.wastefulCount > 0 && (
        <div className="bg-white rounded-2xl border border-rose-200 p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-sm font-black text-rose-700">
            <TrendingDown className="w-4 h-4" /> ムダな残業のコスト（今月）
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3">
              <div className="text-lg font-black text-rose-700">{yen(summary.wastefulFullYen)}</div>
              <div className="text-[11px] font-bold text-rose-600/80 mt-0.5">満額で払うと</div>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
              <div className="text-lg font-black text-amber-700">{yen(summary.wastefulSplitYen)}</div>
              <div className="text-[11px] font-bold text-amber-600/80 mt-0.5">折半での支給額</div>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
              <div className="text-lg font-black text-emerald-700">{yen(summary.savedYen)}</div>
              <div className="text-[11px] font-bold text-emerald-600/80 mt-0.5">折半で抑えられる</div>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            「ムダな被り」と判定された残業を、退社目標（{config?.workEndTarget ?? "20:00"}）からの超過時間×時給で計算しています。
            予約の担当・院長の依頼・正当な理由・締め作業は除いています。
          </p>
          {summary.wageMissing && (
            <p className="text-[11px] text-rose-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> 時給が未設定のスタッフがいるため、金額は実際より少なく出ています。上の欄で時給をご入力ください。
            </p>
          )}
        </div>
      )}

      {/* 一覧 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="h-32 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        ) : records.length === 0 ? (
          <div className="h-32 grid place-items-center text-sm text-slate-400">この月の記録はまだありません</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-500 border-b border-slate-100 bg-slate-50">
                <th className="text-left font-bold px-3 py-2">日付</th>
                <th className="text-left font-bold px-2 py-2">スタッフ</th>
                <th className="text-center font-bold px-2 py-2">出勤</th>
                <th className="text-center font-bold px-2 py-2">退勤</th>
                <th className="text-left font-bold px-3 py-2">判定・理由</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className={`border-b border-slate-50 ${r.judgment === "wasteful" ? "bg-rose-50/70" : r.isOvertime ? "bg-amber-50/50" : ""}`}>
                  <td className="px-3 py-2 whitespace-nowrap font-bold text-slate-700">{format(new Date(r.workDate), "M/d(E)", { locale: ja })}</td>
                  <td className="px-2 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorOf(r.displayColor) }} />
                      {r.staffName}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center text-slate-600">{r.clockInAt ? format(new Date(r.clockInAt), "HH:mm") : "—"}</td>
                  <td className={`px-2 py-2 text-center font-bold ${r.isOvertime ? "text-amber-700" : "text-slate-600"}`}>{r.clockOutAt ? format(new Date(r.clockOutAt), "HH:mm") : "—"}</td>
                  <td className="px-3 py-2">
                    {r.isOvertime && r.judgment ? (
                      <div className="space-y-0.5">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${JUDGMENT_STYLE[r.judgment]}`}>
                          {r.judgment === "wasteful" && <AlertTriangle className="w-3 h-3" />}
                          {JUDGMENT_LABEL[r.judgment]}
                        </span>
                        {r.reasonNote && <span className="block text-[11px] text-slate-500">{r.reasonNote}</span>}
                        {r.judgment === "wasteful" && (
                          <span className="block text-[11px] text-rose-600">
                            残業 {r.overtimeMinutes}分
                            {r.fullPayYen != null ? ` ／ 満額${yen(r.fullPayYen)}・折半${yen(r.splitPayYen ?? 0)}` : "（時給未設定）"}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />定時</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full h-11 rounded-xl border border-slate-300 px-2 text-sm bg-white">
        {TIMES.includes(value) ? null : <option value={value}>{value}</option>}
        {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    </label>
  );
}

function SummaryCard({ label, value, tone, hint }: { label: string; value: string; tone: "slate" | "amber" | "rose"; hint?: string }) {
  const cls = {
    slate: "bg-slate-50 border-slate-200 text-slate-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
  }[tone];
  return (
    <div className={`rounded-2xl border p-3 text-center ${cls}`}>
      <div className="text-2xl font-black">{value}</div>
      <div className="text-[11px] font-bold mt-0.5">{label}</div>
      {hint && <div className="text-[10px] opacity-70 mt-0.5">{hint}</div>}
    </div>
  );
}
