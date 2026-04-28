"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, Trash2, Image as ImageIcon, Palette, Quote } from "lucide-react";
import type { ClinicSettings } from "@/app/actions/settings";

const THEME_COLORS: { key: string; label: string; classes: string }[] = [
  { key: "blue", label: "ブルー", classes: "bg-blue-500" },
  { key: "violet", label: "バイオレット", classes: "bg-violet-500" },
  { key: "emerald", label: "エメラルド", classes: "bg-emerald-500" },
  { key: "amber", label: "アンバー", classes: "bg-amber-500" },
  { key: "orange", label: "オレンジ", classes: "bg-orange-500" },
  { key: "rose", label: "ローズ", classes: "bg-rose-500" },
  { key: "sky", label: "スカイ", classes: "bg-sky-500" },
  { key: "teal", label: "ティール", classes: "bg-teal-500" },
  { key: "indigo", label: "インディゴ", classes: "bg-indigo-500" },
];

const FEATURE_ICONS = ["sparkles", "activity", "heart", "award", "shield", "smile", "zap", "stethoscope"];

interface Props {
  settings: ClinicSettings | null;
  updateField: (field: keyof ClinicSettings, value: any) => void;
}

export default function LPSettingsEditor({ settings, updateField }: Props) {
  const features = (settings?.lp_features as { icon?: string; title: string; description?: string }[]) ?? [];
  const problems = (settings?.lp_target_problems as string[]) ?? [];
  const themeColor = settings?.theme_color || "blue";

  const setFeature = (i: number, patch: Partial<{ icon: string; title: string; description: string }>) => {
    const next = features.map((f, idx) => (idx === i ? { ...f, ...patch } : f));
    updateField("lp_features", next);
  };
  const addFeature = () => {
    updateField("lp_features", [...features, { icon: "sparkles", title: "", description: "" }]);
  };
  const removeFeature = (i: number) => {
    updateField("lp_features", features.filter((_, idx) => idx !== i));
  };

  const setProblem = (i: number, value: string) => {
    const next = problems.map((p, idx) => (idx === i ? value : p));
    updateField("lp_target_problems", next);
  };
  const addProblem = () => {
    updateField("lp_target_problems", [...problems, ""]);
  };
  const removeProblem = (i: number) => {
    updateField("lp_target_problems", problems.filter((_, idx) => idx !== i));
  };

  return (
    <Card className="border-purple-200 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50 border-b">
        <CardTitle className="text-lg flex items-center gap-2 text-purple-800">
          <Sparkles className="w-5 h-5" />
          患者向けLP（予約ページ）設定
        </CardTitle>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
          /reserve と /reserve/menu に表示される、患者さん向けランディングページの内容を編集できます。
          ホットペッパー風のクーポン一覧と、院の魅力を伝えるヒーロー・強み・お悩みリストが揃います。
        </p>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {/* テーマカラー */}
        <div className="space-y-2">
          <Label className="font-bold flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-purple-500" />
            LP テーマカラー
          </Label>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {THEME_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => updateField("theme_color", c.key)}
                className={`relative h-12 rounded-lg ${c.classes} flex items-end justify-center pb-1 text-[10px] font-bold text-white transition-all ${
                  themeColor === c.key ? "ring-2 ring-offset-2 ring-slate-900 scale-105" : "opacity-70 hover:opacity-100"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">クリニックのブランドに合わせて選んでください。LP全体の色合いが変わります。</p>
        </div>

        {/* ヒーロー */}
        <div className="space-y-3 pt-3 border-t">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">ヒーローセクション</p>

          <div className="space-y-2">
            <Label className="font-bold">サブキャッチコピー</Label>
            <Input
              value={settings?.hero_subtitle || ""}
              onChange={(e) => updateField("hero_subtitle", e.target.value)}
              placeholder="例: メディセル筋膜リリースで慢性痛を根本から改善"
            />
            <p className="text-[11px] text-slate-500">院名の下に出る一行のメッセージ。患者さんの心に届く言葉を。</p>
          </div>

          <div className="space-y-2">
            <Label className="font-bold flex items-center gap-1">
              <ImageIcon className="w-4 h-4" />
              メインビジュアル画像URL
            </Label>
            <Input
              value={settings?.hero_image_url || ""}
              onChange={(e) => updateField("hero_image_url", e.target.value)}
              placeholder="https://... 横長 1200x600 推奨"
            />
            {settings?.hero_image_url && (
              <div className="mt-2 max-w-md aspect-[16/9] rounded-lg overflow-hidden border bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={settings.hero_image_url} alt="プレビュー" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="font-bold flex items-center gap-1">
              <ImageIcon className="w-4 h-4" />
              背景画像URL（任意）
            </Label>
            <Input
              value={settings?.hero_background_url || ""}
              onChange={(e) => updateField("hero_background_url", e.target.value)}
              placeholder="https://... ヒーロー全体の背景に使う画像（任意）"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-bold">CTAボタンの文言</Label>
            <Input
              value={settings?.lp_cta_text || ""}
              onChange={(e) => updateField("lp_cta_text", e.target.value)}
              placeholder="例: クーポン・メニューから予約する"
            />
          </div>
        </div>

        {/* お悩みリスト */}
        <div className="space-y-3 pt-3 border-t">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">お悩みリスト（こんなお悩みありませんか？）</p>
            <Button type="button" size="sm" variant="outline" onClick={addProblem}>
              <Plus className="w-3 h-3 mr-1" />
              追加
            </Button>
          </div>
          {problems.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3 border rounded border-dashed">
              「どこに行っても良くならない慢性痛」「ぎっくり腰」など、ターゲットの悩みを箇条書きで
            </p>
          ) : (
            <div className="space-y-2">
              {problems.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={p}
                    onChange={(e) => setProblem(i, e.target.value)}
                    placeholder={i === 0 ? "例: どこに行っても良くならない慢性痛" : ""}
                    className="flex-1"
                  />
                  <Button type="button" size="icon" variant="ghost" className="text-slate-400 hover:text-red-500" onClick={() => removeProblem(i)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 強み */}
        <div className="space-y-3 pt-3 border-t">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">院の強み</p>
            <Button type="button" size="sm" variant="outline" onClick={addFeature}>
              <Plus className="w-3 h-3 mr-1" />
              追加
            </Button>
          </div>
          {features.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3 border rounded border-dashed">
              「メディセル筋膜リリース」「高気圧水素浴」など、当院の特徴的な施術や設備を
            </p>
          ) : (
            <div className="space-y-3">
              {features.map((f, i) => (
                <div key={i} className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={f.icon || "sparkles"}
                      onChange={(e) => setFeature(i, { icon: e.target.value })}
                      className="h-9 px-2 rounded-md border bg-white text-sm"
                    >
                      {FEATURE_ICONS.map((ic) => (
                        <option key={ic} value={ic}>{ic}</option>
                      ))}
                    </select>
                    <Input
                      value={f.title}
                      onChange={(e) => setFeature(i, { title: e.target.value })}
                      placeholder="例: メディセル筋膜リリース"
                      className="flex-1"
                    />
                    <Button type="button" size="icon" variant="ghost" className="text-slate-400 hover:text-red-500" onClick={() => removeFeature(i)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <Input
                    value={f.description || ""}
                    onChange={(e) => setFeature(i, { description: e.target.value })}
                    placeholder="説明文（吸って・引いて・はがす独自手技で...）"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 患者の声 */}
        <div className="space-y-3 pt-3 border-t">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
            <Quote className="w-3.5 h-3.5" />
            代表的な患者さんの声
          </p>
          <div className="space-y-2">
            <Label className="font-bold">声（短文 1〜2行）</Label>
            <Input
              value={settings?.lp_voice_quote || ""}
              onChange={(e) => updateField("lp_voice_quote", e.target.value)}
              placeholder="例: 何年も悩んでいた腰痛が、初回で軽くなって驚きました"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-bold">声の発信者属性</Label>
            <Input
              value={settings?.lp_voice_author || ""}
              onChange={(e) => updateField("lp_voice_author", e.target.value)}
              placeholder="例: 30代女性 会社員"
            />
          </div>
        </div>

        <div className="pt-3 border-t bg-amber-50 -mx-6 -mb-6 p-4 rounded-b">
          <p className="text-xs text-amber-800 leading-relaxed">
            💡 <strong>ヒント：</strong> 公式HPの「お悩み」「特徴」「症例」セクションから3〜5つ程度ピックアップして転記すると、患者さんに刺さるLPになります。
            メイン画像は施術風景や院内が信頼感を与えやすいです。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
