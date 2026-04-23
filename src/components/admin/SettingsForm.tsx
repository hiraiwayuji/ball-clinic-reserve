"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Video, MapPin, Save, Loader2, MessageSquare, Instagram, Youtube, Twitter, Phone, Users, Building2, Target, Globe, Clock } from "lucide-react";
import { updateClinicSettings, ClinicSettings } from "@/app/actions/settings";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { isDemo } from "@/lib/app-mode";
import DemoModeBanner from "@/components/admin/DemoModeBanner";

export default function SettingsForm({ initialSettings }: { initialSettings: ClinicSettings | null }) {
  const router = useRouter();
  const [settings, setSettings] = useState<ClinicSettings | null>(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");

  const handleSave = async () => {
    if (!settings) return;
    if (isDemo) { toast.error("デモモードでは設定を変更できません"); return; }
    setIsSaving(true);
    try {
      const res = await updateClinicSettings(settings);
      if (res.success) {
        toast.success("設定を保存しました");
        router.refresh();
      } else {
        toast.error(res.error || "保存に失敗しました");
      }
    } catch (err) {
      toast.error("例外エラーが発生しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestLine = async () => {
    const defaultId = process.env.NEXT_PUBLIC_TEST_LINE_USER_ID || "U1236495734df25789d98f15d7b2b3b46";
    const userId = prompt("LINEユーザーID（U...）を入力してください", defaultId);
    if (!userId) return;
    const res = await fetch("/api/line/test", {
      method: "POST",
      body: JSON.stringify({
        userId: userId,
        accessToken: settings?.line_channel_access_token,
      }),
    });
    const data = await res.json();
    if (data.success) toast.success("送信成功！スマホを確認してください！");
    else toast.error("失敗: " + data.error);
  };

  const updateField = (field: keyof ClinicSettings, value: any) => {
    setSettings(prev => prev ? { ...prev, [field]: value } : null);
  };

  const addKeyword = () => {
    if (!newKeyword.trim() || !settings) return;
    const currentKeywords = settings.analysis_keywords || [];
    if (!currentKeywords.includes(newKeyword.trim())) {
      updateField("analysis_keywords", [...currentKeywords, newKeyword.trim()]);
    }
    setNewKeyword("");
  };

  const removeKeyword = (keyword: string) => {
    if (!settings) return;
    updateField("analysis_keywords", (settings.analysis_keywords || []).filter(k => k !== keyword));
  };

  return (
    <div className="space-y-8 animate-in fade-in pb-12">
      <DemoModeBanner restrictions="デモモードでは設定の保存はできません。内容の閲覧のみ可能です。" />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 border-l-4 border-slate-600 dark:border-slate-400 pl-3">
            ダッシュボード設定
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            AI予測やダッシュボードの表示に使われる基本目標や、SNS分析のキーワード、外部連携を設定します。
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200">
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          設定を保存する
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-8">
          <Card className="shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
            <CardHeader className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-white/10 pb-4">
              <CardTitle className="flex items-center text-lg text-slate-800 dark:text-slate-100">
                <Settings className="w-5 h-5 mr-2 text-slate-600 dark:text-slate-400" />
                基本設定
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-white/10 pb-2 flex items-center">
                  <Settings className="w-4 h-4 mr-2" />基本プロフィール
                </h4>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="clinic_name" className="text-slate-700 dark:text-slate-300">院名</Label>
                    <Input id="clinic_name" value={settings?.clinic_name || ""} onChange={(e) => updateField("clinic_name", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hp_url" className="text-slate-700 dark:text-slate-300">ホームページURL（SEO診断用）</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <Input id="hp_url" className="pl-9" placeholder="https://..." value={settings?.hp_url || ""} onChange={(e) => updateField("hp_url", e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone_number" className="text-slate-700 dark:text-slate-300">電話番号</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <Input id="phone_number" className="pl-9" placeholder="00-0000-0000" value={settings?.phone_number || ""} onChange={(e) => updateField("phone_number", e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address" className="text-slate-700 dark:text-slate-300">住所</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <Input id="address" className="pl-9" placeholder="東京都○○区..." value={settings?.address || ""} onChange={(e) => updateField("address", e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="market_area" className="text-slate-700 dark:text-slate-300">マーケット範囲（商圏）</Label>
                    <Input id="market_area" placeholder="例：駅から徒歩10分圏内、○○市全域など" value={settings?.market_area || ""} onChange={(e) => updateField("market_area", e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/10">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-white/10 pb-2 flex items-center">
                  <Clock className="w-4 h-4 mr-2" />営業時間
                </h4>
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">営業時間（行を自由に追加できます）</Label>
                  <div className="space-y-2">
                    {(settings?.hours_lines || [""]).map((line, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input
                          placeholder={i === 0 ? "例：月〜金: 9:00〜18:00" : "例：土: 9:00〜13:00"}
                          value={line}
                          onChange={(e) => {
                            const lines = [...(settings?.hours_lines || [""])];
                            lines[i] = e.target.value;
                            updateField("hours_lines", lines);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const lines = (settings?.hours_lines || [""]).filter((_, idx) => idx !== i);
                            updateField("hours_lines", lines.length ? lines : [""]);
                          }}
                          className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0 text-lg leading-none"
                          title="この行を削除"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => updateField("hours_lines", [...(settings?.hours_lines || [""]), ""])}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1"
                  >
                    ＋ 行を追加
                  </button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hours_closed" className="text-slate-700 dark:text-slate-300">休診日・注意事項（赤字で表示）</Label>
                  <Input
                    id="hours_closed"
                    placeholder="例：※月曜定休・祝日休診"
                    value={settings?.hours_closed || ""}
                    onChange={(e) => updateField("hours_closed", e.target.value)}
                  />
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  予約ページのトップに表示されます。未入力の場合は環境変数の値が使用されます。
                </div>
                <div className="mt-2">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">プレビュー</div>
                  <div className="text-sm text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg p-3 leading-relaxed">
                    {(settings?.hours_lines || []).filter(Boolean).length > 0
                      ? (settings?.hours_lines || []).filter(Boolean).map((line, i, arr) => (
                          <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                        ))
                      : <span className="text-slate-400 dark:text-slate-500 italic">（未入力）</span>
                    }
                    {settings?.hours_closed && (
                      <><br /><span className="text-red-500 dark:text-red-400 font-medium">{settings.hours_closed}</span></>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/10">
                <div className="space-y-2">
                  <Label htmlFor="target_generation" className="text-slate-700 dark:text-slate-300">ターゲット年代</Label>
                  <div className="relative">
                    <Target className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <Input id="target_generation" className="pl-9" placeholder="例：30代〜50代、主婦層など" value={settings?.target_generation || ""} onChange={(e) => updateField("target_generation", e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/10">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-white/10 pb-2 flex items-center">
                  <Users className="w-4 h-4 mr-2" />人員・規模
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="doctor_count" className="text-slate-700 dark:text-slate-300">先生の人数（人）</Label>
                    <Input id="doctor_count" type="number" min="0" value={settings?.doctor_count || 0} onChange={(e) => updateField("doctor_count", parseInt(e.target.value))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="staff_count" className="text-slate-700 dark:text-slate-300">スタッフの人数（人）</Label>
                    <Input id="staff_count" type="number" min="0" value={settings?.staff_count || 0} onChange={(e) => updateField("staff_count", parseInt(e.target.value))} />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="branch_count" className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <Building2 className="w-4 h-4 text-slate-500 dark:text-slate-400" />分院の数
                    </Label>
                    <Input id="branch_count" type="number" min="0" value={settings?.branch_count || 0} onChange={(e) => updateField("branch_count", parseInt(e.target.value))} />
                  </div>
                </div>
                {settings?.branch_count && settings.branch_count > 1 && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                    <Building2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">多店舗運営モード</p>
                      <p>分院が複数あるため、将来的な分院別分析の対象となります。現在は本院（メイン）の情報を入力してください。</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-white/10">
                <Label htmlFor="hero_title" className="text-slate-700 dark:text-slate-300">キャッチコピー（HP表示用）</Label>
                <Input id="hero_title" value={settings?.hero_title || ""} onChange={(e) => updateField("hero_title", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
            <CardHeader className="bg-blue-50 dark:bg-blue-950/40 border-b border-slate-200 dark:border-white/10 pb-4">
              <CardTitle className="flex items-center text-lg text-slate-800 dark:text-slate-100">
                <Save className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
                今月の経営目標
              </CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">今月のKPI目標数値を設定します</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">月間目標売上 (円)</Label>
                  <Input type="number" value={settings?.target_income || 0} onChange={(e) => updateField("target_income", parseInt(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">目標来院数 (人)</Label>
                  <Input type="number" value={settings?.target_patients || 0} onChange={(e) => updateField("target_patients", parseInt(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">目標新患数 (人)</Label>
                  <Input type="number" value={settings?.target_new_patients || 0} onChange={(e) => updateField("target_new_patients", parseInt(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">目標リピート率 (%)</Label>
                  <Input type="number" value={settings?.target_repeat_rate || 0} onChange={(e) => updateField("target_repeat_rate", parseInt(e.target.value))} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label className="text-slate-700 dark:text-slate-300">目標SNSタスク数 (件)</Label>
                  <Input type="number" value={settings?.target_sns_tasks || 0} onChange={(e) => updateField("target_sns_tasks", parseInt(e.target.value))} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-green-400 dark:border-green-700 ring-2 ring-green-100 dark:ring-green-900/50 dark:bg-slate-900/50">
            <CardHeader className="bg-green-600 dark:bg-green-800 text-white border-b border-green-500 dark:border-green-700 pb-4">
              <CardTitle className="flex items-center text-lg text-white">
                <MessageSquare className="w-5 h-5 mr-2" />
                LINE連携設定
              </CardTitle>
              <CardDescription className="text-green-100">Messaging API の連携情報を設定します</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="line_url" className="text-slate-700 dark:text-slate-300">LINE公式アカウントURL</Label>
                <Input id="line_url" placeholder="https://lin.ee/..." value={settings?.line_official_account_url || ""} onChange={(e) => updateField("line_official_account_url", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="line_token" className="text-slate-700 dark:text-slate-300">Channel Access Token</Label>
                <Input id="line_token" type="password" value={settings?.line_channel_access_token || ""} onChange={(e) => updateField("line_channel_access_token", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="line_secret" className="text-slate-700 dark:text-slate-300">Channel Secret</Label>
                <Input id="line_secret" type="password" value={settings?.line_channel_secret || ""} onChange={(e) => updateField("line_channel_secret", e.target.value)} />
              </div>
              <div className="pt-4 border-t border-green-200 dark:border-green-800 flex flex-col items-center gap-4 bg-green-50 dark:bg-green-950/40 p-4 rounded-lg">
                <p className="font-bold text-green-700 dark:text-green-400 text-lg">ここを押してテスト！</p>
                <p className="text-xs text-green-600 dark:text-green-500">※保存ボタンを先に押してからテストしてね！</p>
                <Button onClick={handleTestLine} className="w-full bg-green-600 hover:bg-green-700 text-white font-black h-14 text-xl shadow-xl">
                  <MessageSquare className="w-6 h-6 mr-2" />
                  テスト送信を実行！
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
            <CardHeader className="bg-rose-50 dark:bg-rose-950/40 border-b border-slate-200 dark:border-white/10 pb-4">
              <CardTitle className="flex items-center text-lg text-slate-800 dark:text-slate-100">
                <Video className="w-5 h-5 mr-2 text-rose-500 dark:text-rose-400" />
                SNS・キーワード設定
              </CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">各SNSのリンクと、AIがキーワードとする項目です</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-white/10 pb-2">SNSリンク</h4>
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-slate-400 shrink-0" />
                    <Input placeholder="TikTok URL" value={settings?.tiktok_url || ""} onChange={(e) => updateField("tiktok_url", e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Instagram className="w-4 h-4 text-slate-400 shrink-0" />
                    <Input placeholder="Instagram URL" value={settings?.instagram_url || ""} onChange={(e) => updateField("instagram_url", e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Youtube className="w-4 h-4 text-slate-400 shrink-0" />
                    <Input placeholder="YouTube URL" value={settings?.youtube_url || ""} onChange={(e) => updateField("youtube_url", e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Twitter className="w-4 h-4 text-slate-400 shrink-0" />
                    <Input placeholder="X (Twitter) URL" value={settings?.x_url || ""} onChange={(e) => updateField("x_url", e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/10">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">ターゲット属性（AI分析用）</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-slate-300">メインのターゲット層</Label>
                    <Select value={settings?.target_persona || ""} onValueChange={(val) => updateField("target_persona", val)}>
                      <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="women2030">20代〜30代 女性（美容・姿勢）</SelectItem>
                        <SelectItem value="women3040">30代〜40代 女性（産後・肩こり）</SelectItem>
                        <SelectItem value="men3050">30代〜50代 男性（腰痛・疲労）</SelectItem>
                        <SelectItem value="senior">60代以上（ひざ・関節痛）</SelectItem>
                        <SelectItem value="sports">学生・アスリート（スポーツ障害）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-slate-300">コンテンツのトーン</Label>
                    <Select value={settings?.video_tone || ""} onValueChange={(val) => updateField("video_tone", val)}>
                      <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">専門的・権威的（解説メイン）</SelectItem>
                        <SelectItem value="friendly">親しみやすい（エンタメ・共感）</SelectItem>
                        <SelectItem value="energetic">エネルギッシュ（一緒に運動）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/10">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">分析キーワード（最大5つ）</h4>
                <div className="flex flex-wrap gap-2 mb-2">
                  {(settings?.analysis_keywords || []).map(keyword => (
                    <span key={keyword} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                      {keyword}
                      <button onClick={() => removeKeyword(keyword)} className="ml-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">&times;</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input placeholder="新しいキーワード" className="flex-1" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addKeyword()} />
                  <Button variant="secondary" onClick={addKeyword}>追加</Button>
                </div>
              </div>
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/10">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400" /> エリア設定
                </h4>
                <div className="space-y-2">
                  <Label htmlFor="area" className="text-slate-700 dark:text-slate-300">店舗の地域名（ローカルSEO・AI活用用）</Label>
                  <Input id="area" value={settings?.area_name || ""} onChange={(e) => updateField("area_name", e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
