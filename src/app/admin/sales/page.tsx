"use client";

import { useState, useEffect, useTransition, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar as CalendarIcon, Plus, Trash2, Loader2, Coins, User, UserPlus, Landmark, Receipt, Upload, Download, Clock } from "lucide-react";
import { addCashSale, getCashSales, deleteCashSale, searchSalesPatients, SalesPatientSuggestion } from "@/app/actions/sales";
import { toast } from "sonner";
import Link from "next/link";
import CashSalesImportDialog from "@/components/admin/CashSalesImportDialog";
import { exportToExcel } from "@/lib/excel";

function SalesPageInner() {
  const searchParams = useSearchParams();
  const [date, setDate] = useState<Date | null>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // 患者名サジェスト
  const [nameValue, setNameValue] = useState("");
  const [amountValue, setAmountValue] = useState("");
  const [suggestions, setSuggestions] = useState<SalesPatientSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // 受付カウンターからの遷移: URLパラメータで名前・初診フラグを受け取り、金額を過去履歴から予測
  useEffect(() => {
    const presetName = searchParams.get("name");
    const presetFirstVisit = searchParams.get("first_visit") === "true";
    if (!presetName) return;

    setIsFirstVisit(presetFirstVisit);
    setNameValue(presetName);

    // 過去履歴から金額を予測（初診は空欄のまま）
    if (!presetFirstVisit) {
      searchSalesPatients(presetName).then((results) => {
        // 名前が完全一致するものを優先、なければ最初の候補
        const exact = results.find(
          (r) => r.customer_name === presetName
        );
        const best = exact ?? results[0];
        if (best) {
          setAmountValue(String(best.lastAmount));
          toast.info(`${presetName}様の前回金額（${best.lastAmount.toLocaleString()}円）を入力しました`);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setDate(new Date());
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
    if (date) {
      fetchSales(date);
    }
  }, [date]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date) return;
    const formData = new FormData(e.currentTarget);
    formData.set("sale_date", format(date, "yyyy-MM-dd"));
    formData.set("is_first_visit", String(isFirstVisit));

    startTransition(async () => {
      try {
        const res = await addCashSale(formData);
        if (res.success) {
          toast.success(isFirstVisit ? "登録しました（新患）" : "登録しました");
          formRef.current?.reset();
          setIsFirstVisit(false);
          setNameValue("");
          setAmountValue("");
          setSuggestions([]);
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
    setAmountValue(String(p.lastAmount));
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

  const totalAmount = sales.reduce((sum, s) => sum + s.treatment_fee, 0);
  const newPatientCount = sales.filter(s => s.is_first_visit).length;

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
        <div className="flex items-center gap-3 flex-wrap justify-end">
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 入力フォーム */}
        <Card className="lg:col-span-1 shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              新規受付入力
            </CardTitle>
            <CardDescription>{format(date, "M月d日 (E)", { locale: ja })} の売上</CardDescription>
          </CardHeader>
          <CardContent>
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              {/* お名前（サジェスト付き） */}
              <div className="space-y-2">
                <Label htmlFor="customer_name">お名前</Label>
                <div className="relative" ref={suggestionsRef}>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 z-10" />
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
                              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-bold text-slate-800 text-sm truncate">{p.customer_name}</span>
                            </div>
                            <div className="text-right shrink-0 space-y-0.5">
                              <p className="text-sm font-bold text-blue-600">¥{p.lastAmount.toLocaleString()}</p>
                              <div className="flex items-center gap-1 justify-end">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span className={`text-xs font-semibold ${
                                  p.daysSinceLastVisit <= 7 ? "text-green-600" :
                                  p.daysSinceLastVisit <= 30 ? "text-blue-600" :
                                  p.daysSinceLastVisit <= 90 ? "text-amber-600" : "text-red-500"
                                }`}>
                                  {p.daysSinceLastVisit}日前
                                </span>
                                <span className="text-xs text-slate-400">計{p.visitCount}回</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 金額 */}
              <div className="space-y-2">
                <Label htmlFor="treatment_fee">金額（税込）</Label>
                <div className="relative">
                  <Coins className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="treatment_fee"
                    name="treatment_fee"
                    type="number"
                    placeholder="5000"
                    className="pl-9"
                    required
                    value={amountValue}
                    onChange={(e) => setAmountValue(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="memo">備考（オプション）</Label>
                <Input id="memo" name="memo" placeholder="自費施術, 物販等" />
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
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 h-10" disabled={isPending}>
                {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                登録する
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 売上リスト */}
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
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">¥{totalAmount.toLocaleString()}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-slate-100 dark:border-white/5 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50/50 dark:bg-slate-800/30">
                  <TableRow className="border-b dark:border-white/5">
                    <TableHead>お名前</TableHead>
                    <TableHead>備考</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-48 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-300" />
                        <p className="text-sm text-slate-400 mt-2">読み込み中...</p>
                      </TableCell>
                    </TableRow>
                  ) : sales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
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
                        </TableCell>
                        <TableCell className="text-slate-500 dark:text-slate-400 text-sm">{sale.memo || "-"}</TableCell>
                        <TableCell className="text-right font-bold text-slate-700 dark:text-slate-200">¥{sale.treatment_fee.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-slate-100 group">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all rounded-full"
                            onClick={() => handleDelete(sale.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <CashSalesImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => date && fetchSales(date)}
      />
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

