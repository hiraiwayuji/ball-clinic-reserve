"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MoonStar, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  getUnclassifiedCancellations,
  classifyByIds,
  type UnclassifiedCancellation,
} from "@/app/actions/adminReserve";

function fmtJst(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short" });
  const time = d.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${time}`;
}

export default function CancelReviewWidget() {
  const [items, setItems] = useState<UnclassifiedCancellation[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await getUnclassifiedCancellations();
      setItems(data);
      // デフォルトで全選択
      setSelected(new Set(data.map((x) => x.id)));
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const allSelected = items !== null && items.length > 0 && selected.size === items.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set((items ?? []).map((x) => x.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulk = async (kind: "approved" | "unexcused" | "set_removed" | "clinic_reason") => {
    if (busy || selected.size === 0) return;
    setBusy(true);
    try {
      const ids = [...selected];
      const res = await classifyByIds(ids, kind);
      if (!res.success) {
        toast.error(res.error ?? "仕分けに失敗しました");
        return;
      }
      const label =
        kind === "approved"
          ? "承諾済み"
          : kind === "unexcused"
            ? "無断・未確認"
            : kind === "clinic_reason"
              ? "院都合（カウントしない）"
              : "セット解除";
      toast.success(`${res.count}件を「${label}」にしました`);
      if (res.blockedPatients?.length) {
        for (const p of res.blockedPatients) {
          const until = new Date(p.until).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
          toast.warning(`${p.name}は無断キャンセルが規定回数に達したため、${until}までオンライン予約を停止しました`, { duration: 10000 });
        }
      }
      await reload();
    } finally {
      setBusy(false);
    }
  };

  if (items !== null && items.length === 0) {
    return (
      <Card className="shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
        <CardContent className="py-3 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          キャンセルの仕分けはすべて完了しています
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm border-amber-200 dark:border-amber-900/50 dark:bg-slate-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MoonStar className="w-4 h-4 text-amber-500" />
          今日のしめ作業：キャンセルの仕分け
          {items && (
            <span className="text-[11px] font-black bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
              残り {items.length} 件
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items === null ? (
          <div className="flex items-center justify-center py-6 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />読み込み中...
          </div>
        ) : (
          <>
            {/* 全選択チェックボックス */}
            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="w-4 h-4 accent-blue-500 cursor-pointer"
              />
              すべて選択（{selected.size}/{items.length}件）
            </label>

            {/* 一覧 */}
            <div className="space-y-1.5">
              {items.map((item) => (
                <label
                  key={item.id}
                  className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 cursor-pointer transition ${
                    selected.has(item.id)
                      ? "border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-950/40"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleOne(item.id)}
                    className="w-4 h-4 accent-blue-500 shrink-0 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                      {item.customer_name ?? "(顧客名なし)"}
                      {item.no_show && (
                        <span className="ml-2 text-[10px] font-bold text-rose-500">未来院マーク済み</span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {fmtJst(item.start_time)}{item.course_name ? `・${item.course_name}` : ""}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {/* アクションボタン */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                disabled={busy || selected.size === 0}
                onClick={() => handleBulk("approved")}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-blue-500 hover:bg-blue-600 text-white transition disabled:opacity-40"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `選択した${selected.size}件を承諾済みにする`}
              </button>
              <button
                type="button"
                disabled={busy || selected.size === 0}
                onClick={() => handleBulk("clinic_reason")}
                title="院側の都合でやむなくキャンセルしたもの。本人キャンセルではないのでキャンセル回数に数えません"
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-40"
              >
                院都合
              </button>
              <button
                type="button"
                disabled={busy || selected.size === 0}
                onClick={() => handleBulk("set_removed")}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-40"
              >
                セット解除
              </button>
              <button
                type="button"
                disabled={busy || selected.size === 0}
                onClick={() => handleBulk("unexcused")}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950 text-rose-500 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900 transition disabled:opacity-40"
              >
                無断キャンセル
              </button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
