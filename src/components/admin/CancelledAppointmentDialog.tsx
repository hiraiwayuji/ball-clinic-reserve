"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { RotateCcw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { restoreCancelledAppointment, deleteAppointment } from "@/app/actions/adminReserve";
import { toast } from "sonner";

/** キャンセル仕分けの表示ラベル */
export function cancelKindLabel(cancelKind: string | null | undefined, noShow?: boolean | null): string {
  if (cancelKind === "unexcused" || noShow) return "無断キャンセル";
  if (cancelKind === "clinic_reason") return "院都合キャンセル";
  return "キャンセル";
}

interface CancelledAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** appointments 行（customers ネスト or customer_name を含む） */
  appointment: any;
  onSuccess?: () => void;
}

/**
 * カレンダー上の薄い「キャンセル済み」表示をタップしたときのダイアログ。
 * ・予約を元に戻す（復活）
 * ・記録ごと完全に削除
 */
export function CancelledAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  onSuccess,
}: CancelledAppointmentDialogProps) {
  const [busy, setBusy] = useState(false);

  if (!appointment) return null;

  const cust = Array.isArray(appointment.customers) ? appointment.customers[0] : appointment.customers;
  const name = appointment.customer_name ?? cust?.name ?? "(お名前未登録)";
  const start = parseISO(appointment.start_time);
  const kindLabel = cancelKindLabel(appointment.cancel_kind, appointment.no_show);

  const handleRestore = async () => {
    setBusy(true);
    try {
      const res = await restoreCancelledAppointment(appointment.id);
      if (res.success) {
        toast.success(`${name}様の予約を元に戻しました`);
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(res.error || "元に戻せませんでした");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setBusy(false);
    }
  };

  const handleHardDelete = async () => {
    if (!confirm(`${name}様のキャンセル記録を完全に削除しますか？\n（カレンダーの薄い表示も消えます。元に戻せません）`)) return;
    setBusy(true);
    try {
      const res = await deleteAppointment(appointment.id, "one");
      if (res.success) {
        toast.success("キャンセル記録を削除しました");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(res.error || "削除に失敗しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-slate-400" />
            キャンセル済みの予約
          </DialogTitle>
          <DialogDescription>
            この枠は予約サイトでは「空き」として扱われています。
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm space-y-1">
          <p>
            <span className="font-bold text-slate-700 dark:text-slate-200">{name}</span>
            <span className="text-slate-400">様</span>
          </p>
          <p className="text-slate-600 dark:text-slate-300">
            {format(start, "M月d日（E）HH:mm", { locale: ja })}
            {appointment.course_name ? ` / ${appointment.course_name}` : ""}
          </p>
          <p>
            <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
              {kindLabel}
            </span>
          </p>
        </div>
        <div className="space-y-2 pt-1">
          <Button
            type="button"
            onClick={handleRestore}
            disabled={busy}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold"
          >
            <RotateCcw className="w-4 h-4 mr-1.5" />
            予約を元に戻す（復活）
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleHardDelete}
            disabled={busy}
            className="w-full h-10 border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-sm"
          >
            <Trash2 className="w-4 h-4 mr-1.5" />
            この記録を完全に削除
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy} className="w-full">
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
