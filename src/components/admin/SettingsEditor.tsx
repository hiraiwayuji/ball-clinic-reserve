"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Loader2, MessageSquare, Video, Settings, Target, MapPin, Hash, Coins } from "lucide-react";
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
                <Label className="font-bold">公開予約時間（患者向け予約画面）</Label>
                <p className="text-xs text-slate-500 -mt-1">
                  ここで設定した時間が、患者向け予約画面の予約可能スロット範囲になります。<br />
                  管理画面のタイムテーブルは下の「管理画面タイムテーブル表示時間」を優先します（未設定ならここと同じ）。
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

                {/* 院全体の休憩時間（昼休み等） */}
                <div className="border-t pt-3 mt-2 space-y-2">
                  <Label className="font-bold text-sm">休憩時間（昼休み等）</Label>
                  <p className="text-[11px] text-slate-500 -mt-1">
                    設定すると、その時間帯は患者向け予約サイトのスロットから除外されます（予約不可）。<br />
                    使わない院は空欄のままで OK。
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">平日 休憩 開始</Label>
                      <Input type="time" value={(settings?.business_break_start_weekday ?? "").slice(0, 5)} placeholder="12:00"
                        onChange={(e) => updateField("business_break_start_weekday", e.target.value || null)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">平日 休憩 終了</Label>
                      <Input type="time" value={(settings?.business_break_end_weekday ?? "").slice(0, 5)} placeholder="14:00"
                        onChange={(e) => updateField("business_break_end_weekday", e.target.value || null)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">土曜 休憩 開始</Label>
                      <Input type="time" value={(settings?.business_break_start_saturday ?? "").slice(0, 5)} placeholder=""
                        onChange={(e) => updateField("business_break_start_saturday", e.target.value || null)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">土曜 休憩 終了</Label>
                      <Input type="time" value={(settings?.business_break_end_saturday ?? "").slice(0, 5)} placeholder=""
                        onChange={(e) => updateField("business_break_end_saturday", e.target.value || null)} />
                    </div>
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

              {/* 管理画面タイムテーブル専用の表示時間（任意） */}
              <div className="border-t pt-4 mt-2 space-y-3">
                <Label className="font-bold">管理画面タイムテーブル表示時間（任意）</Label>
                <p className="text-xs text-slate-500 -mt-1">
                  予約タイムテーブル（スタッフ別ビュー）の表示範囲をここで上書きできます。<br />
                  例：公開は 10:00-20:00 だけど、管理画面では準備時間を含めて 9:00-21:00 まで表示したい場合に使用。<br />
                  <span className="text-amber-600 font-semibold">空欄ならば上の公開予約時間がそのまま使われます。</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">平日 開始（管理画面）</Label>
                    <Input type="time" value={settings?.admin_timeline_open_weekday ?? ""} placeholder="例: 09:00"
                      onChange={(e) => updateField("admin_timeline_open_weekday", e.target.value || null)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">平日 終了（管理画面）</Label>
                    <Input type="time" value={settings?.admin_timeline_close_weekday ?? ""} placeholder="例: 21:00"
                      onChange={(e) => updateField("admin_timeline_close_weekday", e.target.value || null)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">土曜 開始（管理画面）</Label>
                    <Input type="time" value={settings?.admin_timeline_open_saturday ?? ""} placeholder="例: 09:00"
                      onChange={(e) => updateField("admin_timeline_open_saturday", e.target.value || null)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">土曜 終了（管理画面）</Label>
                    <Input type="time" value={settings?.admin_timeline_close_saturday ?? ""} placeholder="例: 21:00"
                      onChange={(e) => updateField("admin_timeline_close_saturday", e.target.value || null)} />
                  </div>
                </div>
              </div>

              {/* 経費管理の表示制限 */}
              <div className="border-t pt-4 mt-2 space-y-3">
                <Label className="font-bold flex items-center gap-2">
                  <Coins className="w-4 h-4 text-emerald-600" /> 経費管理の表示制限
                </Label>
                <p className="text-xs text-slate-500 -mt-1">
                  ON にすると、オーナー（role = owner）以外のスタッフからは<br />
                  経費管理に関する画面・ショートカット・メニューが完全に見えなくなります。<br />
                  ダッシュボードの「経費入力へのショートカット」も非表示になり、<code className="px-1 bg-slate-100 rounded">/admin/expenses</code> へ直接アクセスしてもダッシュボードに戻されます。
                </p>
                <label className="inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings?.expense_owner_only === true}
                    onChange={(e) => updateField("expense_owner_only", e.target.checked)}
                    className="w-5 h-5 accent-emerald-600"
                  />
                  <span className="ml-2 text-sm font-medium">経費管理をオーナー専用にする（スタッフから完全非表示）</span>
                </label>
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
              <div className="space-y-2 pt-4 border-t border-green-100">
                <Label className="font-bold text-green-800">ショップカードURL（来院スタンプ加算用）</Label>
                <Input
                  className="border-green-300 focus:ring-green-500 text-xs"
                  value={settings?.line_stamp_card_url || ""}
                  onChange={(e) => updateField("line_stamp_card_url", e.target.value)}
                  placeholder="https://shop.line.me/.../point"
                />
                <p className="text-[11px] text-green-700 leading-relaxed">
                  LINE Manager の「ショップカード」設定画面で発行した「ポイント獲得用 URL」を貼り付け。<br />
                  設定済みなら、会計完了時に患者へ LINE 通知が飛び、このURLをタップしてスタンプ自動加算できる。<br />
                  空欄なら通常の御礼メッセージのみ送信。
                </p>
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

