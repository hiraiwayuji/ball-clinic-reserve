"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calendar, TrendingUp, CheckCircle2, AlertCircle, Sparkles, Clock, Loader2, Coins, Plus,
  Users, Stethoscope, CreditCard, ArrowRight, User, ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { getTodayDashboardData } from "@/app/actions/sales";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import AIMemo from "@/components/admin/AIMemo";
import BlogProposal from "@/components/admin/BlogProposal";
import { PatientSearchPanel } from "@/components/admin/PatientSearchPanel";
import { getUpcomingBirthdays } from "@/app/actions/admin-marketing-actions";
import { Cake, Sparkles as SparklesIcon, Star } from "lucide-react";
import AISecretaryBriefing from "@/components/admin/AISecretaryBriefing";

export default function DashboardClient() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [patientPanelOpen, setPatientPanelOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [birthdays, setBirthdays] = useState<any>(null);

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
        const bDays = await getUpcomingBirthdays();
        setBirthdays(bDays);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
        setError("システムエラーが発生しました");
      } finally {
        setLoading(false);
      }
    }
    fetchData();

    const supabase = createClient();
    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        fetchData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_sales" }, () => {
        fetchData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "insurance_payments" }, () => {
        fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);


  if (loading || !currentDate) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
          <p className="text-slate-500 font-medium tracking-wide">ダッシュボードを読込中...</p>
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
            <Button onClick={() => window.location.reload()} className="w-full bg-rose-600 hover:bg-rose-700 text-white">
              再読み込みを試みる
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 今日の来院統計
  const todayTotal = data?.appointments?.length ?? 0;
  const todayArrived = data?.appointments?.filter((a: any) => a.checkin_status === "arrived").length ?? 0;
  const todayInTreatment = data?.appointments?.filter((a: any) => a.checkin_status === "in_treatment").length ?? 0;
  const todayDone = data?.appointments?.filter((a: any) => a.checkin_status === "done").length ?? 0;
  const todayWaiting = data?.appointments?.filter((a: any) => !a.checkin_status).length ?? 0;
  const todayFirstVisit = data?.appointments?.filter((a: any) => a.type === "初診").length ?? 0;

  const monthlyProgress = data && data.monthlyRevenue && data.targetIncome
    ? Math.min(100, Math.round((data.monthlyRevenue.total / data.targetIncome) * 100))
    : 0;
  const snsProgress = data?.targetSnsTasks > 0
    ? Math.min(100, Math.round((data.monthlySnsDone / data.targetSnsTasks) * 100))
    : 0;
  const todayTarget = data?.targetIncome ? Math.round(data.targetIncome / 30) : 50000;
  const todayProgress = data ? Math.min(100, Math.round((data.todaySales / todayTarget) * 100)) : 0;
  const remainingAction = Math.max(0, todayTarget - (data?.todaySales || 0));
  const remainingPatients = Math.ceil(remainingAction / 6000);

  return (
    <div className="space-y-8 animate-in fade-in pb-12 relative">
      <div className="absolute top-0 right-0 -z-10 w-[500px] h-[500px] bg-violet-600/10 blur-[120px] rounded-full hidden dark:block" />
      <div className="absolute bottom-0 left-0 -z-10 w-[400px] h-[400px] bg-indigo-600/10 blur-[100px] rounded-full hidden dark:block" />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50 border-l-8 border-violet-600 pl-4">
            V-ARC AI秘書 ダッシュボード
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium">
            本日の予約状況、売上進捗、そしてAI秘書からのアドバイスを一画面で管理します。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 px-4 py-2 rounded-lg shadow-sm text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 transition-colors">
            <Clock className="w-4 h-4 text-blue-600 dark:text-violet-400" />
            {currentDate && format(currentDate, "yyyy年M月d日 (E)", { locale: ja })}
          </div>
        </div>
      </div>

      {/* ── 今日モード ヒーロー帯 ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 本日予約 */}
        <Link href="/admin/counter" className="group col-span-1 sm:col-span-1 lg:col-span-1 bg-gradient-to-br from-blue-600 to-violet-700 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all">
          <div className="flex items-start justify-between">
            <Users className="w-5 h-5 opacity-80" />
            <ChevronRight className="w-4 h-4 opacity-60 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-3">
            <div className="text-4xl font-black leading-none">{todayTotal}</div>
            <div className="text-xs mt-1 opacity-80 font-medium">本日の予約</div>
          </div>
        </Link>

        {/* 待合中 */}
        <Link href="/admin/counter" className="group bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-200 dark:border-blue-700 rounded-2xl p-5 hover:scale-[1.02] transition-all">
          <div className="flex items-start justify-between">
            <User className="w-5 h-5 text-blue-500" />
            <ChevronRight className="w-4 h-4 text-blue-300 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-3">
            <div className="text-4xl font-black text-blue-700 dark:text-blue-300 leading-none">{todayArrived}</div>
            <div className="text-xs mt-1 text-blue-500 font-medium">待合中</div>
          </div>
        </Link>

        {/* 施術中 */}
        <Link href="/admin/counter" className="group bg-emerald-50 dark:bg-emerald-900/30 border-2 border-emerald-200 dark:border-emerald-700 rounded-2xl p-5 hover:scale-[1.02] transition-all">
          <div className="flex items-start justify-between">
            <Stethoscope className="w-5 h-5 text-emerald-500" />
            <ChevronRight className="w-4 h-4 text-emerald-300 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-3">
            <div className="text-4xl font-black text-emerald-700 dark:text-emerald-300 leading-none">{todayInTreatment}</div>
            <div className="text-xs mt-1 text-emerald-600 font-medium">施術中</div>
          </div>
        </Link>

        {/* 会計完了 */}
        <Link href="/admin/counter" className="group bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:scale-[1.02] transition-all">
          <div className="flex items-start justify-between">
            <CheckCircle2 className="w-5 h-5 text-slate-400" />
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-3">
            <div className="text-4xl font-black text-slate-600 dark:text-slate-300 leading-none">{todayDone}</div>
            <div className="text-xs mt-1 text-slate-400 font-medium">会計完了</div>
          </div>
        </Link>

        {/* 本日売上 */}
        <Link href="/admin/sales" className="group col-span-1 sm:col-span-1 lg:col-span-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:scale-[1.02] transition-all shadow-sm">
          <div className="flex items-start justify-between">
            <CreditCard className="w-5 h-5 text-amber-500" />
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-none">
              ¥{(data?.todaySales ?? 0).toLocaleString()}
            </div>
            <div className="text-xs mt-1 text-slate-400 font-medium">本日自費売上</div>
          </div>
        </Link>

        {/* 今月達成率 */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <TrendingUp className="w-5 h-5 text-violet-500" />
            <span className="text-[10px] font-bold text-violet-500 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded-full">今月</span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-violet-700 dark:text-violet-300 leading-none">{monthlyProgress}<span className="text-sm font-normal text-slate-400 ml-0.5">%</span></div>
            <div className="text-xs mt-1 text-slate-400 font-medium">月次目標達成率</div>
            <div className="mt-2 h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full transition-all duration-1000" style={{ width: `${monthlyProgress}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* 初診バッジ */}
      {todayFirstVisit > 0 && (
        <div className="flex items-center gap-2 -mt-2">
          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-rose-500 text-white rounded-full shadow-sm">
            <Star className="w-3.5 h-3.5 fill-white" />
            本日 初診 {todayFirstVisit}名
          </span>
          <span className="text-xs text-slate-400">— カウンターで来院状況を管理できます</span>
          <Link href="/admin/counter" className="text-xs text-blue-500 hover:text-blue-600 font-medium flex items-center gap-0.5">
            受付カウンターへ <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {data && data.appointments && (
        <AISecretaryBriefing
          appointments={data.appointments}
          onComplete={() => {}}
          tone="polite"
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 1. 経営目標・売上進捗 */}
        <Card className="lg:col-span-1 shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900/60 dark:backdrop-blur-sm group overflow-hidden">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-800/20 border-b dark:border-slate-800 pb-4">
            <CardTitle className="flex items-center text-lg text-slate-800 dark:text-slate-100">
              <TrendingUp className="w-5 h-5 mr-2 text-blue-600 dark:text-violet-400" />
              経営目標・売上進捗
            </CardTitle>
            <CardDescription className="dark:text-slate-400">今月の目標達成状況と本日の数値</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-8">
            <div className="relative">
              <div className="flex justify-between items-baseline mb-3">
                <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">今月の売上達成率</span>
                <span className="text-3xl font-black text-slate-900 dark:text-slate-50">{monthlyProgress}<span className="text-sm text-slate-400 font-normal ml-1">%</span></span>
              </div>
              <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-violet-600 rounded-full transition-all duration-1000"
                  style={{ width: `${monthlyProgress}%` }}
                />
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

            <div>
              <div className="flex justify-between items-end mb-2">
                <span className="text-sm font-medium text-slate-600">今月のSNSタスク進捗</span>
                <span className="text-2xl font-bold text-slate-900">{snsProgress}<span className="text-sm text-slate-500 font-normal">%</span></span>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-rose-500 rounded-full transition-all duration-1000" style={{ width: `${snsProgress}%` }} />
              </div>
              <div className="flex justify-between mt-2 text-xs text-slate-500">
                <span>目標: {data?.targetSnsTasks || '---'}件</span>
                <span className="font-bold text-slate-700">完了: {data?.monthlySnsDone || 0}件</span>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
              <h4 className="text-sm font-bold text-blue-900 mb-3 flex items-center justify-between">
                今日の売上現況
                <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full font-medium">更新: リアルタイム</span>
              </h4>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">本日の目標</span>
                    <span className="font-bold text-slate-800">¥{todayTarget.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-600">現在の売上（自費）</span>
                    <span className="font-bold text-blue-600">¥{data?.todaySales?.toLocaleString() || 0}</span>
                  </div>
                  <div className="h-2.5 w-full bg-white rounded-full overflow-hidden border border-blue-100">
                    <div
                      className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-1000"
                      style={{ width: `${todayProgress}%` }}
                    />
                  </div>
                </div>
                <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs text-slate-500">目標まであと</p>
                    <p className="text-lg font-bold text-rose-600">¥{remainingAction.toLocaleString()}</p>
                  </div>
                  <div className="h-10 w-px bg-slate-100" />
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
                  自費売上を登録
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

        {/* 2. 本日のスケジュール・AIタスク */}
        <Card className="lg:col-span-2 shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900/60 dark:backdrop-blur-sm">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-800/20 border-b dark:border-slate-800 pb-4">
            <CardTitle className="flex items-center text-lg text-slate-800 dark:text-slate-100">
              <Calendar className="w-5 h-5 mr-2 text-blue-600 dark:text-violet-400" />
              本日のスケジュール・AI秘書タスク
            </CardTitle>
            <CardDescription className="dark:text-slate-400">今日の予約状況と連動したタスク管理</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-8">

            <div className="space-y-6">
              <h4 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Clock className="w-4 h-4 text-violet-600 dark:text-violet-400" /> 予約タイムライン
              </h4>
              {!data?.appointments || data.appointments.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-slate-400 border border-dashed rounded-xl">
                  <Calendar className="w-10 h-10 mb-2 opacity-10" />
                  <p className="text-sm">本日の予約はありません</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.appointments.map((res: any, i: number) => {
                    const cs = res.checkin_status;
                    const statusStyle =
                      cs === "done"         ? { bar: "bg-slate-300", badge: "bg-slate-100 text-slate-400", label: "完了" } :
                      cs === "in_treatment" ? { bar: "bg-emerald-400", badge: "bg-emerald-100 text-emerald-700", label: "施術中" } :
                      cs === "arrived"      ? { bar: "bg-blue-400", badge: "bg-blue-100 text-blue-700", label: "待合中" } :
                                              { bar: "bg-slate-200", badge: "bg-slate-100 text-slate-500", label: "未来院" };
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${cs === "done" ? "opacity-50" : "bg-white dark:bg-slate-800/50 border-slate-100 dark:border-slate-700"}`}
                      >
                        {/* ステータスバー */}
                        <div className={`w-1 h-10 rounded-full shrink-0 ${statusStyle.bar}`} />
                        {/* 時間 */}
                        <div className="font-mono text-sm font-bold text-slate-700 dark:text-slate-200 w-10 shrink-0">{res.time}</div>
                        {/* 患者名 */}
                        <button
                          type="button"
                          onClick={() => {
                            if (res.customer_id) {
                              setSelectedPatientId(res.customer_id);
                              setPatientPanelOpen(true);
                            }
                          }}
                          className="flex-1 text-left truncate font-semibold text-slate-800 dark:text-slate-100 hover:text-blue-600 text-sm"
                        >
                          {res.name} 様
                        </button>
                        {/* 初診バッジ */}
                        {res.type === "初診" && (
                          <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-500 text-white">初診</span>
                        )}
                        {/* チェックインバッジ */}
                        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${statusStyle.badge}`}>{statusStyle.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <Link href="/admin/counter">
                <Button variant="ghost" size="sm" className="w-full text-slate-500 text-xs mt-2">
                  受付カウンターで管理 <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" /> AI秘書が提案する今日のタスク
                </h4>
                <Link href="/admin/tasks" className="text-xs text-amber-600 hover:underline font-medium">すべて見る →</Link>
              </div>

              {(!data?.dailyTasks || data.dailyTasks.length === 0) ? (
                <Link href="/admin/tasks">
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-100 text-center hover:border-amber-300 transition-colors cursor-pointer">
                    <Sparkles className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-amber-800">本日のタスクを追加する</p>
                    <p className="text-xs text-amber-600/70 mt-1">AIが提案するSNSタスクを管理できます</p>
                  </div>
                </Link>
              ) : (
                <div className="space-y-2">
                  {data.dailyTasks.slice(0, 3).map((task: any) => (
                    <Link key={task.id} href="/admin/tasks">
                      <div className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-all ${task.status === 'completed' ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-amber-100 hover:border-amber-300'}`}>
                        <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${task.status === 'completed' ? 'bg-amber-400 border-amber-400' : 'border-amber-300'}`}>
                          {task.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <span className={`text-sm flex-1 ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700 font-medium'}`}>
                          {task.title || task.task_name}
                        </span>
                        {task.priority === 'high' && task.status !== 'completed' && (
                          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        )}
                      </div>
                    </Link>
                  ))}
                  {data.dailyTasks.length > 3 && (
                    <Link href="/admin/tasks">
                      <div className="text-center text-xs text-amber-600 hover:underline py-1 cursor-pointer">
                        他{data.dailyTasks.length - 3}件を見る
                      </div>
                    </Link>
                  )}
                  <Link href="/admin/tasks">
                    <Button variant="outline" size="sm" className="w-full mt-1 border-amber-200 text-amber-700 hover:bg-amber-50 text-xs">
                      <Sparkles className="w-3 h-3 mr-1" />タスク管理・追加はこちら
                    </Button>
                  </Link>
                </div>
              )}
            </div>

          </CardContent>
        </Card>

        {/* 3. BlogProposal & AIMemo */}
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
                <p className="text-sm font-bold text-slate-800">領収書・経費の登録</p>
                <p className="text-xs text-slate-500">OCR読取・人件費などの経費を<br />日付別に管理できます。</p>
              </div>
              <Link href="/admin/expenses" className="w-full">
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700">経費入力画面へ</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* 4. お誕生日ウィジェット */}
        <Card className="lg:col-span-1 shadow-sm border-slate-200 bg-gradient-to-br from-rose-50/50 to-orange-50/50">
          <CardHeader className="bg-rose-50/30 border-b pb-4">
            <CardTitle className="flex items-center text-lg text-rose-800">
              <Cake className="w-5 h-5 mr-2 text-rose-500" /> 今月のお誕生日
            </CardTitle>
            <CardDescription>お祝いを送った信頼関係の構築</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {!birthdays || birthdays.totalThisMonth === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <p className="text-sm font-medium">今月誕生日の方は<br />見つかりませんでした</p>
              </div>
            ) : (
              <div className="space-y-4">
                {birthdays.today.length > 0 && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl animate-pulse">
                    <p className="text-[10px] font-black text-rose-600 mb-1 flex items-center gap-1">
                      <SparklesIcon className="w-3 h-3" /> TODAY!
                    </p>
                    {birthdays.today.map((c: any) => (
                      <div key={c.id} className="flex justify-between items-center">
                        <span className="font-bold text-slate-900">{c.name} 様</span>
                        <Link href="/admin/marketing">
                          <Button size="sm" className="h-7 bg-rose-500 hover:bg-rose-600 text-[10px]">LINE送信</Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">今週中 ({birthdays.thisWeek.length})</p>
                  {birthdays.thisWeek.slice(0, 3).map((c: any) => (
                    <div key={c.id} className="flex justify-between items-center bg-white/50 p-2 rounded-lg border border-slate-100">
                      <span className="text-sm text-slate-700 font-medium">{c.name} 様</span>
                      <span className="text-xs text-rose-500 font-bold">{c.month}/{c.day}</span>
                    </div>
                  ))}
                </div>
                <Link href="/admin/marketing" className="block">
                  <Button variant="ghost" className="w-full text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                    マーケティング画面で詳細を見る →
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      <PatientSearchPanel
        open={patientPanelOpen}
        onOpenChange={setPatientPanelOpen}
        initialPatientId={selectedPatientId}
        onRefresh={() => {}}
      />
    </div>
  );
}
