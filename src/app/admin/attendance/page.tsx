"use client";

import { useEffect, useMemo, useState } from "react";
import { format, addMonths } from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";
import {
  Loader2, Clock, ChevronLeft, ChevronRight, AlertTriangle, Copy, Link2,
  Save, Coins, Settings2, CheckCircle2, TrendingDown, Lock, Eye, EyeOff, Pencil, FileSpreadsheet,
} from "lucide-react";
import {
  getAttendanceSettings, setAttendanceSettings, listStaffWages, setStaffWage, getAttendanceReport,
  getAttendanceDeviceSettings, setAttendancePasscode, setAttendanceDeviceLock,
  getWageGate, setWagePasscode, unlockWageView, lockWageView, setAttendanceTimes,
  getMonthlyAttendanceForExcel, getAttendanceClinicName,
  type AttendanceConfig, type OwnerStaffWage, type AttendanceReportRecord, type AttendanceSummary, type AttendanceJudgment,
} from "@/app/actions/attendance";
import { JUDGMENT_LABEL } from "@/lib/attendance-constants";
import { downloadMonthlyAttendanceExcel } from "@/lib/attendance-excel";

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
  const [excelBusy, setExcelBusy] = useState(false);
  const [attendUrl, setAttendUrl] = useState("");
  // 端末ロック（院のPCのみ打刻）
  const [deviceLock, setDeviceLock] = useState(false);
  const [hasPasscode, setHasPasscode] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [savingPass, setSavingPass] = useState(false);
  const [togglingLock, setTogglingLock] = useState(false);
  // 時給の合言葉ゲート
  const [wageHasPass, setWageHasPass] = useState(false);
  const [wageUnlocked, setWageUnlocked] = useState(false);
  const [wagePassInput, setWagePassInput] = useState("");
  const [wageNewPassInput, setWageNewPassInput] = useState("");
  const [wageBusy, setWageBusy] = useState(false);
  // 打刻修正ダイアログ（owner のみ）
  const [editRec, setEditRec] = useState<AttendanceReportRecord | null>(null);
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [savingTimes, setSavingTimes] = useState(false);

  const monthStr = useMemo(
    () => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`,
    [month],
  );

  const reloadWages = () => listStaffWages().then(setWages).catch(() => {});

  useEffect(() => {
    if (typeof window !== "undefined") setAttendUrl(`${window.location.origin}/attendance`);
    Promise.all([getAttendanceSettings(), listStaffWages(), getAttendanceDeviceSettings(), getWageGate()])
      .then(([cfg, w, dev, wg]) => {
        setConfig(cfg); setWages(w);
        setDeviceLock(dev.deviceLock); setHasPasscode(dev.hasPasscode);
        setWageHasPass(wg.hasPasscode); setWageUnlocked(wg.unlocked);
      })
      .catch(() => toast.error("読み込みに失敗しました"));
  }, []);

  // 時給の解錠が変わったら、金額つき/伏せ字の一覧とレポートを取り直す
  const refreshAfterWageGate = async () => {
    await Promise.all([reloadWages(), getAttendanceReport(monthStr).then((r) => {
      setRecords(r.success ? r.records ?? [] : []);
      setSummary(r.success ? r.summary ?? null : null);
    })]);
  };

  // 時給の合言葉を決める（初回）
  const saveWagePass = async () => {
    const code = wageNewPassInput.trim();
    if (code.length < 4) { toast.error("合言葉は4文字以上にしてください"); return; }
    setWageBusy(true);
    const r = await setWagePasscode(code);
    setWageBusy(false);
    if (r.success) {
      setWageHasPass(true); setWageUnlocked(true); setWageNewPassInput("");
      toast.success("合言葉を設定しました");
      await refreshAfterWageGate();
    } else toast.error(r.error ?? "設定に失敗しました");
  };

  // 合言葉を入れて時給を表示
  const unlockWages = async () => {
    const code = wagePassInput.trim();
    if (!code) return;
    setWageBusy(true);
    const r = await unlockWageView(code);
    setWageBusy(false);
    if (r.success) {
      setWageUnlocked(true); setWagePassInput("");
      toast.success("時給を表示しました（15分でまた隠れます）");
      await refreshAfterWageGate();
    } else toast.error(r.error ?? "合言葉が違います");
  };

  // 時給を隠す
  const hideWages = async () => {
    await lockWageView();
    setWageUnlocked(false);
    toast.success("時給を隠しました");
    await refreshAfterWageGate();
  };

  // 打刻修正を開く
  const openEditTimes = (r: AttendanceReportRecord) => {
    setEditRec(r);
    setEditIn(r.clockInAt ? format(new Date(r.clockInAt), "HH:mm") : "");
    setEditOut(r.clockOutAt ? format(new Date(r.clockOutAt), "HH:mm") : "");
  };

  const saveTimes = async () => {
    if (!editRec) return;
    setSavingTimes(true);
    const r = await setAttendanceTimes(editRec.id, editIn || null, editOut || null);
    setSavingTimes(false);
    if (r.success) {
      toast.success("打刻を修正しました");
      setEditRec(null);
      const rep = await getAttendanceReport(monthStr);
      setRecords(rep.success ? rep.records ?? [] : []);
      setSummary(rep.success ? rep.summary ?? null : null);
    } else toast.error(r.error ?? "修正に失敗しました");
  };

  const savePasscode = async () => {
    const code = passcodeInput.trim();
    if (code.length < 4) { toast.error("パスワードは4文字以上にしてください"); return; }
    setSavingPass(true);
    const r = await setAttendancePasscode(code);
    setSavingPass(false);
    if (r.success) { setHasPasscode(true); setPasscodeInput(""); toast.success("打刻用パスワードを保存しました"); }
    else toast.error(r.error ?? "保存に失敗しました");
  };

  const toggleDeviceLock = async () => {
    const next = !deviceLock;
    setTogglingLock(true);
    const r = await setAttendanceDeviceLock(next);
    setTogglingLock(false);
    if (r.success) { setDeviceLock(next); toast.success(next ? "院のパソコンのみで打刻に設定しました" : "端末の制限を解除しました"); }
    else toast.error(r.error ?? "切替に失敗しました");
  };

  useEffect(() => {
    setLoading(true);
    getAttendanceReport(monthStr)
      .then((r) => { setRecords(r.success ? r.records ?? [] : []); setSummary(r.success ? r.summary ?? null : null); })
      .finally(() => setLoading(false));
  }, [monthStr]);

  /** 打刻データから、藤川先生がこれまで手作業で作っていた勤怠管理表を作る */
  const downloadExcel = async () => {
    setExcelBusy(true);
    try {
      const [res, clinicName] = await Promise.all([
        getMonthlyAttendanceForExcel(monthStr),
        getAttendanceClinicName(),
      ]);
      if (!res.success || !res.staff) {
        toast.error(res.error ?? "勤怠管理表の作成に失敗しました");
        return;
      }
      if (res.staff.length === 0) {
        toast.error("対象のスタッフがいません");
        return;
      }
      downloadMonthlyAttendanceExcel(monthStr, clinicName, res.staff);
      toast.success(`${res.staff.length}名分の勤怠管理表をダウンロードしました`);
    } catch {
      toast.error("勤怠管理表の作成に失敗しました");
    } finally {
      setExcelBusy(false);
    }
  };

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
                onClick={async () => {
                  // ON/OFF はその場で保存する（「設定を保存」の押し忘れで反映されない事故防止）
                  const next = { ...config, enabled: !config.enabled };
                  setConfig(next);
                  const r = await setAttendanceSettings(next);
                  if (r.success) toast.success(next.enabled ? "打刻をオンにしました" : "打刻をオフにしました");
                  else { setConfig(config); toast.error(r.error ?? "切替に失敗しました"); }
                }}
                className={`relative w-12 h-7 rounded-full transition-colors ${config.enabled ? "bg-emerald-500" : "bg-slate-300"}`}
              >
                <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${config.enabled ? "translate-x-5" : ""}`} />
              </button>
            </label>

            {/* 残業の基準：シフト終わり＋猶予 */}
            <div className="rounded-xl bg-blue-50/60 border border-blue-100 p-3 space-y-2">
              <label className="block">
                <span className="text-xs font-bold text-slate-700">残業とみなすまでの猶予</span>
                <span className="block text-[11px] font-normal text-slate-500 mb-1.5">
                  各スタッフの<b>シフト終わりから何分</b>までを「定時」とするか。これを過ぎた退勤は残業として理由の入力が必要になります。
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={config.overtimeGraceMinutes}
                    onChange={(e) => setConfig({ ...config, overtimeGraceMinutes: Number(e.target.value) })}
                    className="h-11 rounded-xl border border-slate-300 px-3 text-sm bg-white"
                  >
                    {[0, 5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n}分</option>)}
                  </select>
                  <span className="text-xs text-slate-500">シフト終わり ＋ この時間まではOK</span>
                </div>
              </label>
              <p className="text-[11px] text-slate-500 leading-snug">
                ※ シフトが登録されていない日は、下の「この時刻以降は理由必須」で判定します。
              </p>
            </div>

            {/* しきい値（シフト未登録日のフォールバック） */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <TimeField label="原則退社の目標" value={config.workEndTarget} onChange={(v) => setConfig({ ...config, workEndTarget: v })} />
              <TimeField label="理由必須（シフト無い日）" value={config.overtimeReasonAfter} onChange={(v) => setConfig({ ...config, overtimeReasonAfter: v })} />
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

      {/* 打刻できる端末の制限（院のPCのみ） */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-sm font-black text-slate-700">
          <Lock className="w-4 h-4 text-slate-500" /> 打刻できるパソコンを限定する
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          オンにすると、下のパスワードを入力して登録したパソコンでしか打刻できなくなります。
          院のパソコンで一度だけパスワードを入力すれば、以後そのパソコンはパスワード不要です。
          スタッフ個人のスマホでは打刻できなくなります（パスワードは院長だけが知っておいてください）。
        </p>

        {/* パスワード設定 */}
        <label className="block">
          <span className="text-xs font-bold text-slate-600">
            打刻用パスワード
            {hasPasscode
              ? <span className="ml-1 text-emerald-600">（設定済み・変更する時だけ入力）</span>
              : <span className="ml-1 text-rose-500">（未設定）</span>}
          </span>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="text"
              value={passcodeInput}
              onChange={(e) => setPasscodeInput(e.target.value)}
              placeholder={hasPasscode ? "変更する時だけ入力（4文字以上）" : "4文字以上で決めてください"}
              className="flex-1 h-11 rounded-xl border border-slate-300 px-3 text-sm bg-white"
            />
            <button
              onClick={savePasscode}
              disabled={savingPass || passcodeInput.trim().length < 4}
              className="h-11 px-4 rounded-xl bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-bold whitespace-nowrap"
            >
              {savingPass ? "保存中..." : "保存"}
            </button>
          </div>
        </label>

        {/* ON/OFF */}
        <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
          <span className="text-sm font-bold text-slate-700">
            院のパソコンのみで打刻する
            <span className="block text-[11px] font-normal text-slate-500">
              {hasPasscode ? "登録したパソコン以外は打刻できなくなります" : "先に上のパスワードを設定してください"}
            </span>
          </span>
          <button
            onClick={toggleDeviceLock}
            disabled={togglingLock || (!deviceLock && !hasPasscode)}
            className={`relative w-12 h-7 rounded-full transition-colors disabled:opacity-40 ${deviceLock ? "bg-emerald-500" : "bg-slate-300"}`}
          >
            <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${deviceLock ? "translate-x-5" : ""}`} />
          </button>
        </label>

        {deviceLock && (
          <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            オンです。院のパソコンで打刻ページを開き、上のパスワードを一度入力して登録してください。
          </p>
        )}
      </div>

      {/* 時給（owner専用＋院長の合言葉ゲート） */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-black text-slate-700">
            <Coins className="w-4 h-4 text-amber-500" /> スタッフの時給（院長だけ）
          </div>
          {wageUnlocked && (
            <button
              onClick={hideWages}
              className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-700"
            >
              <EyeOff className="w-3.5 h-3.5" /> 隠す
            </button>
          )}
        </div>

        {/* まだ合言葉が未設定：まず院長が合言葉を決める */}
        {!wageHasPass ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2">
            <p className="text-[12px] font-bold text-amber-800 flex items-start gap-1.5">
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              時給は院長だけが見られるように、合言葉で守ります。まず合言葉を決めてください。
            </p>
            <p className="text-[11px] text-amber-700/90 leading-snug">
              受付のパソコンを院長のアカウントで開いていても、この合言葉を知らないスタッフには時給が見えなくなります。打刻用のパスワードとは別のものにしてください。
            </p>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={wageNewPassInput}
                onChange={(e) => setWageNewPassInput(e.target.value)}
                placeholder="4文字以上で決めてください"
                className="flex-1 h-11 rounded-xl border border-amber-300 px-3 text-sm bg-white"
              />
              <button
                onClick={saveWagePass}
                disabled={wageBusy || wageNewPassInput.trim().length < 4}
                className="h-11 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-bold whitespace-nowrap"
              >
                {wageBusy ? "設定中..." : "決める"}
              </button>
            </div>
          </div>
        ) : !wageUnlocked ? (
          /* 合言葉あり・未解錠：合言葉を入れると表示 */
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
            <p className="text-[12px] font-bold text-slate-600 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> 時給は隠れています。院長の合言葉を入れると表示します。
            </p>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={wagePassInput}
                onChange={(e) => setWagePassInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") unlockWages(); }}
                placeholder="院長の合言葉"
                className="flex-1 h-11 rounded-xl border border-slate-300 px-3 text-sm bg-white"
              />
              <button
                onClick={unlockWages}
                disabled={wageBusy || !wagePassInput.trim()}
                className="h-11 px-4 rounded-xl bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-bold whitespace-nowrap flex items-center gap-1"
              >
                <Eye className="w-4 h-4" /> {wageBusy ? "確認中..." : "表示"}
              </button>
            </div>
            <p className="text-[10px] text-slate-400">合言葉を忘れたときは、下の入力欄で新しく決め直せます（前の値は上書きされます）。</p>
            <details className="text-[11px]">
              <summary className="cursor-pointer text-slate-400 hover:text-slate-600">合言葉を決め直す</summary>
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="password"
                  value={wageNewPassInput}
                  onChange={(e) => setWageNewPassInput(e.target.value)}
                  placeholder="新しい合言葉（4文字以上）"
                  className="flex-1 h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white"
                />
                <button
                  onClick={saveWagePass}
                  disabled={wageBusy || wageNewPassInput.trim().length < 4}
                  className="h-10 px-3 rounded-lg bg-slate-600 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-bold whitespace-nowrap"
                >
                  決め直す
                </button>
              </div>
            </details>
          </div>
        ) : (
          /* 解錠済み：時給の入力 */
          <>
            <p className="text-[11px] text-slate-500">
              コスト計算（ムダになった残業の金額・折半額）に使います。空欄でもかまいません。
              <span className="text-emerald-600 font-bold">15分でまた自動的に隠れます。</span>
            </p>
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
          </>
        )}
      </div>

      {/* 月切替 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-black text-slate-700">勤怠の記録</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadExcel}
            disabled={excelBusy}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
            title="この月の勤怠管理表をExcelで作ります（スタッフごとにシートが分かれます）"
          >
            {excelBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            勤怠管理表を作る
          </button>
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <button onClick={() => setMonth((d) => addMonths(d, -1))} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white"><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-2 text-sm font-bold min-w-[96px] text-center">{format(month, "yyyy年M月", { locale: ja })}</span>
            <button onClick={() => setMonth((d) => addMonths(d, 1))} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* サマリ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="記録日数" value={`${summary?.recordDays ?? 0}`} tone="slate" />
        <SummaryCard label="残業の退社" value={`${summary?.overtimeCount ?? 0}`} tone="amber" />
        <SummaryCard label="ムダな被り" value={`${summary?.wastefulCount ?? 0}`} tone="rose" hint="依頼/予約/正当以外" />
        <SummaryCard label="できなかった業務" value={`${summary?.notDoneTaskCount ?? 0}`} tone="orange" hint="下の一覧に理由" />
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
            「ムダな被り」と判定された残業を、その人のシフト終わりからの超過時間×時給で計算しています。
            予約の担当・院長の依頼・正当な理由・締め作業は除いています。
          </p>
          {summary.wagesLocked && (
            <p className="text-[11px] text-slate-500 flex items-center gap-1">
              <Lock className="w-3 h-3" /> 金額は伏せています。上の「スタッフの時給」で合言葉を入れると表示されます。
            </p>
          )}
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
                <th className="text-left font-bold px-3 py-2">判定・理由 / できなかった業務</th>
                <th className="text-center font-bold px-2 py-2">修正</th>
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
                  <td className={`px-2 py-2 text-center font-bold ${r.isOvertime ? "text-amber-700" : "text-slate-600"}`}>
                    {r.clockOutAt ? format(new Date(r.clockOutAt), "HH:mm") : "—"}
                    {r.shiftEnd && <span className="block text-[9px] font-normal text-slate-400">予定 {r.shiftEnd}</span>}
                  </td>
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
                            {r.fullPayYen != null ? ` ／ 満額${yen(r.fullPayYen)}・折半${yen(r.splitPayYen ?? 0)}` : ""}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />定時</span>
                    )}
                    {/* できなかった業務（退勤時に「できない」で申告されたもの） */}
                    {r.notDoneTasks.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {r.notDoneTasks.map((t, i) => (
                          <div key={i} className="text-[11px] text-orange-700 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>
                              <b>{t.title}</b>
                              {t.reason && <span className="text-orange-600/80">（{t.reason}）</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => openEditTimes(r)}
                      title="出勤・退勤の時刻を修正（院長のみ）"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 打刻の修正（院長のみ） */}
      {editRec && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !savingTimes && setEditRec(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-base font-black text-slate-800">
              <Clock className="w-5 h-5 text-blue-600" /> 打刻の修正
            </div>
            <p className="text-xs text-slate-500">
              {editRec.staffName}さん・{format(new Date(editRec.workDate), "M月d日(E)", { locale: ja })} の打刻を直します。
              空欄にすると「打刻なし」になります。残業の判定も自動でやり直します。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold text-slate-600">出勤</span>
                <input type="time" value={editIn} onChange={(e) => setEditIn(e.target.value)}
                  className="mt-1.5 w-full h-11 rounded-xl border border-slate-300 px-3 text-sm bg-white" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">退勤</span>
                <input type="time" value={editOut} onChange={(e) => setEditOut(e.target.value)}
                  className="mt-1.5 w-full h-11 rounded-xl border border-slate-300 px-3 text-sm bg-white" />
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditRec(null)} disabled={savingTimes}
                className="flex-1 h-11 rounded-xl border border-slate-300 text-slate-600 font-bold text-sm hover:bg-slate-50">
                やめる
              </button>
              <button onClick={saveTimes} disabled={savingTimes}
                className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm">
                {savingTimes ? "保存中..." : "保存する"}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 text-center">
              直した記録は履歴（監査ログ）に残ります。
            </p>
          </div>
        </div>
      )}
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

function SummaryCard({ label, value, tone, hint }: { label: string; value: string; tone: "slate" | "amber" | "rose" | "orange"; hint?: string }) {
  const cls = {
    slate: "bg-slate-50 border-slate-200 text-slate-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
  }[tone];
  return (
    <div className={`rounded-2xl border p-3 text-center ${cls}`}>
      <div className="text-2xl font-black">{value}</div>
      <div className="text-[11px] font-bold mt-0.5">{label}</div>
      {hint && <div className="text-[10px] opacity-70 mt-0.5">{hint}</div>}
    </div>
  );
}
