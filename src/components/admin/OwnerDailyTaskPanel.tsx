"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Sparkles, Loader2, Check, CheckCheck, Trash2, Plus, X, FileText, Megaphone, Brush, ListTodo, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, CalendarClock, History,
} from "lucide-react";
import { toast } from "sonner";
import { format, addDays, subDays } from "date-fns";
import { ja } from "date-fns/locale";
import {
  listDailyTasksForDate, generateDailyTasks, approveTask, approveAllTasksForDate,
  toggleTaskDone, addManualTask, deleteTask, listTaskDaySummaries,
  type DailyTask, type TaskKind, type TaskPriority, type TaskDaySummary,
} from "@/app/actions/staff-daily-tasks";
import { TASK_TEMPLATES } from "@/lib/daily-task-templates";
import { listActiveStaff, type StaffOption } from "@/app/actions/staff-schedule";

const KIND_ICON: Record<TaskKind, typeof FileText> = {
  karte: FileText, sns: Megaphone, cleaning: Brush, morning: Sparkles, manual: ListTodo, other: ListTodo,
};

const HISTORY_DAYS = 14;

function todayJst(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split("T")[0];
}

/** "yyyy-MM-dd" ⇄ ローカル日付。時刻を持たないカレンダー日として扱う（TZをまたいで壊れないよう常にT00:00:00で往復する）。 */
function toDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}
function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export default function OwnerDailyTaskPanel() {
  const today = useMemo(() => todayJst(), []);
  const [dateStr, setDateStr] = useState(today);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyDays, setHistoryDays] = useState<TaskDaySummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [, startTransition] = useTransition();

  // 手動追加フォーム
  const [showAdd, setShowAdd] = useState(false);
  const [addStaffId, setAddStaffId] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addPriority, setAddPriority] = useState<TaskPriority>("normal");

  const isToday = dateStr === today;
  const isPast = dateStr < today;

  const load = () => {
    setLoading(true);
    listDailyTasksForDate(dateStr)
      .then((r) => {
        if (r.success) setTasks(r.tasks ?? []);
        // 失敗時に前の日の一覧を残すと、新しい日付の見出しの下に別の日の中身が出て誤読する。
        else { setTasks([]); toast.error(r.error ?? "この日の記録を読み込めませんでした"); }
      })
      .catch(() => { setTasks([]); toast.error("通信エラーが発生しました"); })
      .finally(() => setLoading(false));
  };

  /**
   * 履歴チップを取り直す。一覧だけ更新して数字が古いままだと、同じ画面で数が食い違って見える。
   * 終端は「今日」と「いま開いている日」の遅いほう。先の日に割り当てたときも、その日の数字が出る。
   */
  const loadHistory = (forDate: string = dateStr) => {
    setHistoryLoading(true);
    setHistoryLoaded(true);
    const from = toDateStr(subDays(toDate(today), HISTORY_DAYS - 1));
    const to = forDate > today ? forDate : today;
    listTaskDaySummaries(from, to)
      .then((r) => { if (r.success) setHistoryDays(r.days ?? []); })
      .finally(() => setHistoryLoading(false));
  };

  /** 一覧を変えたあとの共通後処理。開いている履歴の数字もあわせて取り直す。 */
  const reload = () => {
    load();
    if (showHistory) loadHistory();
  };

  useEffect(() => {
    load();
    if (showHistory) loadHistory(dateStr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr]);

  useEffect(() => {
    listActiveStaff().then((r) => {
      if (r.success && r.staff) { setStaff(r.staff); if (r.staff[0]) setAddStaffId(r.staff[0].id); }
    });
  }, []);

  const toggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && !historyLoaded) loadHistory();
  };

  const goDay = (delta: number) => setDateStr((d) => toDateStr(addDays(toDate(d), delta)));
  const goToday = () => setDateStr(today);

  const pending = tasks.filter((t) => !t.approved);
  const approved = tasks.filter((t) => t.approved);

  // スタッフ別グルーピング
  const byStaff = useMemo(() => {
    const m = new Map<string, DailyTask[]>();
    for (const t of tasks) {
      const key = t.staff_name ?? "未割当";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    return Array.from(m.entries());
  }, [tasks]);

  const generate = async () => {
    setGenerating(true);
    const r = await generateDailyTasks(dateStr);
    setGenerating(false);
    if (r.success) {
      toast.success(r.created ? `${r.created}件のタスク案を作りました（承認待ち）` : "出勤予定の先生がいないか、提案がありませんでした");
      load();
    } else {
      toast.error(r.error ?? "生成に失敗しました");
    }
  };

  const doApprove = (id: string) => {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, approved: true } : t));
    startTransition(async () => {
      const r = await approveTask(id);
      if (!r.success) { toast.error(r.error ?? "承認に失敗"); load(); }
      else if (showHistory) loadHistory();
    });
  };

  const doApproveAll = async () => {
    const r = await approveAllTasksForDate(dateStr);
    if (r.success) { toast.success(`${r.approved ?? 0}件を承認しました（先生に表示されます）`); reload(); }
    else toast.error(r.error ?? "承認に失敗しました");
  };

  const doToggle = (t: DailyTask) => {
    const next = t.status !== "done";
    setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status: next ? "done" : "pending" } : x));
    startTransition(async () => {
      const r = await toggleTaskDone(t.id, next);
      if (!r.success) { toast.error(r.error ?? "更新に失敗"); load(); }
      else if (showHistory) loadHistory();
    });
  };

  const doDelete = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    startTransition(async () => {
      const r = await deleteTask(id);
      if (!r.success) { toast.error(r.error ?? "削除に失敗"); load(); }
      else if (showHistory) loadHistory();
    });
  };

  const doAdd = async () => {
    if (!addStaffId || !addTitle.trim()) return;
    // 過ぎた日に割り当てても、先生の画面（今日ぶんだけを見る）には二度と出ない。
    // 「指示を出したつもり」で伝わらない事故になるので、ここで止める。
    if (isPast) {
      toast.error("過ぎた日には割り当てできません（先生の画面に出ないため）。今日か、これからの日を選んでください。");
      return;
    }
    const staffName = staff.find((s) => s.id === addStaffId)?.name ?? "担当";
    const r = await addManualTask({ staff_id: addStaffId, title: addTitle.trim(), due_date: dateStr, priority: addPriority });
    if (r.success) {
      toast.success(`${format(toDate(dateStr), "M月d日", { locale: ja })}の${staffName}さんに「${addTitle.trim()}」を割り当てました`);
      setAddTitle(""); setShowAdd(false); reload();
    }
    else toast.error(r.error ?? "追加に失敗しました");
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* ヘッダ */}
      <div className="px-4 py-3 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
        <button type="button" onClick={() => setCollapsed((c) => !c)} className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-5 h-5 text-violet-500 shrink-0" />
          <span className="text-sm font-black text-slate-800 dark:text-slate-100">先生のやることリスト</span>
          {pending.length > 0 && (
            <span className="text-[11px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">承認待ち{pending.length}</span>
          )}
          {collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={toggleHistory}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold border ${
              showHistory
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            <History className="w-3.5 h-3.5" />過去の記録
          </button>
          {!isPast && (
            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              AIで作る
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3">
          {/* 日付えらび：過去は記録の確認、未来は先に割り当て */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => goDay(-1)}
              aria-label="前の日"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => { if (e.target.value) setDateStr(e.target.value); }}
              className="h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-sm font-bold text-slate-700 dark:text-slate-200"
            />
            <button
              type="button"
              onClick={() => goDay(1)}
              aria-label="次の日"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {format(toDate(dateStr), "M月d日(E)", { locale: ja })}
              {isToday && <span className="ml-1 text-[11px] font-bold text-emerald-600">今日</span>}
              {isPast && <span className="ml-1 text-[11px] font-bold text-slate-400">過去の記録</span>}
              {!isToday && !isPast && <span className="ml-1 text-[11px] font-bold text-blue-500">先の予定</span>}
            </span>
            {!isToday && (
              <button
                type="button"
                onClick={goToday}
                className="h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                今日に戻る
              </button>
            )}
          </div>

          {/* 過去の記録：直近14日の記入状況。押すとその日を開く */}
          {showHistory && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2 bg-slate-50/60 dark:bg-slate-800/20">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                <CalendarClock className="w-3.5 h-3.5" />直近{HISTORY_DAYS}日＋表示中の日の記入状況（押すとその日を開きます）
              </div>
              {historyLoading ? (
                <div className="h-12 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-slate-300" /></div>
              ) : historyDays.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">この期間に記録はありません。</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {historyDays.map((d) => {
                    const selected = d.date === dateStr;
                    const allDone = d.total > 0 && d.done === d.total;
                    return (
                      <button
                        key={d.date}
                        type="button"
                        onClick={() => setDateStr(d.date)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                          selected
                            ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300"
                            : allDone
                              ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 hover:border-emerald-400"
                              : "border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-400"
                        }`}
                      >
                        {format(toDate(d.date), "M/d(E)", { locale: ja })}
                        <span className="ml-1 font-mono">{d.done}/{d.total}</span>
                        {d.pendingApproval > 0 && <span className="ml-1 text-amber-600">承認待{d.pendingApproval}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {loading ? (
            <div className="h-20 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-6 text-sm text-slate-400">
              <p>{format(toDate(dateStr), "M月d日", { locale: ja })}のタスクはありません。</p>
              <p className="text-xs mt-1">
                {isPast
                  ? "この日は誰も記入していません。"
                  : "「AIで作る」で各先生の業務案を作るか、下から先生を選んで割り当てられます。"}
              </p>
            </div>
          ) : (
            <>
              {/* 一括承認バー */}
              {pending.length > 0 && (
                <div className="flex items-center justify-between gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-200">
                    {pending.length}件が承認待ち（承認すると先生に表示されます）
                  </span>
                  <button
                    type="button"
                    onClick={doApproveAll}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />すべて承認
                  </button>
                </div>
              )}

              {/* スタッフ別 */}
              <div className="space-y-3">
                {byStaff.map(([name, list]) => (
                  <div key={name} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-600 dark:text-slate-300">
                      {name}
                    </div>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {list.map((t) => {
                        const Icon = KIND_ICON[t.task_kind] ?? ListTodo;
                        const checked = t.status === "done";
                        return (
                          <li key={t.id} className={`flex items-center gap-2 px-3 py-2 ${!t.approved ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}>
                            <button type="button" onClick={() => doToggle(t)} className="shrink-0">
                              {checked
                                ? <Check className="w-4 h-4 text-emerald-500" />
                                : <span className="w-4 h-4 rounded border-2 border-slate-300 inline-block" />}
                            </button>
                            <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm ${checked ? "line-through text-slate-400" : "text-slate-700 dark:text-slate-200"}`}>{t.title}</span>
                              {t.description && <p className="text-[11px] text-slate-400 truncate">{t.description}</p>}
                            </div>
                            {t.priority === "high" && <span className="text-[10px] font-bold text-rose-600 shrink-0">優先</span>}
                            {t.source === "ai" && <span className="text-[10px] text-violet-400 shrink-0">AI</span>}
                            {!t.approved && (
                              <button type="button" onClick={() => doApprove(t.id)} className="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-md bg-emerald-100 text-emerald-700 text-[11px] font-bold hover:bg-emerald-200">
                                <Check className="w-3 h-3" />承認
                              </button>
                            )}
                            <button type="button" onClick={() => doDelete(t.id)} className="shrink-0 p-1 text-slate-300 hover:text-rose-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 手動追加 */}
          {showAdd ? (
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {format(toDate(dateStr), "M月d日(E)", { locale: ja })}の担当に割り当てる
                </span>
                <button type="button" onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <select value={addStaffId} onChange={(e) => setAddStaffId(e.target.value)} className="h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-sm">
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={addPriority} onChange={(e) => setAddPriority(e.target.value as TaskPriority)} className="h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-sm">
                  <option value="normal">通常</option>
                  <option value="high">優先</option>
                  <option value="low">低</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TASK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.title}
                    type="button"
                    onClick={() => setAddTitle(tpl.title)}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {tpl.title}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && addTitle.trim()) doAdd(); }}
                  placeholder="業務名（例：カルテまとめ）"
                  className="flex-1 h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm"
                />
                <button type="button" onClick={doAdd} disabled={!addTitle.trim() || isPast} title={isPast ? "過ぎた日には割り当てできません" : undefined} className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">割り当て</button>
              </div>
              <p className={`text-[11px] ${isPast ? "text-rose-500 font-bold" : "text-slate-400"}`}>
                {isPast
                  ? "過ぎた日です。ここに割り当てても先生の画面には出ません。今日か、これからの日を選んでください。"
                  : isToday
                    ? "割り当てるとすぐに先生の「今日やること」に出ます（承認は不要です）。"
                    : `${format(toDate(dateStr), "M月d日", { locale: ja })}になったら、先生の「今日やること」に出ます（承認は不要です）。`}
              </p>
            </div>
          ) : isPast ? (
            <p className="text-center text-[11px] text-slate-400 py-1">
              過ぎた日は記録の確認のみです。割り当ては「今日に戻る」か、これからの日を選んでください。
            </p>
          ) : (
            <button type="button" onClick={() => setShowAdd(true)} className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <Plus className="w-4 h-4" />先生を選んでタスクを割り当てる
            </button>
          )}
        </div>
      )}
    </div>
  );
}
