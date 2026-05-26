import {
  getStaffCategoryProgress,
  COURSE_CATEGORIES,
  CATEGORY_LABELS,
  type CourseCategory,
} from "@/app/actions/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, TrendingUp, TrendingDown } from "lucide-react";

/**
 * スプレッドシート風のスタッフ × カテゴリ別 月間実績 / 目標 / 差分マトリクス。
 * カテゴリ: 柔整 / 鍼灸 / 整体（コース.category で分類）
 */
export default async function StaffTargetProgressWidget() {
  const res = await getStaffCategoryProgress();
  if (!res.success || !res.data) return null;
  const { monthLabel, rows, totals } = res.data;
  if (rows.length === 0) return null;

  const cellPct = (count: number, target: number | null): { label: string; tone: string } => {
    if (!target || target <= 0) {
      return { label: "—", tone: "text-slate-300 dark:text-slate-600" };
    }
    const pct = Math.round((count / target) * 100);
    if (pct >= 100) return { label: `${pct}%`, tone: "text-emerald-600 dark:text-emerald-400" };
    if (pct >= 80)  return { label: `${pct}%`, tone: "text-blue-600 dark:text-blue-400" };
    if (pct >= 50)  return { label: `${pct}%`, tone: "text-amber-600 dark:text-amber-400" };
    return { label: `${pct}%`, tone: "text-rose-600 dark:text-rose-400" };
  };

  const diffCell = (count: number, target: number | null) => {
    if (!target || target <= 0) return <span className="text-slate-300 dark:text-slate-600">—</span>;
    const diff = count - target;
    if (diff === 0) return <span className="text-slate-500 dark:text-slate-400 tabular-nums">±0</span>;
    if (diff > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">
          <TrendingUp className="w-3 h-3" /> +{diff}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-bold tabular-nums">
        <TrendingDown className="w-3 h-3" /> {diff}
      </span>
    );
  };

  // セルの色相: jusei=amber / shinkyu=violet / seitai=emerald（スプレッドシート風）
  const categoryHeaderClass: Record<CourseCategory, string> = {
    jusei: "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/40",
    shinkyu: "bg-violet-50 dark:bg-violet-900/20 text-violet-800 dark:text-violet-300 border-violet-200 dark:border-violet-900/40",
    seitai: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/40",
  };

  return (
    <Card className="shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-500" />
          スタッフ別 月間目標達成率（{monthLabel}・カテゴリ別）
        </CardTitle>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          柔整 / 鍼灸 / 整体ごとの実績・目標・差分。複数担当の予約は各スタッフに +1。
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th rowSpan={2} className="text-left px-3 py-2 border-b-2 border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-900 z-10">
                  スタッフ
                </th>
                {COURSE_CATEGORIES.map((cat) => (
                  <th
                    key={cat}
                    colSpan={4}
                    className={`text-center px-2 py-1.5 border-2 border-b-0 text-xs font-black ${categoryHeaderClass[cat]}`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </th>
                ))}
                <th colSpan={3} className="text-center px-2 py-1.5 border-2 border-b-0 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-black border-slate-200 dark:border-slate-700">
                  合計
                </th>
              </tr>
              <tr className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">
                {COURSE_CATEGORIES.map((cat) => (
                  <>
                    <th key={`${cat}-c`} className={`px-2 py-1.5 border ${categoryHeaderClass[cat]} font-bold`}>実績</th>
                    <th key={`${cat}-t`} className={`px-2 py-1.5 border ${categoryHeaderClass[cat]} font-bold`}>目標</th>
                    <th key={`${cat}-d`} className={`px-2 py-1.5 border ${categoryHeaderClass[cat]} font-bold`}>差</th>
                    <th key={`${cat}-p`} className={`px-2 py-1.5 border ${categoryHeaderClass[cat]} font-bold`}>達成率</th>
                  </>
                ))}
                <th className="px-2 py-1.5 border bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 font-bold">実績</th>
                <th className="px-2 py-1.5 border bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 font-bold">目標</th>
                <th className="px-2 py-1.5 border bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 font-bold">差</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.staff_id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-100 sticky left-0 bg-white dark:bg-slate-900 z-10 whitespace-nowrap">
                    {r.staff_name}
                    {r.uncategorized_count > 0 && (
                      <span className="ml-1 text-[10px] font-normal text-slate-400" title={`未分類: ${r.uncategorized_count}件`}>
                        ＋{r.uncategorized_count}
                      </span>
                    )}
                  </td>
                  {COURSE_CATEGORIES.map((cat) => {
                    const cell = r.by_category[cat];
                    const pct = cellPct(cell.count, cell.target);
                    return (
                      <>
                        <td key={`${cat}-c`} className="px-2 py-2 text-right tabular-nums font-bold text-slate-800 dark:text-slate-100">
                          {cell.count}
                        </td>
                        <td key={`${cat}-t`} className="px-2 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                          {cell.target ?? "—"}
                        </td>
                        <td key={`${cat}-d`} className="px-2 py-2 text-right tabular-nums">
                          {diffCell(cell.count, cell.target)}
                        </td>
                        <td key={`${cat}-p`} className={`px-2 py-2 text-right tabular-nums font-bold ${pct.tone}`}>
                          {pct.label}
                        </td>
                      </>
                    );
                  })}
                  <td className="px-2 py-2 text-right tabular-nums font-black text-slate-900 dark:text-slate-50 bg-slate-50 dark:bg-slate-800/50">
                    {r.total_count}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50">
                    {r.total_target || "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums bg-slate-50 dark:bg-slate-800/50">
                    {r.total_target > 0 ? diffCell(r.total_count, r.total_target) : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
              {/* 全員の合計行 */}
              <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 font-black">
                <td className="px-3 py-2 sticky left-0 bg-slate-100 dark:bg-slate-800/50 z-10 text-rose-600 dark:text-rose-400 whitespace-nowrap">
                  全員の合計
                </td>
                {COURSE_CATEGORIES.map((cat) => {
                  const tc = totals.by_category[cat];
                  const pct = cellPct(tc.count, tc.target);
                  return (
                    <>
                      <td key={`${cat}-tc`} className="px-2 py-2 text-right tabular-nums">{tc.count}</td>
                      <td key={`${cat}-tt`} className="px-2 py-2 text-right tabular-nums text-rose-600 dark:text-rose-400">{tc.target || "—"}</td>
                      <td key={`${cat}-td`} className="px-2 py-2 text-right tabular-nums">{diffCell(tc.count, tc.target)}</td>
                      <td key={`${cat}-tp`} className={`px-2 py-2 text-right tabular-nums ${pct.tone}`}>{pct.label}</td>
                    </>
                  );
                })}
                <td className="px-2 py-2 text-right tabular-nums bg-slate-200 dark:bg-slate-700/70">{totals.total_count}</td>
                <td className="px-2 py-2 text-right tabular-nums text-rose-600 dark:text-rose-400 bg-slate-200 dark:bg-slate-700/70">{totals.total_target || "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums bg-slate-200 dark:bg-slate-700/70">{diffCell(totals.total_count, totals.total_target)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-3 leading-relaxed">
          ※ コースの分類は「設定 → スタッフ管理 / コース管理」で編集できます。
          複数コースの予約はメニュー数で件数換算（スプレッドシートと同じ集計）。
          達成率: 🟢 100%以上 / 🔵 80%以上 / 🟡 50%以上 / 🔴 50%未満
        </p>
      </CardContent>
    </Card>
  );
}
