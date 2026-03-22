"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Video, MapPin, Save, Loader2, MessageSquare, Instagram, Youtube, Twitter } from "lucide-react";
import { updateClinicSettings, ClinicSettings } from "@/app/actions/settings";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function SettingsForm({ initialSettings }: { initialSettings: ClinicSettings | null }) {
  const router = useRouter();
  const [settings, setSettings] = useState<ClinicSettings | null>(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      const res = await updateClinicSettings(settings);
      if (res.success) {
        toast.success("設定を保存しました");
        alert("✅ 設定を保存しました！");
        router.refresh();
      } else {
        toast.error(res.error || "保存に失敗しました");
        alert("保存失敗: " + res.error);
      }
    } catch (err) {
      alert("例外エラー: " + err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestLine = async () => {
    const userId = prompt("LINEユーザーID（U...）を入力してください");
    if (!userId) return;
    const res = await fetch("/api/line/test", {
      method: "POST",
      body: JSON.stringify({
        userId: userId,
        accessToken: settings?.line_channel_access_token,
      }),
    });
    const data = await res.json();
    if (data.success) alert("送信成功！スマホを確認してください！");
    else alert("失敗: " + data.error);
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 border-l-4 border-slate-600 pl-3">
            ダッシュボード設定
          </h1>
          <p className="text-muted-foreground mt-2">
            AI予測やダッシュボードの表示に使われる基本目標や、SNS分析のキーワード、外部連携を設定します。
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="bg-slate-900 hover:bg-slate-800">
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          設定を保存する
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-8">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="bg-slate-50 border-b pb-4">
              <CardTitle className="flex items-center text-lg text-slate-800">
                <Settings className="w-5 h-5 mr-2 text-slate-600" />
                基本設定
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clinic_name">院名</Label>
                <Input id="clinic_name" value={settings?.clinic_name || ""} onChange={(e) => updateField("clinic_name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hero_title">キャッチコピー（HP表示用）</Label>
                <Input id="hero_title" value={settings?.hero_title || ""} onChange={(e) => updateField("hero_title", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="bg-blue-50 border-b pb-4">
              <CardTitle className="flex items-center text-lg text-slate-800">
                <Save className="w-5 h-5 mr-2 text-blue-600" />
                今月の経営目標
              </CardTitle>
              <CardDescription>今月のKPI目標数値を設定します</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>月間目標売上 (円)</Label>
                  <Input type="number" value={settings?.target_income || 0} onChange={(e) => updateField("target_income", parseInt(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>目標来院数 (人)</Label>
                  <Input type="number" value={settings?.target_patients || 0} onChange={(e) => updateField("target_patients", parseInt(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>目標新患数 (人)</Label>
                  <Input type="number" value={settings?.target_new_patients || 0} onChange={(e) => updateField("target_new_patients", parseInt(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>目標リピート率 (%)</Label>
                  <Input type="number" value={settings?.target_repeat_rate || 0} onChange={(e) => updateField("target_repeat_rate", parseInt(e.target.value))} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>目標SNSタスク数 (件)</Label>
                  <Input type="number" value={settings?.target_sns_tasks || 0} onChange={(e) => updateField("target_sns_tasks", parseInt(e.target.value))} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-green-400 ring-2 ring-green-100">
            <CardHeader className="bg-green-600 text-white border-b pb-4">
              <CardTitle className="flex items-center text-lg">
                <MessageSquare className="w-5 h-5 mr-2" />
                LINE連携設定
              </CardTitle>
              <CardDescription className="text-green-100">Messaging API の連携情報を設定します</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="line_url">LINE公式アカウントURL</Label>
                <Input id="line_url" placeholder="https://lin.ee/..." value={settings?.line_official_account_url || ""} onChange={(e) => updateField("line_official_account_url", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="line_token">Channel Access Token</Label>
                <Input id="line_token" type="password" value={settings?.line_channel_access_token || ""} onChange={(e) => updateField("line_channel_access_token", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="line_secret">Channel Secret</Label>
                <Input id="line_secret" type="password" value={settings?.line_channel_secret || ""} onChange={(e) => updateField("line_channel_secret", e.target.value)} />
              </div>
              <div className="pt-4 border-t border-green-100 flex flex-col items-center gap-4 bg-green-50/50 p-4 rounded-lg">
                <p className="font-bold text-green-700 text-lg">ここを押してテスト！</p>
                <p className="text-xs text-green-600">※保存ボタンを先に押してからテストしてね！</p>
                <Button onClick={handleTestLine} className="w-full bg-green-600 hover:bg-green-700 text-white font-black h-14 text-xl shadow-xl">
                  <MessageSquare className="w-6 h-6 mr-2" />
                  テスト送信を実行！
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="bg-rose-50 border-b pb-4">
              <CardTitle className="flex items-center text-lg text-slate-800">
                <Video className="w-5 h-5 mr-2 text-rose-500" />
                SNS・キーワード設定
              </CardTitle>
              <CardDescription>各SNSのリンクと、AIがキーワードとする項目です</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-700 border-b pb-2">SNSリンク</h4>
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-slate-400" />
                    <Input placeholder="TikTok URL" value={settings?.tiktok_url || ""} onChange={(e) => updateField("tiktok_url", e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Instagram className="w-4 h-4 text-slate-400" />
                    <Input placeholder="Instagram URL" value={settings?.instagram_url || ""} onChange={(e) => updateField("instagram_url", e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Youtube className="w-4 h-4 text-slate-400" />
                    <Input placeholder="YouTube URL" value={settings?.youtube_url || ""} onChange={(e) => updateField("youtube_url", e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Twitter className="w-4 h-4 text-slate-400" />
                    <Input placeholder="X (Twitter) URL" value={settings?.x_url || ""} onChange={(e) => updateField("x_url", e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-700">ターゲット属性（AI分析用）</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>メインのターゲット層</Label>
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
                    <Label>コンテンツのトーン</Label>
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
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-700">分析キーワード（最大5つ）</h4>
                <div className="flex flex-wrap gap-2 mb-2">
                  {(settings?.analysis_keywords || []).map(keyword => (
                    <span key={keyword} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-slate-100 text-slate-800">
                      {keyword}
                      <button onClick={() => removeKeyword(keyword)} className="ml-1.5 text-slate-400 hover:text-rose-600">&times;</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input placeholder="新しいキーワード" className="flex-1" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addKeyword()} />
                  <Button variant="secondary" onClick={addKeyword}>追加</Button>
                </div>
              </div>
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-500" /> エリア設定
                </h4>
                <div className="space-y-2">
                  <Label htmlFor="area">店舗の地域名（ローカルSEO・AI活用用）</Label>
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

