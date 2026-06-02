"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths } from "date-fns";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";
import { ArrowLeft, Loader2, PieChart as PieIcon, TrendingUp, Users, Coins } from "lucide-react";
import {
  getTallyCategoryBreakdown, getSalesTrend, getStaffSalesBreakdown,
  type CategoryBreakdownRow, type TrendPoint, type StaffBreakdownRow,
} from "@/app/actions/tally";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#8b5cf6", "#ef4444", "#84cc16", "#64748b"];
const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;

type Preset = "week" | "month" | "lastMonth" | "custom";

function rangeForPreset(p: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  if (p === "week") {
    return { from: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"), to: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd") };
  }
  if (p === "month") {
    return { from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") };
  }
  if (p === "lastMonth") {
    const lm = subMonths(now, 1);
    return { from: format(startOfMonth(lm), "yyyy-MM-dd"), to: format(endOfMonth(lm), "yyyy-MM-dd") };
  }
  return { from: customFrom, to: customTo };
}

export default function SalesAnalyticsPage() {
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [granularity, setGranularity] = useState<"day" | "month">("day");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryBreakdownRow[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [staffRows, setStaffRows] = useState<StaffBreakdownRow[]>([]);
  const [total, setTotal] = useState(0);

  const { from, to } = useMemo(() => rangeForPreset(preset, customFrom, customTo), [preset, customFrom, customTo]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      getTallyCategoryBreakdown(from, to),
      getSalesTrend(granularity, from, to),
      getStaffSalesBreakdown(from, to),
    ])
      .then(([cat, tr, st]) => {
        if (!active) return;
        if (!cat.success) { setError(cat.error ?? "取得に失敗しました"); return; }
        setCategories(cat.rows ?? []);
        setTotal(cat.total ?? 0);
        setTrend(tr.points ?? []);
        setStaffRows(st.rows ?? []);
      })
      .catch(() => active && setError("取得に失敗しました"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [from, to, granularity]);

  const periodTotal = useMemo(() => trend.reduce((s, p) => s + p.amount, 0), [trend]);
  const periodCount = useMemo(() => trend.reduce((s, p) => s + p.count, 0), [trend]);

  return (
    <div className="p-3 sm:p-5 max-w-[1100px] mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Link href="/admin/sales" className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow">
          <TrendingUp className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">売上データ分析</h1>
          <p className="text-xs text-slate-500">カテゴリ別・推移・担当別</p>
        </div>
      </div>

      {/* 期間セレクタ */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {([["week", "今週"], ["month", "今月"], ["lastMonth", "先月"], ["custom", "期間指定"]] as [Preset, string][]).map(([p, label]) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={[
              "px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors",
              preset === p
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
        {preset === "custom" && (
          <div className="flex items-center gap-1.5 text-sm">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
            <span className="text-slate-400">〜</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
          </div>
        )}
        <span className="text-xs text-slate-400 ml-1">{from} 〜 {to}</span>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin inline-block" /> 集計中...</div>
      ) : error ? (
        <div className="p-6 text-center text-rose-600 bg-rose-50 border border-rose-200 rounded-xl">{error}</div>
      ) : (
        <>
          {/* サマリ */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-4 shadow">
              <p className="text-[11px] opacity-80 flex items-center gap-1"><Coins className="w-3.5 h-3.5" />期間売上</p>
              <p className="text-2xl font-black tracking-tight">{yen(periodTotal || total)}</p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
              <p className="text-[11px] text-slate-500">記帳件数</p>
              <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{periodCount}<span className="text-sm font-medium text-slate-400 ml-1">件</span></p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
              <p className="text-[11px] text-slate-500">平均単価</p>
              <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{periodCount ? yen(periodTotal / periodCount) : "—"}</p>
            </div>
          </div>

          {/* カテゴリ別構成 */}
          <section className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 mb-5">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-1.5"><PieIcon className="w-4 h-4 text-indigo-500" />カテゴリ別の売上構成</h2>
            {categories.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">データがありません</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4 items-center">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={categories} dataKey="amount" nameKey="label" cx="50%" cy="50%" outerRadius={90} innerRadius={45}>
                      {categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => yen(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {categories.map((c, i) => (
                    <div key={c.key} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="flex-1 text-slate-600 dark:text-slate-300 truncate">{c.label}</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{yen(c.amount)}</span>
                      <span className="text-xs text-slate-400 w-12 text-right tabular-nums">{(c.ratio * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 推移 */}
          <section className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-emerald-500" />売上の推移</h2>
              <div className="flex gap-1">
                {(["day", "month"] as const).map((g) => (
                  <button key={g} onClick={() => setGranularity(g)}
                    className={["px-2.5 py-1 rounded-lg text-xs font-medium border", granularity === g ? "bg-emerald-600 text-white border-emerald-600" : "bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"].join(" ")}>
                    {g === "day" ? "日別" : "月別"}
                  </button>
                ))}
              </div>
            </div>
            {trend.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">データがありません</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: any) => yen(Number(v))} />
                  <Line type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} name="売上" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </section>

          {/* 担当別 */}
          <section className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-1.5"><Users className="w-4 h-4 text-amber-500" />担当（スタッフ）別の売上</h2>
            {staffRows.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">データがありません</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, staffRows.length * 44)}>
                <BarChart data={staffRows} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                  <Tooltip formatter={(v: any) => yen(Number(v))} />
                  <Bar dataKey="amount" name="売上" radius={[0, 6, 6, 0]}>
                    {staffRows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>
        </>
      )}
    </div>
  );
}
