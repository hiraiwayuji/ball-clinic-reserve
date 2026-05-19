"use client";

import { useState, useEffect, useTransition, Suspense } from "react";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { useSearchParams } from "next/navigation";
import {
  getTodayPendingSales,
  bulkAddCashSales,
  type PendingSalePatient,
  type CashSalePaymentType,
} from "@/app/actions/sales";
import { usePaymentCategories } from "@/lib/use-payment-categories";
import type { PaymentCategoryRow } from "@/app/actions/payment-categories";
import { toast } from "sonner";
import Link from "next/link";
import {
  Bot, CheckSquare, Square, Loader2, Zap, AlertTriangle,
  ChevronLeft, Save, RefreshCw, User, Clock, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DraftRow = PendingSalePatient & {
  checked: boolean;
  editAmount: string;
  editMemo: string;
  paymentType: CashSalePaymentType | "";
};

const CONFIDENCE_ORDER = { certain: 0, likely: 1, unknown: 2 } as const;

function BulkSalesPageInner() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");
  const targetDateStr = dateParam ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const targetDate = new Date(targetDateStr + "T00:00:00+09:00");

  const { categories: paymentCategories } = usePaymentCategories();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const fetchPending = async () => {
    setLoading(true);
    const res = await getTodayPendingSales(targetDateStr);
    if (res.success) {
      setRows(
        [...res.data]
          .sort((a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence])
          .map((p) => ({
            ...p,
            checked: p.confidence === "certain" || p.confidence === "likely",
            editAmount: p.prediction ? String(p.prediction.predictedAmount) : "",
            editMemo: p.prediction?.predictedMemo ?? "",
            paymentType: "" as CashSalePaymentType | "",
          }))
      );
    } else {
      toast.error(res.error ?? "取得に失敗しました");
    }
    setLoading(false);
  };

  useEffect(() => { fetchPending(); }, [targetDateStr]);

  const toggleAll = () => {
    const allChecked = rows.filter(r => r.editAmount !== "").every(r => r.checked);
    setRows(prev => prev.map(r => r.editAmount !== "" ? { ...r, checked: !allChecked } : r));
  };

  const markAllAsChecked = () => {
    setRows(prev => prev.map(r => r.editAmount !== "" ? { ...r, checked: true } : r));
  };

  const clearAllChecks = () => {
    setRows(prev => prev.map(r => ({ ...r, checked: false })));
  };

  const excludeUnknownPatients = () => {
    setRows(prev => prev.map(r => (
      r.confidence === "unknown" ? { ...r, checked: false } : r
    )));
  };

  const handleSave = () => {
    const targets = rows.filter(r => r.checked && r.editAmount !== "");
    if (targets.length === 0) {
      toast.error("保存する項目がありません");
      return;
    }
    // 0 円計上の行は支払区分を必須にする（自賠責・はぐくみ医療等）
    const zeroWithoutPaymentType = targets.filter(r => parseInt(r.editAmount, 10) === 0 && !r.paymentType);
    if (zeroWithoutPaymentType.length > 0) {
      toast.error(`${zeroWithoutPaymentType.map(r => r.customerName).join("・")}様：0円の場合は支払区分を選択してください`);
      return;
    }
    startTransition(async () => {
      const res = await bulkAddCashSales(
        targets.map(r => ({
          customer_name: r.customerName,
          treatment_fee: parseInt(r.editAmount, 10),
          memo: r.editMemo,
          is_first_visit: r.isFirstVisit,
          sale_date: targetDateStr,
          payment_type: r.paymentType || null,
        }))
      );
      if (res.success) {
        toast.success(`${targets.length}件を一括保存しました！`);
        fetchPending();
      } else {
        toast.error(res.error ?? "保存に失敗しました");
      }
    });
  };

  const checkedCount = rows.filter(r => r.checked && r.editAmount !== "").length;
  const totalAmount = rows
    .filter(r => r.checked && r.editAmount !== "")
    .reduce((sum, r) => sum + parseInt(r.editAmount || "0", 10), 0);

  const warningRows = rows.filter(r => r.prediction?.warning);
  const certainCount = rows.filter(r => r.confidence === "certain").length;
  const likelyCount = rows.filter(r => r.confidence === "likely").length;
  const unknownCount = rows.filter(r => r.confidence === "unknown").length;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/admin/sales"
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              売上登録へ戻る
            </Link>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            一括売上入力
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {format(targetDate, "M月d日（E）", { locale: ja })} — 会計完了・売上未入力の患者一覧
            {dateParam && dateParam !== new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }) && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium ml-2">（過去日）</span>
            )}
          </p>
          <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
            {certainCount > 0 && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                来院確実 {certainCount}名
              </span>
            )}
            {likelyCount > 0 && (
              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                来院済み {likelyCount}名
              </span>
            )}
            {unknownCount > 0 && (
              <span className="flex items-center gap-1 text-slate-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                要確認 {unknownCount}名
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={fetchPending}
          disabled={loading}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className={["w-4 h-4", loading ? "animate-spin" : ""].join(" ")} />
        </button>
      </div>

      {/* AI警告サマリー */}
      {warningRows.length > 0 && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">AIが気になる点を発見しました</p>
              {warningRows.map(r => (
                <p key={r.appointmentId} className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
                  • {r.customerName}様：{r.prediction?.warning}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 一覧テーブル */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          読み込み中...
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/10">
          <CheckSquare className="w-10 h-10 mx-auto mb-3 text-emerald-400 opacity-60" />
          <p className="font-bold text-slate-500">未入力の売上はありません</p>
          <p className="text-sm text-slate-400 mt-1">この日の全予約に売上が入力済みです</p>
          <Link href="/admin/sales" className="mt-4 inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 font-medium">
            売上一覧へ
          </Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/40">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={markAllAsChecked}
                className="font-bold"
              >
                全員を会計対象
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={excludeUnknownPatients}
                className="font-bold text-slate-600"
              >
                要確認だけ外す
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearAllChecks}
                className="font-bold text-slate-500"
              >
                全員外す
              </Button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              まず「全員を会計対象」を押して、来院されなかった方だけチェックを外す運用ができます。
            </p>
          </div>

          {/* テーブルヘッダー */}
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-white/10">
            <button type="button" onClick={toggleAll} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
              {rows.filter(r => r.editAmount !== "").every(r => r.checked)
                ? <CheckSquare className="w-5 h-5 text-indigo-600" />
                : <Square className="w-5 h-5" />}
            </button>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex-1">患者名</span>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide w-28 text-right">金額（税込）</span>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide w-32">備考</span>
          </div>

          {/* 各行 */}
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {rows.map((row) => (
              <DraftRowItem
                key={row.appointmentId}
                row={row}
                paymentCategories={paymentCategories}
                onChange={(updated) =>
                  setRows(prev => prev.map(r => r.appointmentId === row.appointmentId ? updated : r))
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* 下部フッター：合計＋保存ボタン */}
      {rows.length > 0 && (
        <div className="sticky bottom-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-xl p-4 flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {checkedCount}件を選択中
            </p>
            <p className="text-2xl font-black text-blue-600 dark:text-blue-400">
              ¥{totalAmount.toLocaleString()}
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={isPending || checkedCount === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 h-11 rounded-xl shadow-lg disabled:opacity-50"
          >
            {isPending
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Save className="w-4 h-4 mr-2" />}
            {checkedCount}件を一括保存
          </Button>
        </div>
      )}
    </div>
  );
}

export default function BulkSalesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
      <BulkSalesPageInner />
    </Suspense>
  );
}

// ── 各行コンポーネント ────────────────────────────────────────────────

function DraftRowItem({
  row,
  onChange,
  paymentCategories,
}: {
  row: DraftRow;
  onChange: (updated: DraftRow) => void;
  paymentCategories: PaymentCategoryRow[];
}) {
  const hasAmount = row.editAmount !== "";
  const isZero = hasAmount && parseInt(row.editAmount, 10) === 0;
  const time = format(parseISO(row.checkinTime), "HH:mm");

  return (
    <div className={[
      "px-4 py-3 transition-colors",
      row.checked ? "bg-indigo-50/60 dark:bg-indigo-950/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/30",
    ].join(" ")}>
      <div className="flex items-center gap-3 flex-wrap">
        {/* チェックボックス */}
        <button
          type="button"
          disabled={!hasAmount}
          onClick={() => onChange({ ...row, checked: !row.checked })}
          className="shrink-0 disabled:opacity-30"
        >
          {row.checked
            ? <CheckSquare className="w-5 h-5 text-indigo-600" />
            : <Square className="w-5 h-5 text-slate-300" />}
        </button>

        {/* 患者名・時間 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-bold text-slate-900 dark:text-slate-100 truncate">{row.customerName}</span>
            {row.confidence === "certain" && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                来院確実
              </span>
            )}
            {row.confidence === "likely" && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                来院済み
              </span>
            )}
            {row.confidence === "unknown" && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                要確認
              </span>
            )}
            {row.isFirstVisit && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-rose-500 text-white">初診</span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-400">
            <Clock className="w-3 h-3" />
            {time}
            {row.prediction && (
              <>
                <Bot className="w-3 h-3 ml-2 text-violet-500" />
                <span className="text-violet-500 font-medium">AI予測 確度{row.prediction.confidence}%</span>
              </>
            )}
            {!row.prediction && (
              <>
                <Info className="w-3 h-3 ml-2 text-slate-300" />
                <span className="text-slate-400">履歴なし・手入力</span>
              </>
            )}
          </div>
          {row.prediction?.warning && (
            <div className="flex items-center gap-1 mt-1">
              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
              <p className="text-[11px] text-amber-600 dark:text-amber-400">{row.prediction.warning}</p>
            </div>
          )}
        </div>

        {/* 金額入力 */}
        <div className="w-28 shrink-0">
          <Input
            type="number"
            min={0}
            placeholder="金額"
            value={row.editAmount}
            onChange={(e) => onChange({ ...row, editAmount: e.target.value, checked: e.target.value !== "" })}
            className="text-right font-bold h-9 text-sm"
          />
        </div>

        {/* 備考入力 */}
        <div className="w-32 shrink-0">
          <Input
            type="text"
            placeholder="備考"
            value={row.editMemo}
            onChange={(e) => onChange({ ...row, editMemo: e.target.value })}
            className="h-9 text-sm"
          />
        </div>
      </div>

      {/* 0円のときだけ支払区分選択を表示（payment_categories マスタから動的取得） */}
      {isZero && (
        <div className="mt-2 ml-8 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">0円の支払区分:</span>
          {paymentCategories.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange({ ...row, paymentType: opt.key })}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-all ${
                row.paymentType === opt.key
                  ? "bg-emerald-500 border-emerald-600 text-white"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
          {!row.paymentType && (
            <span className="text-[10px] text-rose-500 font-medium">※ 必須</span>
          )}
        </div>
      )}
    </div>
  );
}
