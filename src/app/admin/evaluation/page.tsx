"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TrendingUp, Users, Target, MessageSquare,
  Calendar, Sparkles, Star,
  Award, ArrowUpRight, Loader2, Save, Search, Pencil, Trash2, Check, X, ChevronDown, ChevronUp,
  FileSpreadsheet, FileClock,
} from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { getMonthlyEvaluation, saveEvaluationTargets, saveAiSuggestion, getMonthDetailedBreakdown, updateCashSale, deleteCashSaleRecord, getMonthlyReportData, type MonthDetailedBreakdown, type DailySaleRow } from "@/app/actions/evaluation";
import { getBusinessContext, getAnnualTaxData } from "@/app/actions/sales";
import { toast } from "sonner";
import { downloadMonthlyReport } from "@/lib/monthly-report";
import { downloadAnnualTaxReport } from "@/lib/annual-tax-report";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import Link from "next/link";

// --- Radar Chart Component (SVG based) ---
const RadarChart = ({ data }: { data: { label: string, value: number, max: number }[] }) => {
  const size = 300;
  const center = size / 2;
  const radius = size * 0.35;
  const angleStep = (Math.PI * 2) / data.length;

  const points = data.map((d, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const safeMax = d.max === 0 ? 1 : d.max;
    const r = (Math.min(d.value, safeMax) / safeMax) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
      labelX: center + (radius + 35) * Math.cos(angle),
      labelY: center + (radius + 20) * Math.sin(angle),
    };
  });

  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1];

  return (
    <div className="relative w-full aspect-square max-w-[400px] mx-auto flex items-center justify-center">
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {gridLevels.map((level, idx) => (
          <polygon
            key={idx}
            points={data.map((_, i) => {
              const angle = i * angleStep - Math.PI / 2;
              const r = radius * level;
              return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
            }).join(' ')}
            fill="none" stroke="#e2e8f0" strokeWidth="1"
          />
        ))}
        {data.map((_, i) => {
          const angle = i * angleStep - Math.PI / 2;
          return (
            <line key={i} x1={center} y1={center}
              x2={center + radius * Math.cos(angle)} y2={center + radius * Math.sin(angle)}
              stroke="#e2e8f0" strokeWidth="1"
            />
          );
        })}
        {points.length > 0 && (
          <polygon points={points.map(p => `${p.x},${p.y}`).join(' ')}
            fill="rgba(16, 185, 129, 0.2)" stroke="#10b981" strokeWidth="3"
            className="transition-all duration-1000"
          />
        )}
        {data.map((d, i) => (
          <text key={i} x={points[i].labelX} y={points[i].labelY} textAnchor="middle"
            className="text-[10px] font-bold fill-slate-500">{d.label}</text>
        ))}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="#10b981" />
        ))}
      </svg>
    </div>
  );
};

// --- 明細パネル ---
function DetailPanel({ year, month, onClose }: { year: number; month: number; onClose: () => void }) {
  const [data, setData] = useState<MonthDetailedBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"sales" | "insurance" | "visits">("sales");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ customer_name: string; treatment_fee: string; memo: string }>({ customer_name: "", treatment_fee: "", memo: "" });
  const [saving, setSaving] = useState(false);
  const [visitView, setVisitView] = useState<"daily" | "detail">("daily");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getMonthDetailedBreakdown(year, month);
    if (res.success && res.data) setData(res.data);
    else toast.error(res.error ?? "取得失敗");
    setLoading(false);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (row: DailySaleRow) => {
    setEditingId(row.id);
    setEditValues({ customer_name: row.customer_name, treatment_fee: String(row.treatment_fee), memo: row.memo });
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    const res = await updateCashSale(id, {
      customer_name: editValues.customer_name,
      treatment_fee: parseInt(editValues.treatment_fee, 10),
      memo: editValues.memo,
    });
    if (res.success) { toast.success("更新しました"); setEditingId(null); load(); }
    else toast.error(res.error ?? "更新失敗");
    setSaving(false);
  };

  const deleteRow = async (id: string) => {
    if (!confirm("この売上を削除しますか？")) return;
    const res = await deleteCashSaleRecord(id);
    if (res.success) { toast.success("削除しました"); load(); }
    else toast.error(res.error ?? "削除失敗");
  };

  const toggleCashSaleVisit = async (id: string, current: boolean) => {
    const res = await updateCashSale(id, { is_first_visit: !current });
    if (res.success) { toast.success("更新しました"); load(); }
    else toast.error(res.error ?? "更新失敗");
  };

  const fmtDate = (d: string) => {
    const dt = new Date(d);
    const jst = new Date(dt.getTime() + (d.includes("+") ? 0 : 9 * 60 * 60 * 1000));
    return `${jst.getMonth() + 1}/${jst.getDate()}(${["日","月","火","水","木","金","土"][jst.getDay()]})`;
  };

  const fmtDateTime = (d: string) => {
    const dt = new Date(d);
    const jst = new Date(dt.getTime());
    return new Date(jst).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div>
            <h2 className="font-bold text-lg text-slate-900">{year}年{month}月 数字の根拠・明細</h2>
            <p className="text-slate-500 text-xs mt-0.5">確認・編集できます</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b shrink-0">
          {([
            { key: "sales", label: `自費売上`, sub: data ? `¥${data.cashTotal.toLocaleString()} / ${data.cashSales.length}件` : "" },
            { key: "insurance", label: "保険入金", sub: data ? `¥${data.insuranceTotal.toLocaleString()} / ${data.insurancePayments.length}件` : "" },
            { key: "visits", label: "来院履歴", sub: data ? `${data.appointments.length}件` : "" },
          ] as const).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${tab === t.key ? "border-emerald-500 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              {t.label}
              {t.sub && <span className="block text-xs font-normal text-slate-400">{t.sub}</span>}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center h-40 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : !data ? (
            <div className="p-6 text-slate-400 text-sm text-center">データ取得失敗</div>
          ) : tab === "sales" ? (
            <div>
              {data.cashSales.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-sm">この月の自費売上データはありません</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500 font-bold uppercase">
                      <th className="px-4 py-2 text-left">日付</th>
                      <th className="px-4 py-2 text-left">患者名</th>
                      <th className="px-4 py-2 text-right">金額</th>
                      <th className="px-4 py-2 text-left">備考</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.cashSales.map((row) => (
                      <tr key={row.id} className={`hover:bg-slate-50 ${editingId === row.id ? "bg-yellow-50" : ""}`}>
                        {editingId === row.id ? (
                          <>
                            <td className="px-4 py-2 text-slate-500 text-xs whitespace-nowrap">{fmtDate(row.sale_date)}</td>
                            <td className="px-4 py-2">
                              <input value={editValues.customer_name} onChange={(e) => setEditValues(v => ({ ...v, customer_name: e.target.value }))}
                                className="w-full border rounded px-2 py-1 text-sm" />
                            </td>
                            <td className="px-4 py-2">
                              <input type="number" value={editValues.treatment_fee} onChange={(e) => setEditValues(v => ({ ...v, treatment_fee: e.target.value }))}
                                className="w-24 border rounded px-2 py-1 text-sm text-right" />
                            </td>
                            <td className="px-4 py-2">
                              <input value={editValues.memo} onChange={(e) => setEditValues(v => ({ ...v, memo: e.target.value }))}
                                className="w-full border rounded px-2 py-1 text-sm" />
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex gap-1">
                                <button onClick={() => saveEdit(row.id)} disabled={saving}
                                  className="p-1 rounded bg-emerald-500 hover:bg-emerald-600 text-white transition-colors">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setEditingId(null)}
                                  className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-600 transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-2 text-slate-500 text-xs whitespace-nowrap">{fmtDate(row.sale_date)}</td>
                            <td className="px-4 py-2 font-medium text-slate-800">{row.customer_name}</td>
                            <td className="px-4 py-2 text-right font-bold text-slate-900">¥{row.treatment_fee.toLocaleString()}</td>
                            <td className="px-4 py-2 text-xs text-slate-400">{row.memo}</td>
                            <td className="px-4 py-2">
                              <div className="flex gap-1">
                                <button onClick={() => startEdit(row)}
                                  className="p-1 rounded text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => deleteRow(row.id)}
                                  className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold">
                      <td className="px-4 py-3 text-xs text-slate-500" colSpan={2}>合計 {data.cashSales.length}件</td>
                      <td className="px-4 py-3 text-right text-emerald-700">¥{data.cashTotal.toLocaleString()}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          ) : tab === "insurance" ? (
            <div>
              {data.insurancePayments.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-sm">この月の保険入金データはありません</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500 font-bold uppercase">
                      <th className="px-4 py-2 text-left">保険種別</th>
                      <th className="px-4 py-2 text-right">金額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.insurancePayments.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{row.insurance_name}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">¥{row.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold">
                      <td className="px-4 py-3 text-xs text-slate-500">{data.insurancePayments.length}件</td>
                      <td className="px-4 py-3 text-right text-blue-700">¥{data.insuranceTotal.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
              <p className="px-4 pb-4 text-xs text-slate-400">※保険入金の編集は「保険入金」メニューから行ってください</p>
            </div>
          ) : (
            <div>
              {/* サブタブ */}
              <div className="flex border-b px-4 gap-4 text-sm shrink-0">
                {(["daily", "detail"] as const).map(v => (
                  <button key={v} onClick={() => setVisitView(v)}
                    className={`py-2 font-medium border-b-2 transition-colors ${visitView === v ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                    {v === "daily" ? "日別集計" : "明細一覧"}
                  </button>
                ))}
              </div>

              {data.cashSales.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-sm">この月の来院データはありません</div>
              ) : visitView === "daily" ? (() => {
                // 日別集計
                const byDate: Record<string, { total: number; first: number }> = {};
                for (const row of data.cashSales) {
                  if (!byDate[row.sale_date]) byDate[row.sale_date] = { total: 0, first: 0 };
                  byDate[row.sale_date].total++;
                  if (row.is_first_visit) byDate[row.sale_date].first++;
                }
                const days = Object.keys(byDate).sort();
                const avg = days.length > 0 ? (data.cashSales.length / days.length).toFixed(1) : "0";
                const maxCount = Math.max(...days.map(d => byDate[d].total), 1);
                return (
                  <div>
                    {/* 平均バナー */}
                    <div className="mx-4 mt-3 mb-2 p-3 bg-emerald-50 rounded-lg flex items-center justify-between">
                      <span className="text-xs text-emerald-700 font-medium">1日平均来院数</span>
                      <span className="text-2xl font-bold text-emerald-600">{avg}<span className="text-sm font-normal ml-1">人/日</span></span>
                      <span className="text-xs text-slate-400">（{days.length}営業日 / 合計{data.cashSales.length}人）</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-xs text-slate-500 font-bold">
                          <th className="px-4 py-2 text-left">日付</th>
                          <th className="px-4 py-2 text-right">来院数</th>
                          <th className="px-4 py-2 text-right">初診</th>
                          <th className="px-4 py-2 w-24">グラフ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {days.map(d => (
                          <tr key={d} className="hover:bg-slate-50">
                            <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{fmtDate(d)}</td>
                            <td className="px-4 py-2 text-right font-bold text-slate-900">{byDate[d].total}人</td>
                            <td className="px-4 py-2 text-right text-amber-600 text-xs">{byDate[d].first > 0 ? `初診${byDate[d].first}` : "—"}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1">
                                <div className="h-4 rounded bg-emerald-400 transition-all" style={{ width: `${(byDate[d].total / maxCount) * 72}px` }} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 text-xs text-slate-500 font-bold">
                          <td className="px-4 py-3">合計 {days.length}日</td>
                          <td className="px-4 py-3 text-right">{data.cashSales.length}人</td>
                          <td className="px-4 py-3 text-right text-amber-600">{data.cashSales.filter((s: any) => s.is_first_visit).length}名</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })() : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500 font-bold uppercase">
                      <th className="px-4 py-2 text-left">日付</th>
                      <th className="px-4 py-2 text-left">患者名</th>
                      <th className="px-4 py-2 text-center">初診</th>
                      <th className="px-4 py-2 text-center">編集</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.cashSales.map((row: any) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtDate(row.sale_date)}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {editingId === row.id ? (
                            <input className="border rounded px-2 py-1 text-sm w-full" value={editValues.customer_name}
                              onChange={e => setEditValues(v => ({ ...v, customer_name: e.target.value }))} autoFocus />
                          ) : row.customer_name}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button onClick={() => toggleCashSaleVisit(row.id, row.is_first_visit ?? false)}
                            className={`px-2 py-0.5 rounded-full text-xs font-bold transition-colors ${row.is_first_visit ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                            {row.is_first_visit ? "初診" : "再診"}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {editingId === row.id ? (
                            <div className="flex gap-1 justify-center">
                              <button onClick={async () => { setSaving(true); const res = await updateCashSale(row.id, { customer_name: editValues.customer_name }); if (res.success) { toast.success("更新しました"); setEditingId(null); load(); } else toast.error(res.error ?? "更新失敗"); setSaving(false); }} disabled={saving} className="text-emerald-600 hover:text-emerald-700"><Check className="w-4 h-4" /></button>
                              <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <button onClick={() => { setEditingId(row.id); setEditValues({ customer_name: row.customer_name, treatment_fee: String(row.treatment_fee), memo: row.memo }); }} className="text-slate-400 hover:text-slate-600"><Pencil className="w-3.5 h-3.5" /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold text-xs text-slate-500">
                      <td className="px-4 py-3" colSpan={2}>合計 {data.cashSales.length}件（初診 {data.cashSales.filter((s: any) => s.is_first_visit).length}名）</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              )}
              <p className="px-4 py-3 text-xs text-slate-400">※自費売上に基づきます</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EvaluationPage() {
  const [activeYear, setActiveYear] = useState(new Date().getFullYear());
  const [activeMonth, setActiveMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isTaxExporting, setIsTaxExporting] = useState(false);
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());

  const monthOptions = useMemo(() => {
    const opts = [];
    const current = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(current.getFullYear(), current.getMonth() - i, 1);
      opts.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }
    return opts;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await getMonthlyEvaluation(activeYear, activeMonth);
    if (result.success) {
      setData(result.data);
    } else {
      toast.error(result.error || "データ取得に失敗しました");
    }
    setLoading(false);
  }, [activeYear, activeMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveMetrics = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.append("month", `${activeYear}-${activeMonth.toString().padStart(2, '0')}-01`);
    const res = await saveEvaluationTargets(formData);
    if (res.success) {
      toast.success("目標と評価を保存しました");
      setIsEditModalOpen(false);
      fetchData();
    } else {
      toast.error(res.error);
    }
  };

  const handleGenerateAi = async () => {
    setIsGeneratingAi(true);
    try {
      // Build prompt from already-loaded evaluation data
      const metricsText = (metrics || []).map((m: any) =>
        `・${m.name}: 実績 ${m.actual.toLocaleString()}${m.unit} / 目標 ${m.target.toLocaleString()}${m.unit}（達成率 ${m.score}%）`
      ).join("\n");
      const prompt = `${activeYear}年${activeMonth}月の経営評価と来月への戦略を2〜3つの具体的なアクションプラン（短文箇条書き）で150文字程度にまとめてください。\n\n【今月の実績】\n${metricsText}`;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt })
      });
      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || "APIレスポンスエラー");
      }
      const aiText = responseData.response || "提案を生成できませんでした。";
      const monthStr = `${activeYear}-${activeMonth.toString().padStart(2, "0")}-01`;
      await saveAiSuggestion(monthStr, aiText);
      toast.success("AI提案を生成しました");
      // Update local state immediately without waiting for re-fetch
      setData((prev: any) => prev ? { ...prev, evalData: { ...prev.evalData, ai_suggestions: aiText } } : prev);
    } catch (error: any) {
      console.error(error);
      toast.error(`AI提案の生成に失敗しました: ${error?.message || ""}`);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleExportReport = async () => {
    setIsExporting(true);
    try {
      const res = await getMonthlyReportData(activeYear, activeMonth);
      if (!res.success || !res.data) {
        toast.error(res.error ?? "レポートデータの取得に失敗しました");
        return;
      }
      downloadMonthlyReport(res.data);
      toast.success(`${activeYear}年${activeMonth}月のレポートをダウンロードしました`);
    } catch (err) {
      console.error(err);
      toast.error("レポート出力中にエラーが発生しました");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportTaxReport = async () => {
    setIsTaxExporting(true);
    try {
      const res = await getAnnualTaxData(taxYear);
      if (!res.success || !res.data) {
        toast.error(res.error ?? "年間データの取得に失敗しました");
        return;
      }
      downloadAnnualTaxReport(res.data);
      toast.success(`${taxYear}年度の確定申告サポートデータをダウンロードしました`);
    } catch (err) {
      console.error(err);
      toast.error("出力中にエラーが発生しました");
    } finally {
      setIsTaxExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const { targets, evalData, metrics, visitBreakdown } = data || {};

  const visitCatColor: Record<string, string> = {
    hoken: "bg-blue-400",
    jihi: "bg-emerald-400",
    jibaiseki: "bg-violet-400",
    hagukumi: "bg-amber-400",
    kankeisha: "bg-rose-400",
    other: "bg-slate-400",
  };

  const radarData = [
    { label: "売上", value: metrics?.[1]?.score || 0, max: 100 },
    { label: "集客", value: metrics?.[0]?.score || 0, max: 100 },
    { label: "新規", value: metrics?.[3]?.score || 0, max: 100 },
    { label: "口コミ", value: evalData?.google_review_count ? Math.min((evalData.google_review_count / (targets?.target_patients * 0.1 || 1)) * 100, 100) : 0, max: 100 },
    { label: "SNS", value: metrics?.[2]?.score || 0, max: 100 },
    { label: "自己評価", value: evalData?.self_evaluation ? 90 : 30, max: 100 },
  ];

  const totalScore = Math.round(radarData.reduce((acc, curr) => acc + curr.value, 0) / radarData.length);

  const renderIcon = (index: number) => {
    if (index === 0) return <Users className="w-5 h-5 text-blue-600" />;
    if (index === 1) return <TrendingUp className="w-5 h-5 text-emerald-600" />;
    if (index === 2) return <MessageSquare className="w-5 h-5 text-rose-600" />;
    if (index === 3) return <Target className="w-5 h-5 text-amber-600" />;
    return <Award className="w-5 h-5" />;
  };

  const getMetricColor = (index: number) => {
    if (index === 0) return "text-blue-600";
    if (index === 1) return "text-emerald-600";
    if (index === 2) return "text-rose-600";
    if (index === 3) return "text-amber-600";
    return "";
  };

  const getMetricBg = (index: number) => {
    if (index === 0) return "bg-blue-500";
    if (index === 1) return "bg-emerald-500";
    if (index === 2) return "bg-rose-500";
    if (index === 3) return "bg-amber-500";
    return "bg-slate-500";
  };

  return (
    <div className="space-y-8 animate-in fade-in pb-12">
      {/* 明細パネル */}
      {isDetailOpen && (
        <DetailPanel year={activeYear} month={activeMonth} onClose={() => { setIsDetailOpen(false); fetchData(); }} />
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white border-l-4 border-emerald-600 pl-3">
            月間経営評価レポート
          </h1>
          <p className="text-muted-foreground mt-2">視覚的分析によるクリニックの健康診断</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={`${activeYear}-${activeMonth}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-');
              setActiveYear(parseInt(y));
              setActiveMonth(parseInt(m));
            }}
          >
            {monthOptions.map(opt => (
              <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                {opt.year}年{opt.month}月
              </option>
            ))}
          </select>

          {/* 月次レポート出力 */}
          <Button
            variant="outline"
            onClick={handleExportReport}
            disabled={isExporting}
            className="border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 bg-white dark:bg-slate-800 font-bold"
          >
            {isExporting
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <FileSpreadsheet className="w-4 h-4 mr-2" />}
            月次レポート出力
          </Button>

          {/* 確定申告サポート出力 */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-700 rounded-lg overflow-hidden">
            <select
              value={taxYear}
              onChange={e => setTaxYear(Number(e.target.value))}
              className="h-10 pl-3 pr-1 text-sm bg-transparent text-violet-700 dark:text-violet-300 focus:outline-none border-r border-violet-200 dark:border-violet-700"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                <option key={y} value={y}>{y}年度</option>
              ))}
            </select>
            <Button
              variant="ghost"
              onClick={handleExportTaxReport}
              disabled={isTaxExporting}
              className="h-10 px-3 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 font-bold rounded-none"
            >
              {isTaxExporting
                ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                : <FileClock className="w-4 h-4 mr-1.5" />}
              確定申告サポート出力
            </Button>
          </div>

          {/* 数字の根拠ボタン */}
          <Button
            variant="outline"
            onClick={() => setIsDetailOpen(true)}
            className="border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 bg-white dark:bg-slate-800"
          >
            <Search className="w-4 h-4 mr-2" />
            数字の根拠を確認・修正
          </Button>

          {/* 分析ボタン */}
          <Link href="/admin/analytics">
             <Button
               variant="default"
               className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-indigo-900/30 flex items-center gap-2"
             >
               <TrendingUp className="w-4 h-4" />
               <span className="font-bold">さらに詳しく分析する</span>
             </Button>
          </Link>

          <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
            <DialogTrigger>
              <span className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 h-10 px-4 py-2 cursor-pointer">
                <Star className="w-4 h-4 mr-2" />目標・手動指標の編集
              </span>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{activeMonth}月の目標・評価設定</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSaveMetrics} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>来院数目標</Label>
                    <Input type="number" name="target_patients" defaultValue={targets?.target_patients} />
                  </div>
                  <div className="space-y-2">
                    <Label>売上目標 (円)</Label>
                    <Input type="number" name="target_income" defaultValue={targets?.target_income} />
                  </div>
                  <div className="space-y-2">
                    <Label>SNSタスク目標 (件)</Label>
                    <Input type="number" name="target_sns_tasks" defaultValue={targets?.target_sns_tasks} />
                  </div>
                  <div className="space-y-2">
                    <Label>新規患者目標</Label>
                    <Input type="number" name="target_new_patients" defaultValue={targets?.target_new_patients} />
                  </div>
                  <div className="space-y-2">
                    <Label>Google口コミ数 (月間)</Label>
                    <Input type="number" name="google_review_count" defaultValue={evalData?.google_review_count} />
                  </div>
                  <div className="space-y-2">
                    <Label>Google平均評価</Label>
                    <Input type="number" step="0.1" name="google_rating" defaultValue={evalData?.google_rating} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>自己評価・振り返りコメント</Label>
                  <textarea
                    name="self_evaluation"
                    defaultValue={evalData?.self_evaluation}
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">保存する</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 指標サマリー（クリックで明細へ） */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(metrics || []).map((m: any, i: number) => (
          <button
            key={i}
            onClick={() => setIsDetailOpen(true)}
            className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-left hover:border-amber-300 hover:shadow-md transition-all group"
          >
            <div className={`flex items-center gap-2 ${getMetricColor(i)} text-xs font-bold mb-2`}>
              {renderIcon(i)}{m.name}
            </div>
            <div className="text-2xl font-black text-slate-900">
              {m.unit === "円" ? `¥${m.actual.toLocaleString()}` : `${m.actual.toLocaleString()}${m.unit}`}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">目標: {m.unit === "円" ? `¥${m.target.toLocaleString()}` : `${m.target}${m.unit}`}</div>
            {m.target === 0 ? (
              <span className="text-xs text-slate-400 block mt-2">目標未設定</span>
            ) : (
              <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full ${getMetricBg(i)} transition-all`} style={{ width: `${m.score}%` }} />
              </div>
            )}
            <div className="text-[10px] text-amber-600 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              クリックして根拠を確認・修正 →
            </div>
          </button>
        ))}
      </div>

      {/* 来院数の内訳（保険・自費） */}
      {visitBreakdown && (
        <Card className="shadow-md border-slate-200">
          <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              来院数の内訳（保険・自費）
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {/* 主要な人数 */}
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4 mb-6">
              <div>
                <div className="text-xs font-bold text-slate-500">のべ来院数</div>
                <div className="text-4xl font-black text-slate-900">
                  {visitBreakdown.totalVisits.toLocaleString()}<span className="text-base font-bold text-slate-400 ml-1">人</span>
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-blue-600">保険の来院</div>
                <div className="text-3xl font-black text-blue-700">
                  {visitBreakdown.hokenVisits.toLocaleString()}<span className="text-sm font-bold text-blue-300 ml-1">人</span>
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-emerald-600">自費（実費）の来院</div>
                <div className="text-3xl font-black text-emerald-700">
                  {visitBreakdown.jihiVisits.toLocaleString()}<span className="text-sm font-bold text-emerald-300 ml-1">人</span>
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-amber-600">新規（初診）</div>
                <div className="text-3xl font-black text-amber-700">
                  {visitBreakdown.newVisits.toLocaleString()}<span className="text-sm font-bold text-amber-300 ml-1">人</span>
                </div>
              </div>
            </div>

            {/* 区分ごとのバー */}
            {visitBreakdown.byCategory.length > 0 ? (
              <div className="space-y-2">
                {visitBreakdown.byCategory.map((c: any) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <div className="w-28 text-sm font-medium text-slate-600 shrink-0">{c.label}</div>
                    <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                      <div
                        className={`h-full rounded transition-all ${visitCatColor[c.id] || "bg-slate-400"}`}
                        style={{ width: `${visitBreakdown.totalVisits ? Math.round((c.count / visitBreakdown.totalVisits) * 100) : 0}%` }}
                      />
                    </div>
                    <div className="w-16 text-right text-sm font-bold text-slate-800 shrink-0">{c.count}人</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">この月の来院データはまだありません。</p>
            )}

            {visitBreakdown.bothVisits > 0 && (
              <p className="mt-4 text-xs text-slate-400">
                ※保険と自費を併用した来院が {visitBreakdown.bothVisits} 人います。各区分に数えているため、区分ごとの合計はのべ来院数を上回ることがあります。
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              ※同じ患者さんが同じ日に来た分は1来院として数えています。売上記帳のデータから自動で集計しています。
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* --- Left: Score & Radar --- */}
        <div className="lg:col-span-2 space-y-8">
          {data?.targets && data.targets.target_income === 0 && data.targets.target_patients === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4 flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">今月の目標が未設定です</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">経営評価の精度を上げるため、目標値を設定してください。</p>
              </div>
              <a href="/admin/settings" className="shrink-0 text-xs font-bold text-amber-700 dark:text-amber-300 underline hover:no-underline">
                設定画面へ →
              </a>
            </div>
          )}
          <Card className="shadow-lg border-emerald-100 overflow-hidden bg-gradient-to-br from-white to-emerald-50/30">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="p-8 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-emerald-100">
                <span className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Total Monthly Score</span>
                <div className="relative flex items-center justify-center">
                  <svg className="w-48 h-48">
                    <circle cx="96" cy="96" r="88" fill="none" stroke="#f1f5f9" strokeWidth="12" />
                    <circle
                      cx="96" cy="96" r="88" fill="none"
                      stroke={totalScore >= 80 ? "#10b981" : totalScore >= 60 ? "#f59e0b" : "#ef4444"}
                      strokeWidth="12" strokeDasharray={2 * Math.PI * 88}
                      strokeDashoffset={2 * Math.PI * 88 * (1 - totalScore / 100)}
                      strokeLinecap="round"
                      className="transition-all duration-1000 ease-out rotate-[-90deg] origin-center"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-6xl font-black text-slate-900 leading-none">{totalScore}</span>
                    <span className="text-xl font-bold text-slate-500 mt-2">/ 100点</span>
                  </div>
                </div>
                <div className="mt-6 flex items-center gap-2 text-emerald-600 font-bold">
                  <Award className="w-5 h-5" />
                  <span>{totalScore >= 80 ? "Excellent Progress" : totalScore >= 60 ? "Good" : "Needs Improvement"}</span>
                </div>
              </div>
              <div className="p-8 h-full flex items-center justify-center min-h-[400px]">
                <RadarChart data={radarData} />
              </div>
            </div>
          </Card>
        </div>

        {/* --- Right --- */}
        <div className="space-y-6">
          <Card className="shadow-md border-slate-200 overflow-hidden">
            <CardHeader className="bg-sky-50 border-b border-sky-100 pb-6">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                  <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
                  Google 口コミ評価
                </CardTitle>
                <ArrowUpRight className="w-5 h-5 text-emerald-600" />
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4 mb-6">
                <h2 className="text-5xl font-black text-slate-900 tracking-tighter">{evalData?.google_rating || "0.0"}</h2>
                <div className="space-y-1">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(s => <Star key={s} className={`w-4 h-4 ${s <= (evalData?.google_rating || 0) ? "text-amber-400 fill-amber-400" : "text-slate-300"}`} />)}
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase">{evalData?.google_review_count || 0} NEW REVIEWS THIS MONTH</p>
                </div>
              </div>
              <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl text-xs font-medium border border-emerald-100">
                口コミ数は「目標・手動指標の編集」から更新できます。
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100 mb-4 bg-slate-50">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-600" />
                  AI Strategy Plan
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border-l-4 border-emerald-500 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700">
                {evalData?.ai_suggestions ? (
                  evalData.ai_suggestions
                ) : (
                  <p className="text-slate-400 italic">まだAI提案が生成されていません。</p>
                )}
              </div>
              <Button
                onClick={handleGenerateAi}
                disabled={isGeneratingAi}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold mt-2"
              >
                {isGeneratingAi && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {evalData?.ai_suggestions ? "AI提案を再生成する" : "AIに戦略を提案させる"}
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">自己評価コメント</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveMetrics}>
                <input type="hidden" name="target_patients" value={targets?.target_patients || 0} />
                <input type="hidden" name="target_income" value={targets?.target_income || 0} />
                <input type="hidden" name="target_sns_tasks" value={targets?.target_sns_tasks || 0} />
                <input type="hidden" name="target_new_patients" value={targets?.target_new_patients || 0} />
                <input type="hidden" name="google_review_count" value={evalData?.google_review_count || 0} />
                <input type="hidden" name="google_rating" value={evalData?.google_rating || 0} />
                <textarea
                  name="self_evaluation"
                  className="w-full min-h-[100px] p-3 text-sm border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 mb-2"
                  placeholder="院長としての振り返りを記入..."
                  defaultValue={evalData?.self_evaluation}
                />
                <Button size="sm" type="submit" variant="secondary" className="w-full"><Save className="w-4 h-4 mr-2" />自己評価を保存</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
