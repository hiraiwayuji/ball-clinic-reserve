"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, Circle, Plus, Trash2, AlertCircle, Calendar, ChevronLeft, ChevronRight, Sparkles, Wand2, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { generateDailySnsTasks } from "@/app/actions/ai-secretary";
import { format, addDays, subDays } from "date-fns";
import { ja } from "date-fns/locale";

const PRIORITY_OPTIONS = [
  { value: "high", label: "\u9ad8", color: "text-rose-600 bg-rose-50 border-rose-200" },
  { value: "medium", label: "\u4e2d", color: "text-amber-600 bg-amber-50 border-amber-200" },
  { value: "low", label: "\u4f4e", color: "text-slate-500 bg-slate-50 border-slate-200" },
];

const SNS_TEMPLATES = [
  "Instagram\u6295\u7a3f\uff08\u6cbb\u7642\u4e8b\u4f8b\u30fb\u7de8\u96c6\uff09",
  "Instagram Stories\u6295\u7a3f",
  "Google\u53e3\u30b3\u30df\u3078\u306e\u8fd4\u4fe1",
  "YouTube\u52d5\u753b\u64ae\u5f71",
  "YouTube\u52d5\u753b\u7de8\u96c6\u30fb\u30a2\u30c3\u30d7\u30ed\u30fc\u30c9",
  "LINE\u516c\u5f0f\u30a2\u30ab\u30a6\u30f3\u30c8\u914d\u4fe1",
  "\u30d6\u30ed\u30b0\u57f7\u7b46\u30fb\u6295\u7a3f",
  "Google\u30d3\u30b8\u30cd\u30b9\u30d7\u30ed\u30d5\u30a3\u30fc\u30eb\u66f4\u65b0",
];

export default function TasksPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [showForm, setShowForm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedReference, setSelectedReference] = useState<any>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Get clinic_id from auth
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from("clinic_users").select("clinic_id").eq("user_id", user.id).single();
      setClinicId(data?.clinic_id ?? (process.env.NEXT_PUBLIC_CLINIC_ID ?? "00000000-0000-0000-0000-000000000001"));
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
    if (error) toast.error("\u30bf\u30b9\u30af\u306e\u53d6\u5f97\u306b\u5931\u6557\u3057\u307e\u3057\u305f");
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
    if (error) toast.error("\u8ffd\u52a0\u306b\u5931\u6557\u3057\u307e\u3057\u305f");
    else { setNewTitle(""); setShowForm(false); fetchTasks(); toast.success("\u30bf\u30b9\u30af\u3092\u8ffd\u52a0\u3057\u307e\u3057\u305f"); }
    setAdding(false);
  };

  const toggleStatus = async (id: string, current: string) => {
    const supabase = createClient();
    const next = current === "completed" ? "pending" : "completed";
    const { error } = await supabase.from("daily_tasks").update({ status: next }).eq("id", id);
    if (error) toast.error("\u66f4\u65b0\u306b\u5931\u6557\u3057\u307e\u3057\u305f");
    else setTasks(prev => prev.map(t => t.id === id ? { ...t, status: next } : t));
  };

  const deleteTask = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("daily_tasks").delete().eq("id", id);
    if (error) toast.error("\u524a\u9664\u306b\u5931\u6557\u3057\u307e\u3057\u305f");
    else { setTasks(prev => prev.filter(t => t.id !== id)); toast.success("\u524a\u9664\u3057\u307e\u3057\u305f"); }
  };

  const completed = tasks.filter(t => t.status === "completed").length;
  const total = tasks.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleGenerateAI = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    const res = await generateDailySnsTasks(dateStr);
    if (res.success) {
      toast.success("AI\u304c\u30bf\u30b9\u30af\u3092\u63d0\u6848\u3057\u307e\u3057\u305f\uff01");
      fetchTasks();
    } else {
      toast.error(res.error || "\u751f\u6210\u306b\u5931\u6557\u3057\u307e\u3057\u305f");
    }
    setIsGenerating(false);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 border-l-4 border-rose-500 pl-3">
            SNSタスク管理
          </h1>
          <p className="text-muted-foreground mt-2">日次のSNS・マーケティングタスクを管理します</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleGenerateAI}
            disabled={isGenerating}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"
          >
            {isGenerating ? <Wand2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            AIにタスクを提案させる
          </Button>
          <Button onClick={() => setShowForm(v => !v)} variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50">
            <Plus className="w-4 h-4 mr-2" />手動で追加
          </Button>
        </div>
      </div>

      {/* 日付ナビゲーション */}
      <div className="flex items-center gap-3">
        <button onClick={() => setSelectedDate(d => subDays(d, 1))} className="p-2 rounded-lg border hover:bg-slate-50">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg shadow-sm font-medium text-slate-800">
          <Calendar className="w-4 h-4 text-rose-500" />
          {format(selectedDate, "yyyy\u5e74M\u6708d\u65e5 (E)", { locale: ja })}
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
                    {task.reference_content && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 p-1 h-auto"
                        onClick={() => setSelectedReference(task)}
                      >
                        <Lightbulb className="w-4 h-4 mr-1" />
                        <span className="text-[10px] font-bold">参考を表示</span>
                      </Button>
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

      {/* 参考表示ダイアログ */}
      <Dialog open={!!selectedReference} onOpenChange={() => setSelectedReference(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              投稿の参考・アイデア
            </DialogTitle>
            <DialogDescription>
              AIが提案するこのタスクの具体的な実行方法です。
            </DialogDescription>
          </DialogHeader>
          {selectedReference && (
            <div className="mt-4 p-6 bg-slate-50 border rounded-xl overflow-auto max-h-[60vh]">
              <h3 className="font-bold text-slate-900 mb-2 truncate">「{selectedReference.title}」</h3>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {selectedReference.reference_content}
              </div>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setSelectedReference(null)} className="bg-[#2563EB] hover:bg-[#1d4ed8] text-white">
              閉じる
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
