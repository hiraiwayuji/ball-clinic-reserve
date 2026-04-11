"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { format, startOfMonth } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Plus, Trash2, Loader2, Landmark, Calendar as CalendarIcon,
  Camera, Sparkles, BookOpen, CheckCircle2, Circle, Image as ImageIcon,
  Pencil, Check, X
} from "lucide-react";
import {
  addInsurancePayment, getInsurancePayments,
  deleteInsurancePayment, updateInsurancePassbookCheck, updateInsurancePayment
} from "@/app/actions/sales";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export default function InsurancePage() {
  const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // 編集状態
  const [editingRow, setEditingRow] = useState<{
    id: string; insurance_name: string; amount: string; payment_date: string; notes: string;
  } | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // OCR states
  const [isReading, setIsReading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [formPaymentDate, setFormPaymentDate] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const m = startOfMonth(new Date());
    setCurrentMonth(m);
    setFormPaymentDate(format(new Date(), "yyyy-MM-dd"));
  }, []);

  const fetchPayments = async (m: Date) => {
    setLoading(true);
    const monthStr = format(m, "yyyy-MM-01");
    const res = await getInsurancePayments(monthStr);
    if (res.success) setPayments(res.data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (currentMonth) fetchPayments(currentMonth);
  }, [currentMonth]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentMonth) return;
    const formData = new FormData(e.currentTarget);
    formData.set("payment_month", format(currentMonth, "yyyy-MM-01"));
    formData.set("payment_date", formPaymentDate);
    if (currentImageUrl) formData.set("image_url", currentImageUrl);

    startTransition(async () => {
      const res = await addInsurancePayment(formData);
      if (res.success) {
        toast.success("登録しました");
        (e.target as HTMLFormElement).reset();
        setFormPaymentDate(format(new Date(), "yyyy-MM-dd"));
        setCurrentImageUrl(null);
        setPreviewUrl(null);
        fetchPayments(currentMonth!);
      } else {
        toast.error(res.error || "エラーが発生しました");
      }
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除してよろしいですか？")) return;
    const res = await deleteInsurancePayment(id);
    if (res.success) {
      toast.success("削除しました");
      if (currentMonth) fetchPayments(currentMonth);
    } else {
      toast.error(res.error || "削除に失敗しました");
    }
  };

  const handleStartEdit = (p: any) => {
    setEditingRow({
      id: p.id,
      insurance_name: p.insurance_name,
      amount: String(p.amount),
      payment_date: p.payment_date || "",
      notes: p.notes || "",
    });
  };

  const handleCancelEdit = () => setEditingRow(null);

  const handleSaveEdit = async () => {
    if (!editingRow || !currentMonth) return;
    setIsSavingEdit(true);
    const res = await updateInsurancePayment(editingRow.id, {
      insurance_name: editingRow.insurance_name,
      amount: parseInt(editingRow.amount, 10) || 0,
      payment_date: editingRow.payment_date || null,
      notes: editingRow.notes || null,
    });
    setIsSavingEdit(false);
    if (res.success) {
      toast.success("更新しました");
      setEditingRow(null);
      fetchPayments(currentMonth);
    } else {
      toast.error(res.error || "更新に失敗しました");
    }
  };

  const handlePassbookToggle = async (id: string, current: boolean) => {
    setPayments(prev => prev.map(p => p.id === id ? { ...p, passbook_checked: !current } : p));
    const res = await updateInsurancePassbookCheck(id, !current);
    if (!res.success) {
      setPayments(prev => prev.map(p => p.id === id ? { ...p, passbook_checked: current } : p));
      toast.error("更新に失敗しました");
    } else {
      toast.success(!current ? "通帳確認済みにしました" : "未確認に戻しました");
    }
  };

  // OCR: Geminiで振込通知書を読み取る
  const analyzeAndFill = async (base64: string, mimeType: string, objectUrl?: string, file?: File) => {
    setIsReading(true);
    setIsUploading(true);
    if (objectUrl) setPreviewUrl(objectUrl);

    try {
      // Supabase Storageにアップロード
      const supabase = createClient();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`;
      const filePath = `insurance-notices/${fileName}`;

      let uploadFile: any = file;
      if (!uploadFile) {
        const byteCharacters = atob(base64);
        const byteArray = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
        uploadFile = new Blob([byteArray], { type: mimeType });
      }

      const { error: uploadErr } = await supabase.storage
        .from("expense-receipts")
        .upload(filePath, uploadFile);

      if (!uploadErr) {
        const { data: { publicUrl } } = supabase.storage
          .from("expense-receipts")
          .getPublicUrl(filePath);
        setCurrentImageUrl(publicUrl);
      }

      // Gemini解析
      const res = await fetch("/api/read-insurance-notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mimeType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "読み取り失敗");

      const form = formRef.current;
      if (form) {
        if (json.insurance_name) {
          const inp = form.elements.namedItem("insurance_name") as HTMLInputElement;
          if (inp) inp.value = json.insurance_name;
        }
        if (json.amount) {
          const inp = form.elements.namedItem("amount") as HTMLInputElement;
          if (inp) inp.value = String(json.amount);
        }
        if (json.payment_date) setFormPaymentDate(json.payment_date);
        if (json.notes) {
          const inp = form.elements.namedItem("notes") as HTMLInputElement;
          if (inp) inp.value = json.notes;
        }
      }
      toast.success("振込通知書を読み取りました。内容を確認してください。");
    } catch (err: any) {
      toast.error("読み取りに失敗しました: " + (err.message || ""));
    } finally {
      setIsReading(false);
      setIsUploading(false);
    }
  };

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

  const handleOpenCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      }, 100);
    } catch {
      toast.error("カメラへのアクセスが許可されていません。");
    }
  };

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

  const handleCloseCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  if (!currentMonth) return <div className="p-8 text-center text-slate-500">読み込み中...</div>;

  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
  const checkedAmount = payments.filter(p => p.passbook_checked).reduce((sum, p) => sum + p.amount, 0);
  const uncheckedCount = payments.filter(p => !p.passbook_checked).length;

  return (
    <div className="space-y-6 container mx-auto py-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">保険入金管理</h1>
          <p className="text-slate-500 dark:text-slate-400">振込通知書の写真から自動入力・通帳との照合ができます</p>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2 border dark:border-slate-800 rounded-lg shadow-sm">
          <CalendarIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <input
            type="month"
            className="border-none focus:ring-0 text-sm font-medium bg-transparent dark:text-slate-100"
            value={format(currentMonth, "yyyy-MM")}
            onChange={(e) => setCurrentMonth(startOfMonth(new Date(e.target.value + "-01")))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 入力フォーム */}
        <Card className="lg:col-span-1 shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50 h-fit">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              入金データ入力
            </CardTitle>
            <CardDescription>{format(currentMonth, "yyyy年M月", { locale: ja })}分の入金</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 写真読み取りボタン */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">振込通知書・通帳の写真から自動入力</Label>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageRead}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 h-11 font-bold"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isReading || isUploading}
                >
                  {isReading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />読み取り中...</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" />写真を選択</>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50"
                  onClick={handleOpenCamera}
                  disabled={isReading || cameraOpen}
                >
                  <Camera className="w-4 h-4" />
                </Button>
              </div>

              {/* カメラプレビュー */}
              {cameraOpen && (
                <div className="rounded-xl overflow-hidden border border-blue-200 dark:border-blue-800 relative">
                  <video ref={videoRef} className="w-full rounded-xl" playsInline muted />
                  <div className="absolute bottom-2 inset-x-2 flex gap-2">
                    <Button type="button" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-9 text-sm font-bold" onClick={handleCapture}>
                      撮影する
                    </Button>
                    <Button type="button" variant="outline" className="h-9 text-sm" onClick={handleCloseCamera}>
                      キャンセル
                    </Button>
                  </div>
                </div>
              )}

              {/* 画像プレビュー */}
              {previewUrl && !isReading && !cameraOpen && (
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="通知書プレビュー" className="w-full max-h-40 object-contain bg-slate-50 dark:bg-slate-800" />
                  <button
                    type="button"
                    onClick={() => { setPreviewUrl(null); setCurrentImageUrl(null); }}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-black/70"
                  >×</button>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 dark:border-white/5 pt-4">
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="insurance_name">保険種別・保険名</Label>
                  <div className="relative">
                    <Landmark className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      id="insurance_name"
                      name="insurance_name"
                      placeholder="協会けんぽ, 国保, 共済等"
                      className="pl-9"
                      required
                      list="insurance-types"
                    />
                    <datalist id="insurance-types">
                      <option value="協会けんぽ" />
                      <option value="国民健康保険" />
                      <option value="後期高齢者" />
                      <option value="共済組合" />
                      <option value="自賠責" />
                      <option value="労災" />
                    </datalist>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">振込金額</Label>
                  <div className="relative">
                    <p className="absolute left-3 top-2 text-slate-400 font-bold text-lg">¥</p>
                    <Input id="amount" name="amount" type="number" placeholder="50000" className="pl-9" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment_date">振込日</Label>
                  <Input
                    id="payment_date"
                    name="payment_date"
                    type="date"
                    value={formPaymentDate}
                    onChange={(e) => setFormPaymentDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">メモ（任意）</Label>
                  <Input id="notes" name="notes" placeholder="療養費・施術料の内訳など" />
                </div>
                {currentImageUrl && <input type="hidden" name="image_url" value={currentImageUrl} />}
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 h-10" disabled={isPending}>
                  {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  保存する
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        {/* 右カラム */}
        <div className="lg:col-span-2 space-y-4">
          {/* 通帳チェック サマリ */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
              <CardContent className="pt-4 pb-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">入金合計</p>
                <p className="text-xl font-black text-slate-800 dark:text-slate-100">¥{totalAmount.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30">
              <CardContent className="pt-4 pb-3">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">通帳確認済</p>
                <p className="text-xl font-black text-emerald-700 dark:text-emerald-400">¥{checkedAmount.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className={`shadow-sm ${uncheckedCount > 0 ? "border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30" : "border-slate-200 dark:border-white/10 dark:bg-slate-900/50"}`}>
              <CardContent className="pt-4 pb-3">
                <p className={`text-[10px] font-black uppercase tracking-wider ${uncheckedCount > 0 ? "text-amber-600" : "text-slate-400"}`}>未確認件数</p>
                <p className={`text-xl font-black ${uncheckedCount > 0 ? "text-amber-700 dark:text-amber-400" : "text-slate-400"}`}>{uncheckedCount}件</p>
              </CardContent>
            </Card>
          </div>

          {/* 入金一覧 */}
          <Card className="shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle>{format(currentMonth, "yyyy年M月")} 入金内訳</CardTitle>
                <CardDescription>{payments.length} 件の登録済みデータ</CardDescription>
              </div>
              {uncheckedCount > 0 && (
                <Badge variant="outline" className="border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400 font-bold">
                  <BookOpen className="w-3 h-3 mr-1" />
                  通帳照合 {uncheckedCount}件未完了
                </Badge>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50/50 dark:bg-slate-800/30">
                    <TableRow className="border-b dark:border-white/5">
                      <TableHead className="w-[36px]"></TableHead>
                      <TableHead>保険種別・名称</TableHead>
                      <TableHead className="hidden sm:table-cell">振込日</TableHead>
                      <TableHead className="text-right">金額</TableHead>
                      <TableHead className="text-center w-[90px]">通帳確認</TableHead>
                      <TableHead className="w-[48px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-48 text-center text-slate-400 text-sm animate-pulse">
                          データを読み込み中...
                        </TableCell>
                      </TableRow>
                    ) : payments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-48 text-center">
                          <div className="flex flex-col items-center justify-center text-slate-400">
                            <Landmark className="w-12 h-12 mb-2 opacity-20" />
                            <p>この期間のデータはありません</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      payments.map((p) => {
                        const isEditing = editingRow?.id === p.id;
                        return (
                          <TableRow
                            key={p.id}
                            className={`transition-colors border-b dark:border-white/5 ${isEditing ? "bg-blue-50/60 dark:bg-blue-950/20" : p.passbook_checked ? "bg-emerald-50/50 dark:bg-emerald-950/20" : "hover:bg-slate-50/50 dark:hover:bg-slate-800/30"}`}
                          >
                            {/* 画像アイコン */}
                            <TableCell className="pr-0">
                              {p.image_url ? (
                                <a href={p.image_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-600">
                                  <ImageIcon className="w-4 h-4" />
                                </a>
                              ) : (
                                <span className="text-slate-200 dark:text-slate-700"><ImageIcon className="w-4 h-4" /></span>
                              )}
                            </TableCell>

                            {/* 保険名・メモ */}
                            <TableCell>
                              {isEditing ? (
                                <div className="space-y-1">
                                  <Input
                                    value={editingRow!.insurance_name}
                                    onChange={(e) => setEditingRow(prev => prev ? { ...prev, insurance_name: e.target.value } : prev)}
                                    className="h-7 text-sm px-2 py-0"
                                    list="insurance-types-edit"
                                  />
                                  <datalist id="insurance-types-edit">
                                    <option value="協会けんぽ" /><option value="国民健康保険" />
                                    <option value="後期高齢者" /><option value="共済組合" />
                                    <option value="自賠責" /><option value="労災" />
                                  </datalist>
                                  <Input
                                    value={editingRow!.notes}
                                    onChange={(e) => setEditingRow(prev => prev ? { ...prev, notes: e.target.value } : prev)}
                                    placeholder="メモ（任意）"
                                    className="h-7 text-xs px-2 py-0"
                                  />
                                </div>
                              ) : (
                                <>
                                  <p className="font-medium text-slate-700 dark:text-slate-300">{p.insurance_name}</p>
                                  {p.notes && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[160px]">{p.notes}</p>}
                                </>
                              )}
                            </TableCell>

                            {/* 振込日 */}
                            <TableCell className="hidden sm:table-cell">
                              {isEditing ? (
                                <Input
                                  type="date"
                                  value={editingRow!.payment_date}
                                  onChange={(e) => setEditingRow(prev => prev ? { ...prev, payment_date: e.target.value } : prev)}
                                  className="h-7 text-sm px-2 py-0 w-32"
                                />
                              ) : (
                                <span className="text-sm text-slate-500 dark:text-slate-400">
                                  {p.payment_date ? format(new Date(p.payment_date), "M/d") : "—"}
                                </span>
                              )}
                            </TableCell>

                            {/* 金額 */}
                            <TableCell className="text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  value={editingRow!.amount}
                                  onChange={(e) => setEditingRow(prev => prev ? { ...prev, amount: e.target.value } : prev)}
                                  className="h-7 text-sm px-2 py-0 text-right w-28 ml-auto"
                                />
                              ) : (
                                <span className="font-bold text-slate-800 dark:text-slate-200">¥{p.amount.toLocaleString()}</span>
                              )}
                            </TableCell>

                            {/* 通帳確認 */}
                            <TableCell className="text-center">
                              <button
                                type="button"
                                disabled={isEditing}
                                onClick={() => handlePassbookToggle(p.id, p.passbook_checked)}
                                className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full transition-colors ${
                                  p.passbook_checked
                                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-400"
                                    : "bg-slate-100 text-slate-400 hover:bg-amber-100 hover:text-amber-600 dark:bg-slate-800 dark:hover:bg-amber-900/40"
                                } disabled:opacity-40`}
                              >
                                {p.passbook_checked
                                  ? <><CheckCircle2 className="w-3.5 h-3.5" />確認済</>
                                  : <><Circle className="w-3.5 h-3.5" />未確認</>
                                }
                              </button>
                            </TableCell>

                            {/* 操作ボタン */}
                            <TableCell className="text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-full"
                                    onClick={handleSaveEdit}
                                    disabled={isSavingEdit}
                                  >
                                    {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                  </Button>
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
                                    onClick={handleCancelEdit}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-8 w-8 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-full"
                                    onClick={() => handleStartEdit(p)}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-8 w-8 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full"
                                    onClick={() => handleDelete(p.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* 通帳チェック完了メッセージ */}
              {payments.length > 0 && uncheckedCount === 0 && (
                <div className="p-4 text-center text-sm text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center gap-2 bg-emerald-50/50 dark:bg-emerald-950/20 border-t border-emerald-100 dark:border-emerald-900/30">
                  <CheckCircle2 className="w-4 h-4" />
                  すべての入金を通帳で確認済みです
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
