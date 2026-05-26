"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Area,
} from "recharts";
import {
  getComparisonData, getYearlyTrend, getWeekdayBreakdown, getCustomerAnalytics, getVisitorComparison,
  type ComparisonResult, type YearlyTrendPoint, type CustomerAnalytics, type VisitorDemographicsComparison,
} from "@/app/actions/analytics";
import { generateAnalyticsComment } from "@/app/actions/ai-secretary";
import {
  TrendingUp, TrendingDown, Minus, Users, Banknote,
  ReceiptText, ChartBar, Calendar, Sparkles, Loader2, CalendarDays, MapPin
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ========= ユーティリティ =========
const yen = (n: number) => `¥${Math.abs(n).toLocaleString()}`;

const now = new Date();
const THIS_YEAR = now.getFullYear();
const THIS_MONTH = now.getMonth() + 1;

function prevMonth(y: number, m: number) {
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

const EXPENSE_COLORS = [
  "#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe",
  "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#e0f2fe",
];

// ========= Delta badge =========
function Delta({ value, pct, invert = false }: { value: number; pct: number; invert?: boolean }) {
  const positive = invert ? value < 0 : value > 0;
  const neutral = value === 0;
  if (neutral) return <span className="inline-flex items-center gap-0.5 text-slate-400 text-xs font-medium"><Minus className="w-3 h-3" /> 0%</span>;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${positive ? "text-emerald-600" : "text-red-500"}`}>
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positive ? "+" : "-"}{Math.abs(pct)}%
    </span>
  );
}

// ========= KPI Card =========
function KpiCard({ label, valueA, valueB, diff, pct, format, invert, icon }: {
  label: string; valueA: number; valueB: number; diff: number; pct: number;
  format: (n: number) => string; invert?: boolean; icon: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-4 space-y-2">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide">
        {icon}{label}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{format(valueA)}</div>
          <div className="text-xs text-slate-400 mt-0.5">比較: {format(valueB)}</div>
        </div>
        <Delta value={diff} pct={pct} invert={invert} />
      </div>
      <div className="h-1.5 rounded-full w-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-1.5 rounded-full ${diff >= 0 ? "bg-emerald-400" : "bg-red-400"}`}
          style={{ width: `${Math.min(100, valueB > 0 ? (valueA / Math.max(valueA, valueB)) * 100 : 100)}%` }}
        />
      </div>
    </div>
  );
}

// ========= 月ピッカー =========
function MonthPicker({ label, year, month, onChange }: {
  label: string; year: number; month: number;
  onChange: (y: number, m: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-slate-600 w-20">{label}</span>
      <select
        value={year}
        onChange={(e) => onChange(Number(e.target.value), month)}
        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 bg-white"
      >
        {[THIS_YEAR - 2, THIS_YEAR - 1, THIS_YEAR].map((y) => (
          <option key={y} value={y}>{y}年</option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => onChange(year, Number(e.target.value))}
        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 bg-white"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>{m}月</option>
        ))}
      </select>
    </div>
  );
}

// ========= メインページ =========
export default function AnalyticsPage() {
  const [, startTransition] = useTransition();

  // 期間A（今月）と期間B（前月）
  const [yearA, setYearA] = useState(THIS_YEAR);
  const [monthA, setMonthA] = useState(THIS_MONTH);
  const prev = prevMonth(THIS_YEAR, THIS_MONTH);
  const [yearB, setYearB] = useState(prev.year);
  const [monthB, setMonthB] = useState(prev.month);

  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [trend, setTrend] = useState<YearlyTrendPoint[]>([]);
  const [weekday, setWeekday] = useState<{ day: string; count: number }[]>([]);
  const [trendYear, setTrendYear] = useState(THIS_YEAR);
  const [loading, setLoading] = useState(true);
  const [customerData, setCustomerData] = useState<CustomerAnalytics | null>(null);
  const [visitorComparison, setVisitorComparison] = useState<VisitorDemographicsComparison | null>(null);
  const [activeTab, setActiveTab] = useState<"performance" | "visitors" | "customers">("performance");
  const [aiComment, setAiComment] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const [comp, tr, wd, cust, vis] = await Promise.all([
        getComparisonData(yearA, monthA, yearB, monthB),
        getYearlyTrend(trendYear),
        getWeekdayBreakdown(yearA, monthA),
        getCustomerAnalytics(yearA, monthA),
        getVisitorComparison(yearA, monthA, yearB, monthB),
      ]);
      setComparison(comp);
      setTrend(tr);
      setWeekday(wd);
      setCustomerData(cust);
      setVisitorComparison(vis);
      setLoading(false);
    });
  }, [yearA, monthA, yearB, monthB, trendYear]);

  useEffect(() => { load(); }, [load]);

  // クイックプリセット
  const applyPreset = (preset: "prev-month" | "last-year" | "q-compare") => {
    if (preset === "prev-month") {
      const p = prevMonth(THIS_YEAR, THIS_MONTH);
      setYearA(THIS_YEAR); setMonthA(THIS_MONTH);
      setYearB(p.year); setMonthB(p.month);
    } else if (preset === "last-year") {
      setYearA(THIS_YEAR); setMonthA(THIS_MONTH);
      setYearB(THIS_YEAR - 1); setMonthB(THIS_MONTH);
    } else if (preset === "q-compare") {
      // 今月 vs 3ヶ月前
      let y = THIS_YEAR, m = THIS_MONTH - 3;
      if (m <= 0) { m += 12; y -= 1; }
      setYearA(THIS_YEAR); setMonthA(THIS_MONTH);
      setYearB(y); setMonthB(m);
    }
  };

  const a = comparison?.periodA;
  const b = comparison?.periodB;
  const d = comparison?.diff;

  const handleGenerateComment = async () => {
    if (!comparison) return;
    setAiLoading(true);
    setAiComment(null);
    const res = await generateAnalyticsComment(
      JSON.stringify(comparison),
      customerData ? JSON.stringify(customerData) : undefined
    );
    if (res.success) setAiComment(res.comment ?? null);
    else setAiComment("生成に失敗しました。もう一度試してください。");
    setAiLoading(false);
  };

  // 経費カテゴリPieデータ
  const expPieData = a
    ? Object.entries(a.expenses.byCategory).map(([name, value]) => ({ name, value }))
    : [];

  const revMixA = a ? [
    { name: "自費", value: a.revenue.cash },
    { name: "保険", value: a.revenue.insurance },
  ] : [];

  // 顧客属性データ変換
  const genderData = customerData ? Object.entries(customerData.gender).map(([name, value]) => ({ name, value })) : [];
  const ageData = customerData ? Object.entries(customerData.ageGroups).map(([name, value]) => ({ name, value })) : [];
  const sourceData = customerData ? Object.entries(customerData.sources).map(([name, value]) => ({ name, value })) : [];
  const cityData = customerData
    ? Object.entries(customerData.cities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">経営分析</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">期間比較・売上トレンド・来院分析</p>
        </div>
        {comparison && (
          <button
            onClick={handleGenerateComment}
            disabled={aiLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60"
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            AIに分析させる
          </button>
        )}
      </div>

      {/* AI分析コメント */}
      {(aiLoading || aiComment) && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-slate-900/40 dark:to-slate-900/40 border border-indigo-100 dark:border-white/10 rounded-2xl p-5 flex gap-4">
          <div className="shrink-0 w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-1">AI秘書による経営分析コメント</p>
            {aiLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" /> 分析中...
              </div>
            ) : (
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{aiComment}</p>
            )}
          </div>
        </div>
      )}

      {/* 期間比較コントロール */}
      <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">クイック比較：</span>
          {[
            { key: "prev-month", label: "前月 vs 今月" },
            { key: "last-year", label: "昨年同月 vs 今月" },
            { key: "q-compare", label: "3ヶ月前 vs 今月" },
          ].map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key as any)}
              className="px-3 py-1.5 bg-indigo-50 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 text-xs font-semibold rounded-lg transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-6 items-center">
          <MonthPicker label="比較A:" year={yearA} month={monthA} onChange={(y, m) => { setYearA(y); setMonthA(m); }} />
          <span className="text-slate-400 font-bold hidden md:block">vs</span>
          <MonthPicker label="比較B:" year={yearB} month={monthB} onChange={(y, m) => { setYearB(y); setMonthB(m); }} />
        </div>
      </div>

      {/* タブ切り替え */}
      <div className="flex border-b border-slate-200 dark:border-white/5 overflow-x-auto">
        <button
          onClick={() => setActiveTab("performance")}
          className={`px-6 py-3 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${activeTab === "performance" ? "border-indigo-600 text-indigo-700 dark:text-indigo-400" : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
        >
          経営実績・トレンド
        </button>
        <button
          onClick={() => setActiveTab("visitors")}
          className={`px-6 py-3 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${activeTab === "visitors" ? "border-indigo-600 text-indigo-700 dark:text-indigo-400" : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
        >
          来院者属性（前月比）
        </button>
        <button
          onClick={() => setActiveTab("customers")}
          className={`px-6 py-3 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${activeTab === "customers" ? "border-indigo-600 text-indigo-700 dark:text-indigo-400" : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
        >
          新規顧客属性分析
        </button>
      </div>

      {loading && (
        <div className="text-center py-16 text-slate-400 text-sm animate-pulse">データ読み込み中...</div>
      )}

      {!loading && activeTab === "performance" && comparison && a && b && d && (
        <>
          {/* KPIカード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="売上合計" valueA={a.revenue.total} valueB={b.revenue.total}
              diff={d.revenueTotal} pct={d.revenuePct} format={yen}
              icon={<Banknote className="w-4 h-4" />}
            />
            <KpiCard
              label="来院数" valueA={a.visits.total} valueB={b.visits.total}
              diff={d.visits} pct={d.visitsPct} format={(n) => `${n}件`}
              icon={<Users className="w-4 h-4" />}
            />
            <KpiCard
              label="利益（売上-経費）" valueA={a.profit} valueB={b.profit}
              diff={d.profit} pct={d.profitPct} format={yen}
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <KpiCard
              label="経費" valueA={a.expenses.total} valueB={b.expenses.total}
              diff={d.expenses} pct={d.expensesPct} format={yen} invert
              icon={<ReceiptText className="w-4 h-4" />}
            />
            <KpiCard
              label="自費売上" valueA={a.revenue.cash} valueB={b.revenue.cash}
              diff={d.cash} pct={d.cashPct} format={yen}
              icon={<Banknote className="w-4 h-4" />}
            />
            <KpiCard
              label="保険入金" valueA={a.revenue.insurance} valueB={b.revenue.insurance}
              diff={d.insurance} pct={d.insurancePct} format={yen}
              icon={<Banknote className="w-4 h-4" />}
            />
            <KpiCard
              label="新規患者" valueA={a.visits.newPatients} valueB={b.visits.newPatients}
              diff={d.newPatients} pct={d.newPatientsPct} format={(n) => `${n}名`}
              icon={<Users className="w-4 h-4" />}
            />
            <KpiCard
              label="来院単価" valueA={a.avgSpend} valueB={b.avgSpend}
              diff={d.avgSpend} pct={d.avgSpendPct} format={yen}
              icon={<ChartBar className="w-4 h-4" />}
            />
            <KpiCard
              label={`1日平均来院数（営業${a.daysCounted}日換算）`}
              valueA={a.avgVisitsPerDay} valueB={b.avgVisitsPerDay}
              diff={d.avgVisitsPerDay} pct={d.avgVisitsPerDayPct}
              format={(n) => `${n.toFixed(1)}名`}
              icon={<CalendarDays className="w-4 h-4" />}
            />
          </div>

          {/* 詳細比較テーブル */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">詳細比較</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800">
                    <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">項目</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase">{a.label}</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-slate-400 uppercase">{b.label}</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">差額</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">変化率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {[
                    { label: "売上合計", a: a.revenue.total, b: b.revenue.total, diff: d.revenueTotal, pct: d.revenuePct, fmt: yen },
                    { label: "　自費売上", a: a.revenue.cash, b: b.revenue.cash, diff: d.cash, pct: d.cashPct, fmt: yen },
                    { label: "　保険入金", a: a.revenue.insurance, b: b.revenue.insurance, diff: d.insurance, pct: d.insurancePct, fmt: yen },
                    { label: "経費合計", a: a.expenses.total, b: b.expenses.total, diff: d.expenses, pct: d.expensesPct, fmt: yen, invert: true },
                    { label: "利益", a: a.profit, b: b.profit, diff: d.profit, pct: d.profitPct, fmt: yen },
                    { label: "来院数", a: a.visits.total, b: b.visits.total, diff: d.visits, pct: d.visitsPct, fmt: (n: number) => `${n}件` },
                    { label: "　新規患者", a: a.visits.newPatients, b: b.visits.newPatients, diff: d.newPatients, pct: d.newPatientsPct, fmt: (n: number) => `${n}名` },
                    { label: "　リピート患者", a: a.visits.returning, b: b.visits.returning, diff: a.visits.returning - b.visits.returning, pct: pctCalc(a.visits.returning, b.visits.returning), fmt: (n: number) => `${n}名` },
                    { label: "単価", a: a.avgSpend, b: b.avgSpend, diff: d.avgSpend, pct: d.avgSpendPct, fmt: yen },
                    { label: "新規率", a: a.visits.total > 0 ? Math.round((a.visits.newPatients / a.visits.total) * 100) : 0, b: b.visits.total > 0 ? Math.round((b.visits.newPatients / b.visits.total) * 100) : 0, diff: 0, pct: 0, fmt: (n: number) => `${n}%` },
                  ].map((row, i) => (
                    <tr key={i} className={`hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${row.label.startsWith("　") ? "text-slate-500 dark:text-slate-400" : "font-semibold text-slate-800 dark:text-slate-100"}`}>
                      <td className="px-5 py-3 whitespace-nowrap">{row.label}</td>
                      <td className="px-5 py-3 text-right text-indigo-700 dark:text-indigo-400 font-bold">{row.fmt(row.a)}</td>
                      <td className="px-5 py-3 text-right text-slate-400">{row.fmt(row.b)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={row.diff === 0 ? "text-slate-400" : (row.invert ? (row.diff < 0 ? "text-emerald-600" : "text-red-500") : (row.diff > 0 ? "text-emerald-600" : "text-red-500"))}>
                          {row.diff > 0 ? "+" : ""}{row.diff === 0 ? "±0" : row.fmt(row.diff)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Delta value={row.diff} pct={row.pct} invert={row.invert} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* グラフ2カラム */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 売上内訳 A */}
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-5">
              <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-4">{a.label} 売上内訳</h2>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={revMixA} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name} ¥${value.toLocaleString()}`}>
                    <Cell fill="#6366f1" />
                    <Cell fill="#a78bfa" />
                  </Pie>
                  <Tooltip formatter={(v: any) => yen(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* 経費カテゴリ */}
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-5">
              <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-4">{a.label} 経費カテゴリ</h2>
              {expPieData.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center text-slate-300 dark:text-slate-600 text-sm">経費データなし</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={expPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value">
                      {expPieData.map((_, i) => <Cell key={i} fill={EXPENSE_COLORS[i % EXPENSE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => yen(v)} />
                    <Legend iconSize={10} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* 来院数比較 */}
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-5">
              <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-4">来院数比較（新規 / リピート）</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={[
                  { label: a.label, "新規": a.visits.newPatients, "リピート": a.visits.returning },
                  { label: b.label, "新規": b.visits.newPatients, "リピート": b.visits.returning },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="新規" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="リピート" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 曜日別来院数 */}
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-5">
              <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-4">{a.label} 曜日別来院数</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weekday}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 13 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="来院数" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 年間トレンド */}
          <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-bold text-slate-800 dark:text-slate-100">年間トレンド</h2>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <select
                  value={trendYear}
                  onChange={(e) => setTrendYear(Number(e.target.value))}
                  className="border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800"
                >
                  {[THIS_YEAR - 1, THIS_YEAR].map((y) => (
                    <option key={y} value={y}>{y}年</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 売上・経費・利益 */}
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-2">売上 / 経費 / 利益（月次）</p>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                  <Tooltip formatter={(v: any) => yen(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" name="売上" fill="#ede9fe" stroke="#6366f1" strokeWidth={2} />
                  <Line type="monotone" dataKey="expenses" name="経費" stroke="#f43f5e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="profit" name="利益" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* 来院数トレンド */}
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-2">来院数 / 新規患者数（月次）</p>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="visits" name="来院数合計" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="newPatients" name="新規患者" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {!loading && activeTab === "visitors" && visitorComparison && (
        <div className="space-y-6">
          {/* サマリーカード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">{visitorComparison.periodA.label} 来院延べ</p>
              <p className="text-2xl font-black text-indigo-700 dark:text-indigo-400">
                {visitorComparison.periodA.totalVisits}<span className="text-base ml-1 font-bold">件</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">ユニーク {visitorComparison.periodA.uniqueVisitors} 名</p>
            </div>
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">{visitorComparison.periodB.label} 来院延べ</p>
              <p className="text-2xl font-black text-slate-500 dark:text-slate-400">
                {visitorComparison.periodB.totalVisits}<span className="text-base ml-1 font-bold">件</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">ユニーク {visitorComparison.periodB.uniqueVisitors} 名</p>
            </div>
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">最多年代</p>
              <p className="text-xl font-black text-slate-800 dark:text-slate-100">
                {topKey(visitorComparison.periodA.ageGroups) ?? "—"}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">最多エリア</p>
              <p className="text-xl font-black text-slate-800 dark:text-slate-100">
                {topKey(visitorComparison.periodA.cities) ?? "—"}
              </p>
            </div>
          </div>

          {/* 年代別 前月比較 */}
          <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-5">
            <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <div className="w-1.5 h-6 bg-indigo-400 rounded-full" />
              年代別 来院者数（前月比）
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={ageOrder.map((k) => ({
                  name: k,
                  [visitorComparison.periodA.label]: visitorComparison.periodA.ageGroups[k] ?? 0,
                  [visitorComparison.periodB.label]: visitorComparison.periodB.ageGroups[k] ?? 0,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey={visitorComparison.periodA.label} fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey={visitorComparison.periodB.label} fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <DiffTable
              rows={ageOrder
                .map((k) => ({ name: k, ...visitorComparison.ageGroupsDiff[k] }))
                .filter((r) => (r.a ?? 0) > 0 || (r.b ?? 0) > 0)}
              labelA={visitorComparison.periodA.label}
              labelB={visitorComparison.periodB.label}
              unit="名"
            />
          </div>

          {/* エリア別 前月比較 TOP8 */}
          <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-5">
            <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-500" />
              在住エリア別 来院者数 TOP8（前月比）
            </h2>
            {(() => {
              const sortedCities = Object.entries(visitorComparison.citiesDiff)
                .sort((x, y) => (y[1].a ?? 0) - (x[1].a ?? 0))
                .slice(0, 8);
              if (sortedCities.length === 0) {
                return (
                  <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">
                    住所データが登録されている来院者がいません
                  </div>
                );
              }
              return (
                <>
                  <ResponsiveContainer width="100%" height={Math.max(220, sortedCities.length * 36)}>
                    <BarChart
                      data={sortedCities.map(([name, v]) => ({
                        name,
                        [visitorComparison.periodA.label]: v.a,
                        [visitorComparison.periodB.label]: v.b,
                      }))}
                      layout="vertical"
                      margin={{ left: 50, right: 30 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: "bold" }} width={120} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey={visitorComparison.periodA.label} fill="#10b981" radius={[0, 4, 4, 0]} barSize={14} />
                      <Bar dataKey={visitorComparison.periodB.label} fill="#cbd5e1" radius={[0, 4, 4, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                  <DiffTable
                    rows={sortedCities.map(([name, v]) => ({ name, ...v }))}
                    labelA={visitorComparison.periodA.label}
                    labelB={visitorComparison.periodB.label}
                    unit="名"
                  />
                </>
              );
            })()}
            <p className="text-[11px] text-slate-400 mt-3">
              ※ customers.city_name が未入力の場合は住所文字列から市区町村名を自動抽出します。それでも判定できない場合は「不明」に集計されます。
            </p>
          </div>
        </div>
      )}

      {!loading && activeTab === "customers" && customerData && (
        <div className="space-y-6">
          {/* KPIサマリー */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-6 text-center">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-widest">対象期間の新規患者数</p>
              <p className="text-4xl font-black text-indigo-600 dark:text-indigo-400">{customerData.total}<span className="text-lg font-bold ml-1">名</span></p>
            </div>
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-6 text-center">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-widest">主な来院経路</p>
              <p className="text-2xl font-black text-slate-800 dark:text-slate-100">
                {sourceData.length > 0 ? sourceData.sort((a, b) => b.value - a.value)[0].name : "データなし"}
              </p>
              <p className="text-xs text-slate-400 font-medium">最多の流入元</p>
            </div>
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-6 text-center">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-widest">主なエリア</p>
              <p className="text-2xl font-black text-slate-800 dark:text-slate-100">
                {cityData.length > 0 ? cityData[0].name : "データなし"}
              </p>
              <p className="text-xs text-slate-400 font-medium">最多の在住地</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 性別比率 */}
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-6">
              <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <div className="w-1.5 h-6 bg-rose-400 rounded-full" />
                性別比率
              </h2>
              <div className="h-[260px]">
                {genderData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={genderData}
                        cx="50%" cy="45%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, value }) => `${name === 'male' ? '男性' : name === 'female' ? '女性' : name}: ${value}名`}
                      >
                        {genderData.map((entry, i) => (
                          <Cell key={i} fill={entry.name === 'male' ? '#3b82f6' : entry.name === 'female' ? '#f43f5e' : '#94a3b8'} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-sm">データなし</div>}
              </div>
            </div>

            {/* 年代分布 */}
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-6">
              <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <div className="w-1.5 h-6 bg-indigo-400 rounded-full" />
                年代分布
              </h2>
              <div className="h-[260px]">
                {ageData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ageData} layout="vertical" margin={{ left: 40, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 'bold' }} />
                      <Tooltip cursor={{ fill: 'transparent' }} />
                      <Bar dataKey="value" name="人数" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-sm">データなし</div>}
              </div>
            </div>

            {/* 来院経路 */}
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-6">
              <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <div className="w-1.5 h-6 bg-amber-400 rounded-full" />
                来院のきっかけ（流入元）
              </h2>
              <div className="h-[260px]">
                {sourceData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sourceData}
                        cx="50%" cy="45%"
                        innerRadius={50} outerRadius={84} paddingAngle={2}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {sourceData.map((_, i) => (
                          <Cell key={i} fill={EXPENSE_COLORS[i % EXPENSE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div className="h-full flex items-center justify-center text-slate-400 text-sm">データなし</div>}
              </div>
            </div>

            {/* 在住地域分布 */}
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm p-6">
              <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <div className="w-1.5 h-6 bg-emerald-400 rounded-full" />
                居住地分布（在住地TOP5）
              </h2>
              <div className="h-[260px]">
                {cityData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cityData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 'bold' }} />
                      <YAxis hide />
                      <Tooltip />
                      <Bar dataKey="value" name="人数" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-sm">データなし</div>}
              </div>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-6 border border-amber-100 dark:border-amber-900/30 flex gap-4">
            <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-amber-200">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h4 className="font-bold text-amber-800 dark:text-amber-400 text-lg mb-1">AI秘書の戦略アドバイス</h4>
              <p className="text-sm text-amber-900 dark:text-amber-300 leading-relaxed mb-4">
                グラフを見て気になる点はありますか？例えば、Instagramからの流入が多いけれど２０代が少ない、といった傾向があれば、投稿ターゲットを調整するチャンスです。
              </p>
              <Button onClick={handleGenerateComment} variant="outline" className="bg-white dark:bg-slate-800 border-amber-300 dark:border-amber-900/50 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-slate-700">
                顧客属性に基づいた詳細分析を依頼する
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function pctCalc(a: number, b: number) {
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 100);
}

const ageOrder = ["20歳未満", "20代", "30代", "40代", "50代", "60代", "70代", "80歳以上", "不明"];

function topKey(map: Record<string, number>): string | null {
  const entries = Object.entries(map).filter(([k]) => k !== "不明");
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

// 前月比較テーブル
function DiffTable({
  rows, labelA, labelB, unit,
}: {
  rows: Array<{ name: string; a: number; b: number; diff: number; pct: number }>;
  labelA: string; labelB: string; unit: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500 font-bold">
            <th className="px-3 py-2 text-left">区分</th>
            <th className="px-3 py-2 text-right text-indigo-600 dark:text-indigo-400">{labelA}</th>
            <th className="px-3 py-2 text-right text-slate-400">{labelB}</th>
            <th className="px-3 py-2 text-right">差</th>
            <th className="px-3 py-2 text-right">変化率</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {rows.map((r) => (
            <tr key={r.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
              <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{r.name}</td>
              <td className="px-3 py-2 text-right text-indigo-700 dark:text-indigo-400 font-bold">{r.a}{unit}</td>
              <td className="px-3 py-2 text-right text-slate-400">{r.b}{unit}</td>
              <td className={`px-3 py-2 text-right font-bold ${r.diff === 0 ? "text-slate-400" : r.diff > 0 ? "text-emerald-600" : "text-red-500"}`}>
                {r.diff > 0 ? "+" : ""}{r.diff === 0 ? "±0" : r.diff}{unit}
              </td>
              <td className="px-3 py-2 text-right">
                <Delta value={r.diff} pct={r.pct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
