"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Area,
} from "recharts";
import {
  getComparisonData, getYearlyTrend, getWeekdayBreakdown, getCustomerAnalytics,
  type ComparisonResult, type YearlyTrendPoint, type CustomerAnalytics,
} from "@/app/actions/analytics";
import { generateAnalyticsComment } from "@/app/actions/ai-secretary";
import { 
  TrendingUp, TrendingDown, Minus, Users, Banknote, 
  ReceiptText, ChartBar, Calendar, Sparkles, Loader2 
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ========= 繝ｦ繝ｼ繝・ぅ繝ｪ繝・ぅ =========
const yen = (n: number) => `ﾂ･${Math.abs(n).toLocaleString()}`;
const fmt = (n: number) => Math.abs(n).toLocaleString();

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
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
      <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide">
        {icon}{label}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-2xl font-bold text-slate-900">{format(valueA)}</div>
          <div className="text-xs text-slate-400 mt-0.5">豈碑ｼ・ {format(valueB)}</div>
        </div>
        <Delta value={diff} pct={pct} invert={invert} />
      </div>
      <div className={`h-1.5 rounded-full w-full bg-slate-100`}>
        <div
          className={`h-1.5 rounded-full ${diff >= 0 ? "bg-emerald-400" : "bg-red-400"}`}
          style={{ width: `${Math.min(100, valueB > 0 ? (valueA / Math.max(valueA, valueB)) * 100 : 100)}%` }}
        />
      </div>
    </div>
  );
}

// ========= 譛医ヴ繝・き繝ｼ =========
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
          <option key={y} value={y}>{y}蟷ｴ</option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => onChange(year, Number(e.target.value))}
        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 bg-white"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>{m}譛・/option>
        ))}
      </select>
    </div>
  );
}

// ========= 繝｡繧､繝ｳ繝壹・繧ｸ =========
export default function AnalyticsPage() {
  const [isPending, startTransition] = useTransition();

  // 譛滄俣A・井ｻ頑怦・峨∵悄髢釘・亥・譛茨ｼ・  const [yearA, setYearA] = useState(THIS_YEAR);
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
  const [activeTab, setActiveTab] = useState<"performance" | "customers">("performance");
  const [aiComment, setAiComment] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const [comp, tr, wd, cust] = await Promise.all([
        getComparisonData(yearA, monthA, yearB, monthB),
        getYearlyTrend(trendYear),
        getWeekdayBreakdown(yearA, monthA),
        getCustomerAnalytics(yearA, monthA),
      ]);
      setComparison(comp);
      setTrend(tr);
      setWeekday(wd);
      setCustomerData(cust);
      setLoading(false);
    });
  }, [yearA, monthA, yearB, monthB, trendYear]);

  useEffect(() => { load(); }, [load]);

  // 繧ｯ繧､繝・け繝励Μ繧ｻ繝・ヨ
  const applyPreset = (preset: "prev-month" | "last-year" | "q-compare") => {
    if (preset === "prev-month") {
      const p = prevMonth(THIS_YEAR, THIS_MONTH);
      setYearA(THIS_YEAR); setMonthA(THIS_MONTH);
      setYearB(p.year); setMonthB(p.month);
    } else if (preset === "last-year") {
      setYearA(THIS_YEAR); setMonthA(THIS_MONTH);
      setYearB(THIS_YEAR - 1); setMonthB(THIS_MONTH);
    } else if (preset === "q-compare") {
      // 莉頑怦 vs 3繝ｶ譛亥燕
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
    else setAiComment("逕滓・縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲ゅｂ縺・ｸ蠎ｦ縺願ｩｦ縺励￥縺縺輔＞縲・);
    setAiLoading(false);
  };

  // 邨瑚ｲｻ繧ｫ繝・ざ繝ｪPie繝・・繧ｿ
  const expPieData = a
    ? Object.entries(a.expenses.byCategory).map(([name, value]) => ({ name, value }))
    : [];

  // 閾ｪ雋ｻ vs 菫晞匱 蜀・げ繝ｩ繝・  const revMixA = a ? [
    { name: "閾ｪ雋ｻ", value: a.revenue.cash },
    { name: "菫晞匱", value: a.revenue.insurance },
  ] : [];

  // 鬘ｧ螳｢螻樊ｧ繝・・繧ｿ螟画鋤
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
      {/* 繝倥ャ繝繝ｼ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">邨悟霧蛻・梵</h1>
          <p className="text-sm text-slate-500 mt-0.5">譛滄俣豈碑ｼ・・螢ｲ荳翫ヨ繝ｬ繝ｳ繝峨・譚･髯｢蛻・梵</p>
        </div>
        {comparison && (
          <button
            onClick={handleGenerateComment}
            disabled={aiLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60"
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            AI縺ｫ蛻・梵縺輔○繧・          </button>
        )}
      </div>

      {/* AI蛻・梵繧ｳ繝｡繝ｳ繝・*/}
      {(aiLoading || aiComment) && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5 flex gap-4">
          <div className="shrink-0 w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-indigo-700 mb-1">AI遘俶嶌縺ｫ繧医ｋ邨悟霧蛻・梵繧ｳ繝｡繝ｳ繝・/p>
            {aiLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" /> 蛻・梵荳ｭ...
              </div>
            ) : (
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{aiComment}</p>
            )}
          </div>
        </div>
      )}

      {/* 譛滄俣豈碑ｼ・さ繝ｳ繝医Ο繝ｼ繝ｫ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-slate-700">繧ｯ繧､繝・け豈碑ｼ・ｼ・/span>
          {[
            { key: "prev-month", label: "蜈域怦 vs 莉頑怦" },
            { key: "last-year", label: "蜴ｻ蟷ｴ蜷梧怦 vs 莉頑怦" },
            { key: "q-compare", label: "3繝ｶ譛亥燕 vs 莉頑怦" },
          ].map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key as any)}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-6 items-center">
          <MonthPicker label="豈碑ｼ・・・・・・ year={yearA} month={monthA} onChange={(y, m) => { setYearA(y); setMonthA(m); }} />
          <span className="text-slate-400 font-bold hidden md:block">vs</span>
          <MonthPicker label="豈碑ｼ・・・・・・ year={yearB} month={monthB} onChange={(y, m) => { setYearB(y); setMonthB(m); }} />
        </div>
      </div>

      {/* 繧ｿ繝門・繧頑崛縺・*/}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("performance")}
          className={`px-6 py-3 text-sm font-bold transition-colors border-b-2 ${activeTab === "performance" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          邨悟霧螳溽ｸｾ繝ｻ繝医Ξ繝ｳ繝・        </button>
        <button
          onClick={() => setActiveTab("customers")}
          className={`px-6 py-3 text-sm font-bold transition-colors border-b-2 ${activeTab === "customers" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          譁ｰ隕城｡ｧ螳｢螻樊ｧ蛻・梵
        </button>
      </div>

      {loading && (
        <div className="text-center py-16 text-slate-400 text-sm animate-pulse">繝・・繧ｿ隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ...</div>
      )}

      {!loading && activeTab === "performance" && comparison && a && b && d && (
        <>
          {/* KPI繧ｫ繝ｼ繝・*/}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="螢ｲ荳雁粋險・ valueA={a.revenue.total} valueB={b.revenue.total}
              diff={d.revenueTotal} pct={d.revenuePct} format={yen}
              icon={<Banknote className="w-4 h-4" />}
            />
            <KpiCard
              label="譚･髯｢謨ｰ" valueA={a.visits.total} valueB={b.visits.total}
              diff={d.visits} pct={d.visitsPct} format={(n) => `${n}莉ｶ`}
              icon={<Users className="w-4 h-4" />}
            />
            <KpiCard
              label="蛻ｩ逶奇ｼ亥｣ｲ荳・邨瑚ｲｻ・・ valueA={a.profit} valueB={b.profit}
              diff={d.profit} pct={d.profitPct} format={yen}
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <KpiCard
              label="邨瑚ｲｻ" valueA={a.expenses.total} valueB={b.expenses.total}
              diff={d.expenses} pct={d.expensesPct} format={yen} invert
              icon={<ReceiptText className="w-4 h-4" />}
            />
            <KpiCard
              label="閾ｪ雋ｻ螢ｲ荳・ valueA={a.revenue.cash} valueB={b.revenue.cash}
              diff={d.cash} pct={d.cashPct} format={yen}
              icon={<Banknote className="w-4 h-4" />}
            />
            <KpiCard
              label="菫晞匱蜈･驥・ valueA={a.revenue.insurance} valueB={b.revenue.insurance}
              diff={d.insurance} pct={d.insurancePct} format={yen}
              icon={<Banknote className="w-4 h-4" />}
            />
            <KpiCard
              label="譁ｰ隕乗ぅ閠・ valueA={a.visits.newPatients} valueB={b.visits.newPatients}
              diff={d.newPatients} pct={d.newPatientsPct} format={(n) => `${n}蜷港}
              icon={<Users className="w-4 h-4" />}
            />
            <KpiCard
              label="螳｢蜊倅ｾ｡" valueA={a.avgSpend} valueB={b.avgSpend}
              diff={d.avgSpend} pct={d.avgSpendPct} format={yen}
              icon={<ChartBar className="w-4 h-4" />}
            />
          </div>

          {/* 隧ｳ邏ｰ豈碑ｼ・ユ繝ｼ繝悶Ν */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">隧ｳ邏ｰ豈碑ｼ・/h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">謖・ｨ・/th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-indigo-600 uppercase">{a.label}</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-slate-400 uppercase">{b.label}</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase">蠅玲ｸ・/th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase">螟牙喧邇・/th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[
                    { label: "螢ｲ荳雁粋險・, a: a.revenue.total, b: b.revenue.total, diff: d.revenueTotal, pct: d.revenuePct, fmt: yen },
                    { label: "縲閾ｪ雋ｻ螢ｲ荳・, a: a.revenue.cash, b: b.revenue.cash, diff: d.cash, pct: d.cashPct, fmt: yen },
                    { label: "縲菫晞匱蜈･驥・, a: a.revenue.insurance, b: b.revenue.insurance, diff: d.insurance, pct: d.insurancePct, fmt: yen },
                    { label: "邨瑚ｲｻ蜷郁ｨ・, a: a.expenses.total, b: b.expenses.total, diff: d.expenses, pct: d.expensesPct, fmt: yen, invert: true },
                    { label: "蛻ｩ逶・, a: a.profit, b: b.profit, diff: d.profit, pct: d.profitPct, fmt: yen },
                    { label: "譚･髯｢謨ｰ", a: a.visits.total, b: b.visits.total, diff: d.visits, pct: d.visitsPct, fmt: (n: number) => `${n}莉ｶ` },
                    { label: "縲譁ｰ隕乗ぅ閠・, a: a.visits.newPatients, b: b.visits.newPatients, diff: d.newPatients, pct: d.newPatientsPct, fmt: (n: number) => `${n}蜷港 },
                    { label: "縲繝ｪ繝斐・繝域ぅ閠・, a: a.visits.returning, b: b.visits.returning, diff: a.visits.returning - b.visits.returning, pct: pctCalc(a.visits.returning, b.visits.returning), fmt: (n: number) => `${n}蜷港 },
                    { label: "螳｢蜊倅ｾ｡", a: a.avgSpend, b: b.avgSpend, diff: d.avgSpend, pct: d.avgSpendPct, fmt: yen },
                    { label: "譁ｰ隕冗紫", a: a.visits.total > 0 ? Math.round((a.visits.newPatients / a.visits.total) * 100) : 0, b: b.visits.total > 0 ? Math.round((b.visits.newPatients / b.visits.total) * 100) : 0, diff: 0, pct: 0, fmt: (n: number) => `${n}%` },
                  ].map((row, i) => (
                    <tr key={i} className={`hover:bg-slate-50 transition-colors ${row.label.startsWith("縲") ? "text-slate-500" : "font-semibold text-slate-800"}`}>
                      <td className="px-5 py-3">{row.label}</td>
                      <td className="px-5 py-3 text-right text-indigo-700 font-bold">{row.fmt(row.a)}</td>
                      <td className="px-5 py-3 text-right text-slate-400">{row.fmt(row.b)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={row.diff === 0 ? "text-slate-400" : (row.invert ? (row.diff < 0 ? "text-emerald-600" : "text-red-500") : (row.diff > 0 ? "text-emerald-600" : "text-red-500"))}>
                          {row.diff > 0 ? "+" : ""}{row.diff === 0 ? "ﾂｱ0" : row.fmt(row.diff)}
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

          {/* 繧ｰ繝ｩ繝・2繧ｫ繝ｩ繝 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 螢ｲ荳頑ｧ区・ A */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h2 className="font-bold text-slate-800 mb-4">{a.label} 螢ｲ荳雁・險ｳ</h2>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={revMixA} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name} ﾂ･${value.toLocaleString()}`}>
                    <Cell fill="#6366f1" />
                    <Cell fill="#a78bfa" />
                  </Pie>
                  <Tooltip formatter={(v: any) => yen(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* 邨瑚ｲｻ繧ｫ繝・ざ繝ｪ */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h2 className="font-bold text-slate-800 mb-4">{a.label} 邨瑚ｲｻ繧ｫ繝・ざ繝ｪ</h2>
              {expPieData.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center text-slate-300 text-sm">邨瑚ｲｻ繝・・繧ｿ縺ｪ縺・/div>
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

            {/* 譚･髯｢謨ｰ繝舌・豈碑ｼ・*/}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h2 className="font-bold text-slate-800 mb-4">譚･髯｢謨ｰ豈碑ｼ・ｼ域眠隕・/ 繝ｪ繝斐・繝茨ｼ・/h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={[
                  { label: a.label, 譁ｰ隕・ a.visits.newPatients, 繝ｪ繝斐・繝・ a.visits.returning },
                  { label: b.label, 譁ｰ隕・ b.visits.newPatients, 繝ｪ繝斐・繝・ b.visits.returning },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="譁ｰ隕・ fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="繝ｪ繝斐・繝・ fill="#a78bfa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 譖懈律蛻･譚･髯｢謨ｰ */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h2 className="font-bold text-slate-800 mb-4">{a.label} 譖懈律蛻･譚･髯｢謨ｰ</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weekday}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 13 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="譚･髯｢謨ｰ" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 蟷ｴ髢薙ヨ繝ｬ繝ｳ繝・*/}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-bold text-slate-800">蟷ｴ髢薙ヨ繝ｬ繝ｳ繝・/h2>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <select
                  value={trendYear}
                  onChange={(e) => setTrendYear(Number(e.target.value))}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 bg-white"
                >
                  {[THIS_YEAR - 1, THIS_YEAR].map((y) => (
                    <option key={y} value={y}>{y}蟷ｴ</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 螢ｲ荳翫・邨瑚ｲｻ繝ｻ蛻ｩ逶・*/}
            <div>
              <p className="text-xs text-slate-500 font-semibold mb-2">螢ｲ荳・/ 邨瑚ｲｻ / 蛻ｩ逶奇ｼ域怦谺｡・・/p>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}荳㌔} />
                  <Tooltip formatter={(v: any) => yen(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" name="螢ｲ荳・ fill="#ede9fe" stroke="#6366f1" strokeWidth={2} />
                  <Line type="monotone" dataKey="expenses" name="邨瑚ｲｻ" stroke="#f43f5e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="profit" name="蛻ｩ逶・ stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* 譚･髯｢謨ｰ繝医Ξ繝ｳ繝・*/}
            <div>
              <p className="text-xs text-slate-500 font-semibold mb-2">譚･髯｢謨ｰ / 譁ｰ隕乗ぅ閠・焚・域怦谺｡・・/p>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="visits" name="譚･髯｢謨ｰ蜷郁ｨ・ fill="#c7d2fe" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="newPatients" name="譁ｰ隕乗ぅ閠・ stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {!loading && activeTab === "customers" && customerData && (
        <div className="space-y-6">
            {/* KPI繧ｵ繝槭Μ繝ｼ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center">
                    <p className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">蟇ｾ雎｡譛滄俣縺ｮ譁ｰ隕乗ぅ閠・焚</p>
                    <p className="text-4xl font-black text-indigo-600">{customerData.total}<span className="text-lg font-bold ml-1">蜷・/span></p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center">
                    <p className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">荳ｻ隕√↑譚･髯｢邨瑚ｷｯ</p>
                    <p className="text-2xl font-black text-slate-800">
                        {sourceData.length > 0 ? sourceData.sort((a,b) => b.value - a.value)[0].name : "繝・・繧ｿ縺ｪ縺・}
                    </p>
                    <p className="text-xs text-slate-400 font-medium">譛螟壹・豬∝・蜈・/p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center">
                    <p className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">荳ｻ隕√お繝ｪ繧｢</p>
                    <p className="text-2xl font-black text-slate-800">
                        {cityData.length > 0 ? cityData[0].name : "繝・・繧ｿ縺ｪ縺・}
                    </p>
                    <p className="text-xs text-slate-400 font-medium">荳贋ｽ阪・蟶ら伴譚・/p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 諤ｧ蛻･豈・*/}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                  <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-rose-400 rounded-full" />
                    諤ｧ蛻･豈・                  </h2>
                  <div className="h-[260px]">
                    {genderData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie 
                                    data={genderData} 
                                    cx="50%" cy="45%" 
                                    outerRadius={80} 
                                    dataKey="value" 
                                    label={({ name, value }) => `${name === 'male' ? '逕ｷ諤ｧ' : name === 'female' ? '螂ｳ諤ｧ' : name}: ${value}蜷港}
                                >
                                    {genderData.map((entry, i) => (
                                        <Cell key={i} fill={entry.name === 'male' ? '#3b82f6' : entry.name === 'female' ? '#f43f5e' : '#94a3b8'} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36}/>
                            </PieChart>
                        </ResponsiveContainer>
                    ) : <div className="h-full flex items-center justify-center text-slate-400 text-sm">繝・・繧ｿ縺ｪ縺・/div>}
                  </div>
                </div>

                {/* 蟷ｴ莉｣蛻・ｸ・*/}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                  <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-indigo-400 rounded-full" />
                    蟷ｴ莉｣蛻・ｸ・                  </h2>
                  <div className="h-[260px]">
                    {ageData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={ageData} layout="vertical" margin={{ left: 40, right: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 'bold' }} />
                                <Tooltip cursor={{fill: 'transparent'}} />
                                <Bar dataKey="value" name="莠ｺ謨ｰ" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={24} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <div className="h-full flex items-center justify-center text-slate-400 text-sm">繝・・繧ｿ縺ｪ縺・/div>}
                  </div>
                </div>

                {/* 譚･髯｢邨瑚ｷｯ */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                  <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-amber-400 rounded-full" />
                    譚･髯｢縺ｮ縺阪▲縺九￠・域ｵ∝・蜈・ｼ・                  </h2>
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
                                <Legend verticalAlign="bottom" height={36}/>
                            </PieChart>
                        </ResponsiveContainer>
                    ) : <div className="h-full flex items-center justify-center text-slate-400 text-sm">繝・・繧ｿ縺ｪ縺・/div>}
                  </div>
                </div>

                {/* 蟶ら伴譚大・蟶・*/}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                  <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-emerald-400 rounded-full" />
                    螻・ｽ丞慍蛻・ｸ・ｼ亥ｸら伴譚・TOP5・・                  </h2>
                  <div className="h-[260px]">
                    {cityData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={cityData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 'bold' }} />
                                <YAxis hide />
                                <Tooltip />
                                <Bar dataKey="value" name="莠ｺ謨ｰ" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <div className="h-full flex items-center justify-center text-slate-400 text-sm">繝・・繧ｿ縺ｪ縺・/div>}
                  </div>
                </div>
            </div>
            <div className="bg-amber-50 rounded-2xl p-6 border border-amber-100 flex gap-4">
                <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-amber-200">
                    <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h4 className="font-bold text-amber-800 text-lg mb-1">AI遘俶嶌縺ｮ謌ｦ陦薙い繝峨ヰ繧､繧ｹ</h4>
                    <p className="text-sm text-amber-900 leading-relaxed mb-4">
                        繧ｰ繝ｩ繝輔ｒ隕九※豌励↓縺ｪ繧狗せ縺ｯ縺ゅｊ縺ｾ縺吶°・滉ｾ九∴縺ｰ縲栗nstagram縺九ｉ縺ｮ豬∝・縺悟､壹＞縺代ｌ縺ｩ20莉｣縺悟ｰ代↑縺・阪→縺・▲縺溷だ蜷代′縺ゅｌ縺ｰ縲∵兜遞ｿ蜀・ｮｹ縺ｮ繧ｿ繝ｼ繧ｲ繝・ヨ繧定ｪｿ謨ｴ縺吶ｋ繝√Ε繝ｳ繧ｹ縺ｧ縺吶・                    </p>
                    <Button onClick={handleGenerateComment} variant="outline" className="bg-white border-amber-300 text-amber-700 hover:bg-amber-100">
                        鬘ｧ螳｢螻樊ｧ縺ｫ蝓ｺ縺･縺・◆隧ｳ邏ｰ蛻・梵繧剃ｾ晞ｼ縺吶ｋ
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

