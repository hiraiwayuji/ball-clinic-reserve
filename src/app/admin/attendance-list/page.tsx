"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, addMonths } from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";
import {
  Loader2, ChevronLeft, ChevronRight, Pencil, Plus, Lock, Eye, EyeOff, AlertTriangle,
  FileSpreadsheet, ListChecks, Settings2, Coins,
} from "lucide-react";
import {
  getAttendanceLedger, setAttendanceTimes, addAttendanceRecord, setStaffWage, setStaffDefaultBreak,
  unlockWageView, lockWageView, getMonthlyAttendanceForExcel, getAttendanceClinicName,
  type LedgerStaff, type LedgerRecord,
} from "@/app/actions/attendance";
import {
  BREAK_SOURCE_LABEL, calcLedgerDay, summarizeLedger, formatMinutes,
  type LedgerSummary,
} from "@/lib/attendance-pay";
import { downloadMonthlyAttendanceExcel } from "@/lib/attendance-excel";

const COLOR: Record<string, string> = {
  blue: "#3b82f6", sky: "#0ea5e9", indigo: "#6366f1", violet: "#8b5cf6", purple: "#a855f7",
  pink: "#ec4899", rose: "#f43f5e", red: "#ef4444", orange: "#f97316", amber: "#f59e0b",
  yellow: "#eab308", lime: "#84cc16", green: "#22c55e", emerald: "#10b981", teal: "#14b8a6", cyan: "#06b6d4",
  slate: "#64748b", gray: "#6b7280",
};
const colorOf = (c: string | null) => (c && COLOR[c]) || "#64748b";
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const hmOrDash = (m: number) => (m > 0 ? formatMinutes(m) : "—");

/** "YYYY-MM-DD" を端末のタイムゾーンに左右されずに日付として扱う */
function dateOf(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 休憩の入力欄（空欄＝未記録）→ 保存値 */
function parseBreak(v: string): { ok: boolean; value: number | null } {
  const t = v.trim();
  if (t === "") return { ok: true, value: null };
  if (!/^\d{1,3}$/.test(t)) return { ok: false, value: null };
  const n = Number(t);
  return n <= 600 ? { ok: true, value: n } : { ok: false, value: null };
}

type Ledger = {
  staff: LedgerStaff[];
  records: LedgerRecord[];
  wagesUnlocked: boolean;
  hasWagePasscode: boolean;
  today: string;
};

export default function AttendanceListPage() {
  const [month, setMonth] = useState(() => new Date());
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [wagePass, setWagePass] = useState("");
  const [wageBusy, setWageBusy] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);

  // 修正ダイアログ
  const [editRec, setEditRec] = useState<LedgerRecord | null>(null);
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [editBreak, setEditBreak] = useState("");
  const [saving, setSaving] = useState(false);

  // 追加ダイアログ
  const [addOpen, setAddOpen] = useState(false);
  const [addStaff, setAddStaff] = useState("");
  const [addDate, setAddDate] = useState("");
  const [addIn, setAddIn] = useState("");
  const [addOut, setAddOut] = useState("");
  const [addBreak, setAddBreak] = useState("");

  const monthStr = useMemo(
    () => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`,
    [month],
  );

  const load = async (m = monthStr) => {
    const r = await getAttendanceLedger(m);
    if (!r.success) {
      toast.error(r.error ?? "読み込みに失敗しました");
      return;
    }
    setLedger({
      staff: r.staff ?? [],
      records: r.records ?? [],
      wagesUnlocked: !!r.wagesUnlocked,
      hasWagePasscode: !!r.hasWagePasscode,
      today: r.today ?? "",
    });
  };

  useEffect(() => {
    setLoading(true);
    load(monthStr).catch(() => toast.error("読み込みに失敗しました")).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStr]);

  const staffById = useMemo(() => new Map((ledger?.staff ?? []).map((s) => [s.id, s])), [ledger]);
  const staffOrder = useMemo(() => new Map((ledger?.staff ?? []).map((s, i) => [s.id, i])), [ledger]);

  /** 今日まだ退勤していないのは「勤務中」。打刻もれとは数えない */
  const isOpenToday = (r: LedgerRecord) => !!ledger && r.workDate === ledger.today && !!r.clockIn && !r.clockOut;

  // スタッフごとの月の集計
  const summaries = useMemo(() => {
    if (!ledger) return [] as { staff: LedgerStaff; sum: LedgerSummary; missing: number }[];
    return ledger.staff.map((s) => {
      const recs = ledger.records.filter((r) => r.staffId === s.id);
      const sum = summarizeLedger(recs, s.hourlyWage, s.defaultBreakMinutes);
      const missing = recs.filter((r) => !!r.clockIn !== !!r.clockOut && !isOpenToday(r)).length;
      return { staff: s, sum, missing };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger]);

  const totals = useMemo(() => {
    const t = { workDays: 0, missing: 0, total: 0, normal: 0, overtime: 0, night: 0, nightOvertime: 0, yen: 0, wageMissing: false };
    for (const { sum, missing } of summaries) {
      t.workDays += sum.workDays;
      t.missing += missing;
      t.total += sum.total;
      t.normal += sum.normal;
      t.overtime += sum.overtime;
      t.night += sum.night;
      t.nightOvertime += sum.nightOvertime;
      if (sum.total > 0 && sum.yen == null) t.wageMissing = true;
      t.yen += sum.yen ?? 0;
    }
    return t;
  }, [summaries]);

  const defaultBreakDays = summaries.reduce((n, s) => n + s.sum.defaultBreakDays, 0);

  const visibleRecords = useMemo(() => {
    if (!ledger) return [];
    return ledger.records
      .filter((r) => filter === "all" || r.staffId === filter)
      .slice()
      .sort((a, b) => a.workDate.localeCompare(b.workDate) || (staffOrder.get(a.staffId) ?? 99) - (staffOrder.get(b.staffId) ?? 99));
  }, [ledger, filter, staffOrder]);

  // ── 時給の合言葉 ──
  const unlock = async () => {
    const code = wagePass.trim();
    if (!code) return;
    setWageBusy(true);
    const r = await unlockWageView(code);
    setWageBusy(false);
    if (!r.success) { toast.error(r.error ?? "合言葉が違います"); return; }
    setWagePass("");
    toast.success("時給と金額を表示しました（15分でまた隠れます）");
    await load();
  };
  const hide = async () => {
    await lockWageView();
    toast.success("時給と金額を隠しました");
    await load();
  };
  const saveWage = async (staffId: string, value: string) => {
    const t = value.trim();
    const wage = t === "" ? null : Number(t);
    if (wage != null && (!Number.isInteger(wage) || wage < 0 || wage > 100000)) {
      toast.error("時給は0〜100000の整数で入力してください");
      return;
    }
    const r = await setStaffWage(staffId, wage);
    if (!r.success) {
      toast.error(r.error ?? "時給の保存に失敗しました");
      await load();
      return;
    }
    toast.success("時給を保存しました");
    await load();
  };

  const saveDefaultBreak = async (staffId: string, value: string) => {
    const brk = parseBreak(value);
    if (!brk.ok) { toast.error("いつもの休憩は0〜600の数字（分）で入力してください"); await load(); return; }
    const r = await setStaffDefaultBreak(staffId, brk.value);
    if (!r.success) { toast.error(r.error ?? "保存に失敗しました"); await load(); return; }
    toast.success(brk.value == null ? "いつもの休憩を「自動（法定）」に戻しました" : `いつもの休憩を${brk.value}分にしました`);
    await load();
  };

  // ── 修正 ──
  const openEdit = (r: LedgerRecord) => {
    setEditRec(r);
    setEditIn(r.clockIn ?? "");
    setEditOut(r.clockOut ?? "");
    setEditBreak(r.breakMinutes == null ? "" : String(r.breakMinutes));
  };
  const saveEdit = async () => {
    if (!editRec) return;
    const brk = parseBreak(editBreak);
    if (!brk.ok) { toast.error("休憩は0〜600の数字（分）で入力してください"); return; }
    setSaving(true);
    const r = await setAttendanceTimes(editRec.id, editIn || null, editOut || null, brk.value);
    setSaving(false);
    if (!r.success) { toast.error(r.error ?? "保存に失敗しました"); return; }
    toast.success("勤怠を修正しました");
    setEditRec(null);
    await load();
  };

  // ── 追加 ──
  const openAdd = () => {
    if (!ledger) return;
    const inThisMonth = ledger.today.startsWith(monthStr) ? ledger.today : `${monthStr}-01`;
    setAddStaff(filter !== "all" ? filter : ledger.staff[0]?.id ?? "");
    setAddDate(inThisMonth);
    setAddIn("");
    setAddOut("");
    setAddBreak("");
    setAddOpen(true);
  };
  const saveAdd = async () => {
    const brk = parseBreak(addBreak);
    if (!addStaff) { toast.error("スタッフを選んでください"); return; }
    if (!addDate) { toast.error("日付を選んでください"); return; }
    if (!addIn) { toast.error("出勤の時刻を入力してください"); return; }
    if (!brk.ok) { toast.error("休憩は0〜600の数字（分）で入力してください"); return; }
    setSaving(true);
    const r = await addAttendanceRecord(addStaff, addDate, addIn, addOut || null, brk.value);
    setSaving(false);
    if (!r.success) { toast.error(r.error ?? "追加に失敗しました"); return; }
    toast.success("勤怠を追加しました");
    setAddOpen(false);
    if (!addDate.startsWith(monthStr)) setMonth(dateOf(addDate));
    else await load();
  };

  const downloadExcel = async () => {
    setExcelBusy(true);
    try {
      const [res, clinicName] = await Promise.all([getMonthlyAttendanceForExcel(monthStr), getAttendanceClinicName()]);
      if (!res.success || !res.staff) { toast.error(res.error ?? "勤怠管理表の作成に失敗しました"); return; }
      if (res.staff.length === 0) { toast.error("対象のスタッフがいません"); return; }
      downloadMonthlyAttendanceExcel(monthStr, clinicName, res.staff);
      toast.success(`${res.staff.length}名分の勤怠管理表をダウンロードしました`);
    } catch {
      toast.error("勤怠管理表の作成に失敗しました");
    } finally {
      setExcelBusy(false);
    }
  };

  const wagesUnlocked = !!ledger?.wagesUnlocked;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-start gap-3 flex-wrap">
        <ListChecks className="w-6 h-6 text-blue-600 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black text-slate-800">勤怠一覧・給与</h1>
          <p className="text-xs text-slate-500 mt-0.5">全員の出勤・退勤を月ごとに見て、時給から支給額の目安を出します。打刻の時刻や休憩はここで直せます。</p>
        </div>
        <Link href="/admin/attendance" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50">
          <Settings2 className="w-3.5 h-3.5" /> 勤怠の設定・残業の確認
        </Link>
      </div>

      {/* 月切替・操作 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          <button onClick={() => setMonth((d) => addMonths(d, -1))} aria-label="前の月" className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white"><ChevronLeft className="w-4 h-4" /></button>
          <span className="px-2 text-sm font-bold min-w-[104px] text-center">{format(month, "yyyy年M月", { locale: ja })}</span>
          <button onClick={() => setMonth((d) => addMonths(d, 1))} aria-label="次の月" className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={openAdd} disabled={!ledger} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
            <Plus className="w-4 h-4" /> 記録を追加
          </button>
          <button onClick={downloadExcel} disabled={excelBusy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">
            {excelBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} 勤怠管理表（Excel）
          </button>
        </div>
      </div>

      {/* 時給の合言葉 */}
      {ledger && (
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
          {!ledger.hasWagePasscode ? (
            <p className="text-xs text-slate-600 flex items-start gap-1.5">
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
              <span>
                時給と金額は、院長の合言葉を決めると表示できます。
                <Link href="/admin/attendance" className="font-bold text-blue-600 underline ml-1">勤怠の設定で合言葉を決める</Link>
              </span>
            </p>
          ) : wagesUnlocked ? (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-emerald-700 font-bold flex items-center gap-1.5"><Coins className="w-3.5 h-3.5" /> 時給と金額を表示中（15分でまた隠れます）</p>
              <button onClick={hide} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700"><EyeOff className="w-3.5 h-3.5" /> 隠す</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> 時給と金額は隠れています</p>
              <input
                type="password"
                value={wagePass}
                onChange={(e) => setWagePass(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") unlock(); }}
                placeholder="院長の合言葉"
                aria-label="院長の合言葉"
                className="flex-1 min-w-[140px] h-9 rounded-lg border border-slate-300 px-3 text-sm bg-white"
              />
              <button onClick={unlock} disabled={wageBusy || !wagePass.trim()} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-slate-700 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50">
                <Eye className="w-3.5 h-3.5" /> {wageBusy ? "確認中..." : "表示"}
              </button>
            </div>
          )}
        </div>
      )}

      {loading || !ledger ? (
        <div className="h-40 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
      ) : (
        <>
          {/* スタッフごとの集計 */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <h2 className="px-4 pt-3 pb-2 text-sm font-black text-slate-700">スタッフごとの集計</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-sm">
                <thead>
                  <tr className="text-[11px] text-slate-500 border-y border-slate-100 bg-slate-50">
                    <th className="text-left font-bold px-3 py-2">スタッフ</th>
                    <th className="text-right font-bold px-2 py-2">いつもの休憩</th>
                    <th className="text-right font-bold px-2 py-2">出勤日数</th>
                    <th className="text-right font-bold px-2 py-2">総稼働</th>
                    <th className="text-right font-bold px-2 py-2">通常</th>
                    <th className="text-right font-bold px-2 py-2">残業</th>
                    <th className="text-right font-bold px-2 py-2">深夜</th>
                    <th className="text-right font-bold px-2 py-2">深夜残業</th>
                    <th className="text-right font-bold px-2 py-2">時給</th>
                    <th className="text-right font-bold px-3 py-2">支給額の目安</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map(({ staff: s, sum, missing }) => (
                    <tr key={s.id} className={`border-b border-slate-50 ${filter === s.id ? "bg-blue-50/60" : ""}`}>
                      <td className="px-3 py-2">
                        <button onClick={() => setFilter(filter === s.id ? "all" : s.id)} className="inline-flex items-center gap-1.5 font-bold text-slate-700 hover:text-blue-700 text-left">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorOf(s.displayColor) }} />
                          {s.name}
                        </button>
                        {missing > 0 && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                            <AlertTriangle className="w-3 h-3" /> 打刻もれ{missing}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span className="inline-flex items-center gap-1">
                          <input
                            key={`${s.id}-brk-${s.defaultBreakMinutes ?? ""}`}
                            type="text"
                            inputMode="numeric"
                            defaultValue={s.defaultBreakMinutes ?? ""}
                            onBlur={(e) => { if (String(s.defaultBreakMinutes ?? "") !== e.target.value.trim()) saveDefaultBreak(s.id, e.target.value); }}
                            placeholder="自動"
                            aria-label={`${s.name}のいつもの休憩（分）`}
                            className="w-16 h-8 rounded-lg border border-slate-300 px-2 text-right text-sm bg-white"
                          />
                          <span className="text-[11px] text-slate-400">分</span>
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{sum.workDays}日</td>
                      <td className="px-2 py-2 text-right tabular-nums font-bold">{hmOrDash(sum.total)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{hmOrDash(sum.normal)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-amber-700">{hmOrDash(sum.overtime)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-indigo-700">{hmOrDash(sum.night)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-rose-700">{hmOrDash(sum.nightOvertime)}</td>
                      <td className="px-2 py-2 text-right">
                        {wagesUnlocked ? (
                          <span className="inline-flex items-center gap-1">
                            <input
                              key={`${s.id}-${s.hourlyWage ?? ""}`}
                              type="number"
                              inputMode="numeric"
                              defaultValue={s.hourlyWage ?? ""}
                              onBlur={(e) => { if (String(s.hourlyWage ?? "") !== e.target.value.trim()) saveWage(s.id, e.target.value); }}
                              placeholder="未設定"
                              aria-label={`${s.name}の時給`}
                              className="w-20 h-8 rounded-lg border border-slate-300 px-2 text-right text-sm bg-white"
                            />
                            <span className="text-[11px] text-slate-400">円</span>
                          </span>
                        ) : (
                          <Lock className="w-3.5 h-3.5 text-slate-300 inline" aria-label="隠れています" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-black text-slate-800">
                        {!wagesUnlocked ? <span className="text-slate-300 font-normal">—</span>
                          : sum.yen != null ? yen(sum.yen)
                          : sum.total > 0 ? <span className="text-[11px] font-bold text-rose-600">時給を入れてください</span>
                          : <span className="text-slate-300 font-normal">—</span>}
                      </td>
                    </tr>
                  ))}
                  {summaries.length === 0 && (
                    <tr><td colSpan={10} className="px-3 py-6 text-center text-sm text-slate-400">打刻の対象になっているスタッフがいません</td></tr>
                  )}
                </tbody>
                {summaries.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200 font-black text-slate-700">
                      <td className="px-3 py-2">合計</td>
                      <td className="px-2 py-2" />
                      <td className="px-2 py-2 text-right tabular-nums">{totals.workDays}日</td>
                      <td className="px-2 py-2 text-right tabular-nums">{hmOrDash(totals.total)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{hmOrDash(totals.normal)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{hmOrDash(totals.overtime)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{hmOrDash(totals.night)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{hmOrDash(totals.nightOvertime)}</td>
                      <td className="px-2 py-2" />
                      <td className="px-3 py-2 text-right tabular-nums">
                        {wagesUnlocked ? (
                          <>
                            {yen(totals.yen)}
                            {totals.wageMissing && <span className="block text-[10px] font-bold text-rose-600">時給が未設定の人を除く</span>}
                          </>
                        ) : <span className="text-slate-300 font-normal">—</span>}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="px-4 py-3 text-[11px] text-slate-500 leading-relaxed space-y-1 border-t border-slate-100">
              <p>
                <b>計算のしかた（勤怠管理表と同じ）</b>：総稼働＝退勤−出勤−休憩。8時間を超えた分が「残業」、夜22時〜朝5時の分が「深夜」、その両方が重なる分が「深夜残業」です。
              </p>
              <p>
                <b>支給額の目安</b>＝時給×（通常＋残業×1.25＋深夜残業×1.5）＋深夜の割増（時給×0.25）。法律で決まっている最低の割増率で計算しています。
                交通費・手当・休日出勤の割増・社会保険などは含みません。
              </p>
              <p>
                <b>休憩</b>：打刻では休憩を記録しないので、記録が無い日は「いつもの休憩」の分数で計算します（一覧で「いつも」と表示）。
                いつもの休憩が空欄の人は、法律の最低ライン（6時間までは0分・8時間までは45分・それ以上は60分）で計算します（「自動」と表示）。
                {defaultBreakDays > 0 && <> この月は記録の無い日が<b>{defaultBreakDays}日</b>あります。実際と違う日は「修正」から休憩を入れてください（休憩なしは 0）。</>}
              </p>
            </div>
          </section>

          {/* 絞り込み */}
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="スタッフで絞り込み">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>全員</FilterChip>
            {ledger.staff.map((s) => (
              <FilterChip key={s.id} active={filter === s.id} onClick={() => setFilter(s.id)} color={colorOf(s.displayColor)}>{s.name}</FilterChip>
            ))}
          </div>

          {/* 日ごとの記録 */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <h2 className="px-4 pt-3 pb-2 text-sm font-black text-slate-700">
              日ごとの記録 <span className="text-xs font-bold text-slate-400">{visibleRecords.length}件</span>
            </h2>
            {visibleRecords.length === 0 ? (
              <div className="h-28 grid place-items-center text-sm text-slate-400">この月の記録はありません</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-[11px] text-slate-500 border-y border-slate-100 bg-slate-50">
                      <th className="text-left font-bold px-3 py-2">日付</th>
                      <th className="text-left font-bold px-2 py-2">スタッフ</th>
                      <th className="text-center font-bold px-2 py-2">出勤</th>
                      <th className="text-center font-bold px-2 py-2">退勤</th>
                      <th className="text-center font-bold px-2 py-2">休憩</th>
                      <th className="text-right font-bold px-2 py-2">総稼働</th>
                      <th className="text-left font-bold px-2 py-2">残業・深夜</th>
                      <th className="text-right font-bold px-2 py-2">目安</th>
                      <th className="text-center font-bold px-2 py-2">修正</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRecords.map((r) => {
                      const s = staffById.get(r.staffId);
                      const day = calcLedgerDay(r, s?.hourlyWage ?? null, s?.defaultBreakMinutes ?? null);
                      const openToday = isOpenToday(r);
                      const missing = day.missing && !openToday;
                      return (
                        <tr key={r.id} className={`border-b border-slate-50 ${missing ? "bg-amber-50/70" : ""}`}>
                          <td className="px-3 py-2 whitespace-nowrap font-bold text-slate-700">{format(dateOf(r.workDate), "M/d(E)", { locale: ja })}</td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorOf(s?.displayColor ?? null) }} />
                              {r.staffName}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center tabular-nums">{r.clockIn ?? <span className="text-amber-600 font-bold">なし</span>}</td>
                          <td className="px-2 py-2 text-center tabular-nums">
                            {r.clockOut ?? (openToday ? <span className="text-emerald-600 text-xs font-bold">勤務中</span> : <span className="text-amber-600 font-bold">なし</span>)}
                          </td>
                          <td className="px-2 py-2 text-center tabular-nums whitespace-nowrap">
                            {day.split ? `${day.breakUsed}分` : "—"}
                            {day.split && day.breakIsDefault && <span className="ml-1 text-[10px] font-bold text-slate-400 border border-slate-200 rounded px-1">{BREAK_SOURCE_LABEL[day.breakSource]}</span>}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums font-bold">{day.split ? formatMinutes(day.split.total) : "—"}</td>
                          <td className="px-2 py-2 text-[11px] whitespace-nowrap">
                            {missing ? (
                              <span className="inline-flex items-center gap-1 font-bold text-amber-700"><AlertTriangle className="w-3 h-3" /> 打刻もれ</span>
                            ) : day.split ? (
                              <span className="space-x-1.5">
                                {day.split.overtime > 0 && <span className="text-amber-700">残業{formatMinutes(day.split.overtime)}</span>}
                                {day.split.night > 0 && <span className="text-indigo-700">深夜{formatMinutes(day.split.night)}</span>}
                                {day.split.nightOvertime > 0 && <span className="text-rose-700">深夜残業{formatMinutes(day.split.nightOvertime)}</span>}
                                {day.split.overtime + day.split.night + day.split.nightOvertime === 0 && <span className="text-slate-300">—</span>}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {wagesUnlocked && day.yen != null ? yen(day.yen) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => openEdit(r)}
                              aria-label={`${r.staffName} ${r.workDate} の勤怠を修正`}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* 修正ダイアログ */}
      {editRec && (
        <Dialog title="勤怠の修正" onClose={() => !saving && setEditRec(null)}>
          <p className="text-xs text-slate-500">
            {editRec.staffName}さん・{format(dateOf(editRec.workDate), "M月d日(E)", { locale: ja })}の記録を直します。
            時刻を空欄にすると「打刻なし」になります。直した記録は履歴（監査ログ）に残ります。
          </p>
          <TimeInputs inV={editIn} outV={editOut} brk={editBreak} setIn={setEditIn} setOut={setEditOut} setBrk={setEditBreak} />
          <Preview clockIn={editIn} clockOut={editOut} brk={editBreak} staff={staffById.get(editRec.staffId)} showYen={wagesUnlocked} />
          <DialogButtons saving={saving} onCancel={() => setEditRec(null)} onSave={saveEdit} />
        </Dialog>
      )}

      {/* 追加ダイアログ */}
      {addOpen && ledger && (
        <Dialog title="勤怠の記録を追加" onClose={() => !saving && setAddOpen(false)}>
          <p className="text-xs text-slate-500">出勤も退勤も押し忘れた日など、記録が1件も無い日を追加します。すでに記録がある日は一覧の「修正」から直してください。</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-bold text-slate-600">スタッフ</span>
              <select value={addStaff} onChange={(e) => setAddStaff(e.target.value)} className="mt-1.5 w-full h-11 rounded-xl border border-slate-300 px-2 text-sm bg-white">
                {ledger.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">日付</span>
              <input type="date" value={addDate} max={ledger.today} onChange={(e) => setAddDate(e.target.value)} className="mt-1.5 w-full h-11 rounded-xl border border-slate-300 px-2 text-sm bg-white" />
            </label>
          </div>
          <TimeInputs inV={addIn} outV={addOut} brk={addBreak} setIn={setAddIn} setOut={setAddOut} setBrk={setAddBreak} />
          <Preview clockIn={addIn} clockOut={addOut} brk={addBreak} staff={staffById.get(addStaff)} showYen={wagesUnlocked} />
          <DialogButtons saving={saving} onCancel={() => setAddOpen(false)} onSave={saveAdd} saveLabel="追加する" />
        </Dialog>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-bold ${active ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
    >
      {color && <span className="w-2 h-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-label={title} className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-base font-black text-slate-800">{title}</div>
        {children}
      </div>
    </div>
  );
}

function TimeInputs({ inV, outV, brk, setIn, setOut, setBrk }: {
  inV: string; outV: string; brk: string;
  setIn: (v: string) => void; setOut: (v: string) => void; setBrk: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <label className="block">
        <span className="text-xs font-bold text-slate-600">出勤</span>
        <input type="time" value={inV} onChange={(e) => setIn(e.target.value)} className="mt-1.5 w-full h-11 rounded-xl border border-slate-300 px-2 text-sm bg-white" />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-slate-600">退勤</span>
        <input type="time" value={outV} onChange={(e) => setOut(e.target.value)} className="mt-1.5 w-full h-11 rounded-xl border border-slate-300 px-2 text-sm bg-white" />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-slate-600">休憩（分）</span>
        <input
          type="text"
          inputMode="numeric"
          value={brk}
          onChange={(e) => setBrk(e.target.value)}
          placeholder="空欄=記録なし"
          className="mt-1.5 w-full h-11 rounded-xl border border-slate-300 px-2 text-sm bg-white"
        />
      </label>
      <p className="col-span-3 text-[10px] text-slate-400 -mt-1">休憩なしは 0。空欄のままだと「記録なし」になり、いつもの休憩（空欄の人は法律の最低ライン）で計算します。</p>
    </div>
  );
}

function Preview({ clockIn, clockOut, brk, staff, showYen }: { clockIn: string; clockOut: string; brk: string; staff: LedgerStaff | undefined; showYen: boolean }) {
  const parsed = parseBreak(brk);
  if (!parsed.ok) return <p className="text-xs font-bold text-rose-600">休憩は0〜600の数字（分）で入力してください</p>;
  // 保存（サーバー）は「退勤が出勤より前・同じ」を受け付けない。計算だけ正しそうに見せないよう、同じ文言で止める
  if (clockIn && clockOut && clockOut <= clockIn) {
    return <p className="text-xs font-bold text-rose-600">退勤は出勤より後の時刻にしてください</p>;
  }
  const day = calcLedgerDay(
    { clockIn: clockIn || null, clockOut: clockOut || null, breakMinutes: parsed.value },
    staff?.hourlyWage ?? null,
    staff?.defaultBreakMinutes ?? null,
  );
  if (!day.split) return <p className="text-xs text-slate-400">出勤と退勤を入れると、働いた時間を計算して表示します。</p>;
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700 flex flex-wrap gap-x-3 gap-y-1">
      <span>休憩 <b className="tabular-nums">{day.breakUsed}分</b>{day.breakIsDefault ? `（${BREAK_SOURCE_LABEL[day.breakSource]}）` : ""}</span>
      <span>総稼働 <b className="tabular-nums">{formatMinutes(day.split.total)}</b></span>
      <span>残業 <b className="tabular-nums">{formatMinutes(day.split.overtime)}</b></span>
      <span>深夜 <b className="tabular-nums">{formatMinutes(day.split.night)}</b></span>
      <span>深夜残業 <b className="tabular-nums">{formatMinutes(day.split.nightOvertime)}</b></span>
      {showYen && <span>目安 <b className="tabular-nums">{day.yen != null ? yen(day.yen) : "時給未設定"}</b></span>}
    </div>
  );
}

function DialogButtons({ saving, onCancel, onSave, saveLabel = "保存する" }: { saving: boolean; onCancel: () => void; onSave: () => void; saveLabel?: string }) {
  return (
    <div className="flex gap-2">
      <button onClick={onCancel} disabled={saving} className="flex-1 h-11 rounded-xl border border-slate-300 text-slate-600 font-bold text-sm hover:bg-slate-50">やめる</button>
      <button onClick={onSave} disabled={saving} className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm">
        {saving ? "保存中..." : saveLabel}
      </button>
    </div>
  );
}
