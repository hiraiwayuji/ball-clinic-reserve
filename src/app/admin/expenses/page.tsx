"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar as CalendarIcon, Plus, Trash2, Loader2, Receipt, Tag, AlertCircle, Save, Camera, Sparkles, Pencil, Check, X } from "lucide-react";
import { addExpense, getExpenses, deleteExpense, addPendingExpense, updateExpense } from "@/app/actions/sales";
import { toast } from "sonner";
import Link from "next/link";

const EXPENSE_CATEGORIES = [
  "光熱費",
  "消耗品",
  "備品購入",
  "交通費",
  "通信費",
  "家賃",
  "広告費",
  "教育・研修",
  "リース料",
  "雑費",
  "その他",
];

type EditingState = {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  memo: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setDate(new Date());
  }, []);

  const fetchExpenses = async (d: Date) => {
    setLoading(true);
    const dateStr = format(d, "yyyy-MM-dd");
    const res = await getExpenses(dateStr);
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
    // expense_date field in form takes priority; fallback to header date
    if (!formData.get("expense_date")) {
      formData.set("expense_date", format(date, "yyyy-MM-dd"));
    }

    startTransition(async () => {
      const res = await addExpense(formData);
      if (res.success) {
        toast.success("経費を登録しました");
        (e.target as HTMLFormElement).reset();
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
      expense_date: (formData.get("expense_date") as string) || format(date, "yyyy-MM-dd"),
      category: formData.get("category"),
      description: formData.get("description"),
      amount: parseInt(formData.get("amount") as string) || 0,
      memo: formData.get("memo")
    };

    setIsSavingPending(true);
    const res = await addPendingExpense(null, triageData);
    setIsSavingPending(false);

    if (res.success) {
      toast.success("保留経費として保存しました");
      form.reset();
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
  const analyzeAndFill = async (base64: string, mimeType: string, objectUrl?: string) => {
    setIsReading(true);
    if (objectUrl) setPreviewUrl(objectUrl);
    try {
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
        if (json.expense_date) (form.elements.namedItem("expense_date") as HTMLInputElement).value = json.expense_date;
        if (json.category) {
          const sel = form.elements.namedItem("category") as HTMLSelectElement;
          const opt = Array.from(sel.options).find(o => o.value === json.category);
          if (opt) sel.value = json.category;
        }
      }
      toast.success("レシートを読み取りました。内容を確認してください。");
    } catch (err: any) {
      toast.error("読み取りに失敗しました: " + (err.message || ""));
    } finally {
      setIsReading(false);
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
    await analyzeAndFill(base64, file.type, objectUrl);
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

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  if (!date) {
    return <div className="p-8 text-center text-slate-500">読み込み中...</div>;
  }

  return (
    <div className="space-y-6 container mx-auto py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">経費入力</h1>
          <p className="text-slate-500">備品購入・光熱費などの経費を記録します</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/expenses/triage">
            <Button variant="outline" className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              仕分け待ちを確認
            </Button>
          </Link>
          <div className="flex items-center gap-2 bg-white p-2 border rounded-lg shadow-sm">
            <CalendarIcon className="w-5 h-5 text-emerald-600" />
            <input
              type="date"
              className="border-none focus:ring-0 text-sm font-medium"
              value={format(date, "yyyy-MM-dd")}
              onChange={(e) => setDate(new Date(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 入力フォーム */}
        <Card className="lg:col-span-1 shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-600" />
              新規経費入力
            </CardTitle>
            <CardDescription>{format(date, "M月d日 (E)", { locale: ja })} の経費</CardDescription>
          </CardHeader>
          <CardContent>
            {/* 画像読み取りエリア */}
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
              {isReading && (
                <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-bold">
                  <Loader2 className="w-4 h-4 animate-spin" /> AIが読み取り中...
                </div>
              )}

              {/* プレビュー */}
              {previewUrl && !isReading && !cameraOpen && (
                <div className="relative">
                  <img src={previewUrl} alt="レシート" className="w-full max-h-36 object-contain rounded-xl border border-slate-200 bg-slate-50" />
                  <button type="button" onClick={() => setPreviewUrl(null)} className="absolute top-1 right-1 bg-white rounded-full w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 border border-slate-200 text-xs shadow">✕</button>
                </div>
              )}

              {/* 2ボタン */}
              {!cameraOpen && !isReading && (
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

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              {/* 日付（OCRで自動入力、手動でも変更可） */}
              <div className="space-y-2">
                <Label htmlFor="expense_date">経費の日付</Label>
                <input
                  id="expense_date"
                  name="expense_date"
                  type="date"
                  defaultValue={format(date, "yyyy-MM-dd")}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <p className="text-xs text-slate-400">レシート読み取り時に自動入力されます</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">カテゴリ</Label>
                <div className="relative">
                  <Tag className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <select
                    id="category"
                    name="category"
                    className="w-full border border-slate-200 rounded-md pl-9 pr-3 py-2 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="">（後で決める）</option>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">内容</Label>
                <Input id="description" name="description" placeholder="電気代（3月分）" />
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

              <div className="flex flex-col gap-2 pt-2">
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 h-10" disabled={isPending || isSavingPending}>
                  {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  正式に登録する
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 border-amber-200 text-amber-700 hover:bg-amber-50"
                  onClick={handleSavePending}
                  disabled={isPending || isSavingPending}
                >
                  {isSavingPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  とりあえず保存（仕分け待ちへ）
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 経費リスト */}
        <Card className="lg:col-span-2 shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>本日（{format(date, "M/d")}）の確定済み経費</CardTitle>
              <CardDescription>{expenses.length} 件の記録があります</CardDescription>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 font-medium">本日経費合計</p>
              <p className="text-2xl font-bold text-emerald-600">¥{totalAmount.toLocaleString()}</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-slate-100 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50/50">
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
                          <p>経費データがありません</p>
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
                                <select
                                  value={editingRow!.category}
                                  onChange={(e) => setEditingRow(r => r ? { ...r, category: e.target.value } : r)}
                                  className="w-full border border-emerald-300 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                >
                                  <option value="">未分類</option>
                                  {EXPENSE_CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                </select>
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
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-7 h-7 text-emerald-600 hover:bg-emerald-100"
                                    onClick={handleSaveEdit}
                                    disabled={isSavingEdit}
                                  >
                                    {isSavingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-7 h-7 text-slate-400 hover:bg-slate-100"
                                    onClick={() => setEditingRow(null)}
                                  >
                                    <X className="w-3.5 h-3.5" />
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
                                <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full font-medium">
                                  {expense.category || "未分類"}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-sm">{expense.description || "-"}</div>
                                {expense.memo && <div className="text-xs text-slate-400">{expense.memo}</div>}
                              </TableCell>
                              <TableCell className="text-right font-bold text-slate-700">¥{expense.amount.toLocaleString()}</TableCell>
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
    </div>
  );
}
