"use client";

import React, { useState, useEffect } from "react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  Users, 
  TrendingUp, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  MessageSquare, 
  Clock, 
  Coins, 
  Plus, 
  Cake, 
  ArrowLeft,
  Share2,
  ExternalLink,
  MessageCircle,
  MapPin,
  Loader2,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Star,
  Video
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import AISecretaryBriefing from "@/components/admin/AISecretaryBriefing";

// デモ用の理想的なデータ
const DEMO_DATA = {
  clinicName: "V-ARC デモ接骨院",
  targetIncome: 2000000,
  monthlyRevenue: {
    total: 1845000,
    cash: 1250000,
    insurance: 595000
  },
  todaySales: 62000,
  targetSnsTasks: 20,
  monthlySnsDone: 17,
  appointments: [
    { time: "09:00", name: "佐藤 健一", type: "再診", status: "confirmed", aiPriority: true },
    { time: "10:30", name: "伊藤 舞", type: "初診", status: "confirmed", aiPriority: true },
    { time: "11:00", name: "鈴木 一郎", type: "再診", status: "confirmed" },
    { time: "14:00", name: "高橋 誠", type: "再診", status: "confirmed" },
    { time: "15:30", name: "渡辺 直美", type: "再診", status: "confirmed", aiPriority: true },
    { time: "17:00", name: "小林 隆志", type: "再診", status: "confirmed" },
  ],
  dailyTasks: [
    { id: "1", title: "Instagram: 腰痛ストレッチ動画の投稿", status: "completed", priority: "high" },
    { id: "2", title: "3ヶ月未来院患者へのLINEアプローチ", status: "pending", priority: "high" },
    { id: "3", title: "Googleマップの最新口コミへの返信", status: "pending", priority: "medium" },
  ],
  blogProposal: {
    title: "「なんとなく」の経営を卒業。AI秘書と創る、患者様との新しい絆。",
    keywords: ["接骨院経営", "DX", "AI活用", "リピート率向上"],
    content: "現在のリピート率が安定しているため、既存患者様への付加価値提案に軸足を置いた発信が効果的です。特にLINE予約の利便性に触れることで...",
    date: "4/9"
  },
  analysis: {
    goodPoints: [
      "初診リピート率が先月比 +15% 向上。LINEリマインドの自動化が非常に有効に機能しています。",
      "特定のエリア（〇〇区）からの新規患者が急増。マーケティングのターゲティングが的中しています。"
    ],
    badPoints: [
      "土曜の午後に集中する予約過密が顕在化。平日15時台への誘導を検討する必要があります。",
      "SNS経由の問い合わせへの返信時間が平均4時間を超過。即レス率の向上が成約率UPの鍵です。"
    ]
  },
  birthdays: [
    { name: "山田 花子", date: "4/9" }
  ]
};

export default function DemoDashboardPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [tasks, setTasks] = useState(DEMO_DATA.dailyTasks);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const triggerConfetti = () => {
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#8b5cf6', '#6366f1', '#f59e0b', '#ec4899']
    });
  };

  const handleCompleteTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'completed' } : t));
    triggerConfetti();
    toast.success("タスクを完了しました！", {
      description: "素晴らしい！この調子で今日の予定を進めましょう。",
    });
  };

  const handleDemoAction = (actionName: string) => {
    toast.info(`【デモ機能】実際にはここでは「${actionName}」が実行されます。`, {
      description: "本番環境では、LINEメッセージの送信やデータの保存が即座に行われます。",
      duration: 5000,
    });
  };

  if (!isMounted) return null;

  const monthlyProgress = Math.round((DEMO_DATA.monthlyRevenue.total / DEMO_DATA.targetIncome) * 100);
  const snsProgress = Math.round((DEMO_DATA.monthlySnsDone / DEMO_DATA.targetSnsTasks) * 100);
  const todayTarget = Math.round(DEMO_DATA.targetIncome / 30);
  const todayProgress = Math.min(100, Math.round((DEMO_DATA.todaySales / todayTarget) * 100));
  const remainingAction = Math.max(0, todayTarget - DEMO_DATA.todaySales);
  const remainingPatients = Math.ceil(remainingAction / 6000);

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-x-hidden">
      {/* AI秘書の朝礼コンポーネント */}
      <AISecretaryBriefing 
        appointments={DEMO_DATA.appointments} 
        onComplete={() => console.log("Briefing complete")}
        tone="polite"
      />

      {/* デモバナー */}
      <div className="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 text-white py-2 px-4 sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center text-[10px] md:text-sm font-black">
          <div className="flex items-center gap-2">
            <span className="bg-white/20 px-2 py-0.5 rounded-full animate-pulse">SECRETARY DEMO</span>
            <span>V-ARC 次世代経営ダッシュボード (プレビュー画面)</span>
          </div>
          <Link href="/presentation">
             <Button size="sm" variant="ghost" className="h-7 text-[10px] hover:bg-white/10 text-white">
               <ArrowLeft className="w-3 h-3 mr-1" /> 資料へ戻る
             </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in transition-all duration-1000">
        
        {/* ヘッダー */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 border-l-8 border-violet-600 pl-4">
              {DEMO_DATA.clinicName}
            </h1>
            <p className="text-slate-500 mt-2 font-medium">
              本日の予約、売上、そしてAI秘書が提案する次の「一手」を確認できます。
            </p>
          </div>
          <div className="bg-white border-2 border-slate-100 px-6 py-3 rounded-2xl shadow-sm text-sm font-black text-slate-700 flex items-center gap-3">
            <Clock className="w-5 h-5 text-violet-600" />
            {format(new Date(), "yyyy年M月d日 (E)", { locale: ja })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* 1. 経営指標 */}
          <Card className="lg:col-span-1 shadow-xl border-none ring-1 ring-slate-200 overflow-hidden group">
            <CardHeader className="bg-gradient-to-br from-slate-50 to-white border-b pb-6">
              <CardTitle className="flex items-center text-lg font-black text-slate-800">
                <TrendingUp className="w-5 h-5 mr-2 text-violet-600" />
                経営指標・売上進捗
              </CardTitle>
              <CardDescription className="font-medium text-slate-400">今月の目標達成率は順調です</CardDescription>
            </CardHeader>
            <CardContent className="pt-8 space-y-10">
              <div className="relative">
                <div className="flex justify-between items-baseline mb-3">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider">今月の売上達成率</span>
                  <span className="text-3xl font-black text-slate-900">{monthlyProgress}<span className="text-sm text-slate-400 font-normal ml-1">%</span></span>
                </div>
                <div className="h-5 w-full bg-slate-100 rounded-full overflow-hidden p-1">
                  <div 
                    className="h-full bg-gradient-to-r from-violet-500 to-indigo-600 rounded-full transition-all duration-1000 shadow-inner" 
                    style={{ width: `${monthlyProgress}%` }}
                  ></div>
                </div>
              </div>

              {/* 今日の現在地 */}
              <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-lg shadow-indigo-200">
                <div className="flex justify-between items-start mb-6">
                   <h4 className="text-sm font-black flex items-center gap-2">
                     <Sparkles className="w-4 h-4" /> 今日の売上現在地
                   </h4>
                   <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">REALTIME</span>
                </div>
                
                <div className="space-y-6">
                  <div className="flex justify-between items-center bg-white/10 p-4 rounded-2xl border border-white/10">
                    <span className="text-xs font-bold text-white/70">窓口売上 (計)</span>
                    <span className="text-2xl font-black">¥{DEMO_DATA.todaySales.toLocaleString()}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 pt-2">
                     <div className="bg-white/15 p-3 rounded-2xl border border-white/5">
                        <p className="text-[9px] text-white/60 font-bold mb-1">目標まであと</p>
                        <p className="text-lg font-black">¥{remainingAction.toLocaleString()}</p>
                     </div>
                     <div className="bg-white/15 p-3 rounded-2xl border border-white/5 text-right">
                        <p className="text-[9px] text-white/60 font-bold mb-1">来院目安</p>
                        <p className="text-lg font-black">あと<span className="text-2xl text-amber-300 mx-1">{remainingPatients}</span>人</p>
                     </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 2. 予約 & タスク */}
          <Card className="lg:col-span-2 shadow-xl border-none ring-1 ring-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b pb-6">
              <CardTitle className="flex items-center text-lg font-black text-slate-800">
                <Calendar className="w-5 h-5 mr-2 text-violet-600" />
                本日のスケジュール＆AI秘書タスク
              </CardTitle>
              <CardDescription className="font-medium text-slate-400">現場と経営を同時に回す司令塔です</CardDescription>
            </CardHeader>
            <CardContent className="pt-8 grid grid-cols-1 md:grid-cols-2 gap-10">
              
              {/* タイムライン */}
              <div className="space-y-6">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Clock className="w-4 h-4 text-violet-600" /> 予約タイムライン
                </h4>
                <div className="space-y-4 relative pl-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
                  {DEMO_DATA.appointments.map((res, i) => (
                    <div key={i} className="relative group">
                      <div className="absolute left-[-21px] top-1.5 w-[12px] h-[12px] rounded-full bg-white border-2 border-violet-500 z-10" />
                      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:border-violet-200 hover:shadow-md transition-all">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-violet-600 tabular-nums">{res.time}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-800 text-sm">{res.name} 様</span>
                              {res.aiPriority && (
                                <div className="group relative">
                                  <Star className="w-4 h-4 text-amber-500 fill-amber-400 animate-pulse" />
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 p-2 bg-slate-900 text-white text-[8px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                    AI秘書: 成約・リピートが期待されます。注力して対応しましょう。
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <span className={cn(
                            "text-[9px] px-2 py-0.5 rounded-full font-black tracking-tighter",
                            res.type === '初診' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                          )}>
                            {res.type}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* 空き時間枠の提案表示 */}
                  <div className="pt-2 px-2">
                    <div className="bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-2xl p-4 flex items-center gap-4 text-indigo-700">
                       <Video className="w-8 h-8 opacity-50" />
                       <div>
                          <p className="text-[10px] font-black leading-none mb-1">秘書の気付き</p>
                          <p className="text-xs font-bold leading-tight">13:00から60分以上の空きがあります。YouTube撮影はいかがですか？</p>
                       </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI 秘書タスク */}
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" /> AI秘書が提案する今日のタスク
                  </h4>
                </div>

                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div 
                      key={task.id} 
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer group",
                        task.status === 'completed' ? 'bg-slate-50 border-emerald-100 opacity-60' : 'bg-white border-slate-200 hover:border-violet-300'
                      )}
                      onClick={() => task.status !== 'completed' && handleCompleteTask(task.id)}
                    >
                      <div className={cn(
                        "shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                        task.status === 'completed' ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200 group-hover:border-violet-300'
                      )}>
                        {task.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-white" />}
                      </div>
                      <span className={cn(
                        "text-sm font-bold flex-1",
                        task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700'
                      )}>
                        {task.title}
                      </span>
                    </div>
                  ))}
                  
                  <div className="pt-4 space-y-3">
                     <p className="text-[10px] font-black text-slate-400 text-center uppercase tracking-widest">More Actions</p>
                     <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="text-[10px] font-black h-10 rounded-xl" onClick={() => handleDemoAction("売上登録")}>
                           <Plus className="w-3 h-3 mr-1" /> 売上登録
                        </Button>
                        <Button variant="outline" className="text-[10px] font-black h-10 rounded-xl" onClick={() => handleDemoAction("経費入力")}>
                           <Coins className="w-3 h-3 mr-1" /> 経費入力
                        </Button>
                     </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 3. AI経営分析レポート */}
          <Card className="lg:col-span-2 shadow-2xl border-none ring-1 ring-slate-200 overflow-hidden flex flex-col">
            <CardHeader className="bg-gradient-to-br from-indigo-50 to-white border-b pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center text-lg font-black text-slate-800">
                    <Sparkles className="w-5 h-5 mr-2 text-amber-500" /> 
                    AI秘書 経営分析レポート
                  </CardTitle>
                  <CardDescription className="font-medium text-slate-500">直近1週間の経営データから、自動で要点を抽出しました</CardDescription>
                </div>
                <Button size="sm" variant="ghost" className="h-8 rounded-xl text-[10px] font-black" onClick={() => handleDemoAction("詳細レポート生成")}>
                    詳細を表示
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-8 space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                 {/* 良い点 */}
                 <div className="space-y-4">
                    <div className="flex items-center gap-2 text-emerald-700">
                       <ThumbsUp className="w-5 h-5" />
                       <h4 className="font-black text-sm uppercase tracking-wider">特に好調な点</h4>
                    </div>
                    <div className="space-y-3">
                       {DEMO_DATA.analysis.goodPoints.map((text, i) => (
                         <div key={i} className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex gap-3 group hover:bg-emerald-100 transition-colors">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            <p className="text-xs text-emerald-900 font-bold leading-relaxed">{text}</p>
                         </div>
                       ))}
                    </div>
                 </div>

                 {/* 悪い点 */}
                 <div className="space-y-4">
                    <div className="flex items-center gap-2 text-rose-700">
                       <ThumbsDown className="w-5 h-5" />
                       <h4 className="font-black text-sm uppercase tracking-wider">改善すべき課題</h4>
                    </div>
                    <div className="space-y-3">
                       {DEMO_DATA.analysis.badPoints.map((text, i) => (
                         <div key={i} className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex gap-3 group hover:bg-rose-100 transition-colors">
                            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                            <p className="text-xs text-rose-900 font-bold leading-relaxed">{text}</p>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>

              {/* AI秘書からの総合アドバイス */}
              <div className="mt-4 bg-slate-900 rounded-3xl p-6 text-white relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Sparkles className="w-24 h-24" />
                 </div>
                 <div className="relative z-10 flex flex-col md:flex-row gap-6 items-center">
                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center shrink-0 border border-white/20">
                       <MessageSquare className="w-8 h-8 text-amber-400" />
                    </div>
                    <div className="space-y-2">
                       <h5 className="font-black text-sm text-amber-400">秘書の見解・戦術案</h5>
                       <p className="text-xs leading-relaxed font-medium text-slate-300">
                         「リピート率は理想的な伸びを見せていますが、土曜日の過密解消が急務です。LINEのセグメント配信機能を使い、平日の空き枠（特に15時〜16時）への誘導クーポンを配布しましょう。これにより、スタッフの負担分散と収益のさらなる平準化が期待できます。」
                       </p>
                    </div>
                 </div>
              </div>
            </CardContent>
          </Card>

          {/* 4. note執筆提案 & 誕生日 */}
          <div className="space-y-6">
            <Card className="shadow-xl border-none ring-1 ring-slate-200 bg-rose-50/10">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center text-sm font-black text-rose-700">
                  <Sparkles className="w-4 h-4 mr-2" />
                  今週のnote執筆提案
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-sm space-y-2">
                   <h3 className="font-black text-slate-800 text-xs leading-tight">{DEMO_DATA.blogProposal.title}</h3>
                </div>
                <Button variant="outline" className="w-full text-[10px] font-black h-9 rounded-xl border-rose-200 text-rose-700" onClick={() => handleDemoAction("記事構成確認")}>
                  構成を確認
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-xl border-none ring-1 ring-slate-200 bg-emerald-50/30">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center text-sm font-black text-emerald-800">
                  <Cake className="w-4 h-4 mr-2 text-rose-500" />
                  今日のお誕生日
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {DEMO_DATA.birthdays.map((p, i) => (
                  <div key={i} className="flex justify-between items-center bg-white p-3 rounded-2xl shadow-sm border border-emerald-100">
                   <div className="flex items-center gap-2">
                     <span className="font-black text-slate-800 text-xs">{p.name} 様</span>
                     <span className="bg-rose-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-black animate-bounce">TODAY!</span>
                   </div>
                   <Button size="sm" className="h-7 bg-rose-500 hover:bg-rose-600 text-[10px] font-black rounded-lg" onClick={() => handleDemoAction("バースデーLINE送信")}>
                     送付
                   </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Link href="/presentation/inquiry" className="w-full">
              <Button className="w-full h-14 bg-slate-900 dark:bg-violet-600 rounded-2xl font-black text-xs space-y-1 py-1">
                 <span>デモ体験の終了 /</span>
                 <span className="block opacity-70">正規版の導入相談はこちら</span>
              </Button>
            </Link>
          </div>

        </div>

        {/* フッターCTA */}
        <div className="pt-12 pb-20 text-center space-y-6">
           <div className="inline-block px-4 py-1.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-black uppercase tracking-widest mb-2">
             Start your journey
           </div>
           <h2 className="text-4xl font-black text-slate-900 leading-tight">
             院の経営に、<br /><span className="text-violet-600 underline decoration-indigo-200 decoration-8 underline-offset-8">圧倒的なスピード</span>と<span className="text-indigo-600 underline decoration-indigo-200 decoration-8 underline-offset-8">確かな戦略</span>を。
           </h2>
           <p className="text-slate-500 font-medium max-w-xl mx-auto">
             V-ARCは、接骨院の現場から生まれた実戦型システムです。<br />
             まずは無料のデモンストレーションから始めませんか？
           </p>
           <div className="flex flex-col md:flex-row justify-center gap-4 pt-4">
              <Link href="/presentation/inquiry">
                <Button className="h-16 px-10 rounded-3xl bg-slate-900 dark:bg-violet-600 text-white font-black text-lg shadow-2xl hover:scale-105 transition-transform">
                  デモの予約・お問い合わせ
                  <Plus className="w-5 h-5 ml-2" strokeWidth={3} />
                </Button>
              </Link>
              <Link href="/presentation">
                 <Button variant="outline" className="h-16 px-10 rounded-3xl border-2 border-slate-200 text-slate-900 font-black text-lg hover:bg-slate-100">
                   プレゼン資料へ戻る
                 </Button>
              </Link>
           </div>
        </div>

      </div>
    </div>
  );
}
