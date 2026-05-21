"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Loader2, MessageSquare, Video, Settings, Target, MapPin, Hash } from "lucide-react";
import { ClinicSettings, updateClinicSettings } from "@/app/actions/settings";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import LPSettingsEditor from "./LPSettingsEditor";
import PaymentCategoriesEditor from "./PaymentCategoriesEditor";

export default function SettingsEditor({ initialSettings }: { initialSettings: ClinicSettings | null }) {
  const router = useRouter();
  const [settings, setSettings] = useState<ClinicSettings | null>(initialSettings);
  const [isSaving, setIsSaving] = useState(false);

  
    const handleSave = async () => {
    if (!settings) {
      toast.error("設定が読み込まれていません");
      return;
    }
    setIsSaving(true);
    try {
      const result = await updateClinicSettings(settings);
      if (result.success) {
        toast.success("設定を保存しました");
        router.push("/admin/settings");
        router.refresh();
      } else {
        toast.error("保存失敗: " + result.error);
      }
    } catch (err) {
      console.error("保存エラー:", err);
      toast.error("例外エラーが発生しました");
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
    if (data.success) toast.success("送信成功！スマホを確認してください！");
    else toast.error("失敗: " + data.error);
  };

  const updateField = (field: keyof ClinicSettings, value: any) => {
    setSettings(prev => prev ? { ...prev, [field]: value } : null);
  };

  return (
    <div className="space-y-8 p-6 pb-20">
      <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border">
        <h1 className="text-3xl font-bold border-l-4 border-blue-600 pl-3">設定編集</h1>
        <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 h-12 px-8 text-lg font-bold shadow-lg transition-all">
          {isSaving ? <Loader2 className="mr-2 animate-spin" /> : <Save className="mr-2" />}
          設定を保存する
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* 基本設定 */}
          <Card className="shadow-sm">
            <CardHeader className="bg-slate-50 border-b"><CardTitle className="text-lg flex items-center gap-2"><Settings className="w-5 h-5 text-slate-500" /> 基本設定</CardTitle></CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-bold">院名</Label><Input value={settings?.clinic_name || ""} onChange={(e) => updateField("clinic_name", e.target.value)} /></div>
                <div className="space-y-2"><Label className="font-bold">キャッチコピー</Label><Input value={settings?.hero_title || ""} onChange={(e) => updateField("hero_title", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-bold">予約枠サイズ</Label>
                  <select
                    value={settings?.slot_duration_minutes ?? 30}
                    onChange={(e) => updateField("slot_duration_minutes", parseInt(e.target.value, 10) as 15 | 20 | 30)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value={15}>15分刻み</option>
                    <option value={20}>20分刻み</option>
                    <option value={30}>30分刻み</option>
                  </select>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    予約画面に表示する時間の刻みです。<br />
                    予約 1 件あたりの所要時間はメニュー側で別途設定します。
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">ダッシュボードの予約ビュー</Label>
                  <select
                    value={settings?.view_type ?? "list"}
                    onChange={(e) => updateField("view_type", e.target.value as "list" | "timeline")}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="list">一覧ビュー（従来）</option>
                    <option value="timeline">タイムテーブル（先生×時間軸）</option>
                  </select>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    タイムテーブルは手書き予約表のように<br />
                    先生ごとに横並びで表示します。
                  </p>
                </div>
              </div>

              {/* 営業時間（予約スロット範囲） */}
              <div className="border-t pt-4 mt-2 space-y-3">
                <Label className="font-bold">営業時間（予約画面・予約一覧のグリッド範囲）</Label>
                <p className="text-xs text-slate-500 -mt-1">
                  ここで設定した時間が、患者向け予約画面と /admin/appointments のグリッド範囲になります。
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">平日 開始</Label>
                    <Input type="time" value={settings?.business_open_weekday ?? ""} placeholder="12:00"
                      onChange={(e) => updateField("business_open_weekday", e.target.value || null)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">平日 終了</Label>
                    <Input type="time" value={settings?.business_close_weekday ?? ""} placeholder="22:30"
                      onChange={(e) => updateField("business_close_weekday", e.target.value || null)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">土曜 開始</Label>
                    <Input type="time" value={settings?.business_open_saturday ?? ""} placeholder="10:00"
                      onChange={(e) => updateField("business_open_saturday", e.target.value || null)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">土曜 終了</Label>
                    <Input type="time" value={settings?.business_close_saturday ?? ""} placeholder="17:30"
                      onChange={(e) => updateField("business_close_saturday", e.target.value || null)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">休診曜日</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { v: 0, label: "日" },
                      { v: 1, label: "月" },
                      { v: 2, label: "火" },
                      { v: 3, label: "水" },
                      { v: 4, label: "木" },
                      { v: 5, label: "金" },
                      { v: 6, label: "土" },
                    ].map(({ v, label }) => {
                      const current = (settings?.closed_weekdays ?? "0,3")
                        .split(",")
                        .map((s) => parseInt(s.trim(), 10))
                        .filter((n) => Number.isInteger(n));
                      const isOn = current.includes(v);
                      const toggle = () => {
                        const next = isOn ? current.filter((n) => n !== v) : [...current, v];
                        next.sort((a, b) => a - b);
                        updateField("closed_weekdays", next.join(","));
                      };
                      return (
                        <button key={v} type="button" onClick={toggle}
                          className={`px-3 py-1.5 rounded-md text-xs font-bold border transition-colors ${
                            isOn ? "bg-rose-100 border-rose-300 text-rose-700" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-500">クリックで切替（赤=休診）。祝日は別途「定休日（祝日）」設定で管理。</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 今月の経営目標 */}
          <Card className="border-blue-100 shadow-sm">
            <CardHeader className="bg-blue-50 border-b"><CardTitle className="text-lg flex items-center gap-2 text-blue-800"><Target className="w-5 h-5" /> 今月の経営目標</CardTitle></CardHeader>
            <CardContent className="pt-6 grid grid-cols-2 gap-6">
              <div className="space-y-2"><Label className="font-bold">月間目標売上 (円)</Label><Input value={settings?.target_income ?? ""} onChange={(e) => updateField("target_income", parseInt(e.target.value.replace(/\D/g, "")) || 0)} /></div>
              <div className="space-y-2"><Label className="font-bold">目標来院数 (人)</Label><Input type="number" value={settings?.target_patients ?? 0} onChange={(e) => updateField("target_patients", parseInt(e.target.value) || 0)} /></div>
            </CardContent>
          </Card>

          {/* 患者向けLP設定 */}
          <LPSettingsEditor settings={settings} updateField={updateField} />

          {/* 支払区分マスタ */}
          <PaymentCategoriesEditor />

          {/* LINE連携設定（ここを一番目立つようにしました！） */}
          <Card className="border-green-400 shadow-md ring-2 ring-green-100">
            <CardHeader className="bg-green-600 text-white border-b"><CardTitle className="text-lg flex items-center gap-2"><MessageSquare className="w-5 h-5" /> LINE連携設定</CardTitle></CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label className="font-bold text-green-800">Channel Access Token</Label>
                <Input 
                  className="border-green-300 focus:ring-green-500 font-mono text-xs"
                  value={settings?.line_channel_access_token || ""} 
                  onChange={(e) => updateField("line_channel_access_token", e.target.value)}
                  placeholder="ターミナルで出した長い英数字を貼り付け"
                />
              </div>
              <div className="pt-6 border-t border-green-100 flex flex-col items-center gap-4 bg-green-50/50 p-4 rounded-b-lg">
                <div className="text-center space-y-1">
                  <p className="font-bold text-green-700 text-lg underline underline-offset-4 decoration-green-300">ここを押してテスト！</p>
                  <p className="text-xs text-green-600 opacity-80">※保存ボタンを先に押してからテストしてね！</p>
                </div>
                <Button 
                  onClick={handleTestLine} 
                  variant="default" 
                  className="w-full max-w-sm bg-green-600 hover:bg-green-700 text-white font-black h-16 text-xl shadow-xl transform active:scale-95 transition-all flex items-center justify-center gap-3 animate-pulse hover:animate-none"
                >
                  <MessageSquare className="w-8 h-8" />
                  テスト送信を実行！
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 右側サイドバー：SNSリンクなど */}
        <div className="space-y-8">
          <Card className="shadow-sm">
            <CardHeader className="bg-rose-50 border-b"><CardTitle className="text-lg flex items-center gap-2 text-rose-700"><Video className="w-5 h-5" /> SNSリンク</CardTitle></CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2"><Label className="text-xs">TikTok</Label><Input value={settings?.tiktok_url || ""} onChange={(e) => updateField("tiktok_url", e.target.value)} /></div>
              <div className="space-y-2"><Label className="text-xs">Instagram</Label><Input value={settings?.instagram_url || ""} onChange={(e) => updateField("instagram_url", e.target.value)} /></div>
              <div className="space-y-2"><Label className="text-xs">YouTube</Label><Input value={settings?.youtube_url || ""} onChange={(e) => updateField("youtube_url", e.target.value)} /></div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="bg-amber-50 border-b"><CardTitle className="text-lg flex items-center gap-2 text-amber-700"><MapPin className="w-5 h-5" /> エリア設定</CardTitle></CardHeader>
            <CardContent className="pt-6"><Input value={settings?.area_name || ""} onChange={(e) => updateField("area_name", e.target.value)} /></CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

