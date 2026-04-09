"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Sparkles, 
  Calendar, 
  Zap, 
  MessageSquare, 
  Clock, 
  Video, 
  ChevronRight,
  UserCheck,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BriefingPoint {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}

interface AISecretaryBriefingProps {
  appointments: any[];
  onComplete: () => void;
  tone?: "polite" | "frank";
}

export default function AISecretaryBriefing({ 
  appointments = [], 
  onComplete,
  tone = "polite" 
}: AISecretaryBriefingProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // 1日1回だけ表示（セッションストレージで管理）
    const hasSeen = sessionStorage.getItem("v_arc_briefing_seen_today");
    if (!hasSeen) {
      const timer = setTimeout(() => {
        setOpen(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setOpen(false);
    sessionStorage.setItem("v_arc_briefing_seen_today", "true");
    onComplete();
  };

  // スケジュール分析ロジック
  const analyzeSchedule = () => {
    const points: BriefingPoint[] = [];
    
    // 1. 多忙な時間の検出
    if (appointments.length > 5) {
      points.push({
        icon: <Zap className="w-5 h-5 text-amber-500" />,
        title: tone === "polite" ? "本日は予約が詰まっております" : "今日はかなり忙しくなりそう！",
        description: tone === "polite" 
          ? `本日は${appointments.length}件の予約がございます。少し早めに準備を整えましょう。` 
          : `今日は全部で${appointments.length}人！テンポよく回せるように準備しておこう。`,
        color: "bg-amber-50 border-amber-100"
      });
    }

    // 2. 空き時間(60分以上)の検出 (デモ/簡易版ロジック)
    // 実装メモ: 隣接する予約の時間差を計算
    points.push({
      icon: <Video className="w-5 h-5 text-indigo-500" />,
      title: tone === "polite" ? "午後にまとまった空き時間がございます" : "午後に1時間くらい空く時間があるよ！",
      description: tone === "polite"
        ? "13:00から1時間ほど空いております。YouTube撮影の絶好のチャンスです。"
        : "13時からちょうど空いてるから、ここでYouTube撮っちゃおうよ！",
      color: "bg-indigo-50 border-indigo-100"
    });

    // 3. 特別な患者様（誕生日など）
    points.push({
      icon: <Sparkles className="w-5 h-5 text-rose-500" />,
      title: tone === "polite" ? "特別な対応が必要な方がいらっしゃいます" : "今日はお誕生日の人がいるよ！",
      description: tone === "polite"
        ? "本日お誕生日当日の方が1名いらっしゃいます。LINE特典の送付をお願いします。"
        : "今日お誕生日の人が1人いるから、LINEでプレゼント送るの忘れないでね。",
      color: "bg-rose-50 border-rose-100"
    });

    return points;
  };

  const points = analyzeSchedule();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-none bg-slate-900 rounded-[32px] ring-1 ring-white/10 shadow-2xl">
        <div className="relative">
          {/* 背景装飾 */}
          <div className="absolute top-0 left-0 w-full h-40 bg-gradient-to-br from-violet-600/30 via-indigo-600/20 to-transparent pointer-events-none" />
          <div className="absolute top-10 right-10 w-20 h-20 bg-blue-500/10 blur-3xl rounded-full" />
          
          <div className="relative p-8 space-y-8">
            <DialogHeader className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20">
                   <UserCheck className="w-7 h-7 text-violet-400" />
                </div>
                <div>
                   <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest leading-none mb-1">AI Secretary</p>
                   <DialogTitle className="text-2xl font-black text-white leading-none">
                     {tone === "polite" ? "おはようございます、先生" : "おはよう、院長！"}
                   </DialogTitle>
                </div>
              </div>
              <DialogDescription className="text-slate-400 font-medium text-sm leading-relaxed">
                {tone === "polite" 
                  ? "本日のスケジュールを私の方で整理いたしました。スムーズな1日を始めましょう。" 
                  : "今日の流れをパッとまとめたよ！確認して1日をスタートしよう！"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
               {points.map((point, i) => (
                 <div key={i} className={cn(
                   "p-4 rounded-2xl border flex gap-4 transition-all duration-500 animate-in slide-in-from-right",
                   point.color,
                   `delay-${i * 100}`
                 )}>
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                      {point.icon}
                    </div>
                    <div>
                       <h4 className="text-xs font-black text-slate-800 mb-0.5">{point.title}</h4>
                       <p className="text-[10px] text-slate-500 font-bold leading-normal">{point.description}</p>
                    </div>
                 </div>
               ))}
            </div>

            <Button 
              onClick={handleClose} 
              className="w-full h-14 bg-white text-slate-950 hover:bg-slate-100 rounded-2xl font-black text-lg shadow-xl"
            >
              {tone === "polite" ? "業務を開始する" : "よし、いこう！"}
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
