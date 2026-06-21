"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";
import { Loader2, Clock, LogIn, LogOut, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  listAttendanceStaff, getAttendanceConfig, getTodayAttendance,
  clockIn, clockOut,
  type AttendanceStaff, type AttendanceConfig, type TodayAttendance, type OvertimeReasonType,
} from "@/app/actions/attendance";
import { OVERTIME_REASONS } from "@/lib/attendance-constants";
import { CLINIC_CONFIG } from "@/lib/clinic-config";

export default function AttendancePage() {
  const clinicName = CLINIC_CONFIG.name; // ビルド時固定（ボール混入防止）
  const [staffList, setStaffList] = useState<AttendanceStaff[]>([]);
  const [config, setConfig] = useState<AttendanceConfig | null>(null);
  const [staffId, setStaffId] = useState("");
  const [today, setToday] = useState<TodayAttendance | null>(null);
  const [loadingToday, setLoadingToday] = useState(false);
  const [busy, setBusy] = useState(false);

  // 残業理由モーダル
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasonType, setReasonType] = useState<OvertimeReasonType | "">("");
  const [reasonNote, setReasonNote] = useState("");

  useEffect(() => {
    listAttendanceStaff().then(setStaffList).catch(() => {});
    getAttendanceConfig().then(setConfig).catch(() => {});
  }, []);

  const selectedStaff = useMemo(() => staffList.find((s) => s.id === staffId), [staffList, staffId]);

  const refreshToday = async (id: string) => {
    if (!id) { setToday(null); return; }
    setLoadingToday(true);
    try {
      setToday(await getTodayAttendance(id));
    } finally {
      setLoadingToday(false);
    }
  };

  useEffect(() => { refreshToday(staffId); }, [staffId]);

  const handleClockIn = async () => {
    if (!staffId) { toast.error("お名前を選んでください"); return; }
    setBusy(true);
    const r = await clockIn(staffId);
    setBusy(false);
    if (r.success) { toast.success("出勤を記録しました"); refreshToday(staffId); }
    else toast.error(r.error ?? "記録に失敗しました");
  };

  const handleClockOut = async () => {
    if (!staffId) { toast.error("お名前を選んでください"); return; }
    setBusy(true);
    const r = await clockOut(staffId);
    setBusy(false);
    if (r.success) {
      toast.success("お疲れさまでした。退勤を記録しました");
      refreshToday(staffId);
      return;
    }
    if (r.requireReason) {
      // しきい値以降の退社 → 理由を入力
      setReasonType("");
      setReasonNote("");
      setReasonOpen(true);
      return;
    }
    toast.error(r.error ?? "記録に失敗しました");
  };

  const submitReason = async () => {
    if (!reasonType) { toast.error("理由を選んでください"); return; }
    if (reasonType === "valid" && !reasonNote.trim()) { toast.error("正当な理由の内容を入力してください"); return; }
    setBusy(true);
    const r = await clockOut(staffId, { type: reasonType, note: reasonNote });
    setBusy(false);
    if (r.success) {
      setReasonOpen(false);
      toast.success("退勤を記録しました");
      refreshToday(staffId);
    } else {
      toast.error(r.error ?? "記録に失敗しました");
    }
  };

  // 機能オフ（オーナーが未有効化）
  if (config && !config.enabled) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-md w-full p-8 text-center">
          <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h1 className="text-lg font-black text-slate-800">勤怠の打刻は現在オフです</h1>
          <p className="text-slate-500 mt-2 text-sm leading-relaxed">
            院長が管理画面の「勤怠」で<br />オンにすると使えるようになります。
          </p>
        </div>
      </div>
    );
  }

  const clockedIn = !!today?.clockInAt;
  const clockedOut = !!today?.clockOutAt;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* ヘッダー */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-blue-600 font-black">
            <Clock className="w-5 h-5" />
            出退勤の打刻
          </div>
          <p className="text-slate-500 text-sm mt-1">{clinicName}</p>
          {config && (
            <p className="text-[11px] text-slate-400 mt-1">
              退社の目標 {config.workEndTarget} ／ {config.overtimeReasonAfter} 以降の退社は理由の入力が必要です
            </p>
          )}
        </div>

        {/* 名前選択 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">お名前を選んでください</span>
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
        </div>

        {/* 本日の状態 */}
        {staffId && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-600 mb-2">
              本日（{format(new Date(), "M月d日(E)", { locale: ja })}）の {selectedStaff?.name} さん
            </p>
            {loadingToday ? (
              <div className="h-12 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className={`rounded-xl p-3 border ${clockedIn ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"}`}>
                  <div className="text-[11px] font-bold text-slate-500">出勤</div>
                  <div className="text-lg font-black mt-0.5">
                    {today?.clockInAt ? format(new Date(today.clockInAt), "HH:mm") : "—"}
                  </div>
                </div>
                <div className={`rounded-xl p-3 border ${clockedOut ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200"}`}>
                  <div className="text-[11px] font-bold text-slate-500">退勤</div>
                  <div className="text-lg font-black mt-0.5">
                    {today?.clockOutAt ? format(new Date(today.clockOutAt), "HH:mm") : "—"}
                  </div>
                </div>
              </div>
            )}
            {today?.isOvertime && today.reasonType && (
              <div className="mt-3 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-800 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  残業として記録：{OVERTIME_REASONS.find((r) => r.value === today.reasonType)?.label}
                  {today.reasonNote ? `（${today.reasonNote}）` : ""}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 打刻ボタン */}
        {staffId && (
          <div className="space-y-3">
            <button
              onClick={handleClockIn}
              disabled={busy || clockedIn}
              className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-base font-black shadow-lg flex items-center justify-center gap-2"
            >
              <LogIn className="w-5 h-5" />
              {clockedIn ? "出勤ずみ" : "出勤"}
            </button>
            <button
              onClick={handleClockOut}
              disabled={busy || clockedOut}
              className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-base font-black shadow-lg flex items-center justify-center gap-2"
            >
              <LogOut className="w-5 h-5" />
              {clockedOut ? "退勤ずみ" : "退勤"}
            </button>
            {clockedOut && (
              <div className="text-center text-emerald-600 text-sm font-bold flex items-center justify-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> 本日の打刻は完了しています
              </div>
            )}
          </div>
        )}
      </div>

      {/* 残業理由モーダル */}
      {reasonOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => !busy && setReasonOpen(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <div className="inline-flex items-center gap-2 text-amber-600 font-black">
                <AlertTriangle className="w-5 h-5" />
                {config?.overtimeReasonAfter ?? "20:15"} 以降の退社です
              </div>
              <p className="text-slate-500 text-sm mt-1">何のために残ったかを選んでください</p>
            </div>

            <div className="space-y-2">
              {OVERTIME_REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setReasonType(r.value)}
                  className={`w-full text-left rounded-xl border px-4 py-3 text-sm font-bold transition-all ${
                    reasonType === r.value
                      ? "bg-blue-50 border-blue-400 text-blue-700"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {(reasonType === "valid" || reasonType === "other") && (
              <textarea
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                rows={2}
                placeholder={reasonType === "valid" ? "理由を入力してください（必須）" : "補足があれば（任意）"}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
              />
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setReasonOpen(false)}
                disabled={busy}
                className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm"
              >
                もどる
              </button>
              <button
                onClick={submitReason}
                disabled={busy || !reasonType}
                className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-black text-sm"
              >
                {busy ? "記録中..." : "退勤を記録"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
