"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, addDays } from "date-fns";
import { ja } from "date-fns/locale";
import {
  listMyLeaveRequests,
  requestMyLeave,
  cancelMyLeaveRequest,
  type MyLeaveRequest,
} from "@/app/actions/staff-schedule";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CalendarOff, ChevronLeft, ChevronRight, Info, X, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type DayCellState = "free" | "pending" | "approved" | "rejected";

export default function MySchedulePage() {
  const [now, setNow] = useState<Date | null>(null);
  const [targetMonth, setTargetMonth] = useState<Date | null>(null);
  const [rows, setRows] = useState<MyLeaveRequest[]>([]);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const today = new Date();
    setNow(today);
    // デフォルト: 来月
    setTargetMonth(addMonths(today, 1));
  }, []);

  const monthStr = useMemo(() => {
    if (!targetMonth) return "";
    return `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, "0")}`;
  }, [targetMonth]);

  async function refresh() {
    if (!monthStr) return;
    setLoading(true);
    const r = await listMyLeaveRequests(monthStr);
    if (r.success) {
      setRows(r.rows ?? []);
      setStaffId(r.staffId ?? null);
    } else {
      toast.error(r.error ?? "取得に失敗しました");
    }
    setLoading(false);
  }

  useEffect(() => {
    if (monthStr) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStr]);

  // 月のグリッド（前後の空白セルあり、月曜始まり）
  const monthGrid = useMemo(() => {
    if (!targetMonth) return [];
    const monthStart = startOfMonth(targetMonth);
    const monthEnd = endOfMonth(targetMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = startOfWeek(addDays(monthEnd, 6), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [targetMonth]);

  // 日付ごとの状態マップ
  const stateByDate = useMemo(() => {
    const m = new Map<string, { state: DayCellState; id?: string; note?: string | null }>();
    rows.forEach(r => {
      m.set(r.date, { state: r.status as DayCellState, id: r.id, note: r.note });
    });
    return m;
  }, [rows]);

  const handleToggleDay = (date: Date) => {
    if (!targetMonth || pending) return;
    const dateStr = format(date, "yyyy-MM-dd");
    const current = stateByDate.get(dateStr);

    // 過去日は変更不可
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
      toast.error("過去の日付は変更できません");
      return;
    }

    if (!current) {
      // 新規希望提出
      startTransition(async () => {
        const r = await requestMyLeave(dateStr);
        if (!r.success) {
          toast.error(r.error ?? "登録に失敗しました");
          return;
        }
        toast.success(`${format(date, "M/d (E)", { locale: ja })} の休み希望を提出しました`);
        await refresh();
      });
    } else if (current.state === "pending" && current.id) {
      // 自分の pending を取消
      startTransition(async () => {
        const r = await cancelMyLeaveRequest(current.id!);
        if (!r.success) {
          toast.error(r.error ?? "取消に失敗しました");
          return;
        }
        toast.success(`${format(date, "M/d (E)", { locale: ja })} の希望を取り消しました`);
        await refresh();
      });
    } else if (current.state === "approved") {
      toast.info("承認済みです。変更は管理者にご相談ください");
    } else if (current.state === "rejected") {
      toast.info("却下済みです。再提出は管理者にご相談ください");
    }
  };

  if (!targetMonth || !now) {
    return <div className="p-8 text-center text-slate-500">読み込み中...</div>;
  }

  // 全スタッフでない（staffId === null）= reservation_staff にレコードがない
  if (!loading && !staffId) {
    return (
      <div className="container mx-auto py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              スタッフ情報が見つかりません
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            <p>ログイン中のメールアドレスがスタッフ一覧に登録されていないため、休み希望の入力ができません。</p>
            <p>院長または管理者に <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs">設定 → スタッフ管理</code> から、あなたのスタッフレコードに email を登録するよう依頼してください。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const counts = {
    pending: rows.filter(r => r.status === "pending").length,
    approved: rows.filter(r => r.status === "approved").length,
    rejected: rows.filter(r => r.status === "rejected").length,
  };

  return (
    <div className="container mx-auto py-6 max-w-5xl space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CalendarOff className="w-6 h-6 text-rose-500" />
            来月の休み希望
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            来月のシフト作成のため、お休みを希望する日をタップで提出してください。<br />
            <span className="text-xs">提出後は管理者の承認待ち。承認されると予約システム側でその日が自動でブロックされます。</span>
          </p>
        </div>

        {/* 月切り替えナビ */}
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTargetMonth(d => d ? addMonths(d, -1) : d)}
            className="h-8 w-8"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="px-2 text-sm font-bold text-slate-700 dark:text-slate-200 min-w-[110px] text-center">
            {format(targetMonth, "yyyy年M月", { locale: ja })}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTargetMonth(d => d ? addMonths(d, 1) : d)}
            className="h-8 w-8"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">承認待ち</p>
              <p className="text-xl font-black text-amber-600">{counts.pending}日</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">承認済み</p>
              <p className="text-xl font-black text-emerald-600">{counts.approved}日</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <X className="w-4 h-4 text-rose-500" />
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">却下</p>
              <p className="text-xl font-black text-rose-500">{counts.rejected}日</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-200 border border-amber-400" />
          <span className="text-slate-600 dark:text-slate-400">承認待ち</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-300 border border-emerald-500" />
          <span className="text-slate-600 dark:text-slate-400">承認済み</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-rose-200 border border-rose-400" />
          <span className="text-slate-600 dark:text-slate-400">却下</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-white border border-slate-300" />
          <span className="text-slate-600 dark:text-slate-400">出勤予定（タップで休み希望）</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto text-slate-500">
          <Info className="w-3.5 h-3.5" />
          <span>タップで切替（承認待ちのみ取消可能）</span>
        </div>
      </div>

      {/* カレンダー */}
      <Card>
        <CardContent className="p-3 md:p-5">
          {loading ? (
            <div className="h-40 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1.5">
              {/* 曜日ヘッダ */}
              {["月", "火", "水", "木", "金", "土", "日"].map((d, i) => (
                <div
                  key={d}
                  className={`text-center text-[11px] font-bold py-1.5 ${
                    i === 5 ? "text-blue-500" : i === 6 ? "text-rose-500" : "text-slate-500"
                  }`}
                >
                  {d}
                </div>
              ))}
              {/* 日付セル */}
              {monthGrid.map((date) => {
                const inMonth = date.getMonth() === targetMonth.getMonth();
                const dateStr = format(date, "yyyy-MM-dd");
                const state = stateByDate.get(dateStr)?.state;
                const isToday = format(date, "yyyy-MM-dd") === format(now, "yyyy-MM-dd");
                const isPast = date < new Date(format(now, "yyyy-MM-dd"));

                const baseClass = "min-h-[64px] md:min-h-[78px] rounded-lg p-2 text-left transition-all border";
                let stateClass = "bg-white border-slate-200 hover:bg-blue-50 hover:border-blue-300";
                if (!inMonth) stateClass = "bg-slate-50 border-slate-100 opacity-40";
                else if (isPast) stateClass = "bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed";
                else if (state === "pending") stateClass = "bg-amber-100 border-amber-400 hover:bg-amber-200";
                else if (state === "approved") stateClass = "bg-emerald-200 border-emerald-500 cursor-not-allowed";
                else if (state === "rejected") stateClass = "bg-rose-100 border-rose-400 cursor-not-allowed";

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => inMonth && !isPast && handleToggleDay(date)}
                    disabled={!inMonth || isPast || pending}
                    className={`${baseClass} ${stateClass}`}
                  >
                    <div className={`text-xs font-bold ${isToday ? "text-blue-600" : inMonth ? "text-slate-700" : "text-slate-400"}`}>
                      {format(date, "d")}
                      {isToday && <span className="ml-1 text-[9px] bg-blue-500 text-white px-1 py-0.5 rounded">今日</span>}
                    </div>
                    {state && (
                      <div className={`mt-1 text-[10px] font-bold ${
                        state === "pending" ? "text-amber-700" :
                        state === "approved" ? "text-emerald-700" :
                        "text-rose-600"
                      }`}>
                        {state === "pending" ? "希望中" : state === "approved" ? "休み確定" : "却下"}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* リスト表示（モバイル補助） */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">提出済み一覧</CardTitle>
            <CardDescription>承認待ちは行をタップでキャンセル可能</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {rows.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  if (r.status === "pending") {
                    if (!confirm(`${format(new Date(r.date), "M月d日 (E)", { locale: ja })} の希望を取り消しますか？`)) return;
                    startTransition(async () => {
                      const res = await cancelMyLeaveRequest(r.id);
                      if (!res.success) toast.error(res.error ?? "取消失敗");
                      else { toast.success("取消しました"); await refresh(); }
                    });
                  }
                }}
                disabled={r.status !== "pending" || pending}
                className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-lg border text-sm transition ${
                  r.status === "pending" ? "border-amber-300 bg-amber-50 hover:bg-amber-100" :
                  r.status === "approved" ? "border-emerald-300 bg-emerald-50 cursor-default" :
                  "border-rose-300 bg-rose-50 cursor-default"
                }`}
              >
                <span className="font-bold">{format(new Date(r.date), "M月d日 (E)", { locale: ja })}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  r.status === "pending" ? "bg-amber-200 text-amber-800" :
                  r.status === "approved" ? "bg-emerald-200 text-emerald-800" :
                  "bg-rose-200 text-rose-700"
                }`}>
                  {r.status === "pending" ? "承認待ち（タップで取消）" : r.status === "approved" ? "承認済み" : "却下"}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
