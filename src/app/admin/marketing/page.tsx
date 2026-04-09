"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, BellElectric, Trophy, MessageCircle, Loader2, CheckCircle2, Sparkles, ClipboardList, MapIcon, MapPin, Globe, ArrowRight, Share2, ExternalLink, QrCode } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sendAppointmentReminders, sendBirthdayCoupons, runMonthlyLottery, sendWelcomeQuestionnaire, sendWomenOnlyCampaign, getMarketingStats, sendSegmentedCampaign, sendReferralMessage } from "@/app/actions/line-marketing";
import Link from "next/link";

export default function MarketingDashboardPage() {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: string; message: string; data?: any; debugLogs?: string[] } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().getMonth() + 1 + "");
  const [testMode, setTestMode] = useState(true);
  const [testLineId, setTestLineId] = useState("");
  const [womenMessage, setWomenMessage] = useState("");
  const [areaMessage, setAreaMessage] = useState("");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [referralTargetId, setReferralTargetId] = useState("");
  const [showQr, setShowQr] = useState(false);

  // 初回読み込み
  useEffect(() => {
    async function loadStats() {
      try {
        const s = await getMarketingStats();
        setStats(s);
      } catch (e) {
        console.error("Stats load error:", e);
      }
    }
    loadStats();
  }, []);

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
        message: `今月の来院者限定抽選会を実施しました！（対象: ${result.totalCount}名, 当選: ${result.winnerCount}名）`,
        data: { winners: result.winners, target: result.target, note: (result as any).note }
      });
    } catch (e: any) {
      setActionResult({ type: "error", message: e.message || "エラーが発生しました" });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSendWomenCampaign = async () => {
    setLoadingAction("women");
    try {
      const result = await sendWomenOnlyCampaign(womenMessage);
      setActionResult({
        type: "women",
        message: `女性患者さん（${result.count}名）へキャンペーンメッセージを送信しました！`,
        data: result.sentTo,
        debugLogs: result.debugLogs,
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

  const handleSendAreaCampaign = async () => {
    if (!selectedCity) return;
    setLoadingAction("area");
    try {
      const result = await sendSegmentedCampaign({
        city: selectedCity,
        message: areaMessage
      });
      setActionResult({
        type: "area",
        message: `${selectedCity}の患者さん（${result.count}名）へキャンペーンメッセージを送信しました！`,
        data: result.sentTo,
        debugLogs: result.debugLogs,
      });
    } catch (e: any) {
      setActionResult({ type: "error", message: e.message || "エラーが発生しました" });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSendReferral = async () => {
    const target = referralTargetId || testLineId;
    if (!target) {
      setActionResult({ type: "error", message: "紹介先のLINE IDを入力するか、テストIDを設定してください" });
      return;
    }
    setLoadingAction("referral");
    try {
      const result = await sendReferralMessage(target);
      setActionResult({ type: "referral", message: result.message });
    } catch (e: any) {
      setActionResult({ type: "error", message: e.message || "送信に失敗しました" });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <MessageCircle className="h-8 w-8 text-green-500" />
            V-ARC 販促・LINE管理
          </h1>
          <p className="text-slate-500 mt-1">
            患者さんへの自動リマインドや、各種キャンペーンを一括送信します。
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/admin/marketing/seo">
            <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg px-6 font-bold">
              <Globe className="w-4 h-4 mr-2" />
              SEO/MEO AI軍師診断
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Link href="/admin/tasks">
            <Button variant="outline" className="border-slate-200">
              <ClipboardList className="w-4 h-4 mr-2 text-indigo-500" />
              SNSタスク
            </Button>
          </Link>
        </div>
      </div>

      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <input 
            type="checkbox" 
            id="testMode" 
            checked={testMode} 
            onChange={(e) => handleToggleTestMode(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded border-slate-300"
          />
          <label htmlFor="testMode">テスト送信モード（自分だけに届く）</label>
        </div>
        {testMode && (
          <input 
            type="text" 
            placeholder="LINEユーザーID (U3....)" 
            value={testLineId}
            onChange={(e) => handleChangeTestId(e.target.value)}
            className="flex-1 border bg-slate-50 border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono"
          />
        )}
      </div>

      {actionResult && (
        <div className={`p-4 rounded-lg flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 ${actionResult.type === "error" ? "bg-rose-50 border border-rose-200 text-rose-800" : "bg-green-50 border border-green-200 text-green-800"}`}>
          {actionResult.type === "error" ? (
             <div className="shrink-0 mt-0.5">⚠️</div>
          ) : (
             <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <h3 className="font-bold">{actionResult.type === "error" ? "エラーが発生しました" : "配信完了"}</h3>
            <p className="text-sm mt-0.5">{actionResult.message}</p>
            {actionResult.debugLogs && actionResult.debugLogs.length > 0 && (
              <div className="mt-4 p-3 bg-slate-900 text-green-400 rounded font-mono text-[10px] max-h-40 overflow-auto">
                {actionResult.debugLogs.map((log, i) => <div key={i} className="mb-2">{log}</div>)}
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setActionResult(null)} className="shrink-0 -mt-1 opacity-50">×</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* 1. 初診アンケート */}
        <Card className="border-t-4 border-t-purple-500 hover:shadow-md transition-shadow h-full flex flex-col">
          <CardHeader className="pb-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 mb-2">
              <ClipboardList className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">初診アンケート</CardTitle>
            <CardDescription className="text-xs">
              属性取得用フォームを送信します。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-[11px] bg-slate-50 p-3 mx-4 rounded text-slate-500 flex-grow">
            「ご来院ありがとうございます！カルテ作成のためアンケートにご回答をお願いします🌱」
          </CardContent>
          <CardFooter className="pt-4 mt-auto">
            <Button className="w-full bg-purple-600 text-xs py-2" onClick={handleSendQuestionnaire} disabled={loadingAction !== null}>
              {loadingAction === "questionnaire" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardList className="mr-2 h-4 w-4 text-[10px]" />}
              {loadingAction === "questionnaire" ? "送信中..." : "アンケート配信"}
            </Button>
          </CardFooter>
        </Card>

        {/* 2. 当日リマインド */}
        <Card className="border-t-4 border-t-blue-500 hover:shadow-md transition-shadow h-full flex flex-col">
          <CardHeader className="pb-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-2">
              <BellElectric className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">当日リマインド</CardTitle>
            <CardDescription className="text-xs">
              本日の予約者へ忘れ防止LINE。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-[11px] bg-slate-50 p-3 mx-4 rounded text-slate-500 flex-grow">
            「本日ご予約日となっております。お気を付けてお越しください！」
          </CardContent>
          <CardFooter className="pt-4 mt-auto">
            <Button className="w-full bg-blue-600 text-xs py-2" onClick={handleSendReminders} disabled={loadingAction !== null}>
              {loadingAction === "reminders" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4 text-[10px]" />}
              {loadingAction === "reminders" ? "送信中..." : "今すぐリマインド配信"}
            </Button>
          </CardFooter>
        </Card>

        {/* 3. 誕生日クーポン */}
        <Card className="border-t-4 border-t-rose-500 hover:shadow-md transition-shadow h-full flex flex-col">
          <CardHeader className="pb-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-2">
              <Gift className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">誕生日クーポン</CardTitle>
            <CardDescription className="text-xs">
              誕生月の患者様へ特別優待。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-grow">
            <div className="flex items-center gap-2">
              <Select value={selectedMonth} onValueChange={(val) => { if (val) setSelectedMonth(val); }}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <SelectItem key={i + 1} value={`${i + 1}`}>{i + 1}月</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {stats && <Badge variant="secondary" className="text-[10px] bg-rose-50 text-rose-700">対象: {stats.birthdayThisMonth}名</Badge>}
            </div>
          </CardContent>
          <CardFooter className="pt-4 mt-auto">
            <Button className="w-full bg-rose-500 text-xs py-2" onClick={handleSendBirthday} disabled={loadingAction !== null}>
              {loadingAction === "birthday" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gift className="mr-2 h-4 w-4 text-[10px]" />}
              {loadingAction === "birthday" ? "送信中..." : "クーポンを一斉配信"}
            </Button>
          </CardFooter>
        </Card>

        {/* 4. 抽選会 */}
        <Card className="border-t-4 border-t-amber-500 hover:shadow-md transition-shadow h-full flex flex-col">
          <CardHeader className="pb-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-2">
              <Trophy className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">来院者限定抽選会</CardTitle>
            <CardDescription className="text-xs">
              10%の確率で自動クーポン。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-[11px] bg-slate-50 p-3 mx-4 rounded text-amber-700 flex-grow">
            来院履歴のある患者様を対象に今月の抽選を行います。
          </CardContent>
          <CardFooter className="pt-4 mt-auto">
            <Button variant="outline" className="w-full border-amber-500 text-amber-700 text-xs py-2" onClick={handleRunLottery} disabled={loadingAction !== null}>
              {loadingAction === "lottery" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trophy className="mr-2 h-4 w-4 text-[10px]" />}
              {loadingAction === "lottery" ? "処理中..." : "今月の抽選を実施"}
            </Button>
          </CardFooter>
        </Card>

        {/* 5. 女性限定キャンペーン */}
        <Card className="border-t-4 border-t-pink-500 hover:shadow-md transition-shadow h-full flex flex-col">
          <CardHeader className="pb-3">
            <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 mb-2">
              <Sparkles className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">女性限定施策</CardTitle>
            <CardDescription className="text-xs">
              女性患者様への一斉メッセージ。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 flex-grow">
            <textarea
              value={womenMessage}
              onChange={(e) => setWomenMessage(e.target.value)}
              placeholder="メッセージ内容（空欄でデフォルト）"
              className="w-full h-24 border border-slate-200 rounded p-2 text-[10px] resize-none"
            />
          </CardContent>
          <CardFooter className="pt-4 mt-auto">
            <Button className="w-full bg-pink-500 text-xs py-2" onClick={handleSendWomenCampaign} disabled={loadingAction !== null}>
              {loadingAction === "women" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4 text-[10px]" />}
              {loadingAction === "women" ? "送信中..." : `女性(${stats?.women || 0}名)へ`}
            </Button>
          </CardFooter>
        </Card>

        {/* 6. エリア限定配信 */}
        <Card className="border-t-4 border-t-blue-400 hover:shadow-md transition-shadow h-full flex flex-col">
          <CardHeader className="pb-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-2">
              <MapIcon className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">エリア限定配信</CardTitle>
            <CardDescription className="text-xs">
              地域を絞った特別なお知らせ。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 flex-grow">
             <div className="flex flex-wrap gap-1 max-h-20 overflow-auto py-1">
                {stats && Object.entries(stats.cityStats).map(([city, count]) => (
                  <button key={city} onClick={() => setSelectedCity(city)} className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition ${selectedCity === city ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {city} ({count as number})
                  </button>
                ))}
             </div>
             <textarea
               value={areaMessage}
               onChange={(e) => setAreaMessage(e.target.value)}
               placeholder="地域限定の情報を入力..."
               className="w-full h-12 border border-slate-200 rounded p-2 text-[10px] resize-none"
             />
          </CardContent>
          <CardFooter className="pt-4 mt-auto">
            <Button className="w-full bg-blue-600 text-xs py-2" onClick={handleSendAreaCampaign} disabled={loadingAction !== null || !selectedCity}>
              {loadingAction === "area" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4 text-[10px]" />}
              {loadingAction === "area" ? "送信中..." : selectedCity ? `${selectedCity}の患者様へ` : "エリア選択"}
            </Button>
          </CardFooter>
        {/* 7. 他院へのご紹介 */}
        <Card className="border-t-4 border-t-indigo-600 hover:shadow-md transition-shadow h-full flex flex-col bg-slate-50/30">
          <CardHeader className="pb-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 mb-2">
              <Share2 className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">他院へのご紹介</CardTitle>
            <CardDescription className="text-xs">
              V-ARCを他院の先生へ紹介。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 flex-grow">
             <div className="p-3 bg-white border border-indigo-100 rounded-lg space-y-2">
                <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                   <ExternalLink className="w-3 h-3" />
                   紹介用URL
                </p>
                <code className="text-[9px] block bg-slate-100 p-1.5 rounded truncate text-indigo-600">
                   {typeof window !== 'undefined' ? window.location.origin : ''}/presentation
                </code>
             </div>
             <input 
               type="text" 
               placeholder="紹介先のLINE ID（空欄でテストID）" 
               value={referralTargetId}
               onChange={(e) => setReferralTargetId(e.target.value)}
               className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-[10px]"
             />
          </CardContent>
          <CardFooter className="pt-2 mt-auto grid grid-cols-2 gap-2">
            <Link href="/presentation" target="_blank" className="w-full">
              <Button variant="outline" className="w-full text-[10px] h-8 border-indigo-200 text-indigo-700">
                資料を見る
              </Button>
            </Link>
            <Button variant="outline" className="w-full text-[10px] h-8 border-indigo-200 text-indigo-700" onClick={() => setShowQr(true)}>
              <QrCode className="h-3 w-3 mr-1" />
              QRコード
            </Button>
            <Button className="w-full bg-indigo-600 text-[10px] h-8" onClick={handleSendReferral} disabled={loadingAction !== null}>
              {loadingAction === "referral" ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3 mr-1" />}
              LINEで送る
            </Button>
          </CardFooter>
        </Card>

      </div>

      {/* QRコードモーダル */}
      {showQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
           <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-6 shadow-2xl scale-in-center">
              <div className="flex justify-between items-center mb-2">
                 <h3 className="font-black text-slate-800">紹介用QRコード</h3>
                 <button onClick={() => setShowQr(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">×</button>
              </div>
              <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 flex items-center justify-center aspect-square">
                 <img 
                   src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent((typeof window !== 'undefined' ? window.location.origin : '') + '/presentation')}`} 
                   alt="Referral QR Code"
                   className="w-full h-full"
                 />
              </div>
              <p className="text-xs text-slate-500 font-medium">
                相手の先生にスマホで読み取ってもらうと、<br />即座にプレゼン資料が表示されます。
              </p>
              <Button onClick={() => setShowQr(false)} className="w-full rounded-xl bg-slate-900">閉じる</Button>
           </div>
        </div>
      )}
    </div>
  );
}
