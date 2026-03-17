"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, BellElectric, Trophy, MessageCircle, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sendAppointmentReminders, sendBirthdayCoupons, runMonthlyLottery, sendWelcomeQuestionnaire } from "@/app/actions/line-marketing";
import { ClipboardList } from "lucide-react";

export default function MarketingDashboardPage() {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: string; message: string; data?: any; debugLogs?: string[] } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().getMonth() + 1 + "");
  const [testMode, setTestMode] = useState(true);
  const [testLineId, setTestLineId] = useState("");

  // 設定の読み込み
  useEffect(() => {
    const savedId = localStorage.getItem("ballClinic_testLineId");
    const savedMode = localStorage.getItem("ballClinic_testMode");
    if (savedId) setTestLineId(savedId);
    if (savedMode !== null) setTestMode(savedMode === "true");
  }, []);

  // 設定の保存
  const handleToggleTestMode = (checked: boolean) => {
    setTestMode(checked);
    localStorage.setItem("ballClinic_testMode", checked.toString());
  };

  const handleChangeTestId = (val: string) => {
    setTestLineId(val);
    localStorage.setItem("ballClinic_testLineId", val);
  };

  const handleSendReminders = async () => {
    setLoadingAction("reminders");
    try {
      const result = await sendAppointmentReminders(testMode ? testLineId : null);
      setActionResult({ 
        type: "reminders", 
        message: `本日の予約（${result.count}件）に対してリマインドメッセージを送信完了しました！`,
        data: result.sentTo,
        debugLogs: result.debugLogs
      });
    } catch (e: any) {
      setActionResult({ type: "error", message: e.message || "エラーが発生しました" });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSendBirthday = async () => {
    setLoadingAction("birthday");
    try {
      const result = await sendBirthdayCoupons(parseInt(selectedMonth));
      setActionResult({ 
        type: "birthday", 
        message: `${selectedMonth}月生まれの患者さん（${result.count}名）へ誕生日クーポン付きLINEを送信しました！`,
        data: result.sentTo
      });
    } catch (e: any) {
      setActionResult({ type: "error", message: e.message || "エラーが発生しました" });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRunLottery = async () => {
    setLoadingAction("lottery");
    try {
      const result = await runMonthlyLottery();
      setActionResult({ 
        type: "lottery", 
        message: `今月の抽選会を実施しました！（送信数: ${result.totalCount}通, 当たり: ${result.winnerCount}名）`,
        data: { winners: result.winners }
      });
    } catch (e: any) {
      setActionResult({ type: "error", message: e.message || "エラーが発生しました" });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSendQuestionnaire = async () => {
    setLoadingAction("questionnaire");
    try {
      const result = await sendWelcomeQuestionnaire();
      setActionResult({ 
        type: "questionnaire", 
        message: `初診・未回答の患者さん（${result.count}名）へ初回アンケート（性別・誕生月など）を送信しました！`,
        data: result.sentTo
      });
    } catch (e: any) {
      setActionResult({ type: "error", message: e.message || "エラーが発生しました" });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <MessageCircle className="h-8 w-8 text-green-500" />
          LINE 自動配信・マーケティング
        </h1>
        <p className="text-slate-500 mt-1">
          患者さんへの自動リマインドや、誕生日クーポン・抽選会などの販促メッセージを一括送信します。
        </p>
        
        <div className="mt-4 p-4 bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col gap-3 md:flex-row md:items-center w-full max-w-2xl">
          <div className="flex items-center gap-2 font-medium">
            <input 
              type="checkbox" 
              id="testMode" 
              checked={testMode} 
              onChange={(e) => handleToggleTestMode(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
            />
            <label htmlFor="testMode" className="cursor-pointer">テスト配信用IDを記憶して自分だけに送信する</label>
          </div>
          {testMode && (
            <input 
              type="text" 
              placeholder="あなたのLINEユーザーID (U3....)" 
              value={testLineId}
              onChange={(e) => handleChangeTestId(e.target.value)}
              className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-sm"
            />
          )}
        </div>
      </div>

      {actionResult && actionResult.type !== "error" && (
        <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-lg flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-green-900">配信完了</h3>
            <p className="text-sm mt-1">{actionResult.message}</p>
            {actionResult.data && actionResult.data.length > 0 && actionResult.type !== "lottery" && (
              <p className="text-xs mt-2 opacity-80 break-words leading-relaxed">
                <span className="font-bold">対象者:</span> {actionResult.data.join(", ")}
              </p>
            )}
            {actionResult.type === "lottery" && actionResult.data.winners && (
              <>
                <p className="text-xs mt-2 opacity-80"><span className="font-bold">対象者:</span> {actionResult.data.target}</p>
                {actionResult.data.winners.length > 0 && (
                   <p className="text-xs mt-1 opacity-80 break-words leading-relaxed"><span className="font-bold">当選者:</span> {actionResult.data.winners.join(", ")}</p>
                )}
              </>
            )}
            
            {(actionResult as any).debugLogs && (actionResult as any).debugLogs.length > 0 && (
              <div className="mt-4 p-3 bg-slate-900 text-green-400 rounded font-mono text-xs leading-relaxed overflow-auto max-h-60">
                <div className="text-white border-b border-slate-700 pb-1 mb-2">▼ LINE送信内容（シミュレーション）</div>
                {(actionResult as any).debugLogs.map((log: string, i: number) => (
                  <div key={i} className="mb-4 whitespace-pre-wrap">{log}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      {actionResult && actionResult.type === "error" && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-lg shadow-sm">
          <h3 className="font-bold">エラー</h3>
          <p className="text-sm">{actionResult.message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* 0. 初回アンケート */}
        <Card className="border-t-4 border-t-purple-500 hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 mb-2">
              <ClipboardList className="h-5 w-5" />
            </div>
            <CardTitle>初診アンケート</CardTitle>
            <CardDescription>
              LINE初登録者や初診の患者さんへ、属性（性別・誕生月など）を尋ねるアンケートフォームを送信します。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm bg-slate-50 p-4 mx-6 rounded my-2 text-slate-600">
            <p><strong>自動文章例:</strong></p>
            <p className="mt-1 opacity-80">「ご来院ありがとうございます！カルテ作成のため、こちらのリンクから簡単なアンケート（お名前・性別・誕生月 等）にご回答をお願いします🌱」</p>
          </CardContent>
          <CardFooter className="pt-4 border-t mt-auto">
            <Button 
              className="w-full bg-purple-600 hover:bg-purple-700" 
              onClick={handleSendQuestionnaire}
              disabled={loadingAction !== null}
            >
              {loadingAction === "questionnaire" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardList className="mr-2 h-4 w-4" />}
              {loadingAction === "questionnaire" ? "送信中..." : "アンケートを配信する"}
            </Button>
          </CardFooter>
        </Card>

        {/* 1. 当日リマインド */}
        <Card className="border-t-4 border-t-blue-500 hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-2">
              <BellElectric className="h-5 w-5" />
            </div>
            <CardTitle>当日リマインド送信</CardTitle>
            <CardDescription>
              本日の予約が入っている患者さんへ、忘れ防止のお知らせLINEを一斉送信します。
              （※通常は毎朝8時に自動実行されます）
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm bg-slate-50 p-4 mx-6 rounded my-2 text-slate-600">
            <p><strong>自動文章例:</strong></p>
            <p className="mt-1 opacity-80">「こんにちは！ボール接骨院です。本日ご予約の日となっております。お気を付けてお越しください！」</p>
          </CardContent>
          <CardFooter className="pt-4 border-t">
            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700" 
              onClick={handleSendReminders}
              disabled={loadingAction !== null}
            >
              {loadingAction === "reminders" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
              {loadingAction === "reminders" ? "送信中..." : "今すぐリマインド配信"}
            </Button>
          </CardFooter>
        </Card>

        {/* 2. 誕生日クーポン */}
        <Card className="border-t-4 border-t-rose-500 hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-2">
              <Gift className="h-5 w-5" />
            </div>
            <CardTitle>誕生日クーポン</CardTitle>
            <CardDescription>
              指定した月が誕生月の患者さんへ、特別割引クーポンを一斉送信します。
              （※通常は毎月1日に自動実行されます）
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="my-2 bg-slate-50 p-4 rounded text-sm text-slate-600 mb-4">
               <p><strong>自動文章例:</strong></p>
               <p className="mt-1 opacity-80">「お誕生日おめでとうございます🎉 ささやかですが、当院で使える【500円OFFクーポン】をプレゼントいたします！」</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">対象の月:</span>
              <Select value={selectedMonth} onValueChange={(val) => { if (val) setSelectedMonth(val); }}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="月を選択" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <SelectItem key={i + 1} value={`${i + 1}`}>{i + 1}月生まれ</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
          <CardFooter className="pt-4 border-t">
            <Button 
              className="w-full bg-rose-500 hover:bg-rose-600" 
              onClick={handleSendBirthday}
              disabled={loadingAction !== null}
            >
              {loadingAction === "birthday" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gift className="mr-2 h-4 w-4" />}
              {loadingAction === "birthday" ? "送信中..." : "クーポンを配信する"}
            </Button>
          </CardFooter>
        </Card>

        {/* 3. 毎月10%抽選会 */}
        <Card className="border-t-4 border-t-amber-500 hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-2">
              <Trophy className="h-5 w-5" />
            </div>
            <CardTitle>毎月抽選会 (確率10%)</CardTitle>
            <CardDescription>
              全患者に対してランダムで「10%の確率で当たる500円OFF抽選」をLINE配信します。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm bg-slate-50 p-4 mx-6 rounded my-2 text-slate-600">
            <p><strong>自動文章例:</strong></p>
            <p className="mt-1 opacity-80">「今月の運試し！タップして抽選に挑戦しよう！【当たりが出たら500円OFF🙌】」</p>
            <div className="mt-3 flex gap-2 w-full justify-center">
               <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">当たり確率: 10%</Badge>
            </div>
          </CardContent>
          <CardFooter className="pt-4 border-t mt-auto">
            <Button 
              variant="outline"
              className="w-full border-amber-500 text-amber-700 hover:bg-amber-50" 
              onClick={handleRunLottery}
              disabled={loadingAction !== null}
            >
              {loadingAction === "lottery" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trophy className="mr-2 h-4 w-4" />}
              {loadingAction === "lottery" ? "抽選処理中..." : "今月の抽選会を実施"}
            </Button>
          </CardFooter>
        </Card>

      </div>
    </div>
  );
}
