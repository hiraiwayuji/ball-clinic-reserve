"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { ArrowLeft, CalendarClock, X, Loader2, CheckCircle2, Clock } from "lucide-react";
import { consumeLineReserveToken } from "@/app/actions/family-line";
import {
  getMyUpcomingReservations,
  cancelMyReservation,
  rescheduleMyReservation,
  type MyReservation,
} from "@/app/actions/manage-reservation";
import { getDailyAvailability } from "@/app/actions/reserve";
import { getTimeSlots, isTimeSlotWithinTwoHours } from "@/lib/time-slots";
import { useClinicSlotDuration } from "@/lib/use-clinic-slot-duration";
import { useClinicSchedule } from "@/lib/use-clinic-schedule";

function fmtDateTime(iso: string) {
  return format(new Date(iso), "M月d日（E） HH:mm", { locale: ja });
}

export default function ReserveManagePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <ManageContent />
    </Suspense>
  );
}

function ManageContent() {
  const searchParams = useSearchParams();
  const lt = searchParams.get("lt");
  const slotMinutes = useClinicSlotDuration();
  const schedule = useClinicSchedule();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reservations, setReservations] = useState<MyReservation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 時間変更パネルを開いている予約ID
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [reDate, setReDate] = useState<string>("");
  const [bookedTimes, setBookedTimes] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await getMyUpcomingReservations();
    if (res.ok) {
      setReservations(res.reservations);
      setError(null);
    } else {
      setError(res.error ?? "読み込みに失敗しました");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      if (lt) {
        try { await consumeLineReserveToken(lt); } catch {}
      }
      await reload();
    })();
  }, [lt, reload]);

  const openReschedule = (r: MyReservation) => {
    setRescheduleId(r.id);
    setReDate("");
    setBookedTimes([]);
  };

  const onPickDate = async (r: MyReservation, dateStr: string) => {
    setReDate(dateStr);
    if (!dateStr) { setBookedTimes([]); return; }
    setLoadingSlots(true);
    try {
      const booked = await getDailyAvailability(dateStr, r.courseId);
      setBookedTimes(booked);
    } catch { setBookedTimes([]); }
    setLoadingSlots(false);
  };

  const doReschedule = async (r: MyReservation, time: string) => {
    setBusyId(r.id);
    try {
      const res = await rescheduleMyReservation(r.id, reDate, time);
      if (res.ok) {
        setToast("予約時間を変更しました（院の確認後に確定します）");
        setRescheduleId(null);
        await reload();
      } else {
        setToast(res.error ?? "変更できませんでした");
      }
    } finally { setBusyId(null); }
  };

  const doCancel = async (r: MyReservation) => {
    if (!confirm(`${fmtDateTime(r.startTime)} のご予約をキャンセルします。よろしいですか？`)) return;
    setBusyId(r.id);
    try {
      const res = await cancelMyReservation(r.id);
      if (res.ok) {
        setToast("予約をキャンセルしました");
        await reload();
      } else {
        setToast(res.error ?? "キャンセルできませんでした");
      }
    } finally { setBusyId(null); }
  };

  // 変更先の選べる日付（今日〜30日、休診日除外）
  const selectableDates = (() => {
    const out: { value: string; label: string }[] = [];
    const today = new Date();
    for (let i = 0; i <= 31; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      if (schedule.closedDays.includes(d.getDay())) continue;
      const value = format(d, "yyyy-MM-dd");
      out.push({ value, label: format(d, "M/d(E)", { locale: ja }) });
    }
    return out;
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white px-4 py-6">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-2 mb-5">
          <CalendarClock className="w-6 h-6 text-blue-400" />
          <h1 className="text-xl font-black">ご予約の確認・変更</h1>
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-16 gap-3 text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin" /> 読み込み中...
          </div>
        ) : error ? (
          <div className="bg-amber-500/10 border border-amber-400/30 rounded-2xl p-5 text-amber-100 text-sm">
            {error}
          </div>
        ) : reservations.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center text-zinc-300">
            <p className="font-bold mb-1">今後のご予約はありません</p>
            <p className="text-sm text-zinc-400">新しくご予約される場合は下のボタンからどうぞ。</p>
            <Link href="/reserve/menu" className="inline-block mt-4 bg-blue-600 hover:bg-blue-500 px-5 py-3 rounded-2xl font-bold">
              予約する
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {reservations.map((r) => (
              <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] text-zinc-400 font-bold">{r.customerName} 様</p>
                      <p className="text-lg font-black mt-0.5">{fmtDateTime(r.startTime)}</p>
                      <p className="text-sm text-zinc-300 mt-0.5">
                        {r.courseName ?? "施術"}{r.staffName ? `／${r.staffName}` : ""}
                      </p>
                      {r.status === "waiting" && (
                        <span className="inline-block mt-1 text-[11px] font-bold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full">キャンセル待ち</span>
                      )}
                    </div>
                  </div>

                  {rescheduleId === r.id ? (
                    <div className="mt-4 bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
                      <p className="text-sm font-bold mb-2">新しい日付を選ぶ</p>
                      <div className="flex gap-1.5 overflow-x-auto pb-2">
                        {selectableDates.map((d) => (
                          <button
                            key={d.value}
                            onClick={() => onPickDate(r, d.value)}
                            className={`shrink-0 px-3 py-2 rounded-lg text-xs font-bold border ${
                              reDate === d.value ? "bg-blue-600 border-blue-500 text-white" : "bg-zinc-900 border-zinc-700 text-zinc-300"
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>

                      {reDate && (
                        loadingSlots ? (
                          <div className="flex items-center gap-2 text-zinc-400 text-sm py-3"><Loader2 className="w-4 h-4 animate-spin" />空き時間を確認中...</div>
                        ) : (
                          <div className="grid grid-cols-4 gap-1.5 mt-1">
                            {getTimeSlots(new Date(`${reDate}T00:00:00`), { slotMinutes, schedule }).map((t) => {
                              const booked = bookedTimes.includes(t);
                              const tooClose = isTimeSlotWithinTwoHours(reDate, t);
                              const disabled = booked || tooClose || busyId === r.id;
                              return (
                                <button
                                  key={t}
                                  disabled={disabled}
                                  onClick={() => doReschedule(r, t)}
                                  className={`py-2 rounded-lg text-xs font-bold border ${
                                    disabled
                                      ? "bg-zinc-900 border-zinc-800 text-zinc-600"
                                      : "bg-emerald-600/20 border-emerald-500/40 text-emerald-200 hover:bg-emerald-600/40"
                                  }`}
                                >
                                  {t}
                                </button>
                              );
                            })}
                          </div>
                        )
                      )}

                      <button onClick={() => setRescheduleId(null)} className="mt-3 text-xs text-zinc-400 underline">
                        変更をやめる
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => openReschedule(r)}
                        disabled={busyId === r.id}
                        className="flex-1 h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm font-bold inline-flex items-center justify-center gap-1.5"
                      >
                        <Clock className="w-4 h-4" /> 時間を変更
                      </button>
                      <button
                        onClick={() => doCancel(r)}
                        disabled={busyId === r.id}
                        className="flex-1 h-11 rounded-xl bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/40 text-rose-200 text-sm font-bold inline-flex items-center justify-center gap-1.5"
                      >
                        {busyId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} キャンセル
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/reserve/menu" className="text-blue-300 hover:text-white text-sm font-medium inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> 新しく予約する
          </Link>
        </div>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-6 flex justify-center px-4 z-50" onClick={() => setToast(null)}>
          <div className="bg-zinc-800 border border-zinc-700 text-white text-sm font-bold rounded-2xl px-5 py-3 shadow-xl inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {toast}
          </div>
        </div>
      )}
    </div>
  );
}
