import { getStaffTargetsProgress } from "@/app/actions/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, TrendingUp } from "lucide-react";

/**
 * スタッフごとの月間施術目標 vs 当月実績の達成率ダッシュボード。
 * 目標未設定のスタッフは「目標未設定」表記で実績だけ表示。
 */
export default async function StaffTargetProgressWidget() {
  const res = await getStaffTargetsProgress();
  if (!res.success || !res.rows) return null;
  const rows = res.rows;
  if (rows.length === 0) return null;

  // 目標が設定されているスタッフが1人もいなければウィジェット自体を出さない
  const hasAnyTarget = rows.some((r) => (r.monthly_visit_target ?? 0) > 0);
  if (!hasAnyTarget) return null;

  return (
    <Card className="shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-500" />
          スタッフ別 月間目標達成率（{res.monthLabel}）
        </CardTitle>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          当月の予約件数（キャンセル除く・複数担当の予約は各スタッフに+1）と目標の比較。
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rows.map((r) => {
            const target = r.monthly_visit_target ?? 0;
            const count = r.monthly_count;
            const pct = r.achievement_pct;
            const hasTarget = target > 0 && pct !== null;
            // ゲージ最大は 100% でクリップ（達成超過は別途バッジで表現）
            const widthPct = hasTarget ? Math.min(100, pct!) : 0;
            const tone = hasTarget
              ? pct! >= 100
                ? { bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", text: "text-emerald-700 dark:text-emerald-300" }
                : pct! >= 80
                  ? { bar: "bg-blue-500", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", text: "text-blue-700 dark:text-blue-300" }
                  : pct! >= 50
                    ? { bar: "bg-amber-500", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", text: "text-amber-700 dark:text-amber-300" }
                    : { bar: "bg-rose-500", badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300", text: "text-rose-700 dark:text-rose-300" }
              : { bar: "bg-slate-300", badge: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400", text: "text-slate-500" };
            return (
              <div
                key={r.staff_id}
                className="rounded-xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900/40 p-3"
              >
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{r.staff_name}</span>
                    {hasTarget && pct! >= 100 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <TrendingUp className="w-3 h-3" /> 目標達成
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {hasTarget ? (
                      <>
                        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          <span className="font-black text-slate-800 dark:text-slate-100 text-base">{count}</span>
                          <span className="mx-1 text-slate-400">/</span>
                          <span>{target}件</span>
                        </span>
                        <span className={`text-xs font-black px-2 py-0.5 rounded-full tabular-nums ${tone.badge}`}>
                          {pct}%
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        実績 <span className="font-black text-slate-800 dark:text-slate-100 text-base">{count}</span>件
                        <span className="ml-2 text-[10px] text-slate-400">（目標未設定）</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                  <div
                    className={`h-full ${tone.bar} transition-all`}
                    style={{ width: `${widthPct}%` }}
                  />
                  {hasTarget && pct! > 100 && (
                    <div
                      className="absolute top-0 right-0 h-full bg-emerald-300 dark:bg-emerald-700/60 opacity-50"
                      title={`目標オーバー +${pct! - 100}%`}
                      style={{ width: `${Math.min(20, (pct! - 100) / 5)}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-3 leading-relaxed">
          ※ 目標は「設定 → スタッフ管理」で各スタッフごとに編集できます。
          色：🟢 100%以上達成 / 🔵 80%以上 / 🟡 50%以上 / 🔴 50%未満。
        </p>
      </CardContent>
    </Card>
  );
}
