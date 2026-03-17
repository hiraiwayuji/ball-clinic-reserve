"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Users, TrendingUp, CheckCircle2, AlertCircle, Video, Sparkles, MessageSquare, Clock, Loader2, Coins, Plus } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { getTodayDashboardData } from "@/app/actions/sales";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import AIMemo from "@/components/admin/AIMemo";
import BlogProposal from "@/components/admin/BlogProposal";

export default function DashboardPrototype() {
  const [activeTab, setActiveTab] = useState('youtube');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentDate(new Date());
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const res = await getTodayDashboardData();
        if (res.success) {
          setData(res.data);
        } else {
          setError(res.error || "データの取得に失敗しました");
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
        setError("システムエラーが発生しました");
      } finally {
        setLoading(false);
      }
    }
    fetchData();

    // リアルタイム同期の設定 (Supabase Real-time)
    const supabase = createClient();
    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => {
          console.log("[REALTIME] Appointment change, updating dashboard...");
          fetchData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_sales" },
        () => {
          console.log("[REALTIME] Cash sales change, updating dashboard...");
          fetchData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "insurance_payments" },
        () => {
          console.log("[REALTIME] Insurance payment change, updating dashboard...");
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const toggleTaskStatus = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
      const supabase = createClient();
      await supabase.from('daily_tasks').update({ status: newStatus }).eq('id', id);
      const res = await getTodayDashboardData();
      if (res.success) setData(res.data);
    } catch(e) {
      console.error(e);
    }
  };

  if (loading || !currentDate) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
          <p className="text-slate-500 font-medium tracking-wide">ダッシュボードを構成中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[80vh] items-center justify-center p-4">
        <Card className="max-w-md w-full border-rose-200 bg-rose-50">
          <CardHeader>
            <CardTitle className="text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              エラーが発生しました
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-rose-700 text-sm">{error}</p>
            <Button 
              onClick={() => window.location.reload()} 
              className="w-full bg-rose-600 hover:bg-rose-700 text-white"
            >
              再読み込みを試す
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const monthlyProgress = data && data.monthlyRevenue && data.targetIncome 
    ? Math.min(100, Math.round((data.monthlyRevenue.total / data.targetIncome) * 100)) 
    : 0;
  const todayTarget = 50000; // Hardcoded default target for now
  const todayProgress = data ? Math.min(100, Math.round((data.todaySales / todayTarget) * 100)) : 0;
  const remainingAction = Math.max(0, todayTarget - (data?.todaySales || 0));
  const remainingPatients = Math.ceil(remainingAction / 6000);

  return (
    <div className="space-y-8 animate-in fade-in pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 border-l-4 border-blue-600 pl-3">
            接骨院管理ダッシュボード
          </h1>
          <p className="text-muted-foreground mt-2">
            本日の予約状況、売上進捗、やるべきことを一元管理します。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white border px-4 py-2 rounded-lg shadow-sm text-sm font-bold text-slate-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            {currentDate && format(currentDate, "yyyy年M月d日 (E)", { locale: ja })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ======== 1. 経営指標＆売上目標 ======== */}
        <Card className="lg:col-span-1 shadow-sm border-slate-200">
          <CardHeader className="bg-slate-50/50 border-b pb-4">
            <CardTitle className="flex items-center text-lg text-slate-800">
              <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
              経営指標・売上進捗
            </CardTitle>
            <CardDescription>今月の目標達成率と本日の数字</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-8">
            {/* メーター（進捗率: 今月） */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <span className="text-sm font-medium text-slate-600">今月の売上目標進捗</span>
                <span className="text-2xl font-bold text-slate-900">{monthlyProgress}<span className="text-sm text-slate-500 font-normal">%</span></span>
              </div>
              <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full transition-all duration-1000" 
                  style={{ width: `${monthlyProgress}%` }}
                ></div>
              </div>
              <div className="flex justify-between mt-2 text-xs text-slate-500">
                <span>目標: ¥{data?.targetIncome?.toLocaleString() || '---'}</span>
                <span className="font-bold text-slate-700">現在: ¥{data?.monthlyRevenue?.total?.toLocaleString() || 0}</span>
              </div>
              <div className="mt-2 flex gap-2">
                <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded">自費: ¥{data?.monthlyRevenue?.cash?.toLocaleString() || 0}</span>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">保険: ¥{data?.monthlyRevenue?.insurance?.toLocaleString() || 0}</span>
              </div>
            </div>

            {/* 本日の目標と進捗 */}
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
              <h4 className="text-sm font-bold text-blue-900 mb-3 flex items-center justify-between">
                今日の売上現在地
                <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full font-medium">更新: リアルタイム</span>
              </h4>
              
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">本日の目標</span>
                    <span className="font-bold text-slate-800">¥{todayTarget.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-600">現在の売上（窓口）</span>
                    <span className="font-bold text-blue-600">¥{data?.todaySales?.toLocaleString() || 0}</span>
                  </div>
                  
                  <div className="h-2.5 w-full bg-white rounded-full overflow-hidden border border-blue-100">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-1000" 
                      style={{ width: `${todayProgress}%` }}
                    ></div>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs text-slate-500">目標まであと</p>
                    <p className="text-lg font-bold text-rose-600">¥{remainingAction.toLocaleString()}</p>
                  </div>
                  <div className="h-10 w-px bg-slate-100"></div>
                  <div className="space-y-0.5 text-right">
                    <p className="text-xs text-slate-500">来院目安（自費6千円/人）</p>
                    <p className="text-lg font-bold text-slate-800">あと<span className="text-2xl text-blue-600 mx-1">{remainingPatients}</span>人</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
               <Link href="/admin/sales">
                 <Button variant="outline" className="w-full text-xs h-8 border-dashed group">
                   <Plus className="w-3 h-3 mr-1 group-hover:text-blue-600" />
                   窓口売上を登録
                 </Button>
               </Link>
               <Link href="/admin/insurance">
                 <Button variant="outline" className="w-full text-xs h-8 border-dashed group">
                   <Plus className="w-3 h-3 mr-1 group-hover:text-emerald-600" />
                   保険入金を登録
                 </Button>
               </Link>
            </div>
          </CardContent>
        </Card>

        {/* ======== 2. 本日の予約管理＆AIタスク ======== */}
        <Card className="lg:col-span-2 shadow-sm border-slate-200">
          <CardHeader className="bg-slate-50/50 border-b pb-4">
            <CardTitle className="flex items-center text-lg text-slate-800">
              <Calendar className="w-5 h-5 mr-2 text-blue-600" />
              本日のスケジュール＆AIタスク
            </CardTitle>
            <CardDescription>今日の予約状況と連動したタスク管理</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* タイムライン */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Clock className="w-4 h-4" /> 予約タイムライン
              </h4>
              {!data?.appointments || data.appointments.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-slate-400 border border-dashed rounded-xl">
                  <Calendar className="w-10 h-10 mb-2 opacity-10" />
                  <p className="text-sm">本日の予約はありません</p>
                </div>
              ) : (
                <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                  {data.appointments.map((res: any, i: number) => (
                    <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-blue-50 text-blue-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 font-bold text-xs">
                        {res.time}
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-3 rounded-lg border border-slate-100 shadow-sm group-hover:border-blue-200 transition-colors">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-slate-800 text-sm truncate mr-1">{res.name} 様</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${res.type === '初診' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                            {res.type}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500">{res.status === 'confirmed' ? '受付完了' : '保留中'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/admin/appointments">
                <Button variant="ghost" size="sm" className="w-full text-slate-500 text-xs mt-2 underline">予約一覧で詳しく見る</Button>
              </Link>
            </div>

            {/* AI タスク */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" /> 今日の推奨タスク
                </h4>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-100/50 shadow-inner">
                {(!data?.dailyTasks || data.dailyTasks.length === 0) ? (
                  <div className="text-sm text-slate-500 text-center py-4">
                    本日のタスクは登録されていません。<br/>
                    AIアシスタントに相談してタスクを生成できます。
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {data.dailyTasks.map((task: any) => (
                      <li key={task.id} className={`flex flex-col gap-2 bg-white/80 p-3 rounded-lg text-sm transition-all ${task.status === 'completed' ? 'opacity-60 bg-slate-100 shadow-none' : 'shadow-sm'}`}>
                        <div className="flex gap-3">
                          <button 
                            onClick={() => toggleTaskStatus(task.id, task.status)}
                            className={`mt-0.5 shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${task.status === 'completed' ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 bg-white'}`}
                          >
                            {task.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </button>
                          <div className="flex-1">
                            <div className="flex items-start gap-2">
                              {task.priority === 'high' && task.status !== 'completed' && <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />}
                              <span className={task.status === 'completed' ? 'line-through text-slate-500' : 'text-slate-700 font-medium'}>
                                {task.task_name}
                              </span>
                            </div>
                            {task.description && (
                              <p className="text-xs text-slate-500 mt-1 ml-6">{task.description}</p>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/admin/marketing">
                  <Button className="w-full mt-4 bg-amber-500 hover:bg-amber-600 text-white shadow-sm border-none">
                    タスク一覧・管理画面へ
                  </Button>
                </Link>
              </div>
            </div>

          </CardContent>
        </Card>

        {/* ======== 3. SNSバズりトレンド提案 & 経営改善提案 & 軍師メモ ======== */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <BlogProposal clinicContext={JSON.stringify(data)} />
            <AIMemo />
        </div>

        <Card className="lg:col-span-1 shadow-sm border-slate-200">
           <CardHeader className="bg-emerald-50/30 border-b pb-4">
            <CardTitle className="flex items-center text-lg text-emerald-800">
              <Coins className="w-5 h-5 mr-2" /> 経費入力へのショートカット
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
             <div className="flex flex-col items-center justify-center space-y-4 py-4 text-center">
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600">
                   <Coins className="w-10 h-10" />
                </div>
                <div className="space-y-1">
                   <p className="text-sm font-bold text-slate-800">領収書・経費の計上</p>
                   <p className="text-xs text-slate-500">備品購入や光熱費などの経費を<br/>素早く記録できます。</p>
                </div>
                <Link href="/admin/expenses" className="w-full">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700">経費入力画面へ</Button>
                </Link>
             </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
