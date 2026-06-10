"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, BarChart3, Loader2, Trophy, FileText, Heart, Bookmark, MessageSquare, CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import CopyButton from "./CopyButton";
import { STATUS_LABELS, type PostStatus } from "@/lib/ai-marketing";
import { getEffectSummary, generateMonthlyReport, type EffectSummary } from "@/app/actions/ai-marketing";

type Props = { refreshKey?: number };

function monthStrOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ReportDashboard({ refreshKey }: Props) {
  const now = new Date();
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [summary, setSummary] = useState<EffectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<string>("");
  const [reporting, setReporting] = useState(false);

  const monthStr = monthStrOf(cursor);

  const load = useCallback(async () => {
    setLoading(true);
    setReport("");
    try {
      setSummary(await getEffectSummary(monthStr));
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStr, refreshKey]);

  async function makeReport() {
    setReporting(true);
    try {
      const res = await generateMonthlyReport(monthStr);
      if (!res.success || !res.text) { toast.error(res.error || "レポートの作成に失敗しました"); return; }
      setReport(res.text);
    } finally {
      setReporting(false);
    }
  }

  const totalTiles = summary
    ? [
        { icon: <Heart className="w-4 h-4 text-pink-500" />, label: "いいね", v: summary.totals.likes },
        { icon: <Bookmark className="w-4 h-4 text-blue-500" />, label: "保存", v: summary.totals.saves },
        { icon: <MessageSquare className="w-4 h-4 text-violet-500" />, label: "コメント", v: summary.totals.comments },
        { icon: <CalendarCheck className="w-4 h-4 text-emerald-600" />, label: "予約・相談", v: summary.totals.reservations },
      ]
    : [];

  return (
    <div className="space-y-4">
      {/* 月ナビ */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" /> 効果サマリー
        </h2>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold w-24 text-center">{cursor.getFullYear()}年{cursor.getMonth() + 1}月</span>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {loading || !summary ? (
        <div className="py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
      ) : (
        <>
          {/* 投稿数・ステータス */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-end gap-2 mb-2">
                <span className="text-3xl font-bold text-slate-900">{summary.totalPosts}</span>
                <span className="text-sm text-slate-500 mb-1">本の投稿案</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(STATUS_LABELS) as PostStatus[]).map((s) =>
                  summary.statusCounts[s] ? (
                    <Badge key={s} variant="outline">{STATUS_LABELS[s]} {summary.statusCounts[s]}</Badge>
                  ) : null,
                )}
                {summary.totalPosts === 0 && <span className="text-sm text-slate-400">この月の投稿案はまだありません</span>}
              </div>
            </CardContent>
          </Card>

          {/* 反応合計 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {totalTiles.map((t) => (
              <Card key={t.label}>
                <CardContent className="pt-4 text-center">
                  <div className="flex justify-center mb-1">{t.icon}</div>
                  <div className="text-2xl font-bold text-slate-900">{t.v}</div>
                  <div className="text-xs text-slate-500">{t.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 反応が良かった投稿 */}
          {summary.top.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Trophy className="w-4 h-4 text-amber-500" /> 反応が良かった投稿
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {summary.top.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm">
                    <span className="font-bold text-amber-500 w-5">{i + 1}位</span>
                    <Badge variant="secondary">{t.category}</Badge>
                    <span className="truncate text-slate-700 flex-1">{t.theme}</span>
                    <span className="text-xs text-slate-400 shrink-0">スコア{t.score}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* カテゴリ別 */}
          {summary.byCategory.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">カテゴリ別の本数</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {summary.byCategory.map((c) => (
                  <Badge key={c.category} variant="outline">{c.category} {c.count}本</Badge>
                ))}
              </CardContent>
            </Card>
          )}

          {/* 月次レポート */}
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4 text-blue-600" /> 院長向け 月次レポート
              </CardTitle>
              <div className="flex items-center gap-2">
                {report && <CopyButton text={report} />}
                <Button size="sm" onClick={makeReport} disabled={reporting}>
                  {reporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  {report ? "作り直す" : "レポートを作る"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {report ? (
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{report}</p>
              ) : (
                <p className="text-sm text-slate-400">
                  ボタンを押すと、この月のふりかえりと来月の提案を、やさしい文章でまとめます。LINEなどに貼って院内共有できます。
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
