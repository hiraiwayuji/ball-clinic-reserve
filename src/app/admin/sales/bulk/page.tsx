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
import { markAppointmentNoShow } from "@/app/actions/adminReserve";
import { usePaymentCategories } from "@/lib/use-payment-categories";
import { getPaymentCategoryColor } from "@/lib/payment-category-color";
import { evaluateMedicalAid, effectiveWindowBurden, type MedicalAidRules } from "@/lib/medical-aid";
import { getMedicalAidRules } from "@/app/actions/settings";
import { upsertPaymentCategory, type PaymentCategoryRow } from "@/app/actions/payment-categories";
import { toast } from "sonner";
import Link from "next/link";
import {
  Bot, CheckSquare, Square, Loader2, Zap, AlertTriangle,
  ChevronLeft, Save, RefreshCw, User, Clock, Info, ClipboardList,
  Plus, X, SplitSquareHorizontal, UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// 区分ごとの金額明細（複数区分で金額を分ける場合に使う）
type PaymentLine = {
  paymentType: CashSalePaymentType | "";
  amount: string;
};

type DraftRow = PendingSalePatient & {
  checked: boolean;
  editAmount: string;
  editMemo: string;
  // 複数選択対応（保険＋水素=その他 など）。空配列なら未選択。
  paymentTypes: CashSalePaymentType[];
  // 区分ごとに金額を分ける明細。空なら従来どおり editAmount + paymentTypes を使う。
  lines: PaymentLine[];
};

const CONFIDENCE_ORDER = { certain: 0, likely: 1, unknown: 2 } as const;

function BulkSalesPageInner() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");
  const targetDateStr = dateParam ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const targetDate = new Date(targetDateStr + "T00:00:00+09:00");

  const { categories: paymentCategories, reload: reloadCategories } = usePaymentCategories();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [medicalAidRules, setMedicalAidRules] = useState<MedicalAidRules | null>(null);

  // 医療費助成ルールを一度だけ読み込む（各行で 0円/600円 判定に使う）
  useEffect(() => {
    getMedicalAidRules().then((r) => setMedicalAidRules(r.rules)).catch(() => {});
  }, []);

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
            editAmount: p.initialAmount,
            editMemo: p.initialMemo,
            paymentTypes: [] as CashSalePaymentType[],
            lines: [] as PaymentLine[],
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

  // その行が「区分ごと金額分け」モードか（有効な明細が1件以上ある）
  const hasLines = (r: DraftRow) => r.lines.some(l => l.amount !== "");
  // その行の合計金額（明細モードなら明細合計、通常なら editAmount）
  const rowTotal = (r: DraftRow) =>
    hasLines(r)
      ? r.lines.reduce((s, l) => s + (parseInt(l.amount || "0", 10) || 0), 0)
      : (parseInt(r.editAmount || "0", 10) || 0);
  // 保存対象か（通常: 金額入力あり / 明細: 明細が1件以上）
  const isSavable = (r: DraftRow) => hasLines(r) || r.editAmount !== "";

  const handleSave = () => {
    const targets = rows.filter(r => r.checked && isSavable(r));
    if (targets.length === 0) {
      toast.error("保存する項目がありません");
      return;
    }
    // 0 円計上の行は支払区分を必須にする（自賠責・はぐくみ医療等）。
    // 明細モードの行は各明細で区分を持つので個別チェック。
    const zeroWithoutPaymentType = targets.filter(r => {
      if (hasLines(r)) {
        return r.lines.some(l => l.amount !== "" && parseInt(l.amount, 10) === 0 && !l.paymentType);
      }
      return parseInt(r.editAmount, 10) === 0 && r.paymentTypes.length === 0;
    });
    if (zeroWithoutPaymentType.length > 0) {
      toast.error(`${zeroWithoutPaymentType.map(r => r.customerName).join("・")}様：0円の場合は支払区分を選択してください`);
      return;
    }
    startTransition(async () => {
      const res = await bulkAddCashSales(
        targets.map(r => {
          const lines = hasLines(r)
            ? r.lines
                .filter(l => l.amount !== "")
                .map(l => ({ payment_type: l.paymentType || null, treatment_fee: parseInt(l.amount, 10) }))
            : undefined;
          return {
            customer_name: r.customerName,
            treatment_fee: parseInt(r.editAmount || "0", 10) || 0,
            memo: r.editMemo,
            is_first_visit: r.isFirstVisit,
            sale_date: targetDateStr,
            payment_type: r.paymentTypes[0] || null,
            payment_types: r.paymentTypes.length > 0 ? r.paymentTypes : null,
            lines,
          };
        })
      );
      if (res.success) {
        toast.success(`${targets.length}件を一括保存しました！`);
        fetchPending();
      } else {
        toast.error(res.error ?? "保存に失敗しました");
      }
    });
  };

  // 来院されなかった方を「未来院（NoShow）」として一覧から外す。
  // markAppointmentNoShow で予約が cancelled になり、この未入力一覧から自動で消える。
  // （会計を全部終わらせた後でも、残った未来院の方をここで片付けられる）
  const handleNoShow = (row: DraftRow) => {
    startTransition(async () => {
      const res = await markAppointmentNoShow(row.appointmentId);
      if (res.success) {
        // その場で一覧から除去（再取得を待たずに即反映）
        setRows(prev => prev.filter(r => r.appointmentId !== row.appointmentId));
        toast.success(`${row.customerName}様を未来院として外しました`);
      } else {
        toast.error(res.error ?? "未来院の処理に失敗しました");
      }
    });
  };

  const checkedCount = rows.filter(r => r.checked && isSavable(r)).length;
  const totalAmount = rows
    .filter(r => r.checked && isSavable(r))
    .reduce((sum, r) => sum + rowTotal(r), 0);

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
              来院されなかった方は、右の「未来院」ボタンで一覧から外せます（保存後でもOK）。
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
                medicalAidRules={medicalAidRules}
                onCategoryAdded={reloadCategories}
                onChange={(updated) =>
                  setRows(prev => prev.map(r => r.appointmentId === row.appointmentId ? updated : r))
                }
                onNoShow={() => handleNoShow(row)}
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
  medicalAidRules,
  onCategoryAdded,
  onNoShow,
}: {
  row: DraftRow;
  onChange: (updated: DraftRow) => void;
  paymentCategories: PaymentCategoryRow[];
  medicalAidRules: MedicalAidRules | null;
  onCategoryAdded: () => Promise<void> | void;
  onNoShow: () => void;
}) {
  // 「未来院」ボタンの押し間違い防止（1回目で確認、2回目で確定）
  const [confirmingNoShow, setConfirmingNoShow] = useState(false);
  // 子ども医療費助成の判定（市町村＋生年月日）。対象なら医療助成ボタンを色分け。
  const medicalAid = evaluateMedicalAid({
    birthDate: row.birthDate,
    cityName: row.cityName,
    rules: medicalAidRules,
  });
  // 今月この院で助成受診済みか を踏まえた、今回の実窓口負担（0/600/null）。
  const aidBurden = effectiveWindowBurden(medicalAid, row.hagukumiPaidThisMonth);
  // 月600円ルールで「今月初回」だけ 600円 になる（2回目以降は0円）
  const aidFirstThisMonth = medicalAid.monthlyBurdenYen === 600 && !row.hagukumiPaidThisMonth;

  // 助成の窓口金額をワンタップで反映（金額＝0/600、区分に「医療助成」を付与、明細モード解除）。
  const applyAidAmount = () => {
    if (aidBurden == null) return;
    const types = row.paymentTypes.includes("hagukumi")
      ? row.paymentTypes
      : [...row.paymentTypes, "hagukumi" as CashSalePaymentType];
    onChange({
      ...row,
      lines: [],
      editAmount: String(aidBurden),
      paymentTypes: types,
      checked: true,
    });
  };
  // 区分ごと金額分けモードか
  const splitMode = row.lines.length > 0;
  const hasAmount = splitMode
    ? row.lines.some(l => l.amount !== "")
    : row.editAmount !== "";
  const isZero = !splitMode && row.editAmount !== "" && parseInt(row.editAmount, 10) === 0;
  const time = format(parseISO(row.checkinTime), "HH:mm");

  // 明細モードの合計（フッター以外でも行内に出す）
  const splitTotal = row.lines.reduce((s, l) => s + (parseInt(l.amount || "0", 10) || 0), 0);

  // その場で支払区分を追加
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const handleAddCategory = async () => {
    const label = newCategoryLabel.trim();
    if (!label) return;
    setSavingCategory(true);
    try {
      const res = await upsertPaymentCategory({ label });
      if (res.success) {
        toast.success(`支払区分「${label}」を追加しました`);
        setNewCategoryLabel("");
        setAddingCategory(false);
        await onCategoryAdded();
      } else {
        toast.error(res.error ?? "区分の追加に失敗しました");
      }
    } finally {
      setSavingCategory(false);
    }
  };

  // 明細モードへ切り替え（現在選択中の区分・金額を1行目に引き継ぐ）
  const enableSplit = () => {
    onChange({
      ...row,
      checked: true,
      lines: [
        { paymentType: row.paymentTypes[0] ?? "", amount: row.editAmount || "" },
        { paymentType: "", amount: "" },
      ],
    });
  };
  const disableSplit = () => onChange({ ...row, lines: [] });
  const updateLine = (idx: number, patch: Partial<PaymentLine>) => {
    const next = row.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    onChange({ ...row, lines: next, checked: next.some(l => l.amount !== "") });
  };
  const addLine = () => onChange({ ...row, lines: [...row.lines, { paymentType: "", amount: "" }] });
  const removeLine = (idx: number) => {
    const next = row.lines.filter((_, i) => i !== idx);
    onChange({ ...row, lines: next });
  };

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
            {row.medicalRecordNumber && (
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-600 tabular-nums shrink-0">No.{row.medicalRecordNumber}</span>
            )}
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
          <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-400 flex-wrap">
            <Clock className="w-3 h-3" />
            {time}
            {row.amountSource === "course" && (
              <span className="flex items-center gap-1 ml-2 text-emerald-600 font-medium">
                <ClipboardList className="w-3 h-3" />
                予約のコース
                {row.reservedCourseName && <span className="text-emerald-700">「{row.reservedCourseName}」</span>}
              </span>
            )}
            {row.amountSource === "ai" && row.prediction && (
              <span className="flex items-center gap-1 ml-2 text-violet-500 font-medium">
                <Bot className="w-3 h-3" />
                AI履歴 確度{row.prediction.confidence}%
              </span>
            )}
            {row.amountSource === "empty" && (
              <span className="flex items-center gap-1 ml-2 text-slate-400">
                <Info className="w-3 h-3" />
                履歴なし・手入力
              </span>
            )}
          </div>
          {row.prediction?.warning && (
            <div className="flex items-center gap-1 mt-1">
              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
              <p className="text-[11px] text-amber-600 dark:text-amber-400">{row.prediction.warning}</p>
            </div>
          )}
        </div>

        {/* 金額入力（通常モードのみ。明細モードは下に合計を表示） */}
        <div className="w-28 shrink-0">
          {splitMode ? (
            <div className="h-9 flex items-center justify-end font-bold text-sm text-indigo-600 dark:text-indigo-400 tabular-nums">
              ¥{splitTotal.toLocaleString()}
            </div>
          ) : (
            <Input
              type="number"
              min={0}
              placeholder="金額"
              value={row.editAmount}
              onChange={(e) => onChange({ ...row, editAmount: e.target.value, checked: e.target.value !== "" })}
              className="text-right font-bold h-9 text-sm"
            />
          )}
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

        {/* 未来院（来院されなかった方をこの一覧から外す） */}
        <div className="shrink-0">
          {confirmingNoShow ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setConfirmingNoShow(false); onNoShow(); }}
                className="h-9 px-2.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
              >
                未来院にする
              </button>
              <button
                type="button"
                onClick={() => setConfirmingNoShow(false)}
                className="h-9 px-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400"
              >
                やめる
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingNoShow(true)}
              title="来院されなかった方を一覧から外します"
              className="h-9 px-2.5 rounded-lg text-xs font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 inline-flex items-center gap-1"
            >
              <UserX className="w-3.5 h-3.5" />
              未来院
            </button>
          )}
        </div>
      </div>

      {/* 支払区分エリア。
          通常モード: 区分を1つだけタグ選択（0円は必須）。
          明細モード: 区分ごとに金額を分けて複数行入力。
          どちらでも「＋区分を追加」でその場でマスタに新区分を作れる。 */}
      <div className="mt-2 ml-8 space-y-2">
        {!splitMode ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              支払区分（複数選択可）{isZero ? '（0円計上は必須）' : ''}:
            </span>
            {paymentCategories.map(opt => {
              const selected = row.paymentTypes.includes(opt.key);
              const color = getPaymentCategoryColor(opt.key);
              const aidHighlight = opt.key === "hagukumi" && medicalAid.applicable;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => onChange({
                    ...row,
                    paymentTypes: selected
                      ? row.paymentTypes.filter(k => k !== opt.key)
                      : [...row.paymentTypes, opt.key],
                  })}
                  className={`relative px-2 py-0.5 rounded-md text-[11px] font-bold border transition-all ${
                    selected ? color.selected : color.unselected
                  } ${
                    aidHighlight && !selected
                      ? medicalAid.monthlyBurdenYen === 0
                        ? "ring-2 ring-emerald-400 border-emerald-400"
                        : "ring-2 ring-amber-400 border-amber-400"
                      : ""
                  }`}
                >
                  {selected && <span className="mr-0.5">✓</span>}
                  {opt.label}
                  {aidHighlight && (
                    <span className="ml-1 opacity-80">
                      {aidBurden === 0 ? "(今回0円)" : `(今回${aidBurden}円)`}
                    </span>
                  )}
                </button>
              );
            })}
            {medicalAid.applicable && aidBurden != null && (
              <span className="inline-flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-bold ${aidBurden === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                  👶 {medicalAid.city}・{medicalAid.stageLabel}
                  {medicalAid.monthlyBurdenYen === 0
                    ? "（毎回0円）"
                    : aidFirstThisMonth
                      ? "（今月初回 → 窓口600円）"
                      : "（今月受診済 → 窓口0円）"}
                  ・受給者証確認
                </span>
                <button
                  type="button"
                  onClick={applyAidAmount}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all ${
                    aidBurden === 0
                      ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950/40"
                      : "border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/40"
                  }`}
                >
                  {aidBurden === 0 ? "0円で入れる" : `${aidBurden}円で入れる`}
                </button>
              </span>
            )}
            {isZero && row.paymentTypes.length === 0 && (
              <span className="text-[10px] text-rose-500 font-medium">※ 必須</span>
            )}
            {/* 区分ごとに金額を分けるモードへ */}
            <button
              type="button"
              onClick={enableSplit}
              className="px-2 py-0.5 rounded-md text-[11px] font-bold border border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:hover:bg-indigo-950/40 inline-flex items-center gap-1"
            >
              <SplitSquareHorizontal className="w-3 h-3" />
              区分ごとに金額を分ける
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                区分ごとの金額
              </span>
              <button
                type="button"
                onClick={disableSplit}
                className="text-[10px] text-slate-400 hover:text-slate-600 underline"
              >
                分けるのをやめる
              </button>
            </div>
            {row.lines.map((line, idx) => {
              const lineZero = line.amount !== "" && parseInt(line.amount, 10) === 0;
              return (
                <div key={idx} className="flex items-center gap-2 flex-wrap">
                  <select
                    value={line.paymentType}
                    onChange={(e) => updateLine(idx, { paymentType: e.target.value })}
                    className="h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-2 text-[11px] font-bold"
                  >
                    <option value="">区分を選択</option>
                    {paymentCategories.map(opt => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min={0}
                    placeholder="金額"
                    value={line.amount}
                    onChange={(e) => updateLine(idx, { amount: e.target.value })}
                    className="w-24 text-right font-bold h-8 text-sm"
                  />
                  {lineZero && !line.paymentType && (
                    <span className="text-[10px] text-rose-500 font-medium">※区分必須</span>
                  )}
                  {row.lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="p-1 text-rose-400 hover:text-rose-600"
                      aria-label="この明細を削除"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={addLine}
              className="text-[11px] text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 font-medium"
            >
              <Plus className="w-3 h-3" /> 明細を追加
            </button>
          </div>
        )}

        {/* その場で支払区分マスタに新区分を追加 */}
        {addingCategory ? (
          <div className="flex items-center gap-2">
            <Input
              type="text"
              autoFocus
              placeholder="新しい区分名（例: 鍼灸）"
              value={newCategoryLabel}
              onChange={(e) => setNewCategoryLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCategory(); } }}
              className="h-8 w-44 text-[12px]"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAddCategory}
              disabled={savingCategory || !newCategoryLabel.trim()}
              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] px-3"
            >
              {savingCategory ? "追加中..." : "追加"}
            </Button>
            <button
              type="button"
              onClick={() => { setAddingCategory(false); setNewCategoryLabel(""); }}
              className="text-[11px] text-slate-400 hover:text-slate-600"
            >
              やめる
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingCategory(true)}
            className="text-[11px] text-slate-500 hover:text-emerald-600 inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> 支払区分を追加
          </button>
        )}
      </div>
    </div>
  );
}
