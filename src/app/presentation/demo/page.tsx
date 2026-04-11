"use client";

import React, { useState, useEffect, useRef } from "react";
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
  Loader2,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Star,
  Video,
  Camera,
  X,
  Receipt,
  BarChart2,
  TrendingDown,
  Users,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import AISecretaryBriefing from "@/components/admin/AISecretaryBriefing";

const DEMO_DATA = {
  clinicName: "V-ARC デモ接骨院",
  targetIncome: 2000000,
  monthlyRevenue: { total: 1845000, cash: 1250000, insurance: 595000 },
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
  birthdays: [{ name: "山田 花子", date: "4/9" }],
  // 年次比較データ（3月）
  yearComparison: {
    lastYear: { month: "2025年3月", visits: 128, revenue: 1450000, newPatients: 18, repeatRate: 62 },
    thisYear: { month: "2026年3月", visits: 167, revenue: 1845000, newPatients: 31, repeatRate: 78 },
  }
};

// OCRデモ用の偽領収書データ
const DEMO_RECEIPT = {
  vendor: "○○医療用品株式会社",
  date: format(new Date(), "yyyy/MM/dd"),
  amount: 12800,
  category: "医療備品",
  items: ["サポーター（L）× 3", "テーピングテープ × 5"],
};

export default function DemoDashboardPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [tasks, setTasks] = useState(DEMO_DATA.dailyTasks);
  const [appointments, setAppointments] = useState(DEMO_DATA.appointments);

  // 予約デモ
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingTime, setBookingTime] = useState("12:00");
  const [bookingName, setBookingName] = useState("");
  const [bookingType, setBookingType] = useState<"初診" | "再診">("再診");

  // 経費OCRデモ
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [ocrStep, setOcrStep] = useState<"upload" | "reading" | "result">("upload");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setIsMounted(true); }, []);

  const triggerConfetti = () => {
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#8b5cf6', '#6366f1', '#f59e0b', '#ec4899'] });
  };

  const handleCompleteTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'completed' } : t));
    triggerConfetti();
    toast.success("タスクを完了しました！", { description: "素晴らしい！この調子で今日の予定を進めましょう。" });
  };

  const handleDemoAction = (actionName: string) => {
    toast.info(`【デモ機能】実際にはここでは「${actionName}」が実行されます。`, {
      description: "本番環境では、LINEメッセージの送信やデータの保存が即座に行われます。",
      duration: 5000,
    });
  };

  // 予約デモ確定
  const handleBookingConfirm = () => {
    if (!bookingName.trim()) { toast.error("患者名を入力してください"); return; }
    setAppointments(prev => {
      const newApt = { time: bookingTime, name: bookingName, type: bookingType, status: "confirmed" as const };
      return [...prev, newApt].sort((a, b) => a.time.localeCompare(b.time));
    });
    setShowBookingModal(false);
    setBookingName("");
    triggerConfetti();
    toast.success(`${bookingTime} / ${bookingName} 様の予約を追加しました！`, {
      description: "※デモ画面での操作です。本番では患者様へLINE通知も送信されます。"
    });
  };

  // OCRデモ
  const handleOcrDemo = () => {
    setOcrStep("reading");
    setTimeout(() => setOcrStep("result"), 2200);
  };

  const handleExpenseSave = () => {
    setShowExpenseModal(false);
    setOcrStep("upload");
    toast.success(`¥${DEMO_RECEIPT.amount.toLocaleString()} の経費を登録しました！`, {
      description: "カテゴリ「医療備品」として自動分類されました。"
    });
  };

  if (!isMounted) return null;

  const monthlyProgress = Math.round((DEMO_DATA.monthlyRevenue.total / DEMO_DATA.targetIncome) * 100);
  const todayTarget = Math.round(DEMO_DATA.targetIncome / 30);
  const todayProgress = Math.min(100, Math.round((DEMO_DATA.todaySales / todayTarget) * 100));
  const remainingAction = Math.max(0, todayTarget - DEMO_DATA.todaySales);
  const remainingPatients = Math.ceil(remainingAction / 6000);

  const { lastYear, thisYear } = DEMO_DATA.yearComparison;
  const visitDiff = Math.round(((thisYear.visits - lastYear.visits) / lastYear.visits) * 100);
  const revenueDiff = Math.round(((thisYear.revenue - lastYear.revenue) / lastYear.revenue) * 100);
  const newPatientDiff = Math.round(((thisYear.newPatients - lastYear.newPatients) / lastYear.newPatients) * 100);
  const repeatDiff = thisYear.repeatRate - lastYear.repeatRate;

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-x-hidden">
      <AISecretaryBriefing appointments={appointments} onComplete={() => {}} tone="polite" />

      {/* デモバナー */}
      <div className="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 text-white py-3 px-4 sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3 text-sm font-black">
            <span className="bg-white/20 px-3 py-1 rounded-full text-xs animate-pulse">DEMO</span>
            <span className="hidden md:inline">V-ARC 次世代経営ダッシュボード（体験版）</span>
          </div>
          <Link href="/presentation">
            <Button size="sm" variant="ghost" className="h-8 text-sm font-bold hover:bg-white/20 text-white border border-white/30 rounded-xl px-4">
              <ArrowLeft className="w-4 h-4 mr-1" /> プレゼン資料へ戻る
            </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in">

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
          <Card className="lg:col-span-1 shadow-xl border-none ring-1 ring-slate-200 overflow-hidden">
            <CardHeader className="bg-gradient-to-br from-slate-50 to-white border-b pb-6">
              <CardTitle className="flex items-center text-lg font-black text-slate-800">
                <TrendingUp className="w-5 h-5 mr-2 text-violet-600" /> 経営指標・売上進捗
              </CardTitle>
              <CardDescription className="font-medium text-slate-400">今月の目標達成率は順調です</CardDescription>
            </CardHeader>
            <CardContent className="pt-8 space-y-8">
              <div>
                <div className="flex justify-between items-baseline mb-3">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider">今月の売上達成率</span>
                  <span className="text-3xl font-black text-slate-900">{monthlyProgress}<span className="text-sm text-slate-400 font-normal ml-1">%</span></span>
                </div>
                <div className="h-5 w-full bg-slate-100 rounded-full overflow-hidden p-1">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-600 rounded-full transition-all duration-1000" style={{ width: `${monthlyProgress}%` }} />
                </div>
                <div className="flex justify-between mt-2 text-xs text-slate-400">
                  <span>目標: ¥{DEMO_DATA.targetIncome.toLocaleString()}</span>
                  <span className="font-bold text-slate-700">現在: ¥{DEMO_DATA.monthlyRevenue.total.toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-lg shadow-indigo-200">
                <div className="flex justify-between items-start mb-4">
                  <h4 className="text-sm font-black flex items-center gap-2"><Sparkles className="w-4 h-4" /> 今日の売上現在地</h4>
                  <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">REALTIME</span>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-white/10 p-4 rounded-2xl">
                    <span className="text-xs font-bold text-white/70">窓口売上（計）</span>
                    <span className="text-2xl font-black">¥{DEMO_DATA.todaySales.toLocaleString()}</span>
                  </div>
                  <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white/70 rounded-full" style={{ width: `${todayProgress}%` }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/15 p-3 rounded-2xl">
                      <p className="text-[10px] text-white/60 font-bold mb-1">目標まであと</p>
                      <p className="text-base font-black">¥{remainingAction.toLocaleString()}</p>
                    </div>
                    <div className="bg-white/15 p-3 rounded-2xl text-right">
                      <p className="text-[10px] text-white/60 font-bold mb-1">来院目安</p>
                      <p className="text-base font-black">あと<span className="text-xl text-amber-300 mx-1">{remainingPatients}</span>人</p>
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
                <Calendar className="w-5 h-5 mr-2 text-violet-600" /> 本日のスケジュール＆AI秘書タスク
              </CardTitle>
              <CardDescription className="font-medium text-slate-400">現場と経営を同時に回す司令塔です</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-8">

              {/* タイムライン */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Clock className="w-4 h-4 text-violet-600" /> 予約タイムライン
                  </h4>
                  <Button
                    size="sm"
                    className="h-8 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl px-3"
                    onClick={() => setShowBookingModal(true)}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> 予約を入れる
                  </Button>
                </div>

                <div className="space-y-2.5 relative pl-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
                  {appointments.map((res, i) => (
                    <div key={i} className="relative group">
                      <div className="absolute left-[-21px] top-2 w-3 h-3 rounded-full bg-white border-2 border-violet-500 z-10" />
                      <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm hover:border-violet-200 hover:shadow-md transition-all">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-violet-600 tabular-nums">{res.time}</span>
                            <span className="font-black text-slate-800 text-sm">{res.name} 様</span>
                            {(res as any).aiPriority && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 animate-pulse" />}
                          </div>
                          <span className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full font-black",
                            res.type === '初診' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                          )}>{res.type}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="px-1">
                    <div className="bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-2xl p-3 flex items-center gap-3 text-indigo-700">
                      <Video className="w-6 h-6 opacity-50 shrink-0" />
                      <p className="text-xs font-bold leading-tight">13:00から60分以上の空きがあります。YouTube撮影はいかがですか？</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI タスク */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" /> AI秘書が提案する今日のタスク
                </h4>
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer group",
                        task.status === 'completed' ? 'bg-slate-50 border-emerald-100 opacity-60' : 'bg-white border-slate-200 hover:border-violet-300'
                      )}
                      onClick={() => task.status !== 'completed' && handleCompleteTask(task.id)}
                    >
                      <div className={cn(
                        "shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center",
                        task.status === 'completed' ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200 group-hover:border-violet-300'
                      )}>
                        {task.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-white" />}
                      </div>
                      <span className={cn("text-sm font-bold flex-1", task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700')}>
                        {task.title}
                      </span>
                    </div>
                  ))}

                  <div className="pt-2 grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="text-xs font-bold h-10 rounded-xl border-slate-200 text-slate-700 hover:border-violet-300 hover:text-violet-700"
                      onClick={() => handleDemoAction("売上登録")}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> 売上登録
                    </Button>
                    <Button
                      variant="outline"
                      className="text-xs font-bold h-10 rounded-xl border-slate-200 text-slate-700 hover:border-emerald-300 hover:text-emerald-700"
                      onClick={() => { setShowExpenseModal(true); setOcrStep("upload"); }}
                    >
                      <Camera className="w-3.5 h-3.5 mr-1" /> 経費入力（写真）
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 3. AI経営分析レポート */}
          <Card className="lg:col-span-2 shadow-2xl border-none ring-1 ring-slate-200 overflow-hidden">
            <CardHeader className="bg-gradient-to-br from-indigo-50 to-white border-b pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center text-lg font-black text-slate-800">
                    <Sparkles className="w-5 h-5 mr-2 text-amber-500" /> AI秘書 経営分析レポート
                  </CardTitle>
                  <CardDescription className="font-medium text-slate-500">直近1週間の経営データから自動抽出</CardDescription>
                </div>
                <Button size="sm" className="h-9 rounded-xl text-sm font-bold bg-slate-800 text-white hover:bg-slate-700 px-4" onClick={() => handleDemoAction("詳細レポート生成")}>
                  詳細を表示
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <ThumbsUp className="w-5 h-5" />
                    <h4 className="font-black text-sm uppercase tracking-wider">特に好調な点</h4>
                  </div>
                  {DEMO_DATA.analysis.goodPoints.map((text, i) => (
                    <div key={i} className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <p className="text-sm text-emerald-900 font-medium leading-relaxed">{text}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-rose-700">
                    <ThumbsDown className="w-5 h-5" />
                    <h4 className="font-black text-sm uppercase tracking-wider">改善すべき課題</h4>
                  </div>
                  {DEMO_DATA.analysis.badPoints.map((text, i) => (
                    <div key={i} className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex gap-3">
                      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                      <p className="text-sm text-rose-900 font-medium leading-relaxed">{text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900 rounded-3xl p-6 text-white">
                <div className="flex flex-col md:flex-row gap-6 items-center">
                  <div className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center shrink-0 border border-white/20">
                    <MessageSquare className="w-7 h-7 text-amber-400" />
                  </div>
                  <div className="space-y-2">
                    <h5 className="font-black text-sm text-amber-400">秘書の見解・戦術案</h5>
                    <p className="text-sm leading-relaxed font-medium text-slate-300">
                      「リピート率は理想的な伸びを見せていますが、土曜日の過密解消が急務です。LINEのセグメント配信機能を使い、平日の空き枠（特に15時〜16時）への誘導クーポンを配布しましょう。これにより、スタッフの負担分散と収益のさらなる平準化が期待できます。」
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 4. note執筆提案 & 誕生日 */}
          <div className="space-y-6">
            {/* note執筆提案 */}
            <Card className="shadow-xl border-none ring-1 ring-rose-100 bg-rose-50/20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center text-base font-black text-rose-700">
                  <FileText className="w-4 h-4 mr-2" /> 今週のnote執筆提案
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-sm space-y-2">
                  <p className="text-[10px] font-black text-rose-500 uppercase tracking-wider">AIが提案するタイトル</p>
                  <h3 className="font-black text-slate-800 text-sm leading-snug">{DEMO_DATA.blogProposal.title}</h3>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {DEMO_DATA.blogProposal.keywords.map((kw) => (
                      <span key={kw} className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold">#{kw}</span>
                    ))}
                  </div>
                </div>
                <Button
                  className="w-full h-11 font-black text-sm rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-200"
                  onClick={() => handleDemoAction("記事構成確認")}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  構成を確認する
                  <ChevronRight className="w-4 h-4 ml-auto" />
                </Button>
              </CardContent>
            </Card>

            {/* 誕生日 */}
            <Card className="shadow-xl border-none ring-1 ring-emerald-100 bg-emerald-50/20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center text-base font-black text-emerald-800">
                  <Cake className="w-4 h-4 mr-2 text-rose-500" /> 今日のお誕生日
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {DEMO_DATA.birthdays.map((p, i) => (
                  <div key={i} className="flex justify-between items-center bg-white p-3 rounded-2xl shadow-sm border border-emerald-100">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-800 text-sm">{p.name} 様</span>
                      <span className="bg-rose-500 text-white text-[9px] px-2 py-0.5 rounded-full font-black animate-bounce">TODAY!</span>
                    </div>
                    <Button size="sm" className="h-8 bg-rose-500 hover:bg-rose-600 text-xs font-black rounded-lg px-3" onClick={() => handleDemoAction("バースデーLINE送信")}>
                      LINE送付
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* デモ体験終了 */}
            <div className="space-y-3">
              <Link href="/presentation/inquiry" className="block">
                <Button className="w-full h-14 bg-violet-600 hover:bg-violet-700 rounded-2xl font-black text-base text-white shadow-lg shadow-violet-200 flex items-center justify-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  導入のご相談はこちら
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </Link>
              <Link href="/presentation" className="block">
                <Button variant="outline" className="w-full h-12 rounded-2xl font-bold text-sm border-2 border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  デモ体験を終了してプレゼン資料へ戻る
                </Button>
              </Link>
            </div>
          </div>

          {/* 5. 年次比較セクション（去年3月 vs 今年3月） */}
          <Card className="lg:col-span-3 shadow-2xl border-none ring-1 ring-slate-200 overflow-hidden">
            <CardHeader className="bg-gradient-to-br from-blue-50 to-indigo-50 border-b pb-6">
              <CardTitle className="flex items-center text-lg font-black text-slate-800">
                <BarChart2 className="w-5 h-5 mr-2 text-blue-600" />
                前年同月比 分析レポート — {lastYear.month} vs {thisYear.month}
              </CardTitle>
              <CardDescription className="font-medium text-slate-500">
                AIが自動で前年同月のデータを比較・分析します
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-8">

              {/* KPIカード */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    label: "来院件数",
                    icon: <Users className="w-4 h-4" />,
                    last: `${lastYear.visits}件`,
                    this: `${thisYear.visits}件`,
                    diff: visitDiff,
                    color: "blue"
                  },
                  {
                    label: "月間売上",
                    icon: <TrendingUp className="w-4 h-4" />,
                    last: `¥${(lastYear.revenue / 10000).toFixed(0)}万`,
                    this: `¥${(thisYear.revenue / 10000).toFixed(0)}万`,
                    diff: revenueDiff,
                    color: "violet"
                  },
                  {
                    label: "新規患者数",
                    icon: <Users className="w-4 h-4" />,
                    last: `${lastYear.newPatients}名`,
                    this: `${thisYear.newPatients}名`,
                    diff: newPatientDiff,
                    color: "emerald"
                  },
                  {
                    label: "リピート率",
                    icon: <TrendingUp className="w-4 h-4" />,
                    last: `${lastYear.repeatRate}%`,
                    this: `${thisYear.repeatRate}%`,
                    diff: repeatDiff,
                    color: "amber"
                  }
                ].map((kpi, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                    <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wide">
                      {kpi.icon}{kpi.label}
                    </div>
                    <div>
                      <p className="text-2xl font-black text-slate-900">{kpi.this}</p>
                      <p className="text-xs text-slate-400 mt-0.5">前年: {kpi.last}</p>
                    </div>
                    <div className={cn(
                      "inline-flex items-center gap-1 text-sm font-black px-2 py-0.5 rounded-full",
                      kpi.diff > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                    )}>
                      {kpi.diff > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {kpi.diff > 0 ? "+" : ""}{kpi.diff}%
                    </div>
                  </div>
                ))}
              </div>

              {/* 棒グラフ（ビジュアル比較） */}
              <div className="grid md:grid-cols-2 gap-8">
                {/* 来院数比較 */}
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-slate-700">来院件数の比較</h4>
                  <div className="space-y-3">
                    {[
                      { label: lastYear.month, value: lastYear.visits, max: thisYear.visits, color: "bg-slate-300" },
                      { label: thisYear.month, value: thisYear.visits, max: thisYear.visits, color: "bg-blue-500" }
                    ].map((row, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-slate-600">
                          <span>{row.label}</span>
                          <span>{row.value}件</span>
                        </div>
                        <div className="h-8 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${row.color} rounded-full transition-all duration-1000 flex items-center justify-end pr-3`}
                            style={{ width: `${(row.value / row.max) * 100}%` }}
                          >
                            <span className="text-white text-[10px] font-black">{row.value}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 売上比較 */}
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-slate-700">月間売上の比較</h4>
                  <div className="space-y-3">
                    {[
                      { label: lastYear.month, value: lastYear.revenue, max: thisYear.revenue, color: "bg-slate-300" },
                      { label: thisYear.month, value: thisYear.revenue, max: thisYear.revenue, color: "bg-violet-500" }
                    ].map((row, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-slate-600">
                          <span>{row.label}</span>
                          <span>¥{(row.value / 10000).toFixed(0)}万</span>
                        </div>
                        <div className="h-8 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${row.color} rounded-full transition-all duration-1000 flex items-center justify-end pr-3`}
                            style={{ width: `${(row.value / row.max) * 100}%` }}
                          >
                            <span className="text-white text-[10px] font-black">¥{(row.value / 10000).toFixed(0)}万</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI解説 */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5 text-white">
                <p className="text-xs font-black text-blue-200 mb-2 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> AI秘書による前年比分析コメント
                </p>
                <p className="text-sm leading-relaxed font-medium">
                  「前年同月比で来院数が <strong className="text-amber-300">+{visitDiff}%</strong>、売上が <strong className="text-amber-300">+{revenueDiff}%</strong> と大幅な成長を達成しています。特に新規患者数が <strong className="text-amber-300">{lastYear.newPatients}名 → {thisYear.newPatients}名</strong> へ増加しており、LINE集客とMEO対策の相乗効果が確認できます。リピート率も{lastYear.repeatRate}% → {thisYear.repeatRate}% に改善されており、患者満足度の向上が数字に表れています。」
                </p>
              </div>

            </CardContent>
          </Card>

        </div>

        {/* フッターCTA */}
        <div className="pt-8 pb-20 text-center space-y-6">
          <h2 className="text-4xl font-black text-slate-900 leading-tight">
            院の経営に、<br />
            <span className="text-violet-600 underline decoration-indigo-200 decoration-8 underline-offset-8">圧倒的なスピード</span>と
            <span className="text-indigo-600 underline decoration-indigo-200 decoration-8 underline-offset-8">確かな戦略</span>を。
          </h2>
          <p className="text-slate-500 font-medium max-w-xl mx-auto">
            V-ARCは、接骨院の現場から生まれた実戦型システムです。<br />
            まずは無料のデモンストレーションから始めませんか？
          </p>
          <div className="flex flex-col md:flex-row justify-center gap-4 pt-4">
            <Link href="/presentation/inquiry">
              <Button className="h-16 px-10 rounded-3xl bg-violet-600 hover:bg-violet-700 text-white font-black text-lg shadow-2xl shadow-violet-200 hover:scale-105 transition-transform flex items-center gap-2">
                デモの予約・お問い合わせ
                <Plus className="w-5 h-5" strokeWidth={3} />
              </Button>
            </Link>
            <Link href="/presentation">
              <Button variant="outline" className="h-16 px-10 rounded-3xl border-2 border-slate-300 text-slate-800 font-black text-lg hover:bg-slate-100 flex items-center gap-2">
                <ArrowLeft className="w-5 h-5" />
                プレゼン資料へ戻る
              </Button>
            </Link>
          </div>
        </div>

      </div>

      {/* ===== 予約デモモーダル ===== */}
      {showBookingModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowBookingModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-violet-600" /> 予約を入れる
              </h3>
              <button onClick={() => setShowBookingModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-wider block mb-1.5">患者名</label>
                <input
                  type="text"
                  placeholder="例: 田中 太郎"
                  value={bookingName}
                  onChange={(e) => setBookingName(e.target.value)}
                  className="w-full h-11 border border-slate-200 rounded-xl px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-wider block mb-1.5">予約時刻</label>
                <input
                  type="time"
                  value={bookingTime}
                  onChange={(e) => setBookingTime(e.target.value)}
                  className="w-full h-11 border border-slate-200 rounded-xl px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-wider block mb-1.5">区分</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["再診", "初診"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setBookingType(t)}
                      className={cn(
                        "h-10 rounded-xl font-bold text-sm border-2 transition-colors",
                        bookingType === t
                          ? t === "初診" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                      )}
                    >{t}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-2 pt-1">
              <Button onClick={handleBookingConfirm} className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white font-black rounded-xl text-sm">
                <CheckCircle2 className="w-4 h-4 mr-2" /> 予約を確定する
              </Button>
              <p className="text-[10px] text-slate-400 text-center">※デモ画面での操作です。本番ではLINE通知も自動送信されます。</p>
            </div>
          </div>
        </div>
      )}

      {/* ===== 経費OCRデモモーダル ===== */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowExpenseModal(false); setOcrStep("upload"); }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" /> 経費入力（写真読取）
              </h3>
              <button onClick={() => { setShowExpenseModal(false); setOcrStep("upload"); }} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            {ocrStep === "upload" && (
              <div className="space-y-4">
                <div
                  className="border-3 border-dashed border-emerald-300 rounded-2xl p-8 flex flex-col items-center gap-3 text-slate-500 cursor-pointer hover:bg-emerald-50 transition-colors"
                  onClick={handleOcrDemo}
                >
                  <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center">
                    <Camera className="w-8 h-8 text-emerald-600" />
                  </div>
                  <p className="font-black text-slate-700 text-sm">領収書を撮影 / アップロード</p>
                  <p className="text-xs text-slate-400 text-center">タップするとデモ画像でOCR読取をシミュレートします</p>
                </div>
                <Button onClick={handleOcrDemo} className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl">
                  <Camera className="w-4 h-4 mr-2" /> デモ読取を開始
                </Button>
              </div>
            )}

            {ocrStep === "reading" && (
              <div className="py-10 flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center animate-pulse">
                  <Receipt className="w-8 h-8 text-emerald-600" />
                </div>
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                <p className="font-black text-slate-700 text-sm">AIが領収書を読み取り中...</p>
                <p className="text-xs text-slate-400">日付・金額・品目を自動認識しています</p>
              </div>
            )}

            {ocrStep === "result" && (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-3">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> AI読取完了 — 確認してください
                  </p>
                  <div className="space-y-2">
                    {[
                      { label: "お店・業者名", value: DEMO_RECEIPT.vendor },
                      { label: "日付", value: DEMO_RECEIPT.date },
                      { label: "金額", value: `¥${DEMO_RECEIPT.amount.toLocaleString()}` },
                      { label: "カテゴリ（自動分類）", value: DEMO_RECEIPT.category },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between items-center">
                        <span className="text-xs text-slate-500 font-bold">{label}</span>
                        <span className="text-sm font-black text-slate-800">{value}</span>
                      </div>
                    ))}
                    <div className="pt-1">
                      <p className="text-xs text-slate-500 font-bold mb-1">品目</p>
                      {DEMO_RECEIPT.items.map((item) => (
                        <p key={item} className="text-xs text-slate-700 font-medium">• {item}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <Button onClick={handleExpenseSave} className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl">
                  <CheckCircle2 className="w-4 h-4 mr-2" /> この内容で登録する
                </Button>
                <p className="text-[10px] text-slate-400 text-center">※デモ画面での操作です。本番では会計ソフト連携も可能です。</p>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
