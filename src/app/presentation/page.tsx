"use client";

import React, { useState, useEffect } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Printer, 
  Share2, 
  Sparkles, 
  MessageCircle, 
  Zap, 
  LineChart, 
  CreditCard, 
  ShieldCheck,
  CheckCircle2,
  Calendar,
  MousePointer2,
  ArrowRight,
  ClipboardList
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SLIDES = [
  {
    title: "Slide 1: 接骨院の経営を、もっと自由に。",
    content: (
      <div className="flex flex-col items-center justify-center text-center space-y-8">
        <div className="relative">
          <div className="absolute -inset-4 bg-violet-500/20 blur-3xl rounded-full" />
          <div className="relative bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-3xl shadow-2xl">
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-4 bg-gradient-to-r from-white via-violet-200 to-indigo-300 bg-clip-text text-transparent">
              V-ARC
            </h1>
            <p className="text-xl md:text-2xl font-bold text-violet-300">
              次世代接骨院マネジメントシステム
            </p>
          </div>
        </div>
        <div className="max-w-2xl text-slate-400 text-lg font-medium leading-relaxed">
          現場から生まれた、最先端のDXツール。<br />
          LINE連携とAIが、あなたの院の「右腕」になります。
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 bg-slate-900/50 px-4 py-2 rounded-full border border-slate-800">
            <MessageCircle className="w-5 h-5 text-green-500" />
            <span className="text-sm font-bold">LINE連携</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-900/50 px-4 py-2 rounded-full border border-slate-800">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <span className="text-sm font-bold">AI経営軍師</span>
          </div>
        </div>
      </div>
    )
  },
  {
    title: "Slide 2: 現場の「あるある」なお悩み",
    content: (
      <div className="grid md:grid-cols-2 gap-8 items-center max-w-5xl">
        <div className="space-y-6">
          <h2 className="text-4xl font-black text-white leading-tight">
            経営者は常に<br />
            <span className="text-rose-500 font-black decoration-rose-500/30 underline decoration-8 underline-offset-4">多忙</span> である。
          </h2>
          <ul className="space-y-4">
            {[
              "予約受付やリマインドでスタッフの手が止まる",
              "来院データはあるが、分析まで手が回らない",
              "経費精算やタスク管理がアナログで煩雑",
              "「将来の経営戦略が見えてこない...」"
            ].map((text, i) => (
              <li key={i} className="flex items-start gap-3 bg-white/5 p-4 rounded-2xl border border-white/10">
                <div className="mt-1 w-5 h-5 bg-rose-500/20 flex items-center justify-center rounded-full text-rose-500">
                  <Zap className="w-3 h-3 fill-current" />
                </div>
                <span className="text-slate-300 font-medium">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative hidden md:block">
           <div className="absolute -inset-10 bg-rose-500/10 blur-3xl rounded-full" />
           <div className="relative border border-white/10 rounded-3xl overflow-hidden aspect-square bg-slate-900 flex items-center justify-center">
              <div className="text-8xl">😫</div>
           </div>
        </div>
      </div>
    )
  },
  {
    title: "Slide 3: V-ARCが提供する3つの解決策",
    content: (
      <div className="grid md:grid-cols-3 gap-6 max-w-6xl">
        {[
          {
            icon: <Zap className="w-8 h-8 text-blue-400 transition-transform group-hover:scale-110" />,
            title: "自動化",
            desc: "LINEを使った予約・リマインド・メッセージ配信まで自動実行。",
            color: "border-blue-500/30",
            bg: "bg-blue-500/5"
          },
          {
            icon: <LineChart className="w-8 h-8 text-emerald-400 transition-transform group-hover:scale-110" />,
            title: "可視化",
            desc: "売上やリピート率、ターゲット属性などをリアルタイムで表示。",
            color: "border-emerald-500/30",
            bg: "bg-emerald-500/5"
          },
          {
            icon: <Sparkles className="w-8 h-8 text-amber-400 transition-transform group-hover:scale-110" />,
            title: "経営軍師",
            desc: "AIがデータを元に、具体的な「打ち手」をあなたに伴走して提案。",
            color: "border-amber-500/30",
            bg: "bg-amber-500/5"
          }
        ].map((item, i) => (
          <div key={i} className={cn("group p-8 rounded-3xl border-2 backdrop-blur-sm transition-all hover:bg-white/5", item.color, item.bg)}>
            <div className="mb-6">{item.icon}</div>
            <h3 className="text-2xl font-black mb-4">{item.title}</h3>
            <p className="text-slate-400 font-medium leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    )
  },
  {
    title: "Slide 4: 徹底した「攻めのLINEマーケ」",
    content: (
      <div className="flex flex-col md:flex-row gap-8 items-center max-w-5xl">
        <div className="flex-1 space-y-6 text-left">
           <h2 className="text-4xl font-black text-white">
             LINEは診察券であり、<br />
             <span className="text-green-500">最強の広告</span> です。
           </h2>
           <div className="space-y-4">
              <div className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                 <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                 <div>
                    <p className="font-bold text-white">誕生日クーポンの自動配信</p>
                    <p className="text-xs text-slate-500">「おめでとう」の言葉が再診の最強のフックに。</p>
                 </div>
              </div>
              <div className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                 <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                 <div>
                    <p className="font-bold text-white">ターゲット属性別一斉送信</p>
                    <p className="text-xs text-slate-500">女性限定、エリア限定など確実に刺さる情報を配信。</p>
                 </div>
              </div>
              <div className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                 <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                 <div>
                    <p className="font-bold text-white">24時間LINE予約受付</p>
                    <p className="text-xs text-slate-500">スタッフの電話対応時間を大幅に削減。</p>
                 </div>
              </div>
           </div>
        </div>
        <div className="w-full md:w-72 bg-slate-900 border border-slate-800 rounded-[40px] p-4 shadow-2xl relative">
           <div className="w-12 h-1 bg-slate-800 rounded-full mx-auto mb-6" />
           <div className="space-y-3">
              <div className="h-10 bg-slate-800 rounded-xl" />
              <div className="h-40 bg-violet-500/10 rounded-2xl border border-violet-500/20" />
              <div className="h-8 bg-green-500/10 rounded-xl border border-green-500/20" />
           </div>
           <div className="absolute -right-6 -bottom-6 bg-white text-slate-950 p-4 rounded-2xl font-black shadow-xl animate-bounce">
              成約率UP!
           </div>
        </div>
      </div>
    )
  },
  {
    title: "Slide 5: あなたの右腕「AI軍師」",
    content: (
      <div className="flex flex-col items-center space-y-8 max-w-4xl text-center">
         <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Sparkles className="w-10 h-10 text-white" />
         </div>
         <h2 className="text-4xl font-black text-white">
           「データの読み方」は<br />AIに任せてください
         </h2>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left w-full">
            <div className="bg-slate-900 border border-violet-500/20 p-6 rounded-3xl">
               <p className="text-xs font-bold text-violet-400 mb-2 uppercase tracking-widest">Case 01</p>
               <p className="text-white font-medium italic">「今月は新患が少ないので、〇〇エリアのポスティングを強化しませんか？」</p>
            </div>
            <div className="bg-slate-900 border border-indigo-500/20 p-6 rounded-3xl">
               <p className="text-xs font-bold text-indigo-400 mb-2 uppercase tracking-widest">Case 02</p>
               <p className="text-white font-medium italic">「〇〇先生の指名リピート率が低下しています。ヒアリングをおすすめします」</p>
            </div>
         </div>
         <p className="text-slate-400 font-bold border-t border-white/10 pt-6">
           経営者はAIの提案を聞き、<br className="md:hidden" /> <span className="text-white underline font-black decoration-violet-500 decoration-4">「決める」</span> ことに集中できます。
         </p>
      </div>
    )
  },
  {
    title: "Slide 6: 現場を救う「現場DX」",
    content: (
      <div className="grid md:grid-cols-2 gap-8 max-w-5xl">
         {[
           { icon: <CreditCard className="w-6 h-6 text-violet-400" />, t: "経費写メ管理", desc: "領収書をスマホで撮るだけ。AIが自動で読み取り、集計・グラフ化。" },
           { icon: <Calendar className="w-6 h-6 text-blue-400" />, t: "家族カレンダー", desc: "私生活の予定も一括管理。プライバシー完結機能で院内共有も安心。" },
           { icon: <ClipboardList className="w-6 h-6 text-emerald-400" />, t: "院内タスク管理", desc: "ルーチンワークを全スタッフで共有。ヌケ漏れをゼロにします。" },
           { icon: <Zap className="w-6 h-6 text-amber-400" />, t: "一括レセプト連携", desc: "既存のレセコンデータを吸い出し、マーケティングに即転用可能。" }
         ].map((item, i) => (
           <div key={i} className="flex gap-4 p-6 bg-slate-900/50 rounded-3xl border border-white/5">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center shrink-0">
                 {item.icon}
              </div>
              <div>
                 <h4 className="font-black text-white text-lg mb-1">{item.t}</h4>
                 <p className="text-sm text-slate-500 leading-relaxed font-medium">{item.desc}</p>
              </div>
           </div>
         ))}
      </div>
    )
  },
  {
    title: "Slide 7: 導入ハードルを極限まで低く",
    content: (
      <div className="space-y-12 max-w-4xl">
         <div className="text-center">
            <h2 className="text-4xl font-black text-white mb-4">なぜ、V-ARCは選ばれるのか？</h2>
            <div className="h-1.5 w-24 bg-violet-600 mx-auto rounded-full" />
         </div>
         <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
               <div className="flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6 text-green-500" />
                  <p className="text-xl font-black">データ独立性</p>
               </div>
               <p className="text-slate-500 font-medium">各院ごとにデータベースを分離。個人情報や経営データが混ざることはありません。</p>
            </div>
            <div className="space-y-6">
               <div className="flex items-center gap-3">
                  < Zap className="w-6 h-6 text-amber-500" />
                  <p className="text-xl font-black">既存LINEを活用</p>
               </div>
               <p className="text-slate-500 font-medium">現在お使いの院公式LINEアカウントをそのままシステム連携できます。</p>
            </div>
            <div className="space-y-6">
               <div className="flex items-center gap-3">
                  <MousePointer2 className="w-6 h-6 text-blue-500" />
                  <p className="text-xl font-black">直感的な操作</p>
               </div>
               <p className="text-slate-500 font-medium">ITが苦手なスタッフでも、施術の合間にサッと操作できるシンプルな設計。</p>
            </div>
            <div className="space-y-6">
               <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-violet-500" />
                  <p className="text-xl font-black">低リスク導入</p>
               </div>
               <p className="text-slate-500 font-medium">大規模な初期投資は不要。成果に応じた柔軟なプランをご用意しています。</p>
            </div>
         </div>
      </div>
    )
  },
  {
    title: "Slide 8: 接骨院の未来を、共に創る。",
    content: (
      <div className="flex flex-col items-center justify-center text-center space-y-10 max-w-3xl">
         <div className="w-24 h-24 bg-white/10 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center animate-pulse">
            <Sparkles className="w-12 h-12 text-violet-400" />
         </div>
         <div>
            <h2 className="text-5xl font-black text-white mb-4">V-ARC Partners</h2>
            <p className="text-xl text-slate-400 font-medium">現場の声を製品に反映する「モニター院」を募集中です。</p>
         </div>
         <div className="bg-violet-600 text-white font-black py-6 px-12 rounded-3xl shadow-2xl shadow-violet-900/40 text-2xl flex items-center gap-3">
            まずはデモンストレーションから
            <ArrowRight className="w-6 h-6" />
         </div>
         <p className="text-slate-600 text-sm font-bold">
           ※本資料は紹介専用です。詳細な導入費用については個別にお問い合わせください。
         </p>
      </div>
    )
  }
];

export default function PresentationPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // キーボードナビゲーション
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") nextSlide();
      if (e.key === "ArrowLeft") prevSlide();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentSlide]);

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % SLIDES.length);
  const prevSlide = () => setCurrentSlide((prev) => (prev === 0 ? SLIDES.length - 1 : prev - 1));

  if (!isMounted) return null;

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center">
      {/* 印刷用 全スライド表示 (画面上は非表示) */}
      <div className="hidden @media print:block w-full">
         {SLIDES.map((slide, i) => (
            <div key={i} className="slide-page p-12 relative border border-slate-200">
               <div className="absolute top-8 left-8 text-xs font-bold text-slate-400">V-ARC / Clinic DX Presentation</div>
               <div className="w-full flex-grow flex items-center justify-center transform scale-90 origin-center text-slate-900">
                  {slide.content}
               </div>
               <div className="absolute bottom-8 right-8 text-xs font-bold text-slate-400">Slide {i + 1} / {SLIDES.length}</div>
            </div>
         ))}
      </div>

      {/* 画面表示用 */}
      <div className="no-print w-full h-full flex flex-col relative overflow-hidden">
        
        {/* 背景 */}
        <div className="absolute inset-0 pointer-events-none">
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-600/10 blur-[120px] rounded-full" />
           <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-600/5 blur-[100px] rounded-full" />
        </div>

        {/* ヘッダー */}
        <header className="p-6 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center text-lg font-black italic">V</div>
             <span className="font-black tracking-tighter text-xl">V-ARC Presentation</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" className="rounded-xl" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" />
              PDF保存
            </Button>
          </div>
        </header>

        {/* メインスライドエリア */}
        <div className="flex-1 flex items-center justify-center p-4 md:p-12 relative">
           {SLIDES.map((slide, i) => (
             <div 
               key={i} 
               className={cn(
                 "absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out px-6 text-white text-center",
                 i === currentSlide ? "opacity-100 translate-x-0 scale-100" : 
                 i < currentSlide ? "opacity-0 -translate-x-32 scale-95 pointer-events-none" : 
                 "opacity-0 translate-x-32 scale-95 pointer-events-none"
               )}
             >
               {slide.content}
             </div>
           ))}
        </div>

        {/* フッター / ナビ */}
        <footer className="p-8 flex items-center justify-between z-10 shrink-0 border-t border-white/5 bg-slate-950/50 backdrop-blur-md">
           <div className="flex gap-4">
              <Button 
                onClick={prevSlide}
                className="w-14 h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-white/10"
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>
              <Button 
                onClick={nextSlide}
                className="w-14 h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-white/10"
              >
                <ChevronRight className="w-6 h-6" />
              </Button>
           </div>

           <div className="flex flex-col items-end">
              <div className="flex gap-1 mb-2">
                 {SLIDES.map((_, i) => (
                   <div 
                     key={i} 
                     className={cn(
                       "h-1 rounded-full transition-all duration-300",
                       i === currentSlide ? "w-8 bg-violet-500" : "w-2 bg-slate-800"
                     )} 
                   />
                 ))}
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest leading-none">
                Slide <span className="text-white">{currentSlide + 1}</span> / {SLIDES.length}
              </p>
           </div>
        </footer>

        {/* スワイプガイド提示 (初回のみ) */}
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 text-[10px] text-slate-600 font-bold uppercase tracking-[0.2em] pointer-events-none animate-pulse">
          Click or Swipe to Navigate
        </div>
      </div>
    </div>
  );
}
