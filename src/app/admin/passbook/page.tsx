"use client";

import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, Camera, Sparkles, Loader2, Coins, Receipt, Landmark,
  CheckCircle2, AlertTriangle, Trash2, ChevronDown, ChevronUp, History,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BASE_EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { getCustomExpenseCategories } from "@/app/actions/settings";
import {
  analyzePassbookRows, importPassbookRows, getPassbookHistory, deletePassbookEntry,
  type PassbookRowAnalysis, type PassbookImportItem,
} from "@/app/actions/passbook";
import {
  PASSBOOK_KIND_LABELS, looksLikeInsuranceDeposit,
  type PassbookKind, type PassbookOcrRow, type PassbookRow,
} from "@/lib/passbook";

const INCOME_CATEGORIES = ["物販", "自販機", "雑収入", "受取手数料", "受取利息", "その他収入"];

type SheetRow = {
  ocr: PassbookOcrRow;
  analysis: PassbookRowAnalysis;
  checked: boolean;
  kind: PassbookKind;
  category: string;
  insuranceName: string;
  insurancePaymentMonth: string;
};

const yen = (n: number) => "¥" + n.toLocaleString();

/** 対象月セレクタの候補：振込月とその前6ヶ月 */
function monthOptions(entryDate: string): string[] {
  const base = new Date(entryDate + "T00:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    return format(d, "yyyy-MM-01");
  });
}

export default function PassbookPage() {
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const allCategories = [...BASE_EXPENSE_CATEGORIES, ...customCategories];

  useEffect(() => {
    getCustomExpenseCategories().then(setCustomCategories).catch(() => {});
    getPassbookHistory(100).then((r) => setHistory(r.data ?? []));
  }, []);

  const buildSheet = (ocrRows: PassbookOcrRow[], analyses: PassbookRowAnalysis[]): SheetRow[] =>
    ocrRows.map((ocr, i) => {
      const analysis = analyses[i];
      // AIが保険と気づかなかった入金でも、摘要が保険っぽければ保険入金に寄せる
      const kind: PassbookKind =
        ocr.kind === "income" && (analysis.insuranceMatch || looksLikeInsuranceDeposit(ocr))
          ? "insurance"
          : ocr.kind;

      // 既定でチェックを入れるのは、取り込んで安全なものだけ。
      // 取込済み・二重計上の疑い・対象外・保険以外の入金（受付の売上と二重になる）は外しておく。
      const checked =
        analysis.importedAs === null &&
        (kind === "insurance" || (kind === "expense" && analysis.expenseDuplicates.length === 0));

      return {
        ocr,
        analysis,
        checked,
        kind,
        category: ocr.category || (kind === "income" ? "雑収入" : "その他"),
        insuranceName: analysis.insuranceMatch?.insurance_name || ocr.description || "保険入金",
        insurancePaymentMonth: `${ocr.entry_date.slice(0, 7)}-01`,
      };
    });

  const analyzeImage = async (base64: string, mimeType: string, objectUrl?: string, file?: File) => {
    setIsReading(true);
    if (objectUrl) setPreviewUrl(objectUrl);
    setRows([]);

    try {
      // 画像をStorageへ（証拠として経費・保険入金に紐づける。失敗しても読み取りは続ける）
      const supabase = createClient();
      const filePath = `passbook/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`;
      let uploadFile: Blob | File | undefined = file;
      if (!uploadFile) {
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        uploadFile = new Blob([bytes], { type: mimeType });
      }
      const { error: uploadErr } = await supabase.storage
        .from("expense-receipts")
        .upload(filePath, uploadFile);
      if (!uploadErr) {
        const { data } = supabase.storage.from("expense-receipts").getPublicUrl(filePath);
        setImageUrl(data.publicUrl);
      }

      const res = await fetch("/api/read-passbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mimeType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "読み取りに失敗しました");

      const ocrRows: PassbookOcrRow[] = json.rows;
      const plain: PassbookRow[] = ocrRows.map((r) => ({
        entry_date: r.entry_date,
        description: r.description,
        deposit: r.deposit,
        withdrawal: r.withdrawal,
        balance: r.balance,
      }));
      const analysis = await analyzePassbookRows(plain);
      if (!analysis.success) throw new Error(analysis.error || "照合に失敗しました");

      const sheet = buildSheet(ocrRows, analysis.data);
      setRows(sheet);

      const already = sheet.filter((r) => r.analysis.importedAs !== null).length;
      toast.success(
        `${sheet.length}件の明細を読み取りました` + (already > 0 ? `（うち${already}件は取込済み）` : "")
      );
    } catch (err: any) {
      toast.error(err.message || "読み取りに失敗しました");
    } finally {
      setIsReading(false);
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await analyzeImage(base64, file.type, objectUrl, file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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

  const handleCloseCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    handleCloseCamera();
    await analyzeImage(dataUrl.split(",")[1], "image/jpeg", dataUrl);
  };

  const patchRow = (i: number, patch: Partial<SheetRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const selected = rows.filter((r) => r.checked);

  const handleImport = async () => {
    if (selected.length === 0) return;
    setIsImporting(true);
    const items: PassbookImportItem[] = selected.map((r) => ({
      row: {
        entry_date: r.ocr.entry_date,
        description: r.ocr.description,
        deposit: r.ocr.deposit,
        withdrawal: r.ocr.withdrawal,
        balance: r.ocr.balance,
      },
      kind: r.kind,
      category: r.category,
      insuranceName: r.insuranceName,
      insurancePaymentMonth: r.insurancePaymentMonth,
      insuranceMatchId: r.kind === "insurance" ? r.analysis.insuranceMatch?.id ?? null : null,
      imageUrl,
    }));

    const res = await importPassbookRows(items);
    setIsImporting(false);

    if (!res.success) {
      toast.error(res.error || "取り込みに失敗しました");
      return;
    }
    const s = res.summary!;
    const parts = [
      s.expenseCount > 0 && `経費${s.expenseCount}件`,
      s.incomeCount > 0 && `その他収入${s.incomeCount}件`,
      s.insuranceCheckedCount > 0 && `保険入金の通帳確認${s.insuranceCheckedCount}件`,
      s.insuranceNewCount > 0 && `保険入金の新規登録${s.insuranceNewCount}件`,
      s.ignoreCount > 0 && `対象外${s.ignoreCount}件`,
    ].filter(Boolean);
    toast.success("取り込みました：" + parts.join(" / "));

    // 取込済みの表示に切り替える（同じ画面から二度取り込めないように）
    setRows((prev) =>
      prev.map((r) =>
        r.checked
          ? { ...r, checked: false, analysis: { ...r.analysis, importedAs: r.kind } }
          : r
      )
    );
    getPassbookHistory(100).then((h) => setHistory(h.data ?? []));
  };

  const handleDeleteHistory = async (id: string) => {
    if (!confirm("この取込記録を消すと、同じ行をもう一度読み込めるようになります。\n登録済みの経費・保険入金は消えません。よろしいですか？")) return;
    const res = await deletePassbookEntry(id);
    if (res.success) {
      toast.success("取込記録を削除しました");
      setHistory((prev) => prev.filter((h) => h.id !== id));
    } else {
      toast.error(res.error || "削除に失敗しました");
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">通帳読み取り</h1>
            <p className="text-xs text-slate-500">通帳の写真から、経費と保険入金をまとめて取り込みます</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/sales">
            <Button variant="outline" size="sm" className="font-bold"><Coins className="w-4 h-4 mr-1.5" />売上記帳へ</Button>
          </Link>
          <Link href="/admin/expenses">
            <Button variant="outline" size="sm" className="border-emerald-200 text-emerald-600 hover:bg-emerald-50 font-bold"><Receipt className="w-4 h-4 mr-1.5" />経費記帳へ</Button>
          </Link>
          <Link href="/admin/insurance">
            <Button variant="outline" size="sm" className="border-blue-200 text-blue-600 hover:bg-blue-50 font-bold"><Landmark className="w-4 h-4 mr-1.5" />保険入金へ</Button>
          </Link>
        </div>
      </div>

      {/* STEP 1 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
            通帳の写真を撮る
          </CardTitle>
          <CardDescription className="text-xs">
            見開きのまま、明細の文字がはっきり写るように撮ってください。1枚ずつ読み取ります。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFilePick} />

          {cameraOpen && (
            <div className="relative rounded-xl overflow-hidden border-2 border-indigo-400 bg-black">
              <video ref={videoRef} className="w-full max-h-80 object-contain" muted playsInline />
              <div className="flex gap-2 p-2 bg-black/60 absolute bottom-0 left-0 right-0">
                <button type="button" onClick={handleCapture} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm">
                  <Camera className="w-4 h-4" /> 撮影する
                </button>
                <button type="button" onClick={handleCloseCamera} className="px-4 py-2.5 rounded-lg bg-white/20 text-white text-sm font-bold hover:bg-white/30">
                  閉じる
                </button>
              </div>
            </div>
          )}

          {isReading && (
            <div className="flex items-center justify-center gap-2 py-4 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm font-bold">
              <Loader2 className="w-4 h-4 animate-spin" /> AIが通帳を読み取っています...
            </div>
          )}

          {previewUrl && !isReading && !cameraOpen && (
            <div className="relative">
              <img src={previewUrl} alt="通帳" className="w-full max-h-48 object-contain rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950" />
            </div>
          )}

          {!cameraOpen && !isReading && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={handleOpenCamera} className="flex items-center justify-center gap-1.5 py-3 rounded-xl border-2 border-blue-300 bg-blue-50 text-blue-700 font-bold text-xs hover:bg-blue-100">
                <Camera className="w-4 h-4" /> カメラで撮影
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center gap-1.5 py-3 rounded-xl border-2 border-indigo-300 bg-indigo-50 text-indigo-700 font-bold text-xs hover:bg-indigo-100">
                <Sparkles className="w-4 h-4" /> 写真から読み取り
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* STEP 2 */}
      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
              取り込む行を選ぶ
            </CardTitle>
            <CardDescription className="text-xs">
              チェックが入っている行だけを取り込みます。AIの読み間違いがないか、金額と種別を確かめてください。
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800">
                  <tr className="text-slate-500 text-left">
                    <th className="p-2 w-10"></th>
                    <th className="p-2 whitespace-nowrap">日付</th>
                    <th className="p-2 min-w-[140px]">摘要</th>
                    <th className="p-2 text-right whitespace-nowrap">入金</th>
                    <th className="p-2 text-right whitespace-nowrap">出金</th>
                    <th className="p-2 min-w-[110px]">これは何？</th>
                    <th className="p-2 min-w-[150px]">内訳</th>
                    <th className="p-2 min-w-[160px]">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const imported = r.analysis.importedAs !== null;
                    const dup = r.kind === "expense" && r.analysis.expenseDuplicates.length > 0;
                    return (
                      <tr
                        key={i}
                        className={`border-b border-slate-100 dark:border-slate-800 align-top ${imported ? "opacity-45" : ""} ${r.checked ? "bg-indigo-50/40 dark:bg-indigo-950/20" : ""}`}
                      >
                        <td className="p-2">
                          <input
                            type="checkbox"
                            className="w-4 h-4 accent-indigo-600 cursor-pointer"
                            checked={r.checked}
                            onChange={(e) => patchRow(i, { checked: e.target.checked })}
                          />
                        </td>
                        <td className="p-2 whitespace-nowrap tabular-nums">{r.ocr.entry_date.slice(5)}</td>
                        <td className="p-2 break-all">{r.ocr.description || "—"}</td>
                        <td className="p-2 text-right tabular-nums font-bold text-blue-600 dark:text-blue-400">
                          {r.ocr.deposit > 0 ? yen(r.ocr.deposit) : ""}
                        </td>
                        <td className="p-2 text-right tabular-nums font-bold text-slate-700 dark:text-slate-300">
                          {r.ocr.withdrawal > 0 ? yen(r.ocr.withdrawal) : ""}
                        </td>
                        <td className="p-2">
                          <select
                            value={r.kind}
                            onChange={(e) => patchRow(i, { kind: e.target.value as PassbookKind })}
                            className="w-full border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-slate-950"
                          >
                            {(Object.keys(PASSBOOK_KIND_LABELS) as PassbookKind[]).map((k) => (
                              <option key={k} value={k}>{PASSBOOK_KIND_LABELS[k]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 space-y-1">
                          {r.kind === "expense" && (
                            <select
                              value={r.category}
                              onChange={(e) => patchRow(i, { category: e.target.value })}
                              className="w-full border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-slate-950"
                            >
                              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          )}
                          {r.kind === "income" && (
                            <select
                              value={r.category}
                              onChange={(e) => patchRow(i, { category: e.target.value })}
                              className="w-full border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-slate-950"
                            >
                              {INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          )}
                          {r.kind === "insurance" && !r.analysis.insuranceMatch && (
                            <>
                              <input
                                value={r.insuranceName}
                                onChange={(e) => patchRow(i, { insuranceName: e.target.value })}
                                placeholder="保険の名前"
                                className="w-full border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-slate-950"
                              />
                              <select
                                value={r.insurancePaymentMonth}
                                onChange={(e) => patchRow(i, { insurancePaymentMonth: e.target.value })}
                                className="w-full border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs bg-white dark:bg-slate-950"
                              >
                                {monthOptions(r.ocr.entry_date).map((m) => (
                                  <option key={m} value={m}>{m.slice(0, 7).replace("-", "年")}月分</option>
                                ))}
                              </select>
                              <p className="text-[10px] text-slate-400 leading-tight">保険は2ヶ月ほど遅れて入金されます。何月分かを選んでください</p>
                            </>
                          )}
                          {r.kind === "insurance" && r.analysis.insuranceMatch && (
                            <p className="text-[11px] text-slate-500 leading-tight">
                              {r.analysis.insuranceMatch.insurance_name}<br />
                              {r.analysis.insuranceMatch.payment_month.slice(0, 7).replace("-", "年")}月分
                            </p>
                          )}
                          {r.kind === "ignore" && <span className="text-[11px] text-slate-400">記帳しません</span>}
                        </td>
                        <td className="p-2 space-y-1">
                          {imported && (
                            <Badge variant="outline" className="text-[10px] bg-slate-100 dark:bg-slate-800 border-slate-300">
                              取込済み（{PASSBOOK_KIND_LABELS[r.analysis.importedAs!]}）
                            </Badge>
                          )}
                          {r.kind === "insurance" && r.analysis.insuranceMatch && (
                            <div className="flex items-start gap-1 text-[11px] text-blue-700 dark:text-blue-400 leading-tight">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" />
                              <span>
                                登録済みの保険入金と金額が一致
                                {r.analysis.insuranceMatch.passbook_checked ? "（確認済み）" : "。取り込むと通帳確認済みになります"}
                              </span>
                            </div>
                          )}
                          {r.kind === "insurance" && !r.analysis.insuranceMatch && (
                            <div className="flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-400 leading-tight">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                              <span>同じ金額の登録がありません。保険入金として新しく登録します</span>
                            </div>
                          )}
                          {dup && (
                            <div className="flex items-start gap-1 text-[11px] text-rose-700 dark:text-rose-400 leading-tight">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                              <span>
                                同じ金額の経費が登録済みです（{r.analysis.expenseDuplicates.map((d) => `${d.expense_date.slice(5)} ${d.category}`).join("、")}）。
                                レシートから入れたものなら取り込まないでください
                              </span>
                            </div>
                          )}
                          {r.kind === "income" && (
                            <div className="flex items-start gap-1 text-[11px] text-rose-700 dark:text-rose-400 leading-tight">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                              <span>受付で記帳した売上の入金なら、二重計上になるので取り込まないでください</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3 */}
      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
              取り込む
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              {(["insurance", "expense", "income", "ignore"] as PassbookKind[]).map((k) => {
                const n = selected.filter((r) => r.kind === k).length;
                if (n === 0) return null;
                return (
                  <span key={k} className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300">
                    {PASSBOOK_KIND_LABELS[k]} {n}件
                  </span>
                );
              })}
            </div>
            <Button
              onClick={handleImport}
              disabled={selected.length === 0 || isImporting}
              className="w-full h-12 text-base font-bold bg-indigo-600 hover:bg-indigo-700"
            >
              {isImporting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
              選んだ{selected.length}件を取り込む
            </Button>
            <p className="text-xs text-slate-400 leading-relaxed">
              経費・その他収入は経費記帳に、保険入金は保険入金の画面に登録されます。
              「対象外」を選んだ行は記帳せず、次に同じページを読んだときに出てこないよう記録だけします。
            </p>
          </CardContent>
        </Card>
      )}

      {/* 取込履歴 */}
      <Card>
        <CardHeader className="pb-3">
          <button onClick={() => setHistoryOpen((v) => !v)} className="flex items-center justify-between w-full">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4 text-slate-400" />
              取込履歴（{history.length}件）
            </CardTitle>
            {historyOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
        </CardHeader>
        {historyOpen && (
          <CardContent className="p-0">
            {history.length === 0 ? (
              <p className="text-sm text-slate-400 p-4 text-center">まだ取り込んだ明細はありません</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800">
                    <tr className="text-slate-500 text-left">
                      <th className="p-2">日付</th>
                      <th className="p-2">摘要</th>
                      <th className="p-2 text-right">金額</th>
                      <th className="p-2">種別</th>
                      <th className="p-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="p-2 whitespace-nowrap tabular-nums">{h.entry_date}</td>
                        <td className="p-2 break-all">{h.description || "—"}</td>
                        <td className="p-2 text-right tabular-nums">{yen(h.withdrawal > 0 ? h.withdrawal : h.deposit)}</td>
                        <td className="p-2 whitespace-nowrap">{PASSBOOK_KIND_LABELS[h.kind as PassbookKind]}</td>
                        <td className="p-2">
                          <button onClick={() => handleDeleteHistory(h.id)} className="text-slate-300 hover:text-rose-500" title="取込記録を削除（経費・保険入金は消えません）">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
