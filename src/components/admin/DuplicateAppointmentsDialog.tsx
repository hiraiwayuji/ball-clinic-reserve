"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  deleteAppointment,
  type DuplicateAppointmentGroup,
  type DuplicateAppointmentItem,
} from "@/app/actions/adminReserve";

type Kind = "id" | "name";

interface DuplicateAppointmentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idDuplicates: DuplicateAppointmentGroup[];
  nameDuplicates: DuplicateAppointmentGroup[];
  onDeleted: () => void;
}

// 各グループに対して「残す予約 ID」を保持。デフォルトは created_at 最新（フォールバックで最初の id）
function pickDefaultKeep(items: DuplicateAppointmentItem[]): string {
  const sorted = [...items].sort((a, b) => {
    const ax = a.created_at ?? "";
    const bx = b.created_at ?? "";
    return bx.localeCompare(ax);
  });
  return sorted[0]?.id ?? items[0].id;
}

function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.slice(-4).toUpperCase();
}

function formatJp(start: string): string {
  try {
    return format(parseISO(start), "yyyy/MM/dd (E) HH:mm", { locale: ja });
  } catch {
    return start;
  }
}

function formatCreated(ts: string | null): string {
  if (!ts) return "—";
  try {
    return format(parseISO(ts), "MM/dd HH:mm", { locale: ja });
  } catch {
    return ts;
  }
}

function statusBadge(status: string | null) {
  const s = status ?? "—";
  const variant: "default" | "secondary" | "outline" =
    s === "confirmed" ? "default" : s === "waiting" ? "secondary" : "outline";
  return (
    <Badge variant={variant} className="text-[10px]">
      {s}
    </Badge>
  );
}

export function DuplicateAppointmentsDialog({
  open,
  onOpenChange,
  idDuplicates,
  nameDuplicates,
  onDeleted,
}: DuplicateAppointmentsDialogProps) {
  const [keepMap, setKeepMap] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // ダイアログを開いた時に「残す」のデフォルト選択をセット
  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const g of idDuplicates) next[`id:${g.key}`] = pickDefaultKeep(g.items);
    for (const g of nameDuplicates) next[`name:${g.key}`] = pickDefaultKeep(g.items);
    setKeepMap(next);
  }, [open, idDuplicates, nameDuplicates]);

  const totalDeletable = useMemo(() => {
    let n = 0;
    for (const g of idDuplicates) {
      const keep = keepMap[`id:${g.key}`];
      n += g.items.filter((i) => i.id !== keep).length;
    }
    for (const g of nameDuplicates) {
      const keep = keepMap[`name:${g.key}`];
      n += g.items.filter((i) => i.id !== keep).length;
    }
    return n;
  }, [keepMap, idDuplicates, nameDuplicates]);

  const setKeep = (kind: Kind, key: string, id: string) => {
    setKeepMap((m) => ({ ...m, [`${kind}:${key}`]: id }));
  };

  const handleDelete = async () => {
    if (totalDeletable === 0) {
      toast.info("削除対象がありません");
      return;
    }
    setSubmitting(true);
    const targetIds: string[] = [];
    for (const g of idDuplicates) {
      const keep = keepMap[`id:${g.key}`];
      for (const it of g.items) if (it.id !== keep) targetIds.push(it.id);
    }
    for (const g of nameDuplicates) {
      const keep = keepMap[`name:${g.key}`];
      for (const it of g.items) if (it.id !== keep) targetIds.push(it.id);
    }

    const results = await Promise.allSettled(
      targetIds.map((id) => deleteAppointment(id, "one")),
    );
    let ok = 0;
    let ng = 0;
    for (const r of results) {
      if (r.status === "fulfilled" && (r.value as any)?.success) ok++;
      else ng++;
    }
    setSubmitting(false);

    if (ng === 0) {
      toast.success(`${ok} 件の重複予約を削除しました`);
    } else if (ok === 0) {
      toast.error(`削除に失敗しました（${ng} 件）`);
    } else {
      toast.warning(`${ok} 件削除、${ng} 件失敗`);
    }
    onDeleted();
    onOpenChange(false);
  };

  const renderGroup = (
    kind: Kind,
    g: DuplicateAppointmentGroup,
    idx: number,
  ) => {
    const stateKey = `${kind}:${g.key}`;
    const keep = keepMap[stateKey];
    const ringClass =
      kind === "id"
        ? "ring-1 ring-red-300 bg-red-50/40"
        : "ring-1 ring-amber-300 bg-amber-50/40";
    return (
      <div key={`${kind}-${idx}`} className={`rounded-lg p-3 ${ringClass}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-medium">
            {formatJp(g.startTime)} ／ {g.customerName ?? "(名前なし)"}
          </div>
          <Badge
            variant="outline"
            className={
              kind === "id"
                ? "border-red-400 text-red-700"
                : "border-amber-400 text-amber-700"
            }
          >
            {kind === "id" ? "確実" : "要確認"}
          </Badge>
        </div>
        <div className="space-y-1.5">
          {g.items.map((it) => {
            const isKeep = it.id === keep;
            return (
              <label
                key={it.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-xs ${
                  isKeep
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name={stateKey}
                  checked={isKeep}
                  onChange={() => setKeep(kind, g.key, it.id)}
                  className="h-4 w-4 accent-emerald-600"
                />
                <span className="font-mono text-[11px] text-gray-500">
                  #{shortId(it.id)}
                </span>
                {statusBadge(it.status)}
                {kind === "name" && (
                  <span className="text-[11px] text-gray-600">
                    cust:{shortId(it.customer_id)} / TEL:{it.customer?.phone ?? "—"}
                  </span>
                )}
                <span className="ml-auto text-[11px] text-gray-500">
                  作成 {formatCreated(it.created_at)}
                </span>
                {it.memo && (
                  <span
                    className="max-w-[40%] truncate text-[11px] text-gray-700"
                    title={it.memo}
                  >
                    📝 {it.memo}
                  </span>
                )}
                <span
                  className={`ml-2 text-[10px] font-semibold ${
                    isKeep ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {isKeep ? "残す" : "削除"}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  const hasAny = idDuplicates.length > 0 || nameDuplicates.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            重複予約の整理
          </DialogTitle>
          <DialogDescription>
            同じ日時・同じ患者の予約を検出しました。
            残す予約を選んで「削除」を押してください。
          </DialogDescription>
        </DialogHeader>

        {!hasAny && (
          <div className="py-8 text-center text-sm text-gray-500">
            重複候補は見つかりませんでした。
          </div>
        )}

        {idDuplicates.length > 0 && (
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-red-700">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
              確実な重複（同一患者の二重登録）
              <span className="text-xs font-normal text-gray-500">
                {idDuplicates.length} 件
              </span>
            </h3>
            <div className="space-y-2">
              {idDuplicates.map((g, i) => renderGroup("id", g, i))}
            </div>
          </section>
        )}

        {nameDuplicates.length > 0 && (
          <section className="mt-4 space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-700">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              要確認（名前一致・別レコード）
              <span className="text-xs font-normal text-gray-500">
                {nameDuplicates.length} 件
              </span>
            </h3>
            <p className="text-[11px] text-gray-500">
              家族で同名の場合があります。電話番号も確認してから判断してください。
            </p>
            <div className="space-y-2">
              {nameDuplicates.map((g, i) => renderGroup("name", g, i))}
            </div>
          </section>
        )}

        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            キャンセル
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={submitting || totalDeletable === 0}
            className="gap-2"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            選択した予約を削除（{totalDeletable} 件）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
