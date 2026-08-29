"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { Eye, EyeOff, RotateCcw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { restoreCancelledAppointment, deleteAppointment, setCancelledGhostHidden } from "@/app/actions/adminReserve";
import { getMyRole } from "@/app/actions/auth";
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
  // 担当かぶりで戻せなかったときのお知らせ。消えるトーストだと読み飛ばされる
  // （2026-08-22 ぼーるくん「注意メッセージを出しても読まない人がいる」）。
  const [overlapError, setOverlapError] = useState<string | null>(null);
  // 院長なら通せるかぶりか（DBの除外制約で弾かれる担当は院長でも通せないのでボタンを出さない）
  const [overlapNeedsOwner, setOverlapNeedsOwner] = useState(false);
  // かぶりを承知で通せるのはオーナー（院長先生）だけ
  const [userRole, setUserRole] = useState<string | null>(null);
  const isOwner = userRole === "owner";
  useEffect(() => { getMyRole().then((r) => setUserRole(r)).catch(() => {}); }, []);

  if (!appointment) return null;

  const cust = Array.isArray(appointment.customers) ? appointment.customers[0] : appointment.customers;
  const name = appointment.customer_name ?? cust?.name ?? "(お名前未登録)";
  const start = parseISO(appointment.start_time);
  const kindLabel = cancelKindLabel(appointment.cancel_kind, appointment.no_show);
  // 隠せるのは仕分け済み（承諾済み／院都合）だけ。無断キャンセルは見えるまま残す。
  const canHide = appointment.cancel_kind === "approved" || appointment.cancel_kind === "clinic_reason";
  const isHidden = !!appointment.cancel_hidden;

  const handleSetHidden = async (hidden: boolean) => {
    setBusy(true);
    try {
      const res = await setCancelledGhostHidden(appointment.id, hidden);
      if (res.success) {
        toast.success(hidden
          ? "カレンダーから隠しました（記録は残っています）"
          : "カレンダーに再表示しました");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(res.error || "更新に失敗しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (allowOverlap: boolean = false) => {
    setBusy(true);
    try {
      const res = await restoreCancelledAppointment(appointment.id, allowOverlap);
      if (res.success) {
        toast.success(`${name}様の予約を元に戻しました`);
        onOpenChange(false);
        onSuccess?.();
      } else if ("overlap" in res && res.overlap) {
        setOverlapNeedsOwner("needsOwner" in res && !!res.needsOwner);
        setOverlapError(res.error || "同じ担当の重複予約はできません。");
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
    <>
    {overlapError && (
      <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
        {/* 院長先生が通せる場面で「元に戻せません」と言い切ると、下の承認ボタンと
            真逆のことを言うことになる。新規追加・予約編集・予約の移動と同じ形にそろえる
            （2026-08-29。承認ルートを持つ画面は grep -rn "needsOwner" src/ で4つ） */}
        <div
          className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border-2 max-w-sm w-full p-5 space-y-3 ${
            isOwner && overlapNeedsOwner
              ? "border-amber-300 dark:border-amber-700"
              : "border-rose-300"
          }`}
        >
          <p
            className={`text-base font-bold ${
              isOwner && overlapNeedsOwner
                ? "text-amber-700 dark:text-amber-300"
                : "text-rose-700 dark:text-rose-300"
            }`}
          >
            {isOwner && overlapNeedsOwner
              ? "⚠ その時間には、すでに予約が入っています"
              : "⚠ 元に戻せません"}
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">{overlapError}</p>
          {isOwner && overlapNeedsOwner ? (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              <span className="font-bold">重ねて診る予定なら</span>、下の
              <span className="font-bold">「重なりを承知で元に戻す（院長）」</span>
              でそのまま戻せます。予約のメモに院長承認の印が残ります。<br />
              重ねない予定なら、別の時間で取り直してください。
            </div>
          ) : (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 px-3 py-2 text-xs text-rose-800 dark:text-rose-200 leading-relaxed">
              同じ先生の同じ時間に2件の予約は入れられません。<br />
              別の時間で新しく予約を取り直してください。
              {!isOwner && (
                <>
                  <br />
                  どうしても重ねる必要があるときは、<span className="font-bold">院長先生の許可</span>が必要です。
                </>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setOverlapError(null)}
            className="w-full h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold"
          >
            閉じる
          </button>
          {isOwner && overlapNeedsOwner && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => { setOverlapError(null); setOverlapNeedsOwner(false); await handleRestore(true); }}
              className="w-full h-10 rounded-xl border border-amber-300 text-amber-800 dark:text-amber-200 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-sm font-bold"
            >
              重なりを承知で元に戻す（院長）
            </button>
          )}
        </div>
      </div>
    )}
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
            onClick={() => handleRestore(false)}
            disabled={busy}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold"
          >
            <RotateCcw className="w-4 h-4 mr-1.5" />
            予約を元に戻す（復活）
          </Button>
          {isHidden ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSetHidden(false)}
              disabled={busy}
              className="w-full h-10 border-slate-300 text-slate-600 hover:bg-slate-50 rounded-xl text-sm"
            >
              <Eye className="w-4 h-4 mr-1.5" />
              カレンダーに再表示する
            </Button>
          ) : canHide ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSetHidden(true)}
              disabled={busy}
              className="w-full h-10 border-slate-300 text-slate-600 hover:bg-slate-50 rounded-xl text-sm"
            >
              <EyeOff className="w-4 h-4 mr-1.5" />
              カレンダーから隠す（削除はしない）
            </Button>
          ) : (
            <p className="text-[11px] text-slate-400 text-center">
              無断キャンセル・未仕分けのキャンセルは隠せません（見えるまま残します）
            </p>
          )}
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
    </>
  );
}
