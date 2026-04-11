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
import { updateClinicSettings, getClinicSettings } from "@/app/actions/settings";
import Link from "next/link";
import { Clock } from "lucide-react";

export default function MarketingDashboardPage() {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: string; message: string; wasTestMode?: boolean; data?: any; debugLogs?: string[] } | null>(null);
  const [previewDialog, setPreviewDialog] = useState<{ label: string; count: string; sentAt: string; onConfirm: (msg: string, time: string) => void } | null>(null);
  const [previewMessage, setPreviewMessage] = useState("");
  const [previewTime, setPreviewTime] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().getMonth() + 1 + "");
  const [testMode, setTestMode] = useState(true);
  const [testLineId, setTestLineId] = useState("");
  const [womenMessage, setWomenMessage] = useState("");
  const [areaMessage, setAreaMessage] = useState("");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [referralTargetId, setReferralTargetId] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [autoRemindEnabled, setAutoRemindEnabled] = useState(false);
  const [autoRemindTime, setAutoRemindTime] = useState("08:00");
  const [savingRemindSettings, setSavingRemindSettings] = useState(false);

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
    async function loadRemindSettings() {
      try {
        const s = await getClinicSettings();
        if (s) {
          setAutoRemindEnabled((s as any).auto_remind_enabled ?? false);
          setAutoRemindTime((s as any).auto_remind_time ?? "08:00");
        }
      } catch (e) {
        console.error("Remind settings load error:", e);
      }
    }
    loadStats();
    loadRemindSettings();
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

  const handleSaveRemindSettings = async (enabled: boolean, time: string) => {
    setSavingRemindSettings(true);
    try {
      await updateClinicSettings({ auto_remind_enabled: enabled as any, auto_remind_time: time as any } as any);
      setAutoRemindEnabled(enabled);
      setAutoRemindTime(time);
    } catch (e) {
      console.error("Remind settings save error:", e);
    } finally {
      setSavingRemindSettings(false);
    }
  };

  const nowStr = () => new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

  /** 配信前プレビューダイアログを表示し、確認後にコールバックを実行 */
  const showPreview = (label: string, count: string, defaultMessage: string, onConfirm: (msg: string, time: string) => void) => {
    setPreviewMessage(defaultMessage);
    setPreviewTime(nowStr());
    setPreviewDialog({ label, count, sentAt: nowStr(), onConfirm });
  };

  const handleSendReminders = () => {
    const count = stats?.todayAppointments != null ? `本日の予約 ${stats.todayAppointments}件` : "本日の予約者";
    const defaultMsg = "様\n\nこんにちは！ボール接骨院です。\n本日ご予約日となっております。\nお気を付けてお越しください！";
    showPreview("当日リマインド", testMode ? "テスト配信（自分のLINEのみ）" : count, defaultMsg, async (_msg, _time) => {
      setLoadingAction("reminders");
      try {
        const result = await sendAppointmentReminders(testMode ? testLineId : null);
        setActionResult({
          type: "reminders", wasTestMode: testMode,
          message: `本日の予約（${result.count}件）に対してリマインドメッセージを送信完了しました！`,
          data: result.sentTo, debugLogs: result.debugLogs
        });
      } catch (e: any) {
        setActionResult({ type: "error", message: e.message || "エラーが発生しました" });
      } finally { setLoadingAction(null); }
    });
  };

  const handleSendBirthday = () => {
    const count = stats?.birthdayThisMonth != null ? `${selectedMonth}月生まれ ${stats.birthdayThisMonth}名` : `${selectedMonth}月生まれの患者様`;
    const defaultMsg = `🎂 お誕生日おめでとうございます！\n今月限定の特別クーポンをお届けします。\nぜひご来院の際にお使いください🎁`;
    showPreview("誕生日クーポン", testMode ? "テスト配信（自分のLINEのみ）" : count, defaultMsg, async (_msg, _time) => {
      setLoadingAction("birthday");
      try {
        const result = await sendBirthdayCoupons(parseInt(selectedMonth));
        setActionResult({
          type: "birthday", wasTestMode: testMode,
          message: `${selectedMonth}月生まれの患者さん（${result.count}名）へ誕生日クーポン付きLINEを送信しました！`,
          data: result.sentTo
        });
      } catch (e: any) {
        setActionResult({ type: "error", message: e.message || "エラーが発生しました" });
      } finally { setLoadingAction(null); }
    });
  };

  const handleRunLottery = () => {
    const defaultMsg = "🎰 今月の来院者限定抽選会を実施します！\n当選された方には特別クーポンをお届けします。";
    showPreview("来院者限定抽選会", testMode ? "テスト配信（自分のLINEのみ）" : "来院履歴のある患者様全員", defaultMsg, async (_msg, _time) => {
      setLoadingAction("lottery");
      try {
        const result = await runMonthlyLottery(testMode ? testLineId : null);
        setActionResult({
          type: "lottery", wasTestMode: testMode,
          message: `今月の来院者限定抽選会を実施しました！（対象: ${result.totalCount}名, 当選: ${result.winnerCount}名）`,
          data: { winners: result.winners, target: result.target, note: (result as any).note }
        });
      } catch (e: any) {
        setActionResult({ type: "error", message: e.message || "エラーが発生しました" });
      } finally { setLoadingAction(null); }
    });
  };

  const handleSendWomenCampaign = () => {
    const count = stats?.women != null ? `女性患者様 ${stats.women}名` : "女性患者様";
    const defaultMsg = womenMessage || "女性患者様へ特別なお知らせをお届けします。";
    showPreview("女性限定キャンペーン", testMode ? "テスト配信（自分のLINEのみ）" : count, defaultMsg, async (msg, _time) => {
      setWomenMessage(msg);
      setLoadingAction("women");
      try {
        const result = await sendWomenOnlyCampaign(msg);
        setActionResult({
          type: "women", wasTestMode: testMode,
          message: `女性患者さん（${result.count}名）へキャンペーンメッセージを送信しました！`,
          data: result.sentTo, debugLogs: result.debugLogs,
        });
      } catch (e: any) {
        setActionResult({ type: "error", message: e.message || "エラーが発生しました" });
      } finally { setLoadingAction(null); }
    });
  };

  const handleSendQuestionnaire = () => {
    const defaultMsg = "ご来院ありがとうございます！\nカルテ作成のため、簡単なアンケートにご回答をお願いします🌱";
    showPreview("初診アンケート", testMode ? "テスト配信（自分のLINEのみ）" : "初診・未回答の患者様", defaultMsg, async (_msg, _time) => {
      setLoadingAction("questionnaire");
      try {
        const result = await sendWelcomeQuestionnaire();
        setActionResult({
          type: "questionnaire", wasTestMode: testMode,
          message: `初診・未回答の患者さん（${result.count}名）へ初回アンケート（性別・誕生月など）を送信しました！`,
          data: result.sentTo
        });
      } catch (e: any) {
        setActionResult({ type: "error", message: e.message || "エラーが発生しました" });
      } finally { setLoadingAction(null); }
    });
  };

  const handleSendAreaCampaign = () => {
    if (!selectedCity) return;
    const cityCount = stats?.cityStats?.[selectedCity];
    const count = cityCount != null ? `${selectedCity}の患者様 ${cityCount}名` : `${selectedCity}の患者様`;
    const defaultMsg = areaMessage || `${selectedCity}エリアの患者様へ特別なお知らせをお届けします。`;
    showPreview("エリア限定配信", testMode ? "テスト配信（自分のLINEのみ）" : count, defaultMsg, async (msg, _time) => {
      setAreaMessage(msg);
      setLoadingAction("area");
      try {
        const result = await sendSegmentedCampaign({ city: selectedCity!, message: msg });
        setActionResult({
          type: "area", wasTestMode: testMode,
          message: `${selectedCity}の患者さん（${result.count}名）へキャンペーンメッセージを送信しました！`,
          data: result.sentTo, debugLogs: result.debugLogs,
        });
      } catch (e: any) {
        setActionResult({ type: "error", message: e.message || "エラーが発生しました" });
      } finally { setLoadingAction(null); }
    });
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
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-slate-900 dark:text-slate-100">
            <MessageCircle className="h-8 w-8 text-green-500" />
            V-ARC 販促・LINE管理
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            LINEリマインド・キャンペーンを患者様へ一括送信します。<br />
            <span className="text-amber-600 dark:text-amber-400 font-bold text-xs">⚠ 本番送信前に必ず「テスト送信モード」で動作確認してください。</span>
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/admin/marketing/seo">
            <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg px-6 font-bold">
              <Globe className="w-4 h-4 mr-2" />
              SEO/MEO AI秘書診断
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Link href="/admin/tasks">
            <Button variant="outline" className="border-slate-200 dark:border-slate-800 dark:text-slate-300">
              <ClipboardList className="w-4 h-4 mr-2 text-indigo-500" />
              SNSタスク
            </Button>
          </Link>
        </div>
      </div>

      <div className={`border rounded-xl shadow-sm p-4 flex flex-col gap-3 ${testMode ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"}`}>
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              id="testMode"
              checked={testMode}
              onChange={(e) => handleToggleTestMode(e.target.checked)}
              className="w-4 h-4 text-amber-500 rounded border-slate-300 dark:border-slate-700 dark:bg-slate-800 accent-amber-500"
            />
            <span className={`text-sm font-bold ${testMode ? "text-amber-700 dark:text-amber-300" : "text-slate-700 dark:text-slate-300"}`}>
              テスト送信モード（自分のLINEにだけ届く）
            </span>
          </label>
          {testMode && (
            <input
              type="text"
              placeholder="自分のLINEユーザーID (U3xxxx...) を入力"
              value={testLineId}
              onChange={(e) => handleChangeTestId(e.target.value)}
              className="flex-1 border bg-white dark:bg-slate-800 border-amber-300 dark:border-amber-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
            />
          )}
        </div>
        {testMode ? (
          <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-1">
            ✅ テストモードON：上のIDのLINEにのみ送信されます。本番配信時はチェックを外してください。
          </p>
        ) : (
          <p className="text-xs text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
            🔴 本番モード：各ボタンを押すと患者様全員に実際にLINEが送信されます。必ずテストモードで確認してから使用してください。
          </p>
        )}
      </div>

      {/* 配信前プレビューダイアログ */}
      {previewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${testMode ? "bg-amber-100" : "bg-blue-100"}`}>
                <MessageCircle className={`w-5 h-5 ${testMode ? "text-amber-600" : "text-blue-600"}`} />
              </div>
              <div>
                <p className="font-black text-slate-900 dark:text-white text-sm">{previewDialog.label}</p>
                <p className={`text-[10px] font-bold ${testMode ? "text-amber-600" : "text-slate-500 dark:text-slate-400"}`}>
                  {testMode ? "🧪 テスト送信モード" : "🔴 本番送信"}
                </p>
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400 text-xs">配信先</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 text-xs">{previewDialog.count}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400 text-xs">配信時刻</span>
                <input
                  type="time"
                  value={previewTime}
                  onChange={(e) => setPreviewTime(e.target.value)}
                  className="text-xs border border-slate-200 dark:border-slate-600 rounded px-2 py-0.5 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold"
                />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">配信内容（編集可）</p>
              <textarea
                value={previewMessage}
                onChange={(e) => setPreviewMessage(e.target.value)}
                rows={4}
                className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 resize-none focus:ring-2 focus:ring-blue-400 outline-none"
              />
            </div>
            {!testMode && (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
                患者様全員に実際のLINEが送信されます。よろしいですか？
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setPreviewDialog(null)}>キャンセル</Button>
              <Button
                className={`flex-1 font-bold ${testMode ? "bg-amber-500 hover:bg-amber-400 text-white" : "bg-blue-600 hover:bg-blue-500 text-white"}`}
                onClick={() => { const fn = previewDialog.onConfirm; const msg = previewMessage; const t = previewTime; setPreviewDialog(null); fn(msg, t); }}
              >
                {testMode ? "テスト送信する" : "送信する"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {actionResult && (
        <div className={`p-4 rounded-lg flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 ${actionResult.type === "error" ? "bg-rose-50 border border-rose-200 text-rose-800" : actionResult.wasTestMode ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-green-50 border border-green-200 text-green-800"}`}>
          {actionResult.type === "error" ? (
             <div className="shrink-0 mt-0.5">⚠️</div>
          ) : actionResult.wasTestMode ? (
             <div className="shrink-0 mt-0.5">🧪</div>
          ) : (
             <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <h3 className="font-bold">
              {actionResult.type === "error" ? "エラーが発生しました" : actionResult.wasTestMode ? "テスト配信完了" : "配信完了"}
            </h3>
            {actionResult.wasTestMode && (
              <p className="text-xs font-bold text-amber-700 mb-1">【テスト配信】自分のLINEにのみ送信されました。本番配信ではありません。</p>
            )}
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
        <Card className="border-t-4 border-t-purple-500 hover:shadow-md transition-shadow h-full flex flex-col dark:bg-slate-900/50 dark:border-x-white/5 dark:border-b-white/5">
          <CardHeader className="pb-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 mb-2">
              <ClipboardList className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">初診アンケート</CardTitle>
            <CardDescription className="text-xs">
              属性取得用フォームを送信します。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-[11px] bg-slate-50 dark:bg-slate-800/50 p-3 mx-4 rounded text-slate-500 dark:text-slate-400 flex-grow">
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
        <Card className="border-t-4 border-t-blue-500 hover:shadow-md transition-shadow h-full flex flex-col dark:bg-slate-900/50 dark:border-x-white/5 dark:border-b-white/5">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-2">
                <BellElectric className="h-5 w-5" />
              </div>
              {autoRemindEnabled && (
                <span className="text-[9px] font-bold bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">自動配信ON</span>
              )}
            </div>
            <CardTitle className="text-lg">当日リマインド</CardTitle>
            <CardDescription className="text-xs">
              本日の予約者へ忘れ防止LINE。
              {stats?.todayAppointments != null && (
                <span className="ml-1 font-bold text-blue-600 dark:text-blue-400">本日 {stats.todayAppointments}件</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 flex-grow">
            <div className="text-[11px] bg-slate-50 dark:bg-slate-800/50 p-3 rounded text-slate-500 dark:text-slate-400">
              「本日ご予約日となっております。お気を付けてお越しください！」
            </div>
            {/* 自動配信設定 */}
            <div className="border border-blue-100 dark:border-blue-900 rounded-lg p-3 space-y-2 bg-blue-50/50 dark:bg-blue-950/30">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRemindEnabled}
                    onChange={(e) => handleSaveRemindSettings(e.target.checked, autoRemindTime)}
                    disabled={savingRemindSettings}
                    className="w-3.5 h-3.5 accent-blue-500"
                  />
                  <span className="text-[11px] font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    自動配信
                  </span>
                </label>
                {savingRemindSettings && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
              </div>
              {autoRemindEnabled && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">配信時刻</span>
                    <input
                      type="time"
                      value={autoRemindTime}
                      onChange={(e) => setAutoRemindTime(e.target.value)}
                      onBlur={(e) => handleSaveRemindSettings(autoRemindEnabled, e.target.value)}
                      className="text-xs border border-blue-200 dark:border-blue-700 rounded px-2 py-0.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                    />
                    <span className="text-[10px] text-slate-400">毎日</span>
                  </div>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500">
                    ※現在は毎朝8:00 JSTに自動配信（Vercel Hobbyプラン）
                  </p>
                  <p className="text-[9px] text-blue-600 dark:text-blue-400">
                    AI秘書の提案に配信状況が反映されます
                  </p>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="pt-2 mt-auto">
            <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 font-bold" onClick={handleSendReminders} disabled={loadingAction !== null}>
              {loadingAction === "reminders" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
              {loadingAction === "reminders" ? "送信中..." : "今すぐリマインド配信"}
            </Button>
          </CardFooter>
        </Card>

        {/* 3. 誕生日クーポン */}
        <Card className="border-t-4 border-t-rose-500 hover:shadow-md transition-shadow h-full flex flex-col dark:bg-slate-900/50 dark:border-x-white/5 dark:border-b-white/5">
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
        <Card className="border-t-4 border-t-amber-500 hover:shadow-md transition-shadow h-full flex flex-col dark:bg-slate-900/50 dark:border-x-white/5 dark:border-b-white/5">
          <CardHeader className="pb-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-2">
              <Trophy className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">来院者限定抽選会</CardTitle>
            <CardDescription className="text-xs">
              10%の確率で自動クーポン。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-[11px] bg-slate-50 dark:bg-slate-800/50 p-3 mx-4 rounded text-amber-700 dark:text-amber-400 flex-grow">
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
        <Card className="border-t-4 border-t-pink-500 hover:shadow-md transition-shadow h-full flex flex-col dark:bg-slate-900/50 dark:border-x-white/5 dark:border-b-white/5">
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
              className="w-full h-24 border border-slate-200 dark:border-slate-800 rounded p-2 text-[10px] resize-none bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
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
        <Card className="border-t-4 border-t-blue-400 hover:shadow-md transition-shadow h-full flex flex-col dark:bg-slate-900/50 dark:border-x-white/5 dark:border-b-white/5">
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
               className="w-full h-12 border border-slate-200 dark:border-slate-800 rounded p-2 text-[10px] resize-none bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
             />
          </CardContent>
          <CardFooter className="pt-4 mt-auto">
            <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 font-bold" onClick={handleSendAreaCampaign} disabled={loadingAction !== null || !selectedCity}>
              {loadingAction === "area" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
              {loadingAction === "area" ? "送信中..." : selectedCity ? `${selectedCity}の患者様へ` : "エリア選択"}
            </Button>
          </CardFooter>
        </Card>

        {/* 7. 他院へのご紹介 */}
        <Card className="border-t-4 border-t-indigo-600 hover:shadow-md transition-shadow h-full flex flex-col bg-slate-50/30 dark:bg-slate-900/50">
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
             <div className="p-3 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-700 rounded-lg space-y-2">
                <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300 flex items-center gap-1">
                   <ExternalLink className="w-3 h-3" />
                   紹介用URL
                </p>
                <code className="text-[10px] font-semibold block bg-white dark:bg-slate-800 p-1.5 rounded truncate text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-700">
                   {typeof window !== 'undefined' ? window.location.origin : ''}/presentation
                </code>
             </div>
             <input 
               type="text" 
               placeholder="紹介先のLINE ID（空欄でテストID）" 
               value={referralTargetId}
               onChange={(e) => setReferralTargetId(e.target.value)}
               className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-[10px] bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
             />
          </CardContent>
          <CardFooter className="pt-2 mt-auto grid grid-cols-3 gap-2">
            <Link href="/presentation" target="_blank" className="w-full">
              <Button variant="outline" className="w-full text-xs h-9 border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900 font-bold">
                資料を見る
              </Button>
            </Link>
            <Button variant="outline" className="w-full text-xs h-9 border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900 font-bold" onClick={() => setShowQr(true)}>
              <QrCode className="h-3 w-3 mr-1" />
              QRコード
            </Button>
            <Button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-9 font-bold" onClick={handleSendReferral} disabled={loadingAction !== null}>
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
