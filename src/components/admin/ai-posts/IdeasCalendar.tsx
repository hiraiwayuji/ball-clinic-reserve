"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Lightbulb,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Bell,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { STATUS_LABELS, type SavedPost, type PostIdea } from "@/lib/ai-marketing";
import { suggestPostIdeas, listMarketingPosts } from "@/app/actions/ai-marketing";
import type { PrefillData } from "./AiPostStudio";

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
/** 投稿をカレンダーに置く日付（投稿予定日があればそれ、なければ作成日） */
function postDateKey(p: SavedPost): string {
  if (p.scheduled_date) return p.scheduled_date.slice(0, 10);
  return (p.created_at || "").slice(0, 10);
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

type Props = {
  onUseIdea: (prefill: PrefillData) => void;
  refreshKey?: number;
};

export default function IdeasCalendar({ onUseIdea, refreshKey }: Props) {
  const today = useMemo(() => new Date(), []);
  const todayKey = ymd(today);

  const [ideas, setIdeas] = useState<PostIdea[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);

  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const loadPosts = useCallback(async () => {
    setPosts(await listMarketingPosts());
  }, []);
  useEffect(() => {
    loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function getIdeas() {
    setLoadingIdeas(true);
    try {
      const res = await suggestPostIdeas(todayKey, 3);
      if (!res.success || !res.ideas) {
        toast.error(res.error || "ネタの提案に失敗しました");
        return;
      }
      setIdeas(res.ideas);
    } finally {
      setLoadingIdeas(false);
    }
  }

  // 日付 → その日の投稿
  const byDate = useMemo(() => {
    const map: Record<string, SavedPost[]> = {};
    for (const p of posts) {
      const k = postDateKey(p);
      if (!k) continue;
      (map[k] ||= []).push(p);
    }
    return map;
  }, [posts]);

  const todaysScheduled = (byDate[todayKey] || []).filter((p) => p.scheduled_date?.slice(0, 10) === todayKey);

  // カレンダーのマス（前月の余白込み）
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor]);

  return (
    <div className="space-y-5">
      {/* 今日の投稿予定（リマインド） */}
      {todaysScheduled.length > 0 && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 p-3">
          <div className="flex items-center gap-2 text-blue-800 font-semibold mb-1.5">
            <Bell className="w-4 h-4" /> 今日が投稿予定日です（{todaysScheduled.length}件）
          </div>
          <ul className="space-y-1">
            {todaysScheduled.map((p) => (
              <li key={p.id} className="text-sm text-blue-900 flex items-center gap-2">
                <Badge variant="outline">{p.category}</Badge>
                <span className="truncate">{p.theme || p.blog?.seo_title || "（テーマ未設定）"}</span>
                <span className="text-xs text-blue-500">{STATUS_LABELS[p.status]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 今日のネタ */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="w-4 h-4 text-amber-500" /> 今日のネタ
          </CardTitle>
          <Button size="sm" onClick={getIdeas} disabled={loadingIdeas}>
            {loadingIdeas ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5" />}
            {ideas.length ? "別のネタを出す" : "ネタを出す"}
          </Button>
        </CardHeader>
        <CardContent>
          {ideas.length === 0 ? (
            <p className="text-sm text-slate-400">
              「ネタを出す」を押すと、季節や行事に合わせた投稿アイデアをAIが提案します。
            </p>
          ) : (
            <div className="space-y-2">
              {ideas.map((idea, i) => (
                <div key={i} className="rounded-md border border-slate-200 p-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary">{idea.category}</Badge>
                      {idea.audience && <span className="text-xs text-slate-400">{idea.audience}</span>}
                    </div>
                    <div className="text-sm font-medium text-slate-800">{idea.theme}</div>
                    {idea.reason && <div className="text-xs text-amber-600 mt-0.5">💡 {idea.reason}</div>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() =>
                      onUseIdea({
                        key: Date.now() + i,
                        category: idea.category,
                        audience: idea.audience,
                        theme: idea.theme,
                      })
                    }
                  >
                    この内容で作る <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 投稿カレンダー */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="w-4 h-4 text-blue-600" /> 投稿カレンダー
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold w-28 text-center">
              {cursor.getFullYear()}年{cursor.getMonth() + 1}月
            </span>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400 mb-1">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : ""}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="min-h-16 rounded bg-slate-50/50" />;
              const key = ymd(d);
              const dayPosts = byDate[key] || [];
              const isToday = key === todayKey;
              return (
                <div
                  key={i}
                  className={
                    "min-h-16 rounded border p-1 text-left " +
                    (isToday ? "border-blue-400 bg-blue-50" : "border-slate-100")
                  }
                >
                  <div className={"text-[11px] " + (isToday ? "font-bold text-blue-700" : "text-slate-500")}>
                    {d.getDate()}
                  </div>
                  <div className="space-y-0.5 mt-0.5">
                    {dayPosts.slice(0, 2).map((p) => (
                      <div
                        key={p.id}
                        title={p.theme || p.category}
                        className={
                          "truncate rounded px-1 py-0.5 text-[10px] " +
                          (p.scheduled_date ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600")
                        }
                      >
                        {p.category}
                      </div>
                    ))}
                    {dayPosts.length > 2 && (
                      <div className="text-[10px] text-slate-400">＋{dayPosts.length - 2}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-blue-100" />投稿予定日</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-slate-100" />作成日</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
