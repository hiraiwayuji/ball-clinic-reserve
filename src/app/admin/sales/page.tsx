"use client";

import { useState, useEffect, useTransition, useRef, useCallback, Suspense, useMemo } from "react";

type SalesLineItem = { name: string; amount: number };

function parseMemo(memoStr: string | null) {
  if (!memoStr) return "-";
  try {
    const data = JSON.parse(memoStr);
    if (data.jippi || data.buhan) {
      const items = [...(data.jippi || []), ...(data.buhan || [])];
      return items.map((i: any) => i.name).join(", ");
    }
  } catch (e) {
    // not json
  }
  return memoStr;
}

// 「前回同様」を前回の項目名入りに展開する（例: 「前回同様（保険施術、鍼灸1部位）」）
function formatPrevSimilarLabel(items: string[] | undefined | null): string {
  if (!items || items.length === 0) return "前回同様";
  return `前回同様（${items.join("、")}）`;
}
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar as CalendarIcon, Plus, Trash2, Loader2, Coins, User, UserPlus, Landmark, Receipt, Upload, Download, Clock, Bot, X, AlertTriangle, Zap, Pencil, ShieldCheck, CalendarPlus, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { addCashSale, getCashSales, deleteCashSale, updateCashSale, searchSalesPatients, getCustomerByMedicalRecord, getLastSaleForCustomer, SalesPatientSuggestion, type CashSalePaymentType } from "@/app/actions/sales";
import { updateCheckinStatus, getLastAppointmentByCustomerName } from "@/app/actions/adminReserve";
import { getActiveCoursesByPopularity, type ReservationCourse } from "@/app/actions/courses";
import { usePaymentCategories } from "@/lib/use-payment-categories";
import { getPaymentCategoryColor } from "@/lib/payment-category-color";
import { toast } from "sonner";
import Link from "next/link";
import CashSalesImportDialog from "@/components/admin/CashSalesImportDialog";
import { AddAppointmentDialog } from "@/components/admin/AddAppointmentDialog";
import { exportToExcel } from "@/lib/excel";
import { getMyRole } from "@/app/actions/auth";

function SalesPageInner() {
  const searchParams = useSearchParams();
  const { categories: paymentCategories } = usePaymentCategories();
  const [date, setDate] = useState<Date | null>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // 受付スタッフは「受付の売上記帳（入力のみ）」。帳簿一覧・修正/削除・他日閲覧・エクスポート等はオーナー専用。
  const [isOwner, setIsOwner] = useState(false);

  // 「次回予約」モーダル（会計成功直後に開く）
  const [nextReserveOpen, setNextReserveOpen] = useState(false);
  const [nextReserveConfirmOpen, setNextReserveConfirmOpen] = useState(false);
  const [pendingNextReserve, setPendingNextReserve] = useState<{
    name: string;
    courseId?: string;
    staffId?: string;
    time?: string;
  } | null>(null);
  // 元の予約情報（受付タイムテーブルからの遷移時に URL params で受け取る）
  const sourceCourseId = searchParams.get("course_id") || undefined;
  const sourceStaffId = searchParams.get("staff_id") || undefined;
  const sourceNextTime = searchParams.get("next_time") || undefined;

  // 患者名サジェスト
  const [nameValue, setNameValue] = useState("");
  // カルテ番号（親子で同じ名前の場合の本人特定に使用）
  const [medicalRecordNumberValue, setMedicalRecordNumberValue] = useState("");
  const [jippiItems, setJippiItems] = useState<SalesLineItem[]>([{ name: "", amount: 0 }]);
  const [buhanItems, setBuhanItems] = useState<SalesLineItem[]>([]);
  const [savedMenuItems, setSavedMenuItems] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    return JSON.parse(localStorage.getItem("custom_sales_items") || "[]");
  });
  const [activeCourses, setActiveCourses] = useState<ReservationCourse[]>([]);

  // コース一覧をマウント時に取得（実費プルダウンの選択肢）
  useEffect(() => {
    getActiveCoursesByPopularity().then(setActiveCourses).catch(() => setActiveCourses([]));
  }, []);

  const totalAmount = useMemo(() => {
    const sum = (items: SalesLineItem[]) => items.reduce((s, i) => s + (i.amount || 0), 0);
    return sum(jippiItems) + sum(buhanItems);
  }, [jippiItems, buhanItems]);
  const [suggestions, setSuggestions] = useState<SalesPatientSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // AI秘書バナー（受付カウンターから予測データを受け取ったとき）
  const [aiDraft, setAiDraft] = useState<{
    message: string;
    amount: number;
    memo: string;
    confidence: number;
    warning: string | null;
  } | null>(null);
  const [showAiBanner, setShowAiBanner] = useState(false);

  // 支払区分（0円計上時に自賠責・はぐくみ医療等を選ぶ）
  // デフォルトは「自費施術」（旧「通常（自費）」を統合・2026-05-23）
  // 支払区分 複数選択対応（2026-05-23）。1要素なら従来挙動と同等。
  const [paymentTypes, setPaymentTypes] = useState<CashSalePaymentType[]>(["jihi"]);
  const primaryPaymentType = paymentTypes[0] ?? "";
  const togglePaymentType = (key: CashSalePaymentType) => {
    setPaymentTypes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  // 編集ダイアログ。memo に明細 JSON が入っている場合は明細を温存して名前/金額/支払区分のみ編集可能。
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<{
    customer_name: string;
    treatment_fee: string;
    memo: string;
    originalMemo: string;
    hasJsonMemo: boolean;
    is_first_visit: boolean;
    payment_types: string[];
    sale_date: string;
  }>({
    customer_name: "",
    treatment_fee: "",
    memo: "",
    originalMemo: "",
    hasJsonMemo: false,
    is_first_visit: false,
    payment_types: [],
    sale_date: "",
  });
  const [isUpdating, setIsUpdating] = useState(false);

  // 受付カウンターからの遷移: URLパラメータで名前・初診フラグ・予測データを受け取る
  useEffect(() => {
    const presetName = searchParams.get("name");
    const presetFirstVisit = searchParams.get("first_visit") === "true";
    if (!presetName) return;

    setIsFirstVisit(presetFirstVisit);
    setNameValue(presetName);

    // 予測データがURLに含まれている場合（カウンターから遷移）
    const predictedAmount = searchParams.get("predicted_amount");
    const predictedMemo = searchParams.get("predicted_memo") ?? "";
    const aiMessage = searchParams.get("ai_message");
    const confidence = searchParams.get("confidence");

    if (predictedAmount && aiMessage && !presetFirstVisit) {
      const amount = parseInt(predictedAmount, 10);
      const conf = parseInt(confidence ?? "0", 10);
      setJippiItems(prev => [{ name: prev[0]?.name || "", amount }, ...prev.slice(1)]);
      setAiDraft({ message: aiMessage, amount, memo: predictedMemo, confidence: conf, warning: null });
      setShowAiBanner(true);
      return;
    }

    // 予測なし: 過去履歴から金額を取得（初診は空欄）
    if (!presetFirstVisit) {
      searchSalesPatients(presetName).then((results) => {
        const exact = results.find((r) => r.customer_name === presetName);
        const best = exact ?? results[0];
        if (best) {
          setJippiItems([{ name: formatPrevSimilarLabel(best.lastItems), amount: best.lastAmount }]);
          toast.info(`${presetName}様の前回金額（${best.lastAmount.toLocaleString()}円）を入力しました`);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setDate(new Date());
  }, []);

  useEffect(() => {
    getMyRole().then((r) => setIsOwner(r === "owner"));
  }, []);

  const fetchSales = async (d: Date) => {
    setLoading(true);
    const dateStr = format(d, "yyyy-MM-dd");
    const res = await getCashSales(dateStr);
    if (res.success) {
      setSales(res.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    // 帳簿一覧の取得はオーナーのみ（getCashSales はオーナー専用）。
    if (date && isOwner) {
      fetchSales(date);
    }
  }, [date, isOwner]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date) return;
    const breakdown = {
      jippi: jippiItems.filter(i => i.name || i.amount > 0),
      buhan: buhanItems.filter(i => i.name || i.amount > 0),
      ...(medicalRecordNumberValue.trim()
        ? { medicalRecordNumber: medicalRecordNumberValue.trim() }
        : {}),
    };

    // 0 円計上時は支払区分必須
    if (totalAmount === 0 && paymentTypes.length === 0) {
      toast.error("0円で登録する場合は支払区分（自賠責・はぐくみ医療など）を選択してください");
      return;
    }

    // 同日同名の売上が既にあれば確認（兄弟・親子の二重計上 / 同一人物の重複計上検出）
    const trimmedName = nameValue.trim();
    if (trimmedName) {
      const sameNameToday = sales.filter((s) => s.customer_name === trimmedName);
      if (sameNameToday.length > 0) {
        const lines = sameNameToday
          .map((s) => `・¥${Number(s.treatment_fee ?? 0).toLocaleString()}（${parseMemo(s.memo)}）`)
          .join("\n");
        const ok = window.confirm(
          `「${trimmedName}」さんの売上が本日すでに ${sameNameToday.length} 件あります：\n${lines}\n\n⚠ 兄弟・親子の二重計上、または同一人物のダブり登録の可能性があります。\nこのまま追加しますか？（OK で追加 / キャンセルで中止）`,
        );
        if (!ok) return;
      }
    }

    const formData = new FormData(e.currentTarget);
    formData.set("sale_date", format(date, "yyyy-MM-dd"));
    formData.set("is_first_visit", String(isFirstVisit));
    formData.set("customer_name", nameValue);
    formData.set("treatment_fee", String(totalAmount));
    formData.set("memo", JSON.stringify(breakdown));
    if (primaryPaymentType) formData.set("payment_type", primaryPaymentType);
    if (paymentTypes.length > 0) formData.set("payment_types", JSON.stringify(paymentTypes));

    startTransition(async () => {
      try {
        const res = await addCashSale(formData);
        if (res.success) {
          // 受付カウンター経由なら、保存と同時に「会計完了」(checkin_status=done) も更新
          // → counter の「会計」ボタンを押す → 売上保存 = 自動的に done になる流れ
          const aptId = searchParams.get("apt_id");
          if (aptId) {
            await updateCheckinStatus(aptId, "done").catch((e) => {
              console.warn("[sales] updateCheckinStatus failed (non-fatal):", e);
            });
            toast.success(isFirstVisit ? "登録 & 会計完了（新患）" : "登録 & 会計完了");
          } else {
            toast.success(isFirstVisit ? "登録しました（新患）" : "登録しました");
          }
          // 会計直後の「次回予約しますか？」確認（タイムテーブルから遷移してきた場合）
          if (sourceCourseId || sourceStaffId) {
            setPendingNextReserve({
              name: nameValue,
              courseId: sourceCourseId,
              staffId: sourceStaffId,
              time: sourceNextTime,
            });
            setNextReserveConfirmOpen(true);
          }
          formRef.current?.reset();
          setIsFirstVisit(false);
          setMedicalRecordNumberValue("");
          setJippiItems([{ name: "", amount: 0 }]);
          setBuhanItems([]);
          setSuggestions([]);
          setShowAiBanner(false);
          setAiDraft(null);
          setPaymentTypes(["jihi"]);
          fetchSales(date);
        } else {
          toast.error(res.error || "エラーが発生しました");
        }
      } catch(err) {
        toast.error("通信エラーが発生しました");
      }
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除してよろしいですか？") || !date) return;
    const res = await deleteCashSale(id);
    if (res.success) {
      toast.success("削除しました");
      fetchSales(date);
    } else {
      toast.error(res.error || "削除に失敗しました");
    }
  };

  const openEdit = (sale: any) => {
    const rawMemo = typeof sale.memo === "string" ? sale.memo : "";
    const hasJsonMemo = rawMemo.trim().startsWith("{");
    // payment_types(配列) を優先、無ければ legacy payment_type を 1 要素として復元
    const initialPaymentTypes: string[] =
      Array.isArray(sale.payment_types) && sale.payment_types.length > 0
        ? sale.payment_types.filter((v: unknown): v is string => typeof v === "string" && !!v)
        : sale.payment_type
          ? [String(sale.payment_type)]
          : [];
    setEditTarget(sale);
    setEditForm({
      customer_name: sale.customer_name ?? "",
      treatment_fee: String(sale.treatment_fee ?? 0),
      memo: hasJsonMemo ? "" : rawMemo,
      originalMemo: rawMemo,
      hasJsonMemo,
      is_first_visit: !!sale.is_first_visit,
      payment_types: initialPaymentTypes,
      sale_date: sale.sale_date ?? "",
    });
  };

  const handleUpdate = async () => {
    if (!editTarget || !date) return;
    const trimmedName = editForm.customer_name.trim();
    const fee = Number(editForm.treatment_fee);
    if (!trimmedName || !Number.isInteger(fee) || fee < 0) {
      toast.error("お名前と金額（0以上の整数）を正しく入力してください");
      return;
    }
    // 0 円修正時は支払区分が必須（self_pay のみは新規入力同様に弾く）
    const onlySelfPay =
      editForm.payment_types.length === 1 && editForm.payment_types[0] === "self_pay";
    if (fee === 0 && (editForm.payment_types.length === 0 || onlySelfPay)) {
      toast.error("0円に修正する場合は支払区分（自賠責・はぐくみ医療など）を選択してください");
      return;
    }
    const memoToSave = editForm.hasJsonMemo ? editForm.originalMemo : editForm.memo;
    setIsUpdating(true);
    try {
      const fd = new FormData();
      fd.set("id", editTarget.id);
      fd.set("sale_date", editForm.sale_date || format(date, "yyyy-MM-dd"));
      fd.set("customer_name", trimmedName);
      fd.set("treatment_fee", String(fee));
      fd.set("memo", memoToSave);
      fd.set("is_first_visit", editForm.is_first_visit ? "true" : "false");
      // legacy payment_type は配列の先頭要素を入れて後方互換を維持
      const primary = editForm.payment_types[0] ?? "";
      if (primary) fd.set("payment_type", primary);
      fd.set("payment_types", JSON.stringify(editForm.payment_types));
      const res = await updateCashSale(fd);
      if (res.success) {
        toast.success("更新しました");
        setEditTarget(null);
        fetchSales(date);
      } else {
        toast.error(res.error || "更新に失敗しました");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  // 売上一覧の各行から「次回予約」ボタンで AddAppointmentDialog を開くハンドラ。
  // 顧客名で直近の予約を引いて、コース/担当/時刻をプリセット。
  // 見つからなければ名前だけ詰めてダイアログを開く（手動でコース等を選べる）。
  const [reserveFromSaleLoading, setReserveFromSaleLoading] = useState<string | null>(null);
  const handleReserveFromSale = async (sale: any) => {
    if (reserveFromSaleLoading) return;
    setReserveFromSaleLoading(sale.id);
    try {
      const res = await getLastAppointmentByCustomerName(sale.customer_name);
      const last = res.success ? res.data : null;
      setPendingNextReserve({
        name: sale.customer_name,
        courseId: last?.courseId ?? undefined,
        staffId: last?.staffId ?? undefined,
        time: last?.timeOfDay ?? undefined,
      });
      setNextReserveOpen(true);
      if (!last?.courseId && !last?.staffId) {
        toast.info(`${sale.customer_name}様の過去予約が見つかりませんでした。コース・担当を選んでください`);
      }
    } catch (e) {
      console.warn("[handleReserveFromSale] error:", e);
      toast.error("過去予約の取得に失敗しました");
    } finally {
      setReserveFromSaleLoading(null);
    }
  };

  // 名前入力でデバウンス検索
  const handleNameChange = useCallback((value: string) => {
    setNameValue(value);
    setSuggestions([]);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!value.trim()) { setShowSuggestions(false); return; }
    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchSalesPatients(value);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  // 候補を選択したとき
  const handleSelectSuggestion = (p: SalesPatientSuggestion) => {
    setNameValue(p.customer_name);
    setJippiItems([{ name: formatPrevSimilarLabel(p.lastItems), amount: p.lastAmount }]);
    setShowSuggestions(false);
  };

  // サジェスト外クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleExport = () => {
    if (!date) return;
    exportToExcel(
      sales.map(s => ({
        sale_date: s.sale_date,
        customer_name: s.customer_name,
        treatment_fee: s.treatment_fee,
        memo: s.memo || "",
        is_first_visit: s.is_first_visit ? "○" : "",
      })),
      [
        { key: "sale_date",       label: "日付" },
        { key: "customer_name",   label: "お名前" },
        { key: "treatment_fee",   label: "金額（税込）" },
        { key: "memo",            label: "備考" },
        { key: "is_first_visit",  label: "新患" },
      ],
      `受付入力_${format(date, "yyyy-MM-dd")}.xlsx`
    );
  };

  const dailyTotalAmount = sales.reduce((sum, s) => sum + s.treatment_fee, 0);
  const newPatientCount = sales.filter(s => s.is_first_visit).length;
  const bulkSalesHref = date ? `/admin/sales/bulk?date=${format(date, "yyyy-MM-dd")}` : "/admin/sales/bulk";

  if (!date) {
    return <div className="p-8 text-center text-slate-500">読み込み中...</div>;
  }

  return (
    <div className="space-y-6 container mx-auto py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">売上登録（受付）</h1>
          <p className="text-slate-500 dark:text-slate-400">窓口での自費・物販等の売上を記録します</p>
        </div>
        {isOwner ? (
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <Link href={bulkSalesHref}>
            <Button variant="outline" size="sm" className="border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/50 font-bold">
              <Zap className="w-4 h-4 mr-1.5" />
              一括入力
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/50 font-bold">
            <Upload className="w-4 h-4 mr-1.5" />
            Excel/CSV取込
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={sales.length === 0} className="border-slate-200 text-slate-600 hover:bg-slate-50 font-bold">
            <Download className="w-4 h-4 mr-1.5" />
            Excel出力
          </Button>
          <Link href="/admin/expenses">
            <Button variant="outline" size="sm" className="border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/50 font-bold">
              <Receipt className="w-4 h-4 mr-1.5" />
              売上記帳へ
            </Button>
          </Link>
          <Link href="/admin/insurance">
            <Button variant="outline" size="sm" className="border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/50 font-bold">
              <Landmark className="w-4 h-4 mr-1.5" />
              保険入金へ
            </Button>
          </Link>
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2 border dark:border-slate-800 rounded-lg shadow-sm">
            <CalendarIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <input
              type="date"
              className="border-none focus:ring-0 text-sm font-medium bg-transparent dark:text-slate-100"
              value={format(date, "yyyy-MM-dd")}
              onChange={(e) => setDate(new Date(e.target.value))}
            />
          </div>
        </div>
        ) : (
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
            本日 {format(date, "M月d日 (E)", { locale: ja })} の受付売上を入力
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 入力フォーム */}
        <Card className={`${isOwner ? "lg:col-span-1" : "lg:col-span-2 lg:col-start-1"} shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50`}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              新規受付入力
            </CardTitle>
            <CardDescription>{format(date, "M月d日 (E)", { locale: ja })} の売上</CardDescription>
          </CardHeader>
          <CardContent>
            {/* AI秘書バナー（受付カウンターから予測データがある場合） */}
            {showAiBanner && aiDraft && (
              <div className="mb-4 rounded-xl border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40 p-3">
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 bg-violet-500 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Zap className="w-3 h-3 text-violet-500" />
                      <span className="text-[11px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-wide">AI秘書の仮入力</span>
                      <span className="text-[10px] text-violet-400 bg-violet-100 dark:bg-violet-900/50 px-1.5 rounded-full">確度 {aiDraft.confidence}%</span>
                    </div>
                    <p className="text-xs text-violet-800 dark:text-violet-200 leading-snug font-medium">{aiDraft.message}</p>
                    {aiDraft.warning && (
                      <div className="mt-1.5 flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <p className="text-[11px]">{aiDraft.warning}</p>
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => setShowAiBanner(false)} className="text-violet-400 hover:text-violet-600 transition-colors shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              {/* お名前（サジェスト付き） */}
              <div className="space-y-2">
                <Label htmlFor="customer_name">お名前</Label>
                <div className="relative" ref={suggestionsRef}>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 z-10" />
                    <Input
                      id="customer_name"
                      name="customer_name"
                      placeholder="やまだ たろう"
                      className="pl-9"
                      required
                      lang="ja"
                      autoComplete="off"
                      value={nameValue}
                      onChange={(e) => handleNameChange(e.target.value)}
                      onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    />
                    {isSearching && (
                      <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>

                  {/* サジェストドロップダウン */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                      <div className="px-3 py-1.5 bg-slate-50 border-b text-xs text-slate-500 font-medium">
                        直近の来院（タップで入力）
                      </div>
                      {suggestions.map((p, i) => (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelectSuggestion(p)}
                          className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span className="font-bold text-slate-800 text-sm truncate">{p.customer_name}</span>
                            </div>
                            <div className="text-right shrink-0 space-y-0.5">
                              <p className="text-sm font-bold text-blue-600">¥{p.lastAmount.toLocaleString()}</p>
                              <div className="flex items-center gap-1 justify-end">
                                <Clock className="w-3 h-3 text-slate-500" />
                                <span className={`text-xs font-semibold ${
                                  p.daysSinceLastVisit <= 7 ? "text-green-600" :
                                  p.daysSinceLastVisit <= 30 ? "text-blue-600" :
                                  p.daysSinceLastVisit <= 90 ? "text-amber-600" : "text-red-500"
                                }`}>
                                  {p.daysSinceLastVisit}日前
                                </span>
                                <span className="text-xs text-slate-500">計{p.visitCount}回</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* カルテ番号（親子で同じ名前の場合の特定用・任意） */}
              <div className="space-y-2">
                <Label htmlFor="medical_record_number" className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  カルテ番号 <span className="text-slate-400 font-normal normal-case">（任意）</span>
                </Label>
                <Input
                  id="medical_record_number"
                  type="text"
                  placeholder="例: A-1234（入力すると患者名を自動引き出し）"
                  value={medicalRecordNumberValue}
                  onChange={(e) => setMedicalRecordNumberValue(e.target.value)}
                  onBlur={async (e) => {
                    const num = e.target.value.trim();
                    if (!num) return;
                    const res = await getCustomerByMedicalRecord(num);
                    if (!res.ok) return;
                    if (res.customers.length === 1) {
                      const c = res.customers[0];
                      setNameValue(c.name);
                      // 続けて直近の売上明細を取って復元
                      const lastRes = await getLastSaleForCustomer(c.name);
                      if (lastRes.ok && lastRes.sale) {
                        const s = lastRes.sale;
                        if (s.jippi.length > 0) {
                          setJippiItems(s.jippi);
                        }
                        if (s.buhan.length > 0) {
                          setBuhanItems(s.buhan);
                        }
                        if (s.paymentType) {
                          setPaymentTypes([s.paymentType as CashSalePaymentType]);
                        }
                        const total = s.jippi.reduce((a, b) => a + (b.amount || 0), 0)
                                    + s.buhan.reduce((a, b) => a + (b.amount || 0), 0);
                        toast.success(
                          `${c.name}様（カルテ ${num}）: 前回 ${s.saleDate} ¥${total.toLocaleString()} を復元しました`
                        );
                      } else {
                        toast.success(`カルテ ${num}: ${c.name}様 を読み込みました（過去の売上記録なし）`);
                      }
                    } else if (res.customers.length > 1) {
                      toast.warning(`カルテ ${num} は ${res.customers.length} 名ヒット。お名前を直接入力してください`);
                    } else {
                      toast.info(`カルテ ${num} に該当する患者は登録されていません`);
                    }
                  }}
                  autoComplete="off"
                />
              </div>

              {/* 実費セクション */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">実費</Label>
                  <button type="button" onClick={() => setJippiItems(v => [...v, { name: "", amount: 0 }])}
                    className="text-xs text-blue-600 hover:underline">＋項目を追加</button>
                </div>
                {jippiItems.map((item, i) => (
                  <LineItemRow key={`jippi-${i}`} item={item} savedItems={savedMenuItems}
                    courses={activeCourses} isFirstVisit={isFirstVisit}
                    onChange={updated => setJippiItems(v => v.map((x, j) => j === i ? updated : x))}
                    onRemove={() => setJippiItems(v => v.filter((_, j) => j !== i))}
                    onSaveToMaster={name => {
                      const next = [...new Set([...savedMenuItems, name])];
                      setSavedMenuItems(next);
                      localStorage.setItem("custom_sales_items", JSON.stringify(next));
                    }}
                  />
                ))}
              </div>

              {/* 物販セクション */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">物販</Label>
                  <button type="button" onClick={() => setBuhanItems(v => [...v, { name: "", amount: 0 }])}
                    className="text-xs text-blue-600 hover:underline">＋項目を追加</button>
                </div>
                {buhanItems.map((item, i) => (
                  <LineItemRow key={`buhan-${i}`} item={item} savedItems={savedMenuItems}
                    courses={[]} isFirstVisit={false}
                    onChange={updated => setBuhanItems(v => v.map((x, j) => j === i ? updated : x))}
                    onRemove={() => setBuhanItems(v => v.filter((_, j) => j !== i))}
                    onSaveToMaster={name => {
                      const next = [...new Set([...savedMenuItems, name])];
                      setSavedMenuItems(next);
                      localStorage.setItem("custom_sales_items", JSON.stringify(next));
                    }}
                  />
                ))}
              </div>

              {/* 合計表示 */}
              <div className="text-right text-lg font-bold text-slate-900 dark:text-slate-100">
                合計: ¥{totalAmount.toLocaleString()}
              </div>

              {/* 新患トグル */}
              <button
                type="button"
                onClick={() => setIsFirstVisit(v => !v)}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 font-bold text-sm transition-all ${
                  isFirstVisit
                    ? "bg-amber-400 border-amber-500 text-white shadow-md"
                    : "bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200 hover:border-slate-400"
                }`}
              >
                <UserPlus className="w-4 h-4" />
                {isFirstVisit ? "✓ 新患（タップで解除）" : "新患の場合はここをタップ"}
              </button>

              {/* 支払区分（payment_categories マスタから動的取得・複数選択可） */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  支払区分（複数選択可・0円計上の場合は必須）
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {paymentCategories.map(opt => {
                    const selected = paymentTypes.includes(opt.key);
                    const color = getPaymentCategoryColor(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => togglePaymentType(opt.key)}
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
                <p className="text-[10px] text-slate-500">
                  ※ 保険＋自費＋鍼 など複数該当する場合は全て選択してください。<br />
                  　 0 円計上時は必須。区分は「設定」→「支払区分」で追加・編集できます。
                </p>
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 h-10"
                disabled={isPending || (totalAmount === 0 && paymentTypes.length === 0)}
              >
                {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                {totalAmount === 0 && paymentTypes.length > 0 ? "0円で登録（公費・自賠責等）" : "登録する"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 売上リスト（オーナー専用：受付スタッフには非表示） */}
        {isOwner && (
        <Card className="lg:col-span-2 shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>本日（{format(date, "M/d")}）の売上一覧</CardTitle>
              <CardDescription>{sales.length} 件の記録があります</CardDescription>
            </div>
            <div className="flex gap-4 items-end">
              {newPatientCount > 0 && (
                <div className="text-right">
                  <p className="text-xs text-amber-600 font-medium">新患</p>
                  <p className="text-2xl font-bold text-amber-600">{newPatientCount}名</p>
                </div>
              )}
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">本日合計</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">¥{dailyTotalAmount.toLocaleString()}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-slate-100 dark:border-white/5 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50/50 dark:bg-slate-800/30">
                  <TableRow className="border-b dark:border-white/5">
                    <TableHead>お名前</TableHead>
                    <TableHead className="w-[90px]">カルテ番号</TableHead>
                    <TableHead>備考</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead className="w-[130px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-48 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-500" />
                        <p className="text-sm text-slate-500 mt-2">読み込み中...</p>
                      </TableCell>
                    </TableRow>
                  ) : sales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-500">
                          <Coins className="w-12 h-12 mb-2 opacity-20" />
                          <p>売上データがありません</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sales.map((sale) => (
                      <TableRow key={sale.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                          <div className="flex items-center gap-2">
                            {sale.customer_name}
                            {sale.is_first_visit && (
                              <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-bold px-1.5 py-0.5 rounded">新患</span>
                            )}
                          </div>
                          {sale.city_name && (
                            <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                              <MapPin className="w-3 h-3" />
                              {sale.city_name}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-300 text-sm font-mono">
                          {sale.medical_record_number ? (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {sale.medical_record_number}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-500 dark:text-slate-400 text-sm">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {(() => {
                              // payment_types（複数）優先・無ければ legacy payment_type を 1 要素扱い
                              const keys: string[] = Array.isArray(sale.payment_types) && sale.payment_types.length > 0
                                ? sale.payment_types
                                : (sale.payment_type ? [sale.payment_type] : []);
                              return keys.map((key) => {
                                const cat = paymentCategories.find(c => c.key === key);
                                if (!cat) return null;
                                const color = getPaymentCategoryColor(key);
                                return (
                                  <span
                                    key={key}
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color.badge}`}
                                  >
                                    {cat.label}
                                  </span>
                                );
                              });
                            })()}
                            <span className="truncate">{parseMemo(sale.memo)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-bold text-slate-700 dark:text-slate-200">¥{sale.treatment_fee.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-slate-100 group">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all rounded-full"
                              onClick={() => handleReserveFromSale(sale)}
                              disabled={reserveFromSaleLoading === sale.id}
                              aria-label="次回予約"
                              title="次回予約を入れる"
                            >
                              {reserveFromSaleLoading === sale.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CalendarPlus className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all rounded-full"
                              onClick={() => openEdit(sale)}
                              aria-label="修正"
                              title="修正"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-slate-500 hover:text-rose-500 hover:bg-rose-50 transition-all rounded-full"
                              onClick={() => handleDelete(sale.id)}
                              aria-label="削除"
                              title="削除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        )}
      </div>

      <CashSalesImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => date && fetchSales(date)}
      />

      {/* 売上修正ダイアログ */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>売上を修正</DialogTitle>
            <DialogDescription>
              受付からの一括入力後でも、ここで金額・お名前・支払区分を修正できます。
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">日付</Label>
                <Input
                  type="date"
                  value={editForm.sale_date}
                  onChange={(e) => setEditForm(f => ({ ...f, sale_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">お名前</Label>
                <Input
                  value={editForm.customer_name}
                  onChange={(e) => setEditForm(f => ({ ...f, customer_name: e.target.value }))}
                  placeholder="やまだ たろう"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">金額（円）</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={100}
                  value={editForm.treatment_fee}
                  onChange={(e) => setEditForm(f => ({ ...f, treatment_fee: e.target.value }))}
                />
                {editForm.hasJsonMemo && (
                  <p className="text-[10px] text-slate-500">
                    ※ 受付入力の明細データは保持されます（金額のみ上書き）
                  </p>
                )}
              </div>
              {!editForm.hasJsonMemo && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">備考</Label>
                  <Input
                    value={editForm.memo}
                    onChange={(e) => setEditForm(f => ({ ...f, memo: e.target.value }))}
                    placeholder="備考"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  支払区分 <span className="text-slate-400 font-normal normal-case">（複数選択可）</span>
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {paymentCategories.map(opt => {
                    const selected = editForm.payment_types.includes(opt.key);
                    const color = getPaymentCategoryColor(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setEditForm(f => ({
                          ...f,
                          payment_types: selected
                            ? f.payment_types.filter(k => k !== opt.key)
                            : [...f.payment_types, opt.key],
                        }))}
                        className={`px-2 py-2 rounded-md text-xs font-bold border transition-all ${
                          selected ? color.selected : color.unselected
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="edit-first-visit"
                  checked={editForm.is_first_visit}
                  onChange={(e) => setEditForm(f => ({ ...f, is_first_visit: e.target.checked }))}
                  className="accent-amber-500"
                />
                <Label htmlFor="edit-first-visit" className="text-xs cursor-pointer">新患</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={isUpdating}>
              キャンセル
            </Button>
            <Button onClick={handleUpdate} disabled={isUpdating} className="bg-blue-600 hover:bg-blue-700">
              {isUpdating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              保存する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 会計直後の「次回予約しますか？」確認 */}
      <Dialog open={nextReserveConfirmOpen} onOpenChange={setNextReserveConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>次回予約を入れますか？</DialogTitle>
            <DialogDescription>
              今回と同じメニュー・同じ担当・同じ時間帯で次回予約を作成できます。<br />
              「はい」を押すと日時選択画面が開きます。
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-slate-600 space-y-1 py-2 border-y border-slate-100">
            {pendingNextReserve?.name && <div><span className="text-slate-400">お名前:</span> {pendingNextReserve.name}</div>}
            {pendingNextReserve?.time && <div><span className="text-slate-400">時間枠:</span> {pendingNextReserve.time}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNextReserveConfirmOpen(false); setPendingNextReserve(null); }}>
              いいえ
            </Button>
            <Button
              onClick={() => { setNextReserveConfirmOpen(false); setNextReserveOpen(true); }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              はい、日時を選ぶ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 次回予約の AddAppointmentDialog（同じメニュー・担当・時間枠をプリセット） */}
      {nextReserveOpen && (
        <AddAppointmentDialog
          open={nextReserveOpen}
          onOpenChange={(o) => {
            setNextReserveOpen(o);
            if (!o) setPendingNextReserve(null);
          }}
          defaultName={pendingNextReserve?.name}
          defaultCourseId={pendingNextReserve?.courseId}
          defaultStaffId={pendingNextReserve?.staffId}
          defaultTime={pendingNextReserve?.time}
          hideTrigger
          onSuccess={() => {
            toast.success("次回予約を登録しました");
            setNextReserveOpen(false);
            setPendingNextReserve(null);
          }}
        />
      )}
    </div>
  );
}

const CUSTOM_NAME = "__custom__";

function LineItemRow({
  item, savedItems, courses, isFirstVisit, onChange, onRemove, onSaveToMaster
}: {
  item: SalesLineItem;
  savedItems: string[];
  courses: ReservationCourse[];
  isFirstVisit: boolean;
  onChange: (item: SalesLineItem) => void;
  onRemove: () => void;
  onSaveToMaster: (name: string) => void;
}) {
  const [saveChecked, setSaveChecked] = useState(false);
  const courseNames = useMemo(() => new Set(courses.map(c => c.name)), [courses]);
  const isCourseName = item.name && courseNames.has(item.name);
  const isSavedName = item.name && !isCourseName && savedItems.includes(item.name);
  const isFreeText = item.name !== "" && !isCourseName && !isSavedName;
  // select の現在値: コース名 / 保存項目名 / "__custom__"（自由入力）/ ""（未選択）
  const selectValue = isFreeText ? CUSTOM_NAME : item.name;

  const handleSelectChange = (val: string) => {
    if (val === CUSTOM_NAME) {
      onChange({ ...item, name: " " }); // 自由入力モード切替（空文字とは区別）
      return;
    }
    if (val === "") {
      onChange({ name: "", amount: 0 });
      return;
    }
    // コース選択時は金額を自動入力（初診なら first_visit_price 優先）
    const c = courses.find(x => x.name === val);
    if (c) {
      const price = isFirstVisit && c.first_visit_price != null ? c.first_visit_price : (c.price ?? 0);
      onChange({ name: val, amount: price });
      return;
    }
    // 保存項目から選択（金額は手入力）
    onChange({ name: val, amount: item.amount });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isFreeText ? (
        <input
          autoFocus
          value={item.name.trim() === "" ? "" : item.name}
          onChange={e => onChange({ ...item, name: e.target.value })}
          onBlur={e => { if (e.target.value === "") onChange({ name: "", amount: item.amount }); }}
          placeholder="項目名（自由入力）"
          className="flex-1 min-w-[10rem] border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-sm bg-transparent dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      ) : (
        <select
          value={selectValue}
          onChange={e => handleSelectChange(e.target.value)}
          className="flex-1 min-w-[10rem] border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-sm bg-transparent dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">— 項目を選択 —</option>
          {courses.length > 0 && (
            <optgroup label="コース">
              {courses.map(c => {
                const price = isFirstVisit && c.first_visit_price != null ? c.first_visit_price : c.price;
                const priceLabel = price != null ? ` ¥${price.toLocaleString()}` : "";
                return <option key={c.id} value={c.name}>{c.name}{priceLabel}</option>;
              })}
            </optgroup>
          )}
          {savedItems.length > 0 && (
            <optgroup label="保存した項目">
              {savedItems.map(s => <option key={s} value={s}>{s}</option>)}
            </optgroup>
          )}
          <option value={CUSTOM_NAME}>＋ その他（自由入力）</option>
        </select>
      )}
      <input type="number" inputMode="numeric" step={100} value={item.amount || ""}
        onChange={e => onChange({ ...item, amount: Number(e.target.value) })}
        placeholder="金額" className="w-28 sm:w-32 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm text-right bg-transparent dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      {isFreeText && item.name.trim() !== "" && !savedItems.includes(item.name) && (
        <label className="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap cursor-pointer">
          <input type="checkbox" checked={saveChecked}
            onChange={e => {
              setSaveChecked(e.target.checked);
              if (e.target.checked) onSaveToMaster(item.name);
            }} className="accent-blue-600" />
          保存
        </label>
      )}
      <button type="button" onClick={onRemove} className="text-slate-500 hover:text-red-500 text-lg leading-none shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">×</button>
    </div>
  );
}

export default function SalesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">読み込み中...</div>}>
      <SalesPageInner />
    </Suspense>
  );
}
