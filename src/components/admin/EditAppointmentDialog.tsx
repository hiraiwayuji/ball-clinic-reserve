"use client";

import { useState, useEffect } from "react";
import { format, parseISO, addDays } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarIcon, Trash2, MessageCircle, CheckCircle, X, Clock, CalendarRange, CalendarPlus, Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  updateAppointmentDetails,
  deleteAppointment,
  updateAppointmentStatus,
  sendLineConfirmation,
  notifyWaitlistOpening,
  addAddonToAppointment,
  getAddonCourseInfo,
  type WaitlistCandidate,
} from "@/app/actions/adminReserve";
import { getCourses, getStaffList, getRooms, type ReservationCourse, type ReservationStaff, type ReservationRoom } from "@/app/actions/courses";
import { AddAppointmentDialog } from "./AddAppointmentDialog";
import { toast } from "sonner";
import { getTimeSlots } from "@/lib/time-slots";
import { useClinicSlotDuration } from "@/lib/use-clinic-slot-duration";

interface EditAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: any;
  onSuccess?: () => void;
}

export function EditAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  onSuccess,
}: EditAppointmentDialogProps) {
  const slotMinutes = useClinicSlotDuration();
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState<string>("");
  const [duration, setDuration] = useState<string>("30");
  const [visitType, setVisitType] = useState<string>("return");
  const [memo, setMemo] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastVisitDate, setLastVisitDate] = useState<Date | null>(null);
  const [visitCount, setVisitCount] = useState<number | null>(null);
  const [deleteChoiceOpen, setDeleteChoiceOpen] = useState(false);
  const [seriesFutureCount, setSeriesFutureCount] = useState<number>(0);
  // キャンセル待ち：削除で空きが出たとき候補を出して LINE で空きを知らせる
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistCandidates, setWaitlistCandidates] = useState<WaitlistCandidate[]>([]);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [notifiedIds, setNotifiedIds] = useState<string[]>([]);
  // 予約確定の直後に「LINEを送りますか？」を確認するポップ
  const [lineConfirmOpen, setLineConfirmOpen] = useState(false);
  const [lineSending, setLineSending] = useState(false);
  // 次回予約（この患者の新規予約をプリフィルして開く）
  const [nextOpen, setNextOpen] = useState(false);
  const [custPhone, setCustPhone] = useState<string>("");
  const [custMrn, setCustMrn] = useState<string>("");
  // 次回予約フォームの初期日時（1週間後の同じ曜日・同じ時刻）
  const [nextDefaultDate, setNextDefaultDate] = useState<Date | undefined>();
  const [nextDefaultTime, setNextDefaultTime] = useState<string>("");
  // 「施術後に○○を追加」用の設定メニュー
  const [addonInfo, setAddonInfo] = useState<{ courseId: string; name: string; allowConcurrent: boolean } | null>(null);

  // コース・スタッフ・個室マスタ
  const [courses, setCourses] = useState<ReservationCourse[]>([]);
  const [staffList, setStaffList] = useState<ReservationStaff[]>([]);
  const [rooms, setRooms] = useState<ReservationRoom[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");
  const [roomId, setRoomId] = useState<string>("");
  // 元の値（変更検知用：未変更なら updateAppointmentDetails に options を渡さない）
  const [initialCourseId, setInitialCourseId] = useState<string>("");
  const [initialStaffId, setInitialStaffId] = useState<string>("");
  const [initialRoomId, setInitialRoomId] = useState<string>("");

  // slot サイズ刻みで 120分まで（既存予約が slot 倍数でないケースも拾えるよう現在値もマージ）
  const durationOptions = (() => {
    const base = Array.from(
      { length: Math.floor(120 / slotMinutes) },
      (_, i) => (i + 1) * slotMinutes,
    );
    const cur = Number(duration);
    if (cur && !base.includes(cur)) {
      base.push(cur);
      base.sort((a, b) => a - b);
    }
    return base;
  })();

  useEffect(() => {
    if (open && appointment) {
      const startDateTime = parseISO(appointment.start_time);
      setDate(startDateTime);
      setTime(format(startDateTime, "HH:mm"));

      // 前回来院日・来院回数を取得（マルチテナント漏洩防止のため clinic_id でも絞る）
      const aptClinicId = appointment.clinic_id ?? null;
      if (appointment.customer_id && aptClinicId) {
        const supabase = createClient();
        supabase
          .from("appointments")
          .select("start_time")
          .eq("clinic_id", aptClinicId)
          .eq("customer_id", appointment.customer_id)
          .neq("status", "cancelled")
          .neq("id", appointment.id)
          .lt("start_time", appointment.start_time)
          .order("start_time", { ascending: false })
          .limit(1)
          .then(({ data }) => {
            setLastVisitDate(data && data.length > 0 ? new Date(data[0].start_time) : null);
          });
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", aptClinicId)
          .eq("customer_id", appointment.customer_id)
          .neq("status", "cancelled")
          .neq("id", appointment.id)
          .lt("start_time", appointment.start_time)
          .then(({ count }) => {
            setVisitCount(count ?? 0);
          });
        // 次回予約のプリフィル用に電話番号・カルテ番号を取得（本人を確実に特定するため）
        supabase
          .from("customers")
          .select("phone, medical_record_number")
          .eq("clinic_id", aptClinicId)
          .eq("id", appointment.customer_id)
          .maybeSingle()
          .then(({ data }) => {
            setCustPhone(data?.phone ?? appointment.customers?.phone ?? "");
            setCustMrn(data?.medical_record_number ?? "");
          });
      } else {
        setLastVisitDate(null);
        setVisitCount(null);
        setCustPhone(appointment.customers?.phone ?? "");
        setCustMrn("");
      }

      let diffMinutes = 30;
      if (appointment.end_time) {
        const endDateTime = parseISO(appointment.end_time);
        diffMinutes = Math.round(
          (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60)
        );
      }
      setDuration(diffMinutes > 0 ? diffMinutes.toString() : "30");
      setVisitType(appointment.is_first_visit ? "new" : "return");
      setMemo(appointment.memo || "");

      // 既存の course_id / staff_id / room_id をセット
      const cId = appointment.course_id ?? "";
      const sId = appointment.staff_id ?? "";
      const rId = appointment.room_id ?? "";
      setCourseId(cId);
      setStaffId(sId);
      setRoomId(rId);
      setInitialCourseId(cId);
      setInitialStaffId(sId);
      setInitialRoomId(rId);

      // マスタ取得（既に取得済みなら再取得しない）
      if (courses.length === 0) {
        getCourses().then(setCourses).catch(() => {});
      }
      if (staffList.length === 0) {
        getStaffList().then(setStaffList).catch(() => {});
      }
      if (rooms.length === 0) {
        getRooms().then(setRooms).catch(() => {});
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appointment]);

  // 追加メニュー設定を取得（「施術後に○○を追加」ボタン用）
  useEffect(() => { getAddonCourseInfo().then(setAddonInfo).catch(() => setAddonInfo(null)); }, []);

  // コース選択時に所要時間も連動して更新
  const handleCourseChange = (id: string) => {
    setCourseId(id);
    if (id) {
      const c = courses.find(c => c.id === id);
      if (c) setDuration(String(c.duration_minutes));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date || !time || !appointment) {
      toast.error("日付と時間を選択してください");
      return;
    }
    setIsSubmitting(true);
    try {
      // 変更があった項目だけ options に含める（"" は「解除」扱い → null）
      const options: { courseId?: string | null; staffId?: string | null; roomId?: string | null } = {};
      if (courseId !== initialCourseId) options.courseId = courseId === "" ? null : courseId;
      if (staffId !== initialStaffId) options.staffId = staffId === "" ? null : staffId;
      if (roomId !== initialRoomId) options.roomId = roomId === "" ? null : roomId;

      const result = await updateAppointmentDetails(
        appointment.id,
        format(date, "yyyy-MM-dd"),
        time,
        memo,
        visitType === "new",
        Number(duration),
        Object.keys(options).length > 0 ? options : undefined,
      );
      if (result.success) {
        toast.success("予約を更新しました");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(result.error || "エラーが発生しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 予約に「設定された追加メニュー」を追加（施術後 or 同時刻）。同一患者へ直接ひもづけ。
  const handleAddAddon = async (timing: "after" | "same") => {
    if (!appointment) return;
    const label = addonInfo?.name ?? "メニュー";
    setIsSubmitting(true);
    try {
      const res = await addAddonToAppointment(appointment.id, timing);
      if (res.success) {
        toast.success(timing === "same" ? `同時刻に${label}を追加しました` : `施術後に${label}を追加しました`);
        onSuccess?.();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "追加に失敗しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 削除ボタン押下: 連続予約（series_id あり）なら選択ダイアログを開く。
  // 単発予約は従来通り confirm のみ。
  const handleDeleteClick = async () => {
    if (!appointment) return;
    if (appointment.series_id) {
      // 同一シリーズ内のこの予約を含む将来の件数を数える（モーダルに件数表示・自院のみ）
      try {
        const supabase = createClient();
        if (!appointment.clinic_id) {
          setSeriesFutureCount(1);
        } else {
          const { count } = await supabase
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .eq("clinic_id", appointment.clinic_id)
            .eq("series_id", appointment.series_id)
            .neq("status", "cancelled")
            .gte("start_time", appointment.start_time);
          setSeriesFutureCount(count ?? 1);
        }
      } catch {
        setSeriesFutureCount(1);
      }
      setDeleteChoiceOpen(true);
      return;
    }
    if (!confirm("本当にこの予約を削除しますか？")) return;
    await runDelete("one");
  };

  const runDelete = async (scope: "one" | "future") => {
    if (!appointment) return;
    setIsSubmitting(true);
    setDeleteChoiceOpen(false);
    try {
      const result = await deleteAppointment(appointment.id, scope);
      if (result.success) {
        const n = (result as any).deletedCount ?? 1;
        toast.success(scope === "future" && n > 1
          ? `連続予約 ${n} 件を削除しました`
          : "予約を削除しました");
        const cands = ((result as any).waitlistCandidates ?? []) as WaitlistCandidate[];
        onSuccess?.();
        if (cands.length > 0) {
          // 空きが出た → キャンセル待ちの方へ知らせるポップアップを出す（本体はそのまま）
          setWaitlistCandidates(cands);
          setNotifiedIds([]);
          setWaitlistOpen(true);
        } else {
          onOpenChange(false);
        }
      } else {
        toast.error(result.error || "エラーが発生しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeWaitlist = () => {
    setWaitlistOpen(false);
    onOpenChange(false);
  };

  const handleNotifyWaitlist = async (id: string) => {
    setNotifyingId(id);
    try {
      const r = await notifyWaitlistOpening(id);
      if (r.success) {
        toast.success("キャンセル待ちの方へ、LINEで空きをお知らせしました");
        setNotifiedIds((prev) => [...prev, id]);
      } else {
        toast.error(r.error || "送信に失敗しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setNotifyingId(null);
    }
  };

  const handleSendLine = async () => {
    if (!appointment) return;
    // 仮予約のまま「LINE通知」を押す＝この予約を受け付ける意味なので、
    // 先に予約確定してから送る。こうすると確認待ちリストから自動で消える。
    const wasPending = appointment.status === "pending";
    setIsSubmitting(true);
    try {
      if (wasPending) {
        const confirmed = await updateAppointmentStatus(appointment.id, "confirmed");
        if (!confirmed.success) {
          toast.error(confirmed.error || "予約確定に失敗しました");
          return;
        }
      }
      const result = await sendLineConfirmation(appointment.id);
      if (result.success) {
        toast.success(wasPending ? "予約を確定し、LINEを送信しました" : "LINEを送信しました");
      } else {
        // LINE未連携などで送れなくても、確定は済んでいるのでリストからは消す
        toast.error(result.error || "LINE送信に失敗しました");
      }
      if (wasPending) {
        // 確定済み＝処理済みなので一覧を更新して閉じる（確認待ちから外れる）
        onSuccess?.();
        onOpenChange(false);
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (!appointment) return;
    setIsSubmitting(true);
    try {
      const result = await updateAppointmentStatus(appointment.id, "confirmed");
      if (result.success) {
        toast.success("予約を確定しました");
        // ★ここで onSuccess() を呼ぶと親が selectedAppointment を null にして
        //   このダイアログごとアンマウントされ、直後の「LINEを送りますか？」ポップが
        //   表示される前に消えてしまう（＝一覧に戻ってしまう）バグだった。
        //   一覧の更新は、ポップを閉じたあと（送る／送らない）に行う。
        setLineConfirmOpen(true);
      } else {
        toast.error(result.error || "エラーが発生しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 確定ポップ内「送る」: LINE確定通知を送ってから閉じる
  const handleConfirmSendLine = async () => {
    if (!appointment) return;
    setLineSending(true);
    try {
      const result = await sendLineConfirmation(appointment.id);
      if (result.success) {
        toast.success("予約確定のLINEを送信しました");
      } else {
        toast.error(result.error || "LINE送信に失敗しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setLineSending(false);
      setLineConfirmOpen(false);
      // ポップを閉じてから一覧を更新（確定済みステータスを反映）
      onSuccess?.();
      onOpenChange(false);
    }
  };

  // 確定ポップ内「送らない」: 送信せず閉じる（一覧は確定済みに更新）
  const handleSkipLine = () => {
    setLineConfirmOpen(false);
    onSuccess?.();
    onOpenChange(false);
  };

  // 次回予約: この患者をプリフィルした新規予約フォームを開く（編集は閉じる）
  // 初期日時は「いま表示中の予約日時」を基準に1週間後の同じ曜日・同じ時刻にする。
  const handleNextAppointment = () => {
    const base = date ?? parseISO(appointment.start_time);
    setNextDefaultDate(addDays(base, 7));
    setNextDefaultTime(time || format(parseISO(appointment.start_time), "HH:mm"));
    onOpenChange(false);
    setNextOpen(true);
  };

  if (!appointment) return null;

  const selectClass =
    "flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg mx-auto max-h-[92dvh] overflow-y-auto p-0 gap-0 rounded-2xl">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b sticky top-0 bg-white z-10">
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle className="text-base font-bold">予約の編集</DialogTitle>
              <p className="text-sm text-slate-500 mt-0.5">
                {appointment.customers?.name}
                <span className="text-slate-400">様</span>
                {custMrn && (
                  <span className="ml-2 text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-full border border-slate-200 tabular-nums">
                    No.{custMrn}
                  </span>
                )}
                {appointment.is_first_visit && (
                  <span className="ml-2 text-[10px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
                    初診
                  </span>
                )}
              </p>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="w-3 h-3" />
                  前回来院:{" "}
                  <span className="font-semibold text-slate-700">
                    {lastVisitDate
                      ? format(lastVisitDate, "yyyy年M月d日（E）", { locale: ja })
                      : "初来院"}
                  </span>
                </span>
                {visitCount !== null && (
                  <span className="text-xs text-slate-400">
                    通算 <span className="font-bold text-slate-600">{visitCount}</span> 回目
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4 space-y-4">
            {/* 日付 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                予約日 <span className="text-red-500">*</span>
              </Label>
              <Popover>
                <PopoverTrigger className="flex items-center w-full h-11 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm hover:bg-accent transition-colors text-left">
                  <CalendarIcon className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
                  {date ? (
                    format(date, "yyyy年M月d日（E）", { locale: ja })
                  ) : (
                    <span className="text-muted-foreground">日付を選択</span>
                  )}
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-0 z-[200]"
                  align="start"
                  side="bottom"
                  sideOffset={4}
                >
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                    locale={ja}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* 時間 + 所要時間 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  時間 <span className="text-red-500">*</span>
                </Label>
                <select
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={selectClass}
                >
                  {!date ? (
                    <option value="" disabled>先に日付を選択</option>
                  ) : getTimeSlots(date, { bypassRestrictions: true, slotMinutes }).length === 0 ? (
                    <option value="" disabled>休診日</option>
                  ) : (
                    <option value="" disabled>時間を選択</option>
                  )}
                  {date &&
                    getTimeSlots(date, { bypassRestrictions: true, slotMinutes }).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  所要時間
                </Label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className={selectClass}
                >
                  {durationOptions.map((m) => (
                    <option key={m} value={m}>{m}分</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 初診/再診 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                初診 / 再診
              </Label>
              <div className="flex gap-2">
                {["new", "return"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisitType(v)}
                    className={`flex-1 h-11 rounded-lg border text-sm font-semibold transition-all ${
                      visitType === v
                        ? v === "new"
                          ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                          : "bg-blue-600 border-blue-600 text-white shadow-sm"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {v === "new" ? "初診" : "再診"}
                  </button>
                ))}
              </div>
            </div>

            {/* コース・メニュー */}
            {courses.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  メニュー / コース
                </Label>
                <select value={courseId} onChange={(e) => handleCourseChange(e.target.value)} className={selectClass}>
                  <option value="">指定なし</option>
                  {courses
                    .filter(c => c.is_active || c.id === initialCourseId)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}（{c.duration_minutes}分{c.price != null ? ` / ¥${c.price.toLocaleString()}` : ""}）
                        {!c.is_active ? "（非公開）" : ""}
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-500">変更すると売上一括入力の元情報も更新されます。</p>
              </div>
            )}

            {/* 担当スタッフ */}
            {staffList.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  担当スタッフ
                </Label>
                <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={selectClass}>
                  <option value="">指定なし</option>
                  {staffList
                    .filter(s => s.is_active || s.id === initialStaffId)
                    .map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}{!s.is_active ? "（非公開）" : ""}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* 個室 */}
            {rooms.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  個室
                </Label>
                <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={selectClass}>
                  <option value="">指定なし</option>
                  {rooms
                    .filter(r => r.is_active || r.id === initialRoomId)
                    .map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name}{!r.is_active ? "（非公開）" : ""}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* メモ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                メモ（症状など）
              </Label>
              <Input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="例: 腰痛（電話予約）"
                className="h-11"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 pt-3 border-t space-y-2 sticky bottom-0 bg-white">
            {/* Primary action */}
            <Button
              type="submit"
              disabled={isSubmitting || !date || !time}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
            >
              {isSubmitting ? "保存中..." : "変更を保存"}
            </Button>

            {/* 次回予約（この患者の新規予約をプリフィルして開く） */}
            <Button
              type="button"
              variant="outline"
              onClick={handleNextAppointment}
              disabled={isSubmitting}
              className="w-full h-11 border-blue-300 text-blue-700 hover:bg-blue-50 rounded-xl font-bold"
            >
              <CalendarPlus className="w-4 h-4 mr-1.5" />
              次回予約を入れる
            </Button>

            {/* 施術後に○○を追加（設定 addon_course_id がある院のみ・追加メニュー自体には出さない） */}
            {addonInfo && appointment.course_id !== addonInfo.courseId && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAddAddon("after")}
                  disabled={isSubmitting}
                  className="flex-1 h-10 border-cyan-300 text-cyan-700 hover:bg-cyan-50 rounded-xl text-sm"
                >
                  ＋ 施術後に{addonInfo.name}
                </Button>
                {/* 「同時刻」は水素のように別の時間が要らないメニューだけ */}
                {addonInfo.allowConcurrent && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleAddAddon("same")}
                    disabled={isSubmitting}
                    className="flex-1 h-10 border-cyan-300 text-cyan-700 hover:bg-cyan-50 rounded-xl text-sm"
                  >
                    ＋ 同時刻に{addonInfo.name}
                  </Button>
                )}
              </div>
            )}

            {/* Secondary actions */}
            <div className="flex gap-2">
              {appointment.status === "pending" && (
                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isSubmitting}
                  className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm"
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  予約確定
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={handleSendLine}
                disabled={isSubmitting}
                className="flex-1 h-10 border-green-400 text-green-700 hover:bg-green-50 rounded-xl text-sm"
              >
                <MessageCircle className="w-4 h-4 mr-1" />
                LINE通知
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteClick}
                disabled={isSubmitting}
                className="flex-1 h-10 rounded-xl text-sm"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                削除
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>

      {/* 次回予約フォーム（この患者をプリフィル） */}
      <AddAppointmentDialog
        open={nextOpen}
        onOpenChange={setNextOpen}
        hideTrigger
        defaultDate={nextDefaultDate}
        defaultTime={nextDefaultTime}
        defaultCustomerId={appointment.customer_id ?? undefined}
        defaultName={appointment.customers?.name ?? ""}
        defaultPhone={custPhone}
        defaultMedicalRecordNumber={custMrn || undefined}
        defaultCourseId={appointment.course_id ?? undefined}
        defaultStaffId={appointment.staff_id ?? undefined}
        defaultVisitType="return"
        onSuccess={onSuccess}
      />

      {/* 予約確定後のLINE送信確認ポップ */}
      <Dialog open={lineConfirmOpen} onOpenChange={(o) => { if (!o) handleSkipLine(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" />
              予約確定のLINEを送りますか？
            </DialogTitle>
            <DialogDescription>
              {appointment.customers?.name}
              <span className="text-slate-400">様</span>
              に、予約が確定したことをLINEでお知らせできます。
              <br />
              <span className="text-xs text-slate-400">
                ※LINE未連携の方には送信できません（その場合はメッセージが表示されます）。
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleSkipLine}
              disabled={lineSending}
              className="flex-1"
            >
              送らない
            </Button>
            <Button
              type="button"
              onClick={handleConfirmSendLine}
              disabled={lineSending}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              <MessageCircle className="w-4 h-4 mr-1" />
              {lineSending ? "送信中..." : "LINEを送る"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 連続予約の削除選択ダイアログ */}
      <Dialog open={deleteChoiceOpen} onOpenChange={setDeleteChoiceOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarRange className="w-5 h-5 text-amber-500" />
              連続予約の削除
            </DialogTitle>
            <DialogDescription>
              この予約は連続予約（毎週繰り返し）として登録されています。
              削除する範囲を選んでください。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <button
              type="button"
              onClick={() => runDelete("one")}
              disabled={isSubmitting}
              className="w-full text-left rounded-xl border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 px-4 py-3 transition-all disabled:opacity-50"
            >
              <p className="font-bold text-sm text-slate-800 dark:text-slate-100">この予約だけ削除</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {date ? format(date, "M月d日（E）", { locale: ja }) : ""} {time} の 1 件のみを削除します。
              </p>
            </button>
            <button
              type="button"
              onClick={() => runDelete("future")}
              disabled={isSubmitting}
              className="w-full text-left rounded-xl border-2 border-rose-200 hover:border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-4 py-3 transition-all disabled:opacity-50"
            >
              <p className="font-bold text-sm text-rose-700 dark:text-rose-300">
                この日以降の連続予約をすべて削除（{seriesFutureCount}件）
              </p>
              <p className="text-xs text-rose-500 dark:text-rose-400 mt-0.5">
                同じシリーズの「この日およびそれ以降」の予約をまとめて削除します。元に戻せません。
              </p>
            </button>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteChoiceOpen(false)}
              disabled={isSubmitting}
            >
              キャンセル
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* キャンセル待ち：空きが出た方へのお知らせ */}
      <Dialog open={waitlistOpen} onOpenChange={(o) => { if (!o) closeWaitlist(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-500" />
              この方に予約できるようになりました
            </DialogTitle>
            <DialogDescription>
              キャンセルで枠が空きました。キャンセル待ちの方へ、LINEで空きをお知らせしましょう（先着順でのご案内です）。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-72 overflow-y-auto">
            {waitlistCandidates.map((c) => {
              const notified = notifiedIds.includes(c.appointmentId);
              return (
                <div
                  key={c.appointmentId}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                      {c.customerName}
                      {c.isFirstVisit && <span className="ml-1.5 text-[10px] text-amber-600">初診</span>}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      希望 {format(parseISO(c.startTime), "M/d HH:mm", { locale: ja })}
                      {!c.hasLine && "・LINE未登録"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!c.hasLine || notifyingId === c.appointmentId || notified}
                    onClick={() => handleNotifyWaitlist(c.appointmentId)}
                    className="bg-green-600 hover:bg-green-700 text-white shrink-0 disabled:opacity-50"
                  >
                    <MessageCircle className="w-4 h-4 mr-1" />
                    {notified ? "送信済み" : notifyingId === c.appointmentId ? "送信中..." : "LINEで知らせる"}
                  </Button>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeWaitlist}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
