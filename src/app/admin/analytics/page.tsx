"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import {
  getComparisonData, getYearlyTrend, getMonthAnalytics, getWeekdayBreakdown,
  type ComparisonResult, type YearlyTrendPoint, type MonthAnalytics,
} from "@/app/actions/analytics";
import { generateAnalyticsComment } from "@/app/actions/ai-strategist";
import { TrendingUp, TrendingDown, Minus, Users, Banknote, ReceiptText, ChartBar, Calendar, Sparkles, Loader2 } from "lucide-react";

// ========= ユーティリティ =========
const yen = (n: number) => `¥${Math.abs(n).toLocaleString()}`;
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
          <div className="text-xs text-slate-400 mt-0.5">比較: {format(valueB)}</div>
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
  const [isPending, startTransition] = useTransition();

  // 期間A（今月）、期間B（先月）
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
  const [aiComment, setAiComment] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const [comp, tr, wd] = await Promise.all([
        getComparisonData(yearA, monthA, yearB, monthB),
        getYearlyTrend(trendYear),
        getWeekdayBreakdown(yearA, monthA),
      ]);
      setComparison(comp);
      setTrend(tr);
      setWeekday(wd);
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
    const res = await generateAnalyticsComment(JSON.stringify(comparison));
    if (res.success) setAiComment(res.comment ?? null);
    else setAiComment("生成に失敗しました。もう一度お試しください。");
    setAiLoading(false);
  };

  // 経費カテゴリPieデータ
  const expPieData = a
    ? Object.entries(a.expenses.byCategory).map(([name, value]) => ({ name, value }))
    : [];

  // 自費 vs 保険 円グラフ
  const revMixA = a ? [
    { name: "自費", value: a.revenue.cash },
    { name: "保険", value: a.revenue.insurance },
  ] : [];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">経営分析</h1>
          <p className="text-sm text-slate-500 mt-0.5">期間比較・売上トレンド・来院分析</p>
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
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5 flex gap-4">
          <div className="shrink-0 w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-indigo-700 mb-1">経営軍師AIからの分析コメント</p>
            {aiLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" /> 分析中...
              </div>
            ) : (
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{aiComment}</p>
            )}
          </div>
        </div>
      )}

      {/* 期間比較コントロール */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-slate-700">クイック比較：</span>
          {[
            { key: "prev-month", label: "先月 vs 今月" },
            { key: "last-year", label: "去年同月 vs 今月" },
            { key: "q-compare", label: "3ヶ月前 vs 今月" },
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
          <MonthPicker label="比較元（A）" year={yearA} month={monthA} onChange={(y, m) => { setYearA(y); setMonthA(m); }} />
          <span className="text-slate-400 font-bold hidden md:block">vs</span>
          <MonthPicker label="比較先（B）" year={yearB} month={monthB} onChange={(y, m) => { setYearB(y); setMonthB(m); }} />
        </div>
      </div>

      {loading && (
        <div className="text-center py-16 text-slate-400 text-sm animate-pulse">データ読み込み中...</div>
      )}

      {!loading && comparison && a && b && d && (
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
              label="客単価" valueA={a.avgSpend} valueB={b.avgSpend}
              diff={d.avgSpend} pct={d.avgSpendPct} format={yen}
              icon={<ChartBar className="w-4 h-4" />}
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
                  <tr className="bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">指標</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-indigo-600 uppercase">{a.label}</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-slate-400 uppercase">{b.label}</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase">増減</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase">変化率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[
                    { label: "売上合計", a: a.revenue.total, b: b.revenue.total, diff: d.revenueTotal, pct: d.revenuePct, fmt: yen },
                    { label: "　自費売上", a: a.revenue.cash, b: b.revenue.cash, diff: d.cash, pct: d.cashPct, fmt: yen },
                    { label: "　保険入金", a: a.revenue.insurance, b: b.revenue.insurance, diff: d.insurance, pct: d.insurancePct, fmt: yen },
                    { label: "経費合計", a: a.expenses.total, b: b.expenses.total, diff: d.expenses, pct: d.expensesPct, fmt: yen, invert: true },
                    { label: "利益", a: a.profit, b: b.profit, diff: d.profit, pct: d.profitPct, fmt: yen },
                    { label: "来院数", a: a.visits.total, b: b.visits.total, diff: d.visits, pct: d.visitsPct, fmt: (n: number) => `${n}件` },
                    { label: "　新規患者", a: a.visits.newPatients, b: b.visits.newPatients, diff: d.newPatients, pct: d.newPatientsPct, fmt: (n: number) => `${n}名` },
                    { label: "　リピート患者", a: a.visits.returning, b: b.visits.returning, diff: a.visits.returning - b.visits.returning, pct: pctCalc(a.visits.returning, b.visits.returning), fmt: (n: number) => `${n}名` },
                    { label: "客単価", a: a.avgSpend, b: b.avgSpend, diff: d.avgSpend, pct: d.avgSpendPct, fmt: yen },
                    { label: "新規率", a: a.visits.total > 0 ? Math.round((a.visits.newPatients / a.visits.total) * 100) : 0, b: b.visits.total > 0 ? Math.round((b.visits.newPatients / b.visits.total) * 100) : 0, diff: 0, pct: 0, fmt: (n: number) => `${n}%` },
                  ].map((row, i) => (
                    <tr key={i} className={`hover:bg-slate-50 transition-colors ${row.label.startsWith("　") ? "text-slate-500" : "font-semibold text-slate-800"}`}>
                      <td className="px-5 py-3">{row.label}</td>
                      <td className="px-5 py-3 text-right text-indigo-700 font-bold">{row.fmt(row.a)}</td>
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

          {/* グラフ 2カラム */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 売上構成 A */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h2 className="font-bold text-slate-800 mb-4">{a.label} 売上内訳</h2>
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
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h2 className="font-bold text-slate-800 mb-4">{a.label} 経費カテゴリ</h2>
              {expPieData.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center text-slate-300 text-sm">経費データなし</div>
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

            {/* 来院数バー比較 */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h2 className="font-bold text-slate-800 mb-4">来院数比較（新規 / リピート）</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={[
                  { label: a.label, 新規: a.visits.newPatients, リピート: a.visits.returning },
                  { label: b.label, 新規: b.visits.newPatients, リピート: b.visits.returning },
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
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h2 className="font-bold text-slate-800 mb-4">{a.label} 曜日別来院数</h2>
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
        </>
      )}

      {/* 年間トレンド */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-bold text-slate-800">年間トレンド</h2>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select
              value={trendYear}
              onChange={(e) => setTrendYear(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 bg-white"
            >
              {[THIS_YEAR - 1, THIS_YEAR].map((y) => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
          </div>
        </div>

        {/* 売上・経費・利益 */}
        <div>
          <p className="text-xs text-slate-500 font-semibold mb-2">売上 / 経費 / 利益（月次）</p>
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
          <p className="text-xs text-slate-500 font-semibold mb-2">来院数 / 新規患者数（月次）</p>
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
    </div>
  );
}

function pctCalc(a: number, b: number) {
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 100);
}
