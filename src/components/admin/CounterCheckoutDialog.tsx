"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addCashSale, getSalesPrediction } from "@/app/actions/sales";
import { updateCheckinStatus } from "@/app/actions/adminReserve";
import { usePaymentCategories } from "@/lib/use-payment-categories";
import { getPaymentCategoryColor } from "@/lib/payment-category-color";
import { toast } from "sonner";
import { format } from "date-fns";
import { CreditCard, Loader2, UserPlus, ShieldCheck, Bot } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  appointmentId: string;
  customerName: string;
  isFirstVisit: boolean;
  courseName?: string | null;
  saleDate: Date;
  /** 会計登録＆会計完了が済んだら呼ぶ（受付一覧の状態を done に更新する用） */
  onCompleted: (id: string) => void;
};

/**
 * 受付ページ上で会計（売上入力）まで完結させるダイアログ。
 * /admin/sales へ遷移せず、その場で addCashSale → checkin_status=done まで行う。
 * 受付スタッフ権限でも使える（addCashSale は staff 可）。
 */
export default function CounterCheckoutDialog({
  open,
  onOpenChange,
  appointmentId,
  customerName,
  isFirstVisit: initialFirstVisit,
  courseName,
  saleDate,
  onCompleted,
}: Props) {
  const { categories } = usePaymentCategories();
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [paymentTypes, setPaymentTypes] = useState<string[]>(["jihi"]);
  const [isFirstVisit, setIsFirstVisit] = useState(initialFirstVisit);
  const [submitting, setSubmitting] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  // 開くたびに初期化。再診は過去履歴から金額を自動入力（AI秘書）。
  useEffect(() => {
    if (!open) return;
    setAmount("");
    setMemo("");
    setPaymentTypes(["jihi"]);
    setIsFirstVisit(initialFirstVisit);
    setAiNote(null);
    if (!initialFirstVisit && customerName) {
      getSalesPrediction(customerName)
        .then((p) => {
          if (p && p.predictedAmount > 0) {
            setAmount(String(p.predictedAmount));
            if (p.predictedMemo) setMemo(p.predictedMemo);
            setAiNote(`前回の履歴から ¥${p.predictedAmount.toLocaleString()} を入力しました（確度${p.confidence}%）`);
          }
        })
        .catch(() => {});
    }
  }, [open, customerName, initialFirstVisit]);

  const togglePay = (key: string) =>
    setPaymentTypes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const handleSubmit = async () => {
    const fee = parseInt(amount, 10);
    if (isNaN(fee) || fee < 0) {
      toast.error("金額を入力してください");
      return;
    }
    // 0円計上は支払区分必須（自費のみ／未選択は不可）
    const onlySelfPay = paymentTypes.length === 0 || (paymentTypes.length === 1 && paymentTypes[0] === "jihi");
    if (fee === 0 && onlySelfPay) {
      toast.error("0円で登録する場合は支払区分（自賠責・はぐくみ医療など）を選択してください");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("sale_date", format(saleDate, "yyyy-MM-dd"));
      fd.set("customer_name", customerName);
      fd.set("treatment_fee", String(fee));
      fd.set("memo", memo);
      fd.set("is_first_visit", String(isFirstVisit));
      if (paymentTypes[0]) fd.set("payment_type", paymentTypes[0]);
      if (paymentTypes.length > 0) fd.set("payment_types", JSON.stringify(paymentTypes));
      const res = await addCashSale(fd);
      if (!res.success) {
        toast.error(res.error || "登録に失敗しました");
        setSubmitting(false);
        return;
      }
      await updateCheckinStatus(appointmentId, "done").catch(() => {});
      toast.success(isFirstVisit ? "会計を登録しました（新患・会計完了）" : "会計を登録しました（会計完了）");
      onCompleted(appointmentId);
      onOpenChange(false);
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-600" />
            会計（受付で完結）
          </DialogTitle>
          <DialogDescription>
            {customerName} 様{courseName ? ` ／ ${courseName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {aiNote && (
            <div className="flex items-start gap-2 text-xs bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 text-violet-700">
              <Bot className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{aiNote}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600">金額（円）</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="例: 3000"
              autoFocus
              className="text-lg font-bold"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsFirstVisit((v) => !v)}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 font-bold text-sm transition-all ${
              isFirstVisit
                ? "bg-amber-400 border-amber-500 text-white"
                : "bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <UserPlus className="w-4 h-4" />
            {isFirstVisit ? "✓ 新患（タップで解除）" : "新患の場合はタップ"}
          </button>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              支払区分（複数選択可・0円は必須）
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((opt) => {
                const selected = paymentTypes.includes(opt.key);
                const color = getPaymentCategoryColor(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => togglePay(opt.key)}
                    className={`relative px-2 py-2 rounded-md text-xs font-bold border transition-all ${
                      selected ? color.selected : color.unselected
                    }`}
                  >
                    {selected && <span className="absolute top-0.5 right-1 text-[10px]">✓</span>}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600">備考（任意）</Label>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="施術内容・物販など" />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CreditCard className="w-4 h-4 mr-1" />}
            会計を登録して完了
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
