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
import { PatientSearchPanel } from "@/components/admin/PatientSearchPanel";
import { getUpcomingBirthdays } from "@/app/actions/admin-marketing-actions";
import { Cake, Sparkles as SparklesIcon, Star } from "lucide-react";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import AISecretaryBriefing from "@/components/admin/AISecretaryBriefing";

export default function DashboardPrototype() {
  const [activeTab, setActiveTab] = useState('youtube');
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
          setError(res.error || "繝・・繧ｿ縺ｮ蜿門ｾ励↓螟ｱ謨励＠縺ｾ縺励◆");
        }

        // 隱慕函譌･繝・・繧ｿ繧貞叙蠕・
        const bDays = await getUpcomingBirthdays();
        setBirthdays(bDays);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
        setError("繧ｷ繧ｹ繝・Β繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆");
      } finally {
        setLoading(false);
      }
    }
    fetchData();

    // 繝ｪ繧｢繝ｫ繧ｿ繧､繝蜷梧悄縺ｮ險ｭ螳・(Supabase Real-time)
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
      const { error } = await supabase.from('daily_tasks').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
      const res = await getTodayDashboardData();
      if (res.success) setData(res.data);
      if (newStatus === 'completed') {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#8b5cf6', '#6366f1', '#f59e0b', '#ec4899']
        });
        toast.success('繧ｿ繧ｹ繧ｯ繧貞ｮ御ｺ・↓縺励∪縺励◆・・);
      } else {
        toast.success('繧ｿ繧ｹ繧ｯ繧呈悴螳御ｺ・↓謌ｻ縺励∪縺励◆');
      }
    } catch(e) {
      toast.error('繧ｿ繧ｹ繧ｯ縺ｮ譖ｴ譁ｰ縺ｫ螟ｱ謨励＠縺ｾ縺励◆');
    }
  };

  if (loading || !currentDate) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
          <p className="text-slate-500 font-medium tracking-wide">繝繝・す繝･繝懊・繝峨ｒ讒区・荳ｭ...</p>
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
              繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-rose-700 text-sm">{error}</p>
            <Button 
              onClick={() => window.location.reload()} 
              className="w-full bg-rose-600 hover:bg-rose-700 text-white"
            >
              蜀崎ｪｭ縺ｿ霎ｼ縺ｿ繧定ｩｦ縺・
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
      {/* 繝励Ξ繝溘い繝閭梧勹陬・｣ｾ (繝繝ｼ繧ｯ繝｢繝ｼ繝画凾縺ｮ縺ｿ) */}
      <div className="absolute top-0 right-0 -z-10 w-[500px] h-[500px] bg-violet-600/10 blur-[120px] rounded-full hidden dark:block" />
      <div className="absolute bottom-0 left-0 -z-10 w-[400px] h-[400px] bg-indigo-600/10 blur-[100px] rounded-full hidden dark:block" />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50 border-l-8 border-violet-600 pl-4">
            V-ARC AI遘俶嶌 繝繝・す繝･繝懊・繝・
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium">
            譛ｬ譌･縺ｮ莠育ｴ・憾豕√∝｣ｲ荳企ｲ謐励√◎縺励※AI遘俶嶌縺九ｉ縺ｮ繧｢繝峨ヰ繧､繧ｹ繧剃ｸ蜈・ｮ｡逅・＠縺ｾ縺吶・
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 px-4 py-2 rounded-lg shadow-sm text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 transition-colors">
            <Clock className="w-4 h-4 text-blue-600 dark:text-violet-400" />
            {currentDate && format(currentDate, "yyyy蟷ｴM譛・譌･ (E)", { locale: ja })}
          </div>
        </div>
      </div>
      
      {/* AI遘俶嶌縺ｮ譛昴・繝悶Μ繝ｼ繝輔ぅ繝ｳ繧ｰ */}
      {data && data.appointments && (
        <AISecretaryBriefing 
          appointments={data.appointments} 
          onComplete={() => {}} 
          tone="polite"
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ======== 1. 邨悟霧謖・ｨ呻ｼ・｣ｲ荳顔岼讓・======== */}
        <Card className="lg:col-span-1 shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900/60 dark:backdrop-blur-sm group overflow-hidden">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-800/20 border-b dark:border-slate-800 pb-4">
            <CardTitle className="flex items-center text-lg text-slate-800 dark:text-slate-100">
              <TrendingUp className="w-5 h-5 mr-2 text-blue-600 dark:text-violet-400" />
              邨悟霧謖・ｨ吶・螢ｲ荳企ｲ謐・
            </CardTitle>
            <CardDescription className="dark:text-slate-400">莉頑怦縺ｮ逶ｮ讓咎＃謌千紫縺ｨ譛ｬ譌･縺ｮ謨ｰ蟄・/CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-8">
            <div className="relative">
              <div className="flex justify-between items-baseline mb-3">
                <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">莉頑怦縺ｮ螢ｲ荳企＃謌千紫</span>
                <span className="text-3xl font-black text-slate-900 dark:text-slate-50">{monthlyProgress}<span className="text-sm text-slate-400 font-normal ml-1">%</span></span>
              </div>
              <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-violet-600 rounded-full transition-all duration-1000" 
                  style={{ width: `${monthlyProgress}%` }}
                ></div>
              </div>
              <div className="flex justify-between mt-2 text-xs text-slate-500">
                <span>逶ｮ讓・ ﾂ･{data?.targetIncome?.toLocaleString() || '---'}</span>
                <span className="font-bold text-slate-700">迴ｾ蝨ｨ: ﾂ･{data?.monthlyRevenue?.total?.toLocaleString() || 0}</span>
              </div>
              <div className="mt-2 flex gap-2">
                <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded">閾ｪ雋ｻ: ﾂ･{data?.monthlyRevenue?.cash?.toLocaleString() || 0}</span>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">菫晞匱: ﾂ･{data?.monthlyRevenue?.insurance?.toLocaleString() || 0}</span>
              </div>
            </div>

            {/* SNS繧ｿ繧ｹ繧ｯ騾ｲ謐・*/}
            <div>
              <div className="flex justify-between items-end mb-2">
                <span className="text-sm font-medium text-slate-600">莉頑怦縺ｮSNS繧ｿ繧ｹ繧ｯ騾ｲ謐・/span>
                <span className="text-2xl font-bold text-slate-900">{snsProgress}<span className="text-sm text-slate-500 font-normal">%</span></span>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-1000"
                  style={{ width: `${snsProgress}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs text-slate-500">
                <span>逶ｮ讓・ {data?.targetSnsTasks || '---'}莉ｶ</span>
                <span className="font-bold text-slate-700">螳御ｺ・ {data?.monthlySnsDone || 0}莉ｶ</span>
              </div>
            </div>

            {/* 譛ｬ譌･縺ｮ逶ｮ讓吶→騾ｲ謐・*/}
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
              <h4 className="text-sm font-bold text-blue-900 mb-3 flex items-center justify-between">
                莉頑律縺ｮ螢ｲ荳顔樟蝨ｨ蝨ｰ
                <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full font-medium">譖ｴ譁ｰ: 繝ｪ繧｢繝ｫ繧ｿ繧､繝</span>
              </h4>
              
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">譛ｬ譌･縺ｮ逶ｮ讓・/span>
                    <span className="font-bold text-slate-800">ﾂ･{todayTarget.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-600">迴ｾ蝨ｨ縺ｮ螢ｲ荳奇ｼ育ｪ灘哨・・/span>
                    <span className="font-bold text-blue-600">ﾂ･{data?.todaySales?.toLocaleString() || 0}</span>
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
                    <p className="text-xs text-slate-500">逶ｮ讓吶∪縺ｧ縺ゅ→</p>
                    <p className="text-lg font-bold text-rose-600">ﾂ･{remainingAction.toLocaleString()}</p>
                  </div>
                  <div className="h-10 w-px bg-slate-100"></div>
                  <div className="space-y-0.5 text-right">
                    <p className="text-xs text-slate-500">譚･髯｢逶ｮ螳会ｼ郁・雋ｻ6蜊・・/莠ｺ・・/p>
                    <p className="text-lg font-bold text-slate-800">縺ゅ→<span className="text-2xl text-blue-600 mx-1">{remainingPatients}</span>莠ｺ</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
               <Link href="/admin/sales">
                 <Button variant="outline" className="w-full text-xs h-8 border-dashed group">
                   <Plus className="w-3 h-3 mr-1 group-hover:text-blue-600" />
                   遯灘哨螢ｲ荳翫ｒ逋ｻ骭ｲ
                 </Button>
               </Link>
               <Link href="/admin/insurance">
                 <Button variant="outline" className="w-full text-xs h-8 border-dashed group">
                   <Plus className="w-3 h-3 mr-1 group-hover:text-emerald-600" />
                   菫晞匱蜈･驥代ｒ逋ｻ骭ｲ
                 </Button>
               </Link>
            </div>
          </CardContent>
        </Card>

        {/* ======== 2. 譛ｬ譌･縺ｮ莠育ｴ・ｮ｡逅・ｼ・I繧ｿ繧ｹ繧ｯ ======== */}
        <Card className="lg:col-span-2 shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900/60 dark:backdrop-blur-sm">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-800/20 border-b dark:border-slate-800 pb-4">
            <CardTitle className="flex items-center text-lg text-slate-800 dark:text-slate-100">
              <Calendar className="w-5 h-5 mr-2 text-blue-600 dark:text-violet-400" />
              譛ｬ譌･縺ｮ繧ｹ繧ｱ繧ｸ繝･繝ｼ繝ｫ・・I遘俶嶌繧ｿ繧ｹ繧ｯ
            </CardTitle>
            <CardDescription className="dark:text-slate-400">莉頑律縺ｮ莠育ｴ・憾豕√→騾｣蜍輔＠縺溘ち繧ｹ繧ｯ邂｡逅・/CardDescription>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* 繧ｿ繧､繝繝ｩ繧､繝ｳ */}
            <div className="space-y-6">
              <h4 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                 <Clock className="w-4 h-4 text-violet-600 dark:text-violet-400" /> 莠育ｴ・ち繧､繝繝ｩ繧､繝ｳ
              </h4>
              {!data?.appointments || data.appointments.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-slate-400 border border-dashed rounded-xl">
                  <Calendar className="w-10 h-10 mb-2 opacity-10" />
                  <p className="text-sm">譛ｬ譌･縺ｮ莠育ｴ・・縺ゅｊ縺ｾ縺帙ｓ</p>
                </div>
              ) : (
                <div className="space-y-4 relative pl-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100 dark:before:bg-slate-800">
                  {data.appointments.map((res: any, i: number) => (
                            <button
                              type="button"
                              onClick={() => {
                                if (res.customer_id) {
                                  setSelectedPatientId(res.customer_id);
                                  setPatientPanelOpen(true);
                                }
                              }}
                              className="font-bold text-blue-700 text-sm truncate mr-1 hover:underline text-left"
                            >
                              {res.name} 讒・
                            </button>
                            {/* AI遘俶嶌縺ｫ繧医ｋ蜆ｪ蜈亥ｺｦ繝槭・繧ｯ (莉ｮ: 蛻晁ｨｺ繧・音螳壽擅莉ｶ縺ｧ陦ｨ遉ｺ) */}
                            {(res.type === '蛻晁ｨｺ' || i === 0) && (
                              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 animate-pulse shrink-0" />
                            )}
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${res.type === '蛻晁ｨｺ' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                            {res.type}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500">{res.status === 'confirmed' ? '蜿嶺ｻ伜ｮ御ｺ・ : '菫晉蕗荳ｭ'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/admin/appointments">
                <Button variant="ghost" size="sm" className="w-full text-slate-500 text-xs mt-2 underline">莠育ｴ・ｸ隕ｧ縺ｧ隧ｳ縺励￥隕九ｋ</Button>
              </Link>
            </div>

            {/* AI 繧ｿ繧ｹ繧ｯ 繝励Ξ繝薙Η繝ｼ */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" /> AI遘俶嶌縺梧署譯医☆繧倶ｻ頑律縺ｮ繧ｿ繧ｹ繧ｯ
                </h4>
                <Link href="/admin/tasks" className="text-xs text-amber-600 hover:underline font-medium">縺吶∋縺ｦ隕九ｋ 竊・/Link>
              </div>

              {(!data?.dailyTasks || data.dailyTasks.length === 0) ? (
                <Link href="/admin/tasks">
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-100 text-center hover:border-amber-300 transition-colors cursor-pointer">
                    <Sparkles className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-amber-800">譛ｬ譌･縺ｮ繧ｿ繧ｹ繧ｯ繧定ｿｽ蜉縺吶ｋ</p>
                    <p className="text-xs text-amber-600/70 mt-1">AI縺梧署譯医☆繧鬼NS繧ｿ繧ｹ繧ｯ繧堤ｮ｡逅・〒縺阪∪縺・/p>
                  </div>
                </Link>
              ) : (
                <div className="space-y-2">
                  {/* 譛螟ｧ3莉ｶ繝励Ξ繝薙Η繝ｼ */}
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
                  {/* 谿九ｊ莉ｶ謨ｰ or 蜈ｨ莉ｶ螳御ｺ・*/}
                  {data.dailyTasks.length > 3 && (
                    <Link href="/admin/tasks">
                      <div className="text-center text-xs text-amber-600 hover:underline py-1 cursor-pointer">
                        莉・{data.dailyTasks.length - 3} 莉ｶ繧定ｦ九ｋ
                      </div>
                    </Link>
                  )}
                  <Link href="/admin/tasks">
                    <Button variant="outline" size="sm" className="w-full mt-1 border-amber-200 text-amber-700 hover:bg-amber-50 text-xs">
                      <Sparkles className="w-3 h-3 mr-1" />繧ｿ繧ｹ繧ｯ邂｡逅・・霑ｽ蜉縺ｯ縺薙■繧・
                    </Button>
                  </Link>
                </div>
              )}
            </div>

          </CardContent>
        </Card>

        {/* ======== 3. SNS繝舌ぜ繧翫ヨ繝ｬ繝ｳ繝画署譯・& 邨悟霧謾ｹ蝟・署譯・& AI遘俶嶌繝｡繝｢ ======== */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <BlogProposal clinicContext={JSON.stringify(data)} />
            <AIMemo />
        </div>

        <Card className="lg:col-span-1 shadow-sm border-slate-200">
           <CardHeader className="bg-emerald-50/30 border-b pb-4">
            <CardTitle className="flex items-center text-lg text-emerald-800">
              <Coins className="w-5 h-5 mr-2" /> 邨瑚ｲｻ蜈･蜉帙∈縺ｮ繧ｷ繝ｧ繝ｼ繝医き繝・ヨ
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
             <div className="flex flex-col items-center justify-center space-y-4 py-4 text-center">
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600">
                   <Coins className="w-10 h-10" />
                </div>
                <div className="space-y-1">
                   <p className="text-sm font-bold text-slate-800">鬆伜庶譖ｸ繝ｻ邨瑚ｲｻ縺ｮ險井ｸ・/p>
                   <p className="text-xs text-slate-500">蛯吝刀雉ｼ蜈･繧・・辭ｱ雋ｻ縺ｪ縺ｩ縺ｮ邨瑚ｲｻ繧・br/>邏譌ｩ縺剰ｨ倬鹸縺ｧ縺阪∪縺吶・/p>
                </div>
                <Link href="/admin/expenses" className="w-full">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700">邨瑚ｲｻ蜈･蜉帷判髱｢縺ｸ</Button>
                </Link>
             </div>
          </CardContent>
        </Card>

        {/* ======== 4. 縺願ｪ慕函譌･繧ｦ繧｣繧ｸ繧ｧ繝・ヨ ======== */}
        <Card className="lg:col-span-1 shadow-sm border-slate-200 bg-gradient-to-br from-rose-50/50 to-orange-50/50">
          <CardHeader className="bg-rose-50/30 border-b pb-4">
            <CardTitle className="flex items-center text-lg text-rose-800">
              <Cake className="w-5 h-5 mr-2 text-rose-500" /> 莉頑怦縺ｮ縺願ｪ慕函譌･
            </CardTitle>
            <CardDescription>縺顔･昴＞繧帝壹§縺滉ｿ｡鬆ｼ髢｢菫ゅ・讒狗ｯ・/CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {!birthdays || birthdays.totalThisMonth === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <p className="text-sm font-medium">莉頑怦隱慕函譌･縺ｮ謔｣閠・＆繧薙・<br/>隕九▽縺九ｊ縺ｾ縺帙ｓ縺ｧ縺励◆</p>
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
                        <span className="font-bold text-slate-900">{c.name} 讒・/span>
                        <Link href="/admin/marketing">
                          <Button size="sm" className="h-7 bg-rose-500 hover:bg-rose-600 text-[10px]">LINE騾∽ｻ・/Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">霑第律荳ｭ ({birthdays.thisWeek.length})</p>
                  {birthdays.thisWeek.slice(0, 3).map((c: any) => (
                    <div key={c.id} className="flex justify-between items-center bg-white/50 p-2 rounded-lg border border-slate-100">
                      <span className="text-sm text-slate-700 font-medium">{c.name} 讒・/span>
                      <span className="text-xs text-rose-500 font-bold">{c.month}/{c.day}</span>
                    </div>
                  ))}
                </div>

                <Link href="/admin/marketing" className="block">
                  <Button variant="ghost" className="w-full text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                    繝槭・繧ｱ繝・ぅ繝ｳ繧ｰ逕ｻ髱｢縺ｧ迚ｹ蜈ｸ繧帝√ｋ 竊・
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

