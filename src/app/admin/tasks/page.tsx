"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, Circle, Plus, Trash2, AlertCircle, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, addDays, subDays } from "date-fns";
import { ja } from "date-fns/locale";

const PRIORITY_OPTIONS = [
  { value: "high", label: "高", color: "text-rose-600 bg-rose-50 border-rose-200" },
  { value: "medium", label: "中", color: "text-amber-600 bg-amber-50 border-amber-200" },
  { value: "low", label: "低", color: "text-slate-500 bg-slate-50 border-slate-200" },
];

const SNS_TEMPLATES = [
  "Instagram投稿（写真撮影・編集・投稿）",
  "Instagram Stories投稿",
  "Google口コミへの返信",
  "YouTube動画撮影",
  "YouTube動画編集・アップロード",
  "LINE公式アカウント配信",
  "ブログ記事作成・投稿",
  "Googleビジネスプロフィール更新",
];

export default function TasksPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [showForm, setShowForm] = useState(false);
  const [clinicId, setClinicId] = useState<string | null>(null);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Get clinic_id from auth
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from("clinic_users").select("clinic_id").eq("user_id", user.id).single();
      setClinicId(data?.clinic_id ?? "00000000-0000-0000-0000-000000000001");
    });
  }, []);

  const fetchTasks = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("daily_tasks")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("task_date", dateStr)
      .order("created_at", { ascending: true });
    if (error) toast.error("タスクの取得に失敗しました");
    else setTasks(data || []);
    setLoading(false);
  }, [clinicId, dateStr]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const addTask = async () => {
    if (!newTitle.trim() || !clinicId) return;
    setAdding(true);
    const supabase = createClient();
    const { error } = await supabase.from("daily_tasks").insert([{
      clinic_id: clinicId,
      task_date: dateStr,
      task_name: newTitle.trim(),
      title: newTitle.trim(),
      status: "pending",
      priority: newPriority,
    }]);
    if (error) toast.error("追加に失敗しました");
    else { setNewTitle(""); setShowForm(false); fetchTasks(); toast.success("タスクを追加しました"); }
    setAdding(false);
  };

  const toggleStatus = async (id: string, current: string) => {
    const supabase = createClient();
    const next = current === "completed" ? "pending" : "completed";
    const { error } = await supabase.from("daily_tasks").update({ status: next }).eq("id", id);
    if (error) toast.error("更新に失敗しました");
    else setTasks(prev => prev.map(t => t.id === id ? { ...t, status: next } : t));
  };

  const deleteTask = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("daily_tasks").delete().eq("id", id);
    if (error) toast.error("削除に失敗しました");
    else { setTasks(prev => prev.filter(t => t.id !== id)); toast.success("削除しました"); }
  };

  const completed = tasks.filter(t => t.status === "completed").length;
  const total = tasks.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 border-l-4 border-rose-500 pl-3">
            SNSタスク管理
          </h1>
          <p className="text-muted-foreground mt-2">日別のSNS・マーケティングタスクを管理します</p>
        </div>
        <Button onClick={() => setShowForm(v => !v)} className="bg-rose-600 hover:bg-rose-700">
          <Plus className="w-4 h-4 mr-2" />タスクを追加
        </Button>
      </div>

      {/* 日付ナビゲーション */}
      <div className="flex items-center gap-3">
        <button onClick={() => setSelectedDate(d => subDays(d, 1))} className="p-2 rounded-lg border hover:bg-slate-50">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg shadow-sm font-medium text-slate-800">
          <Calendar className="w-4 h-4 text-rose-500" />
          {format(selectedDate, "yyyy年M月d日（E）", { locale: ja })}
        </div>
        <button onClick={() => setSelectedDate(d => addDays(d, 1))} className="p-2 rounded-lg border hover:bg-slate-50">
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => setSelectedDate(new Date())} className="px-3 py-2 text-xs text-slate-500 border rounded-lg hover:bg-slate-50">
          今日
        </button>
      </div>

      {/* 追加フォーム */}
      {showForm && (
        <Card className="border-rose-200 bg-rose-50/30">
          <CardContent className="pt-4 space-y-3">
            <div className="flex gap-2 flex-wrap">
              {SNS_TEMPLATES.map(t => (
                <button key={t} onClick={() => setNewTitle(t)}
                  className="text-xs px-2 py-1 bg-white border rounded-full hover:border-rose-400 hover:text-rose-600 transition-colors">
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                placeholder="タスク名を入力（またはテンプレートを選択）"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addTask()}
                autoFocus
              />
              <select value={newPriority} onChange={e => setNewPriority(e.target.value)}
                className="border rounded-lg px-2 py-2 text-sm">
                {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <Button onClick={addTask} disabled={adding || !newTitle.trim()} className="bg-rose-600 hover:bg-rose-700">追加</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>キャンセル</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 進捗サマリー */}
      {total > 0 && (
        <div className="bg-white border rounded-xl p-4 flex items-center gap-4 shadow-sm">
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-600 font-medium">本日の進捗</span>
              <span className="font-bold text-slate-800">{completed}/{total}件完了（{progress}%）</span>
            </div>
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-rose-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
          {progress === 100 && (
            <span className="text-sm font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">🎉 完了！</span>
          )}
        </div>
      )}

      {/* タスク一覧 */}
      <Card>
        <CardHeader className="border-b bg-slate-50/50 pb-3">
          <CardTitle className="text-base text-slate-700">
            {format(selectedDate, "M月d日", { locale: ja })}のタスク
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">読み込み中...</div>
          ) : tasks.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
              この日のタスクはありません
            </div>
          ) : (
            <ul className="divide-y">
              {tasks.map(task => {
                const priority = PRIORITY_OPTIONS.find(p => p.value === task.priority);
                const done = task.status === "completed";
                return (
                  <li key={task.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${done ? "opacity-60" : ""}`}>
                    <button onClick={() => toggleStatus(task.id, task.status)} className="shrink-0">
                      {done
                        ? <CheckCircle2 className="w-5 h-5 text-rose-500" />
                        : <Circle className="w-5 h-5 text-slate-300 hover:text-rose-400 transition-colors" />}
                    </button>
                    <span className={`flex-1 text-sm ${done ? "line-through text-slate-400" : "text-slate-800 font-medium"}`}>
                      {task.title || task.task_name}
                    </span>
                    {priority && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${priority.color}`}>
                        {priority.label}
                      </span>
                    )}
                    <button onClick={() => deleteTask(task.id)} className="shrink-0 text-slate-300 hover:text-rose-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
