"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Users, RefreshCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  getTaskLoadByStaff,
  type TaskLoadSummary,
} from "@/app/actions/staff-schedule";

export default function TeamTaskLoadPanel() {
  const [rows, setRows] = useState<TaskLoadSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      const r = await getTaskLoadByStaff();
      if (r.success) {
        setRows(r.rows ?? []);
        setLoaded(true);
      }
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxPending = Math.max(1, ...rows.map((r) => r.pending));
  const totalPending = rows.reduce((s, r) => s + r.pending, 0);
  const totalOverdue = rows.reduce((s, r) => s + r.overdue, 0);
  const allClear = loaded && totalPending === 0;

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-900">チームタスク負荷</h3>
          {totalOverdue > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
              <AlertTriangle className="w-3 h-3" />
              超過 {totalOverdue}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/settings/staff-schedule?tab=tasks"
            className="text-[10px] text-indigo-600 hover:underline"
          >
            管理 →
          </Link>
          <button
            type="button"
            onClick={load}
            disabled={pending}
            className="text-slate-400 hover:text-indigo-600 p-1"
            aria-label="更新"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${pending ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {!loaded ? (
        <p className="text-xs text-slate-400">読み込み中…</p>
      ) : allClear ? (
        <div className="py-3 flex items-center justify-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4" />
          全員クリア！未完了タスク 0 件
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 text-center">
          スタッフ未登録
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => {
            const pct = (r.pending / maxPending) * 100;
            const barColor =
              r.pending >= 8 ? "bg-rose-500" :
              r.pending >= 4 ? "bg-amber-400" :
              r.pending > 0  ? "bg-emerald-500" :
                               "bg-slate-200";
            return (
              <div key={r.staff_id ?? "unassigned"} className="grid grid-cols-[100px_1fr_50px] items-center gap-2 text-xs">
                <span className="font-semibold text-slate-700 truncate" title={r.staff_name}>
                  {r.staff_name}
                </span>
                <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${barColor} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                  {r.overdue > 0 && (
                    <div
                      className="absolute top-0 left-0 h-1 bg-rose-700"
                      style={{ width: `${(r.overdue / maxPending) * 100}%` }}
                      title={`期限超過 ${r.overdue}`}
                    />
                  )}
                </div>
                <span className="text-right tabular-nums font-bold text-slate-700">
                  {r.pending}
                  {r.overdue > 0 && (
                    <span className="text-rose-700 text-[10px]"> +{r.overdue}超</span>
                  )}
                </span>
              </div>
            );
          })}
          <div className="pt-2 mt-2 border-t border-slate-100 text-[10px] text-slate-500 flex justify-between">
            <span>合計 {totalPending} 件 未完了</span>
            <span className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> 〜3
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400" /> 4〜7
              <span className="inline-block w-2 h-2 rounded-full bg-rose-500" /> 8+
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
