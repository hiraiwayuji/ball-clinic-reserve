"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar as CalendarIcon, Plus, Trash2, Loader2, Receipt, AlertCircle, Save, Camera, Sparkles, Pencil, Check, X, Banknote, Download, FileSpreadsheet, Settings2 } from "lucide-react";
import { addExpense, getExpenses, deleteExpense, addPendingExpense, updateExpense, getMonthDetailedExpenses } from "@/app/actions/sales";
import { getCustomExpenseCategories, addCustomExpenseCategory, deleteCustomExpenseCategory, getClinicSettings } from "@/app/actions/settings";
import { BASE_EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import Image from "next/image";
import Link from "next/link";
import { exportToExcel } from "@/lib/excel";
import ExpensesImportDialog from "@/components/admin/ExpensesImportDialog";
import { CategorySelect } from "@/components/admin/CategorySelect";

// 収入（その他収入）のカテゴリ。受付の患者売上とは別に、雑収入・物販などを記帳する用途。
const INCOME_CATEGORIES = ["物販", "自販機", "雑収入", "受取手数料", "受取利息", "その他収入"];

type EntryType = "expense" | "income";

type EditingState = {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  memo: string;
  entry_type: EntryType;
};

export default function ExpensesPage() {
  const [date, setDate] = useState<Date | null>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isSavingPending, setIsSavingPending] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<EditingState | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [formExpenseDate, setFormExpenseDate] = useState<string>("");
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // カスタムカテゴリ
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  // 新規入力フォームのカテゴリ（controlled）
  const [formCategory, setFormCategory] = useState<string>("");
  // 種別: 支出（経費）/ 収入（その他収入）。デフォルトは支出。
  const [entryType, setEntryType] = useState<EntryType>("expense");
  const isIncome = entryType === "income";
  // 部門（サロン/カフェ等）。clinic_settings.expense_departments が空の院では部門UIを出さない。
  const [departments, setDepartments] = useState<string[]>([]);
  const [formDepartment, setFormDepartment] = useState<string>("");

  const allCategories = [...BASE_EXPENSE_CATEGORIES, ...customCategories];
  const useDepartments = departments.length > 0;

  useEffect(() => {
    const today = new Date();
    setDate(today);
    setFormExpenseDate(format(today, "yyyy-MM-dd"));
    // カスタムカテゴリ読み込み
    getCustomExpenseCategories().then(setCustomCategories);
    // 部門設定の読み込み（空なら部門UIは出さない）
    getClinicSettings().then((s) => setDepartments(s?.departments ?? []));
  }, []);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    setIsSavingCategory(true);
    const res = await addCustomExpenseCategory(newCategoryName.trim());
    if (res.success) {
      const updated = await getCustomExpenseCategories();
      setCustomCategories(updated);
      setNewCategoryName("");
      toast.success("カテゴリを追加しました");
    } else {
      toast.error(res.error || "追加に失敗しました");
    }
    setIsSavingCategory(false);
  };

  const handleDeleteCategory = async (name: string) => {
    const res = await deleteCustomExpenseCategory(name);
    if (res.success) {
      const updated = await getCustomExpenseCategories();
      setCustomCategories(updated);
      toast.success(`「${name}」を削除しました`);
    } else {
      toast.error(res.error || "削除に失敗しました");
    }
  };

  const fetchExpenses = async (d: Date) => {
    setLoading(true);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const res = await getMonthDetailedExpenses(year, month);
    if (res.success) {
      setExpenses(res.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (date) {
      fetchExpenses(date);
    }
  }, [date]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date) return;
    const formData = new FormData(e.currentTarget);
    formData.set("expense_date", formExpenseDate || format(date, "yyyy-MM-dd"));
    formData.set("category", formCategory);
    formData.set("department", formDepartment);
    formData.set("entry_type", entryType);

    startTransition(async () => {
      const res = await addExpense(formData);
      if (res.success) {
        toast.success(isIncome ? "収入を登録しました" : "経費を登録しました");
        (e.target as HTMLFormElement).reset();
        setFormExpenseDate(format(date, "yyyy-MM-dd"));
        setFormCategory("");
        setFormDepartment("");
        setCurrentImageUrl(null);
        setPreviewUrl(null);
        fetchExpenses(date);
      } else {
        toast.error(res.error || "エラーが発生しました");
      }
    });
  };

  const handleSavePending = async (e: React.MouseEvent) => {
    const form = (e.target as HTMLElement).closest('form');
    if (!form || !date) return;

    const formData = new FormData(form);
    const triageData = {
      expense_date: formExpenseDate || format(date, "yyyy-MM-dd"),
      category: formCategory,
      description: formData.get("description"),
      amount: parseInt(formData.get("amount") as string) || 0,
      memo: formData.get("memo")
    };

    setIsSavingPending(true);
    const res = await addPendingExpense(currentImageUrl, triageData);
    setIsSavingPending(false);

    if (res.success) {
      toast.success("保留経費として保存しました");
      form.reset();
      setFormCategory("");
    } else {
      toast.error(res.error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除してよろしいですか？") || !date) return;
    const res = await deleteExpense(id);
    if (res.success) {
      toast.success("削除しました");
      fetchExpenses(date);
    } else {
      toast.error(res.error || "削除に失敗しました");
    }
  };

  // Geminiにbase64画像を送って結果をフォームに反映する共通処理
  const analyzeAndFill = async (base64: string, mimeType: string, objectUrl?: string, file?: File) => {
    setIsReading(true);
    setIsUploading(true);
    if (objectUrl) setPreviewUrl(objectUrl);
    
    try {
      // 1. Supabase Storageにアップロード
      const supabase = createClient();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`;
      const filePath = `receipts/${fileName}`;
      
      let uploadFile: any = file;
      if (!uploadFile) {
        // base64をBlobに変換
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        uploadFile = new Blob([byteArray], { type: mimeType });
      }

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("expense-receipts")
        .upload(filePath, uploadFile);

      if (uploadErr) {
        console.error("Storage upload error:", uploadErr);
        // アップロード失敗してもOCR自体は進める
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from("expense-receipts")
          .getPublicUrl(filePath);
        setCurrentImageUrl(publicUrl);
      }

      // 2. Geminiによる解析
      const res = await fetch("/api/read-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mimeType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "読み取り失敗");
      const form = formRef.current;
      if (form) {
        if (json.amount) (form.elements.namedItem("amount") as HTMLInputElement).value = String(json.amount);
        if (json.description) (form.elements.namedItem("description") as HTMLInputElement).value = json.description;
        if (json.memo) (form.elements.namedItem("memo") as HTMLInputElement).value = json.memo;
        if (json.expense_date) setFormExpenseDate(json.expense_date);
        if (json.category && allCategories.includes(json.category)) {
          setFormCategory(json.category);
        }
      }
      toast.success("レシートを読み取りました。内容を確認してください。");
    } catch (err: any) {
      toast.error("読み取りに失敗しました: " + (err.message || ""));
    } finally {
      setIsReading(false);
      setIsUploading(false);
    }
  };

  // ファイル選択から読み取り
  const handleImageRead = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await analyzeAndFill(base64, file.type, objectUrl, file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // PCカメラを起動
  const handleOpenCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch {
      toast.error("カメラへのアクセスが許可されていません。ブラウザの設定を確認してください。");
    }
  };

  // PCカメラで撮影
  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.split(",")[1];
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
    await analyzeAndFill(base64, "image/jpeg", dataUrl);
  };

  // カメラを閉じる
  const handleCloseCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  // 編集開始
  const handleStartEdit = (expense: any) => {
    setEditingRow({
      id: expense.id,
      expense_date: expense.expense_date,
      category: expense.category || "",
      description: expense.description || "",
      amount: expense.amount,
      memo: expense.memo || "",
      entry_type: expense.entry_type === "income" ? "income" : "expense",
    });
  };

  // 編集保存
  const handleSaveEdit = async () => {
    if (!editingRow || !date) return;
    setIsSavingEdit(true);
    const res = await updateExpense(editingRow.id, {
      expense_date: editingRow.expense_date,
      category: editingRow.category,
      description: editingRow.description,
      amount: editingRow.amount,
      memo: editingRow.memo,
      entry_type: editingRow.entry_type,
    });
    setIsSavingEdit(false);
    if (res.success) {
      const newDate = new Date(editingRow.expense_date + "T00:00:00");
      const movedToOtherDay = editingRow.expense_date !== format(date, "yyyy-MM-dd");
      toast.success(movedToOtherDay
        ? `更新しました（${editingRow.expense_date} の経費に移動しました）`
        : "更新しました"
      );
      setEditingRow(null);
      if (movedToOtherDay) {
        // 保存先の日付に移動して表示
        setDate(newDate);
      } else {
        fetchExpenses(date);
      }
    } else {
      toast.error(res.error || "更新に失敗しました");
    }
  };

  const handleExport = () => {
    exportToExcel(
      expenses.map(e => ({
        expense_date: e.expense_date,
        entry_type: e.entry_type === "income" ? "収入" : "支出",
        category: e.category || "",
        description: e.description || "",
        amount: e.amount,
        memo: e.memo || "",
      })),
      [
        { key: "expense_date", label: "日付" },
        { key: "entry_type",   label: "種別" },
        { key: "category",     label: "カテゴリ" },
        { key: "description",  label: "内容" },
        { key: "amount",       label: "金額" },
        { key: "memo",         label: "備考" },
      ],
      `経費記帳_${format(date!, "yyyy-MM")}.xlsx`
    );
  };

  // 支出・収入を分けて集計（収入は entry_type === "income"）。
  const expenseRows = expenses.filter((e) => e.entry_type !== "income");
  const incomeRows = expenses.filter((e) => e.entry_type === "income");
  const expenseTotal = expenseRows.reduce((sum, e) => sum + e.amount, 0);
  const incomeTotal = incomeRows.reduce((sum, e) => sum + e.amount, 0);

  // 部門×費目の集計（部門が設定されている院のみ）。「未分類」も1グループとして集計。
  // 収入は部門サマリー（経費の内訳）には含めない。
  const departmentSummary = (() => {
    if (!useDepartments) return [];
    const groups = [...departments, "未分類"];
    return groups
      .map((dep) => {
        const rows = expenseRows.filter((e) =>
          dep === "未分類" ? !e.department : e.department === dep
        );
        const total = rows.reduce((s, e) => s + e.amount, 0);
        const byCategory: Record<string, number> = {};
        for (const r of rows) {
          const key = r.category || "未分類";
          byCategory[key] = (byCategory[key] || 0) + r.amount;
        }
        const categories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
        return { dep, total, count: rows.length, categories };
      })
      .filter((g) => g.count > 0);
  })();

  if (!date) {
    return <div className="p-8 text-center text-slate-500">読み込み中...</div>;
  }

  return (
    <div className="space-y-6 container mx-auto py-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 border-l-4 border-emerald-600 pl-3">
              経費記帳
            </h1>
            <p className="text-muted-foreground mt-2">経費（支出）と、その他の収入をまとめて記帳できます</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-white/10">
            <span className="text-sm font-bold text-slate-500 dark:text-slate-400 mr-2 border-r dark:border-slate-700 pr-3">こちらの入力も必要ですか？</span>
            <Link href="/admin/sales">
              <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200/50 flex items-center gap-2 group">
                <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="text-base font-black">受付入力</span>
              </Button>
            </Link>
            <Link href="/admin/insurance">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200/50 flex items-center gap-2 group">
                <Banknote className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="text-base font-black">保険入金</span>
              </Button>
            </Link>
          </div>
        </div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/expenses/triage">
            <Button variant="outline" className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              仕分け待ちを確認
            </Button>
          </Link>
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2 border dark:border-slate-800 rounded-lg shadow-sm">
            <CalendarIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <input
              type="date"
              className="border-none focus:ring-0 text-sm font-medium bg-transparent dark:text-slate-100"
              value={format(date, "yyyy-MM-dd")}
              onChange={(e) => setDate(new Date(e.target.value))}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCategoryPanelOpen(v => !v)} className="flex items-center gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50">
            <Settings2 className="w-4 h-4" /> カテゴリ管理
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
            <FileSpreadsheet className="w-4 h-4" /> Excel取込
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={expenses.length === 0} className="flex items-center gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50">
            <Download className="w-4 h-4" /> Excel出力
          </Button>
        </div>
      </div>

      {/* カテゴリ管理パネル */}
      {categoryPanelOpen && (
        <Card className="shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-slate-500" />
              経費カテゴリ管理
            </CardTitle>
            <CardDescription>よく使うカテゴリを自由に追加できます。標準カテゴリは削除できません。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 追加フォーム */}
            <div className="flex gap-2">
              <Input
                placeholder="新しいカテゴリ名（例: 医薬品・サプリ）"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCategory(); } }}
                className="flex-1"
              />
              <Button onClick={handleAddCategory} disabled={isSavingCategory || !newCategoryName.trim()} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                {isSavingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                追加
              </Button>
            </div>
            {/* カテゴリ一覧 */}
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">標準カテゴリ</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {BASE_EXPENSE_CATEGORIES.map(cat => (
                  <span key={cat} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {cat}
                  </span>
                ))}
              </div>
              {customCategories.length > 0 && (
                <>
                  <p className="text-xs font-medium text-slate-500 mb-2">追加カテゴリ</p>
                  <div className="flex flex-wrap gap-1.5">
                    {customCategories.map(cat => (
                      <span key={cat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">
                        {cat}
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat)}
                          className="ml-0.5 hover:text-red-500 transition-colors"
                          aria-label={`${cat}を削除`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 部門×費目サマリー（部門が設定された院のみ） */}
      {useDepartments && departmentSummary.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {departmentSummary.map((g) => (
            <Card key={g.dep} className="shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${g.dep === "未分類" ? "bg-slate-300" : "bg-emerald-500"}`} />
                  {g.dep}
                </CardTitle>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">¥{g.total.toLocaleString()}</span>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {g.categories.map(([cat, amt]) => (
                    <div key={cat} className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">{cat}</span>
                      <span className="text-slate-700 dark:text-slate-200 font-medium">¥{amt.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-2">{g.count} 件</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 入力フォーム */}
        <Card className="lg:col-span-1 shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className={`w-5 h-5 ${isIncome ? "text-sky-600" : "text-emerald-600"}`} />
              {isIncome ? "新規収入入力" : "新規経費入力"}
            </CardTitle>
            <CardDescription>{format(date, "M月d日 (E)", { locale: ja })} の{isIncome ? "収入" : "経費"}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* 種別の切り替え（支出 / 収入） */}
            <div className="mb-4 grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl">
              <button
                type="button"
                onClick={() => { setEntryType("expense"); setFormCategory(""); }}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                  !isIncome
                    ? "bg-emerald-600 text-white shadow"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                <Receipt className="w-4 h-4" /> 支出（経費）
              </button>
              <button
                type="button"
                onClick={() => { setEntryType("income"); setFormCategory(""); }}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                  isIncome
                    ? "bg-sky-600 text-white shadow"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                <Banknote className="w-4 h-4" /> 収入
              </button>
            </div>

            {/* 画像読み取りエリア（レシート＝経費のみ） */}
            {!isIncome && (
            <div className="mb-4 space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageRead}
              />

              {/* カメラビュー */}
              {cameraOpen && (
                <div className="relative rounded-xl overflow-hidden border-2 border-emerald-400 bg-black">
                  <video ref={videoRef} className="w-full max-h-56 object-cover" muted playsInline />
                  <div className="flex gap-2 p-2 bg-black/60 absolute bottom-0 left-0 right-0">
                    <button
                      type="button"
                      onClick={handleCapture}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm transition-colors"
                    >
                      <Camera className="w-4 h-4" /> 撮影する
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseCamera}
                      className="px-4 py-2.5 rounded-lg bg-white/20 text-white text-sm font-bold hover:bg-white/30 transition-colors"
                    >
                      閉じる
                    </button>
                  </div>
                </div>
              )}

              {/* 読み取り中 */}
              {isReading || isUploading ? (
                <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-bold">
                  <Loader2 className="w-4 h-4 animate-spin" /> {isUploading ? "保存中..." : "AIが読み取り中..."}
                </div>
              ) : null}

              {/* プレビュー */}
              {previewUrl && !isReading && !cameraOpen && (
                <div className="relative">
                  <img src={previewUrl} alt="レシート" className="w-full max-h-36 object-contain rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950" />
                  <button type="button" onClick={() => setPreviewUrl(null)} className="absolute top-1 right-1 bg-white dark:bg-slate-800 rounded-full w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 border border-slate-200 dark:border-slate-700 text-xs shadow">✕</button>
                </div>
              )}

              {/* 2ボタン */}
              {!cameraOpen && !isReading && !isUploading && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleOpenCamera}
                    className="flex items-center justify-center gap-1.5 py-3 rounded-xl border-2 border-blue-300 bg-blue-50 text-blue-700 font-bold text-xs hover:bg-blue-100 transition-colors"
                  >
                    <Camera className="w-4 h-4" /> PCカメラで撮影
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-1.5 py-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 text-emerald-700 font-bold text-xs hover:bg-emerald-100 transition-colors"
                  >
                    <Sparkles className="w-4 h-4" /> 画像から読み取り
                  </button>
                </div>
              )}
            </div>
            )}

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              {/* 日付（OCRで自動入力、手動でも変更可） */}
              <div className="space-y-2">
                <Label htmlFor="expense_date">{isIncome ? "収入の日付" : "経費の日付"}</Label>
                <input
                  id="expense_date"
                  name="expense_date"
                  type="date"
                  value={formExpenseDate}
                  onChange={(e) => setFormExpenseDate(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-800 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
                {!isIncome && <p className="text-xs text-slate-400">レシート読み取り時に自動入力。手動でも変更できます</p>}
              </div>
              {useDepartments && (
                <div className="space-y-2">
                  <Label htmlFor="department">部門</Label>
                  <select
                    id="department"
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-800 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">（未分類）</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="category">カテゴリ</Label>
                {isIncome ? (
                  <select
                    id="category"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-800 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">（後で決める）</option>
                    {INCOME_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                ) : (
                  <CategorySelect
                    selectId="category"
                    value={formCategory}
                    onChange={setFormCategory}
                    customCategories={customCategories}
                    onCustomCategoriesChange={setCustomCategories}
                    placeholder="（後で決める）"
                    withIcon
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">内容</Label>
                <Input id="description" name="description" placeholder={isIncome ? "物販（プロテイン）" : "電気代（3月分）"} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">金額</Label>
                <div className="relative">
                  <Receipt className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input id="amount" name="amount" type="number" placeholder="10000" className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="memo">備考（オプション）</Label>
                <Input id="memo" name="memo" placeholder="領収書あり" />
              </div>

              {/* 画像URLを hidden で送信 */}
              {currentImageUrl && <input type="hidden" name="image_url" value={currentImageUrl} />}

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  type="submit"
                  className={`w-full h-10 text-white ${isIncome ? "bg-sky-600 hover:bg-sky-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                  disabled={isPending || isSavingPending}
                >
                  {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  {isIncome ? "収入を登録する" : "正式に登録する"}
                </Button>
                {!isIncome && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 border-amber-200 text-amber-700 hover:bg-amber-50"
                  onClick={handleSavePending}
                  disabled={isPending || isSavingPending || isUploading}
                >
                  {isSavingPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  とりあえず保存（仕分け待ちへ）
                </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 経費リスト */}
        <Card className="lg:col-span-2 shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-slate-900 dark:text-slate-100">今月（{format(date, "M月")}）の記帳</CardTitle>
              <CardDescription>{expenses.length} 件の記録があります</CardDescription>
            </div>
            <div className="flex items-end gap-5">
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">今月の支出合計</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">¥{expenseTotal.toLocaleString()}</p>
              </div>
              {incomeTotal > 0 && (
                <div className="text-right">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">今月の収入合計</p>
                  <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">＋¥{incomeTotal.toLocaleString()}</p>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-slate-100 dark:border-white/5 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50/50 dark:bg-slate-800/30">
                  <TableRow>
                    <TableHead className="w-[100px]">日付</TableHead>
                    <TableHead>カテゴリ</TableHead>
                    <TableHead>内容</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-48 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-300" />
                        <p className="text-sm text-slate-400 mt-2">読み込み中...</p>
                      </TableCell>
                    </TableRow>
                  ) : expenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <Receipt className="w-12 h-12 mb-2 opacity-20" />
                          <p>記帳データがありません</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    expenses.map((expense) => {
                      const isEditing = editingRow?.id === expense.id;
                      return (
                        <TableRow key={expense.id} className={`transition-colors ${isEditing ? "bg-emerald-50" : "hover:bg-slate-50/50"}`}>
                          {isEditing ? (
                            <>
                              {/* 編集モード */}
                              <TableCell>
                                <input
                                  type="date"
                                  value={editingRow!.expense_date}
                                  onChange={(e) => setEditingRow(r => r ? { ...r, expense_date: e.target.value } : r)}
                                  className="w-full border border-emerald-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              </TableCell>
                              <TableCell>
                                {editingRow!.entry_type === "income" ? (
                                  <select
                                    value={editingRow!.category}
                                    onChange={(e) => setEditingRow(r => r ? { ...r, category: e.target.value } : r)}
                                    className="w-full border border-sky-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                                  >
                                    <option value="">未分類</option>
                                    {INCOME_CATEGORIES.map((c) => (
                                      <option key={c} value={c}>{c}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <CategorySelect
                                    value={editingRow!.category}
                                    onChange={(v) => setEditingRow(r => r ? { ...r, category: v } : r)}
                                    customCategories={customCategories}
                                    onCustomCategoriesChange={setCustomCategories}
                                    placeholder="未分類"
                                    size="compact"
                                  />
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <input
                                    type="text"
                                    value={editingRow!.description}
                                    onChange={(e) => setEditingRow(r => r ? { ...r, description: e.target.value } : r)}
                                    placeholder="内容"
                                    className="w-full border border-emerald-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                  <input
                                    type="text"
                                    value={editingRow!.memo}
                                    onChange={(e) => setEditingRow(r => r ? { ...r, memo: e.target.value } : r)}
                                    placeholder="備考"
                                    className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                  />
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <input
                                  type="number"
                                  value={editingRow!.amount}
                                  onChange={(e) => setEditingRow(r => r ? { ...r, amount: parseInt(e.target.value) || 0 } : r)}
                                  className="w-24 border border-emerald-300 rounded px-1.5 py-1 text-xs text-right font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex flex-col gap-1">
                                  <Button
                                    size="sm"
                                    className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={handleSaveEdit}
                                    disabled={isSavingEdit}
                                  >
                                    {isSavingEdit ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                                    保存
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-3 text-xs text-slate-400 hover:bg-slate-100"
                                    onClick={() => setEditingRow(null)}
                                  >
                                    キャンセル
                                  </Button>
                                </div>
                              </TableCell>
                            </>
                          ) : (
                            <>
                              {/* 通常表示 */}
                              <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                                {expense.expense_date}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1 flex-wrap">
                                  {expense.entry_type === "income" && (
                                    <span className="text-xs bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 px-2 py-1 rounded-full font-bold">
                                      収入
                                    </span>
                                  )}
                                  {useDepartments && expense.department && (
                                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-medium">
                                      {expense.department}
                                    </span>
                                  )}
                                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                    expense.entry_type === "income"
                                      ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                                      : "bg-emerald-50 text-emerald-700"
                                  }`}>
                                    {expense.category || "未分類"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="font-medium text-sm">{expense.description || "-"}</div>
                                  {expense.image_url && (
                                    <div className="relative group shrink-0">
                                      <a 
                                        href={expense.image_url} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 border border-emerald-100 text-emerald-600 hover:bg-emerald-100 transition-colors"
                                      >
                                        <Receipt className="w-4 h-4" />
                                        <span className="text-[10px] font-bold">写真を確認</span>
                                      </a>
                                      {/* ホバープレビュー（簡易実装） */}
                                      <div className="invisible group-hover:visible absolute bottom-full left-0 mb-2 z-50 p-1 bg-white border border-slate-200 shadow-xl rounded-lg w-40 h-40 transition-all opacity-0 group-hover:opacity-100">
                                        <div className="relative w-full h-full rounded overflow-hidden">
                                          <Image src={expense.image_url} alt="領収書プレビュー" fill className="object-cover" />
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                {expense.memo && <div className="text-xs text-slate-400 mt-0.5">{expense.memo}</div>}
                              </TableCell>
                              <TableCell className={`text-right font-bold ${expense.entry_type === "income" ? "text-sky-600 dark:text-sky-400" : "text-slate-700 dark:text-slate-200"}`}>
                                {expense.entry_type === "income" ? "＋" : ""}¥{expense.amount.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-7 h-7 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all rounded-full"
                                    onClick={() => handleStartEdit(expense)}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-7 h-7 text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all rounded-full"
                                    onClick={() => handleDelete(expense.id)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <ExpensesImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => { setImportOpen(false); if (date) fetchExpenses(date); }}
      />
    </div>
  );
}
