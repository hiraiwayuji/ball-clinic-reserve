"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarIcon, Trash2, MessageCircle, CheckCircle, X, Clock, CalendarRange } from "lucide-react";
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
} from "@/app/actions/adminReserve";
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

  useEffect(() => {
    if (open && appointment) {
      const startDateTime = parseISO(appointment.start_time);
      setDate(startDateTime);
      setTime(format(startDateTime, "HH:mm"));

      // 前回来院日・来院回数を取得
      if (appointment.customer_id) {
        const supabase = createClient();
        supabase
          .from("appointments")
          .select("start_time")
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
          .eq("customer_id", appointment.customer_id)
          .neq("status", "cancelled")
          .neq("id", appointment.id)
          .lt("start_time", appointment.start_time)
          .then(({ count }) => {
            setVisitCount(count ?? 0);
          });
      } else {
        setLastVisitDate(null);
        setVisitCount(null);
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
    }
  }, [open, appointment]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date || !time || !appointment) {
      toast.error("日付と時間を選択してください");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await updateAppointmentDetails(
        appointment.id,
        format(date, "yyyy-MM-dd"),
        time,
        memo,
        visitType === "new",
        Number(duration)
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

  // 削除ボタン押下: 連続予約（series_id あり）なら選択ダイアログを開く。
  // 単発予約は従来通り confirm のみ。
  const handleDeleteClick = async () => {
    if (!appointment) return;
    if (appointment.series_id) {
      // 同一シリーズ内のこの予約を含む将来の件数を数える（モーダルに件数表示）
      try {
        const supabase = createClient();
        const { count } = await supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("series_id", appointment.series_id)
          .neq("status", "cancelled")
          .gte("start_time", appointment.start_time);
        setSeriesFutureCount(count ?? 1);
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

  const handleSendLine = async () => {
    if (!appointment) return;
    setIsSubmitting(true);
    try {
      const result = await sendLineConfirmation(appointment.id);
      if (result.success) {
        toast.success("LINEを送信しました");
      } else {
        toast.error(result.error || "LINE送信に失敗しました");
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
                  <option value="30">30分</option>
                  <option value="60">60分</option>
                  <option value="90">90分</option>
                  <option value="120">120分</option>
                  <option value="150">150分</option>
                  <option value="180">180分</option>
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
    </Dialog>
  );
}
