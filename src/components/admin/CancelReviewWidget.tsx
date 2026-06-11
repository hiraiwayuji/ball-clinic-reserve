"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MoonStar, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  getUnclassifiedCancellations,
  classifyCancellation,
  classifyRemainingAsApproved,
  type UnclassifiedCancellation,
} from "@/app/actions/adminReserve";

function fmtJst(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short" });
  const time = d.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${time}`;
}

/**
 * 毎日のしめ作業：キャンセルの仕分けウィジェット。
 * 未仕分けのキャンセル（status=cancelled, cancel_kind なし）を
 * 「無断・未確認 / 連絡あり・承諾済み / セット解除（ノーカウント）」に分ける。
 * 無断は院の運用設定により、規定回数で期限付きオンライン予約停止になる。
 */
export default function CancelReviewWidget() {
  const [items, setItems] = useState<UnclassifiedCancellation[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setItems(await getUnclassifiedCancellations());
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleClassify = async (item: UnclassifiedCancellation, kind: "unexcused" | "approved" | "set_removed") => {
    if (busyId) return;
    setBusyId(item.id);
    try {
      const res = await classifyCancellation(item.id, kind);
      if (!res.success) {
        toast.error(res.error ?? "仕分けに失敗しました");
        return;
      }
      const label = kind === "unexcused" ? "無断・未確認" : kind === "approved" ? "承諾済み" : "セット解除（ノーカウント）";
      toast.success(`${item.customer_name ?? "予約"} を「${label}」にしました`);
      if (res.blockedUntil) {
        const until = new Date(res.blockedUntil).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
        toast.warning(
          `${res.customerName ?? "この患者さん"}は無断キャンセルが規定回数に達したため、${until} までオンライン予約を停止しました（顧客管理から解除できます）`,
          { duration: 10000 },
        );
      }
      setItems((prev) => (prev ?? []).filter((x) => x.id !== item.id));
    } finally {
      setBusyId(null);
    }
  };

  // 未仕分けゼロのときは小さく「完了」表示だけ（場所を取らない）
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
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          無断（未確認）だけが「未来院」として赤くカウントされます。
          連絡があって院が承諾したキャンセルや、施術＋水素などのセット解除はカウントされません。
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* 過去分が大量に並ぶ初回向け：未来院マークなしをまとめて承諾済みに */}
        {items !== null && items.filter((x) => !x.no_show).length >= 3 && (
          <button
            type="button"
            disabled={busyId !== null}
            onClick={async () => {
              setBusyId("__bulk__");
              try {
                const res = await classifyRemainingAsApproved();
                if (res.success) {
                  toast.success(`${res.count}件を「連絡あり・承諾済み」にまとめて仕分けました`);
                  await reload();
                } else {
                  toast.error(res.error ?? "一括仕分けに失敗しました");
                }
              } finally {
                setBusyId(null);
              }
            }}
            className="w-full text-[11px] font-bold text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg py-2 hover:bg-blue-100 dark:hover:bg-blue-900 transition disabled:opacity-50"
          >
            未来院マークの無いもの（{items.filter((x) => !x.no_show).length}件）をまとめて「承諾済み」にする
          </button>
        )}
        {items === null ? (
          <div className="flex items-center justify-center py-6 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />読み込み中...
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-xl p-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                  {item.customer_name ?? "(顧客名なし)"}
                  {item.no_show && (
                    <span className="ml-2 text-[10px] font-bold text-rose-500">未来院マーク済み</span>
                  )}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {fmtJst(item.start_time)}
                  {item.course_name ? `・${item.course_name}` : ""}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => handleClassify(item, "unexcused")}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900 transition disabled:opacity-50"
                >
                  無断・未確認
                </button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => handleClassify(item, "approved")}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900 transition disabled:opacity-50"
                >
                  連絡あり・承諾済み
                </button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => handleClassify(item, "set_removed")}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition disabled:opacity-50"
                  title="施術＋水素のセット解除など。キャンセル回数にも未来院にも数えません"
                >
                  セット解除
                </button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
