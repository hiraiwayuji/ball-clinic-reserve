"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import {
  getCustomerCancellations,
  setCancellationClinicReason,
  type CustomerCancellation,
} from "@/app/actions/adminReserve";

function kindLabel(kind: string | null, noShow: boolean): { text: string; counted: boolean } {
  switch (kind) {
    case "clinic_reason":
      return { text: "院都合（数えません）", counted: false };
    case "set_removed":
      return { text: "セット解除（数えません）", counted: false };
    case "unexcused":
      return { text: "無断キャンセル", counted: true };
    case "approved":
      return { text: "承諾済み", counted: true };
    default:
      return { text: noShow ? "未来院（未仕分け）" : "キャンセル（未仕分け）", counted: true };
  }
}

export function CancelHistoryDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  onAfterChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  customerName: string;
  onAfterChange?: () => void;
}) {
  const [items, setItems] = useState<CustomerCancellation[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setItems(null);
    getCustomerCancellations(customerId).then(setItems).catch(() => setItems([]));
  }, [open, customerId]);

  const toggle = (item: CustomerCancellation, on: boolean) => {
    setBusyId(item.id);
    startTransition(async () => {
      const res = await setCancellationClinicReason(item.id, on);
      if (res.success) {
        setItems((prev) =>
          (prev ?? []).map((x) =>
            x.id === item.id ? { ...x, cancel_kind: on ? "clinic_reason" : null, no_show: false } : x,
          ),
        );
        toast.success(on ? "院都合にしました（キャンセル回数から外しました）" : "院都合を取り消しました");
        onAfterChange?.();
      } else {
        toast.error(res.error ?? "変更に失敗しました");
      }
      setBusyId(null);
    });
  };

  const countedNum = (items ?? []).filter((i) => kindLabel(i.cancel_kind, i.no_show).counted).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customerName}様のキャンセル履歴</DialogTitle>
          <DialogDescription>
            こちらの都合（水素を当日できなかった等）でキャンセル扱いにしたものは「院都合にする」を押すと、
            キャンセル回数・未来院から外れます。本人のキャンセルではないものを整理できます。
          </DialogDescription>
        </DialogHeader>

        {items === null ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />読み込み中...
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-slate-500">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            キャンセルの記録はありません
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              カウント対象 <strong className="text-slate-700 dark:text-slate-200">{countedNum}件</strong>
              （全{items.length}件中）
            </p>
            <div className="space-y-1.5">
              {items.map((item) => {
                const k = kindLabel(item.cancel_kind, item.no_show);
                const isClinic = item.cancel_kind === "clinic_reason";
                const rowBusy = busyId === item.id && isPending;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 ${
                      isClinic
                        ? "border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        {format(new Date(item.start_time), "yyyy/MM/dd (E) HH:mm", { locale: ja })}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {item.course_name ?? "（メニューなし）"}
                        <span
                          className={`ml-2 font-bold ${
                            k.counted ? "text-rose-500" : "text-slate-400"
                          }`}
                        >
                          {k.text}
                        </span>
                      </p>
                    </div>
                    {isClinic ? (
                      <button
                        type="button"
                        disabled={rowBusy}
                        onClick={() => toggle(item, false)}
                        className="shrink-0 h-9 px-3 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-700 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40"
                      >
                        {rowBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "取り消す"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={rowBusy}
                        onClick={() => toggle(item, true)}
                        className="shrink-0 h-9 px-3 rounded-lg text-xs font-bold bg-slate-600 hover:bg-slate-700 text-white transition disabled:opacity-40"
                      >
                        {rowBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "院都合にする"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
