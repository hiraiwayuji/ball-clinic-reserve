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
  Zap,
  ChevronRight,
  UserCheck,
  TrendingUp,
  TrendingDown,
  CalendarDays,
  BarChart2,
  FileText,
  Loader2,
  Minus,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getBriefingContext } from "@/app/actions/ai-secretary";

interface AISecretaryBriefingProps {
  appointments: any[];
  onComplete: () => void;
  tone?: "polite" | "frank";
}

type BriefingCtx = Awaited<ReturnType<typeof getBriefingContext>>;

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

export default function AISecretaryBriefing({
  appointments = [],
  onComplete,
  tone = "polite",
}: AISecretaryBriefingProps) {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<BriefingCtx | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(false);

  useEffect(() => {
    const hasSeen = sessionStorage.getItem("v_arc_briefing_seen_today");
    if (!hasSeen) {
      const timer = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!open || ctx) return;
    setLoadingCtx(true);
    getBriefingContext()
      .then((data) => setCtx(data))
      .catch(() => setCtx(null))
      .finally(() => setLoadingCtx(false));
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    sessionStorage.setItem("v_arc_briefing_seen_today", "true");
    onComplete();
  };

  const todayNew = appointments.filter((a) => a.type === "初診").length;
  const todayCount = appointments.length;

  // 週比・前月比・去年同月比の計算
  const weekDiff = ctx && ctx.prevWeekVisits > 0
    ? Math.round(((ctx.thisWeekVisits - ctx.prevWeekVisits) / ctx.prevWeekVisits) * 100)
    : null;
  const monthDiff = ctx && ctx.prevMonthVisits > 0
    ? Math.round(((ctx.thisMonthVisits - ctx.prevMonthVisits) / ctx.prevMonthVisits) * 100)
    : null;
  const yearDiff = ctx && ctx.lastYearSameVisits > 0
    ? Math.round(((ctx.thisMonthVisits - ctx.lastYearSameVisits) / ctx.lastYearSameVisits) * 100)
    : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-none bg-slate-900 rounded-[32px] ring-1 ring-white/10 shadow-2xl max-h-[90dvh] flex flex-col">
        <div className="relative flex flex-col flex-1 min-h-0">
          <div className="absolute top-0 left-0 w-full h-40 bg-gradient-to-br from-violet-600/30 via-indigo-600/20 to-transparent pointer-events-none z-0" />
          <div className="absolute top-10 right-10 w-20 h-20 bg-blue-500/10 blur-3xl rounded-full z-0" />

          {/* スクロール可能コンテンツエリア */}
          <div className="relative flex-1 overflow-y-auto p-7 pb-4 space-y-6 z-10">
            {/* ヘッダー */}
            <DialogHeader className="space-y-3">
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
                  ? "本日のスケジュールと最新の経営データをまとめました。"
                  : "今日の流れと最新データをパッとまとめたよ！"}
              </DialogDescription>
            </DialogHeader>

            {/* 今日の予約サマリ */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center">
                  <CalendarDays className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">本日の予約</p>
                  <p className="text-xl font-black text-white">
                    {todayCount}<span className="text-sm text-slate-400 ml-1">件</span>
                    {todayNew > 0 && (
                      <span className="ml-2 text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-bold">
                        初診 {todayNew}名
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {todayCount > 5 && (
                <div className="flex items-center gap-1 text-amber-400">
                  <Zap className="w-4 h-4" />
                  <span className="text-xs font-black">混雑</span>
                </div>
              )}
            </div>

            {/* データ読み込み中 */}
            {loadingCtx && (
              <div className="flex items-center gap-3 text-slate-400 text-sm px-1">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="font-medium">最新データを取得中...</span>
              </div>
            )}

            {/* 週次比較（月曜のみ） */}
            {ctx?.isWeekStart && weekDiff !== null && (
              <div className={cn(
                "p-4 rounded-2xl border flex gap-3 items-start",
                weekDiff >= 0 ? "bg-emerald-950/40 border-emerald-800/50" : "bg-rose-950/40 border-rose-800/50"
              )}>
                <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                  <BarChart2 className={cn("w-4 h-4", weekDiff >= 0 ? "text-emerald-400" : "text-rose-400")} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-xs font-black text-white">週次レポート（先週との比較）</p>
                    <span className={cn(
                      "text-[10px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-0.5",
                      weekDiff >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                    )}>
                      {weekDiff >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                      {weekDiff > 0 ? "+" : ""}{weekDiff}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    先週は{ctx.prevWeekVisits}件 → 今週は現在{ctx.thisWeekVisits}件（うち初診{ctx.thisWeekNew}名）
                  </p>
                </div>
              </div>
            )}

            {/* 月初め：前月比 & 去年同月比 */}
            {ctx?.isMonthStart && (
              <div className="space-y-2">
                {monthDiff !== null && (
                  <div className={cn(
                    "p-4 rounded-2xl border flex gap-3 items-start",
                    monthDiff >= 0 ? "bg-blue-950/40 border-blue-800/50" : "bg-orange-950/40 border-orange-800/50"
                  )}>
                    <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                      <TrendingUp className={cn("w-4 h-4", monthDiff >= 0 ? "text-blue-400" : "text-orange-400")} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-xs font-black text-white">月初めレポート — 先月比</p>
                        <span className={cn(
                          "text-[10px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-0.5",
                          monthDiff >= 0 ? "bg-blue-500/20 text-blue-400" : "bg-orange-500/20 text-orange-400"
                        )}>
                          {monthDiff >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                          {monthDiff > 0 ? "+" : ""}{monthDiff}%
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        先月{ctx.prevMonthVisits}件 → 今月{ctx.thisMonthVisits}件
                      </p>
                    </div>
                  </div>
                )}
                {yearDiff !== null && (
                  <div className={cn(
                    "p-4 rounded-2xl border flex gap-3 items-start",
                    yearDiff >= 0 ? "bg-violet-950/40 border-violet-800/50" : "bg-slate-800/60 border-slate-700"
                  )}>
                    <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                      {yearDiff > 0 ? <TrendingUp className="w-4 h-4 text-violet-400" /> : yearDiff < 0 ? <TrendingDown className="w-4 h-4 text-slate-400" /> : <Minus className="w-4 h-4 text-slate-400" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-xs font-black text-white">去年{ctx.month}月との比較</p>
                        <span className={cn(
                          "text-[10px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-0.5",
                          yearDiff >= 0 ? "bg-violet-500/20 text-violet-400" : "bg-slate-600/50 text-slate-400"
                        )}>
                          {yearDiff > 0 ? "+" : ""}{yearDiff}%
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        去年同月{ctx.lastYearSameVisits}件 → 今月{ctx.thisMonthVisits}件
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 週初め以外の平日：今週の状況サマリ */}
            {ctx && !ctx.isWeekStart && !ctx.isMonthStart && ctx.thisWeekVisits > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex gap-3 items-start">
                <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                  <BarChart2 className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <p className="text-xs font-black text-white mb-0.5">今週の来院（{DAY_NAMES[ctx.dayOfWeek]}曜まで）</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    今週は現在{ctx.thisWeekVisits}件（うち初診{ctx.thisWeekNew}名）
                    {weekDiff !== null && ` ／ 先週比 ${weekDiff > 0 ? "+" : ""}${weekDiff}%`}
                  </p>
                </div>
              </div>
            )}

            {/* 最新メモのハイライト */}
            {ctx?.latestMemo && (
              <div className="bg-amber-950/30 border border-amber-800/40 rounded-2xl p-4 flex gap-3 items-start">
                <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs font-black text-white mb-0.5">直近のメモ</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">{ctx.latestMemo}</p>
                </div>
              </div>
            )}

            {/* AI朝のアドバイス */}
            {ctx?.aiAdvice && (
              <div className="bg-gradient-to-br from-violet-900/50 to-indigo-900/40 border border-violet-700/40 rounded-2xl p-4 flex gap-3 items-start">
                <div className="w-9 h-9 bg-violet-500/20 rounded-xl flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-violet-300" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-violet-400 uppercase tracking-wider mb-1">AI秘書からの朝のひと言</p>
                  <p className="text-xs text-slate-200 leading-relaxed font-medium">{ctx.aiAdvice}</p>
                </div>
              </div>
            )}

            {/* SNS・LINE 今日のアクション提言 */}
            {ctx?.snsAdvice && (
              <div className="bg-gradient-to-br from-teal-900/50 to-emerald-900/40 border border-teal-700/40 rounded-2xl p-4 flex gap-3 items-start">
                <div className="w-9 h-9 bg-teal-500/20 rounded-xl flex items-center justify-center shrink-0">
                  <Megaphone className="w-4 h-4 text-teal-300" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-teal-400 uppercase tracking-wider mb-1">SNS・LINE 今日のアクション提言</p>
                  <p className="text-xs text-slate-200 leading-relaxed font-medium">{ctx.snsAdvice}</p>
                </div>
              </div>
            )}

          </div>

          {/* 常に見えるボタンエリア（スクロール外） */}
          <div className="relative z-10 px-7 pb-7 pt-3 shrink-0">
            <Button
              onClick={handleClose}
              className="w-full h-13 bg-white text-slate-950 hover:bg-slate-100 rounded-2xl font-black text-base shadow-xl py-4"
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
