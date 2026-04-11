"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Globe, Search, ArrowLeft, Lightbulb } from "lucide-react";
import Link from "next/link";
import { generateSEOMeoAdvice } from "@/app/actions/ai-secretary";
import { getClinicSettings, ClinicSettings } from "@/app/actions/settings";

export default function SeoDiagnosisPage() {
  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ClinicSettings | null>(null);

  useEffect(() => {
    async function loadSettings() {
      const s = await getClinicSettings();
      setSettings(s);
    }
    loadSettings();
  }, []);

  const handleDiagnosis = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateSEOMeoAdvice();
      if (result.success && result.advice) {
        setAdvice(result.advice);
      } else {
        setError(result.error || "\u8a3a\u65ad\u306b\u5931\u6557\u3057\u307e\u3057\u305f");
      }
    } catch (e: any) {
      setError(e.message || "\u4e88\u671f\u305b\u306c\u30a8\u30e9\u30fc\u304c\u767a\u751f\u3057\u307e\u3057\u305f");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex items-center gap-4">
        <Link href="/admin/marketing">
          <Button variant="ghost" size="sm" className="text-slate-500">
            <ArrowLeft className="w-4 h-4 mr-2" />
            マーケティングダッシュボードへ戻る
          </Button>
        </Link>
      </div>

      <div className="space-y-2">
        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
          <Globe className="w-10 h-10 text-indigo-600" />
          SEO / MEO AI秘書診断
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg">
          Googleの目線からあなたの院を分析。検索順位とマップ表示を最大化します。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/50">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center text-slate-800 dark:text-slate-100">
              <Lightbulb className="w-4 h-4 mr-2 text-amber-500" />
              AI診断に使われるデータ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-[10px] uppercase font-bold text-indigo-500 dark:text-indigo-400">院名</p>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{settings?.clinic_name || "読み込み中..."}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-indigo-500 dark:text-indigo-400">エリア</p>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{settings?.area_name || settings?.address || "未設定"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-indigo-500 dark:text-indigo-400">HP URL</p>
              <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{settings?.hp_url || "未設定"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-indigo-500 dark:text-indigo-400">分析キーワード</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {settings?.analysis_keywords?.map(k => (
                  <Badge key={k} variant="outline" className="text-[10px] bg-white dark:bg-indigo-900 dark:text-indigo-200 dark:border-indigo-700">{k}</Badge>
                )) || <p className="text-slate-500 dark:text-slate-400 italic">未設定</p>}
              </div>
            </div>
            <div className="border-t border-indigo-100 dark:border-indigo-800 pt-3 space-y-1.5">
              <p className="text-[10px] uppercase font-bold text-indigo-500 dark:text-indigo-400">自動取得データ（毎回最新）</p>
              {[
                "今月の来院件数・初診/再診比率",
                "前月比トレンド",
                "今月の自費売上",
                "最近のAIメモ（最新3件）",
              ].map((item) => (
                <div key={item} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                  {item}
                </div>
              ))}
            </div>
            <Link href="/admin/settings">
              <Button variant="link" size="sm" className="px-0 text-indigo-600 dark:text-indigo-400 text-[11px]">
                院の設定を変更する
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-xl border-2 border-indigo-600 ring-4 ring-indigo-50 dark:ring-indigo-900/30 overflow-hidden">
          <div className="bg-indigo-600 p-6 text-white">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              AI診断を開始する
            </h2>
            <p className="text-indigo-100 text-sm mt-1">来院数・売上・最近のメモをもとに、この院固有のSEO/MEOアドバイスを生成します。</p>
          </div>
          <CardContent className="p-8 flex flex-col items-center justify-center min-h-[200px] bg-white">
            {!advice && !loading && (
              <div className="text-center space-y-6">
                <div className="flex justify-center flex-wrap gap-3">
                  <Badge variant="outline" className="text-indigo-600 border-indigo-200">ホームページ改善</Badge>
                  <Badge variant="outline" className="text-indigo-600 border-indigo-200">Googleマップ対策</Badge>
                  <Badge variant="outline" className="text-indigo-600 border-indigo-200">集患戦略</Badge>
                </div>
                <Button
                  size="lg"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white h-16 px-12 text-xl font-black shadow-2xl hover:scale-105 transition-transform"
                  onClick={handleDiagnosis}
                >
                  <Search className="w-6 h-6 mr-3" />
                  診断を実行する
                </Button>
              </div>
            )}

            {loading && (
              <div className="text-center space-y-4 py-8">
                <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto" />
                <p className="text-slate-600 font-bold animate-pulse text-lg">来院データ・メモをもとに分析中...</p>
                <p className="text-slate-400 text-sm text-center max-w-xs mx-auto">
                  今月の来院数・前月比・AIメモをAIに渡して、この院固有の改善策を生成しています。
                </p>
              </div>
            )}

            {advice && (
              <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="prose prose-slate max-w-none text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {advice}
                </div>
                <div className="flex justify-center pt-6 border-t">
                  <Button variant="outline" onClick={handleDiagnosis} className="text-slate-500">
                    <Sparkles className="w-4 h-4 mr-2" />
                    もう一度診断する
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-rose-50 border border-rose-200 p-6 rounded-lg text-center space-y-4">
                <p className="text-rose-700 font-bold">診断に失敗しました</p>
                <p className="text-rose-500 text-sm">{error}</p>
                <Button variant="outline" onClick={handleDiagnosis} className="border-rose-200 text-rose-700 hover:bg-rose-100">
                  再試行する
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
