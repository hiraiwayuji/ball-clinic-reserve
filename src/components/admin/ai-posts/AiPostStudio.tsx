"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Loader2,
  Save,
  AlertTriangle,
  Instagram,
  MapPin,
  MessageCircle,
  FileText,
  Images,
  RefreshCw,
  Lock,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import CopyButton from "./CopyButton";
import OpenInstagramButton from "./OpenInstagramButton";
import MaterialUploader from "./MaterialUploader";
import VoiceInput from "./VoiceInput";
import { ImagePackCard, ReelPackCard, AiImagePackCard, StoryExtrasCard } from "./PackCards";
import {
  POST_CATEGORIES,
  AUDIENCES,
  SPORTS,
  TONES,
  REGEN_MODES,
  MEDIA_MODES,
  PREMIUM_FEATURES,
  blogToPlainText,
  storyToPlainText,
  type GeneratedPost,
  type PostInput,
  type OutputChannel,
  type RegenMode,
  type BlogDraft,
  type Material,
  type MediaMode,
  type ImagePack,
  type ReelPack,
  type AiImagePack,
} from "@/lib/ai-marketing";
import {
  generateMarketingPost,
  generateImagePack,
  generateReelPack,
  generateAiImagePack,
  analyzePhoto,
  regenerateChannel,
  saveMarketingPost,
  getMarketingAccess,
} from "@/app/actions/ai-marketing";
import { Camera } from "lucide-react";

const NONE = "__none__";

export type PrefillData = {
  key: number; // 同じ内容でも再適用させるためのトリガー
  category?: string;
  audience?: string;
  sport?: string;
  theme?: string;
  treatment?: string;
  message?: string;
};

type Props = {
  onSaved?: () => void;
  prefill?: PrefillData | null;
};

export default function AiPostStudio({ onSaved, prefill }: Props) {
  // ── 入力 ──
  const [category, setCategory] = useState<string>(POST_CATEGORIES[0]);
  const [audience, setAudience] = useState<string>(NONE);
  const [sport, setSport] = useState<string>(NONE);
  const [theme, setTheme] = useState("");
  const [treatment, setTreatment] = useState("");
  const [message, setMessage] = useState("");
  const [hasMedia, setHasMedia] = useState(false);
  const [tone, setTone] = useState<string>(NONE);
  const [notes, setNotes] = useState("");
  const [noPersonalInfo, setNoPersonalInfo] = useState(true);

  // ── 素材・制作モード ──
  const [materials, setMaterials] = useState<Material[]>([]);
  const [modes, setModes] = useState<MediaMode[]>([]);
  const [videoContext, setVideoContext] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");

  // ── 状態 ──
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<GeneratedPost | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [regenLoading, setRegenLoading] = useState<string | null>(null);

  // ── 画像/動画/AI画像 パック ──
  const [imagePack, setImagePack] = useState<ImagePack | null>(null);
  const [reelPack, setReelPack] = useState<ReelPack | null>(null);
  const [aiImagePack, setAiImagePack] = useState<AiImagePack | null>(null);

  // ── プラン（フリーミアム）──
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  useEffect(() => {
    getMarketingAccess().then((a) => setIsPremium(a.isPremium)).catch(() => setIsPremium(false));
  }, []);

  // ── ネタ提案からのプリフィル ──
  useEffect(() => {
    if (!prefill) return;
    if (prefill.category) setCategory(prefill.category);
    if (prefill.audience) setAudience(prefill.audience);
    if (prefill.sport) setSport(prefill.sport);
    if (prefill.theme) setTheme(prefill.theme);
    if (prefill.treatment) setTreatment(prefill.treatment);
    if (prefill.message) setMessage(prefill.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.key]);

  // ── 写真から下書き ──
  const [analyzing, setAnalyzing] = useState(false);
  const [privacyWarnings, setPrivacyWarnings] = useState<string[]>([]);

  async function handleAnalyzePhoto() {
    const firstImage = materials.find((m) => m.category === "image");
    if (!firstImage) {
      toast.error("先に写真をアップロードしてください");
      return;
    }
    setAnalyzing(true);
    setPrivacyWarnings([]);
    try {
      const res = await analyzePhoto(firstImage.url);
      if (!res.success || !res.suggestion) {
        toast.error(res.error || "写真の解析に失敗しました");
        return;
      }
      const s = res.suggestion;
      if (s.category) setCategory(s.category);
      if (s.audience) setAudience(s.audience);
      if (s.sport) setSport(s.sport);
      if (s.theme) setTheme(s.theme);
      if (s.treatment) setTreatment(s.treatment);
      if (s.message) setMessage(s.message);
      setPrivacyWarnings(s.privacy_warnings || []);
      toast.success("写真から下書きを入れました");
    } finally {
      setAnalyzing(false);
    }
  }

  function appendText(setter: (v: string) => void, current: string, add: string) {
    const sep = current.trim() ? (current.endsWith("\n") ? "" : "\n") : "";
    setter(current + sep + add);
  }

  function toggleMode(m: MediaMode) {
    setModes((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }
  // プレミアム限定機能。無料プランでは生成しない（サーバー側でも二重にガード）。
  const wantImage = isPremium === true && (modes.includes("photo") || modes.includes("canva") || modes.includes("blog-eyecatch"));
  const wantReel = isPremium === true && (modes.includes("video") || modes.includes("reel"));
  const wantAiImage = isPremium === true && (modes.includes("ai-image") || modes.includes("blog-eyecatch"));
  const showVideoCtx = wantReel;

  function buildInput(): PostInput {
    return {
      category,
      audience: audience === NONE ? "" : audience,
      sport: sport === NONE ? "" : sport,
      theme: theme.trim(),
      treatment: treatment.trim(),
      message: message.trim(),
      has_media: hasMedia || materials.length > 0,
      tone: tone === NONE ? "" : tone,
      notes: notes.trim(),
      no_personal_info: noPersonalInfo,
    };
  }

  async function handleGenerate() {
    setGenerating(true);
    setResult(null);
    setWarnings([]);
    setImagePack(null);
    setReelPack(null);
    setAiImagePack(null);
    try {
      const input = buildInput();
      // 文章（基本）と各パックを同時に走らせる
      const tasks: Promise<{ warns: string[] }>[] = [];

      tasks.push(
        generateMarketingPost(input).then((res) => {
          if (!res.success || !res.post) throw new Error(res.error || "生成に失敗しました");
          setResult(res.post);
          return { warns: res.warnings ?? [] };
        }),
      );
      if (wantImage) {
        tasks.push(
          generateImagePack(input, materials).then((r) => {
            if (r.success && r.pack) setImagePack(r.pack);
            return { warns: r.warnings ?? [] };
          }),
        );
      }
      if (wantReel) {
        tasks.push(
          generateReelPack(input, videoContext, materials).then((r) => {
            if (r.success && r.pack) setReelPack(r.pack);
            return { warns: r.warnings ?? [] };
          }),
        );
      }
      if (wantAiImage) {
        tasks.push(
          generateAiImagePack(input).then((r) => {
            if (r.success && r.pack) setAiImagePack(r.pack);
            return { warns: r.warnings ?? [] };
          }),
        );
      }

      const settled = await Promise.allSettled(tasks);
      const baseFailed = settled[0].status === "rejected";
      if (baseFailed) {
        toast.error((settled[0] as PromiseRejectedResult).reason?.message || "生成に失敗しました");
        return;
      }
      const allWarns = settled
        .filter((s): s is PromiseFulfilledResult<{ warns: string[] }> => s.status === "fulfilled")
        .flatMap((s) => s.value.warns);
      setWarnings(Array.from(new Set(allWarns)));
      toast.success("文章・素材案を作成しました");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegen(channel: OutputChannel, mode: RegenMode) {
    if (!result) return;
    const key = `${channel}:${mode}`;
    setRegenLoading(key);
    try {
      const currentText =
        channel === "instagram"
          ? result.instagram_text
          : channel === "google"
            ? result.google_text
            : channel === "line"
              ? result.line_text
              : channel === "story"
                ? storyToPlainText(result.story_slides)
                : blogToPlainText(result.blog);
      const res = await regenerateChannel(channel, currentText, mode, buildInput());
      if (!res.success) {
        toast.error(res.error || "再生成に失敗しました");
        return;
      }
      setResult((prev) => {
        if (!prev) return prev;
        if (channel === "story" && res.story) return { ...prev, story_slides: res.story };
        if (channel === "blog" && res.blog) return { ...prev, blog: res.blog };
        if (channel === "instagram" && res.text != null) return { ...prev, instagram_text: res.text };
        if (channel === "google" && res.text != null) return { ...prev, google_text: res.text };
        if (channel === "line" && res.text != null) return { ...prev, line_text: res.text };
        return prev;
      });
      if (res.warnings?.length) setWarnings((w) => Array.from(new Set([...w, ...res.warnings!])));
      toast.success("作り直しました");
    } finally {
      setRegenLoading(null);
    }
  }

  /** 結果カードを直接編集できるよう、各フィールドの更新ヘルパ */
  function patchResult(p: Partial<GeneratedPost>) {
    setResult((prev) => (prev ? { ...prev, ...p } : prev));
  }
  function patchStory(i: number, v: string) {
    setResult((prev) => {
      if (!prev) return prev;
      const slides = [...prev.story_slides];
      slides[i] = v;
      return { ...prev, story_slides: slides };
    });
  }
  function patchBlog(p: Partial<BlogDraft>) {
    setResult((prev) => (prev && prev.blog ? { ...prev, blog: { ...prev.blog, ...p } } : prev));
  }

  async function handleSave(status: "draft" | "reviewed") {
    if (!result) return;
    setSaving(true);
    try {
      const input = buildInput();
      const res = await saveMarketingPost({
        ...input,
        instagram_text: result.instagram_text,
        story_slides: result.story_slides,
        google_text: result.google_text,
        line_text: result.line_text,
        blog: result.blog,
        status,
        materials,
        media_modes: modes,
        video_context: videoContext.trim(),
        image_pack: imagePack,
        reel_pack: reelPack,
        ai_image_pack: aiImagePack,
        story_extras: result.story_extras ?? null,
        scheduled_date: scheduledDate || null,
      });
      if (!res.success) {
        toast.error(res.error || "保存に失敗しました");
        return;
      }
      toast.success(status === "reviewed" ? "確認済みで保存しました" : "下書きを保存しました");
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  // ── 再生成ボタン群 ──
  function RegenBar({ channel }: { channel: OutputChannel }) {
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {REGEN_MODES.map((m) => {
          const key = `${channel}:${m.key}`;
          const loading = regenLoading === key;
          return (
            <Button
              key={m.key}
              type="button"
              variant="ghost"
              size="sm"
              disabled={!!regenLoading}
              onClick={() => handleRegen(channel, m.key)}
              className="h-7 px-2 text-xs text-slate-600 border border-slate-200"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {m.label}
            </Button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── 入力フォーム ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-blue-600" />
            AI投稿作成フォーム
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>投稿カテゴリ</Label>
              <Select value={category} onValueChange={(v) => v && setCategory(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POST_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>対象</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v ?? NONE)}>
                <SelectTrigger><SelectValue placeholder="指定なし" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>指定なし</SelectItem>
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>スポーツ種別</Label>
              <Select value={sport} onValueChange={(v) => setSport(v ?? NONE)}>
                <SelectTrigger><SelectValue placeholder="指定なし" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>指定なし</SelectItem>
                  {SPORTS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>投稿の雰囲気</Label>
              <Select value={tone} onValueChange={(v) => setTone(v ?? NONE)}>
                <SelectTrigger><SelectValue placeholder="院の既定" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>院の既定の雰囲気</SelectItem>
                  {TONES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>症状・テーマ</Label>
              <VoiceInput label="話して入力" onResult={(t) => appendText(setTheme, theme, t)} />
            </div>
            <Input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="例：膝の痛み（オスグッド）、成長期のスポーツ障害"
            />
          </div>
          <div className="space-y-1.5">
            <Label>施術内容</Label>
            <Input
              value={treatment}
              onChange={(e) => setTreatment(e.target.value)}
              placeholder="例：音叉療法、姿勢チェック、トレーニング指導"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>伝えたいこと</Label>
              <VoiceInput label="話して入力" onResult={(t) => appendText(setMessage, message, t)} />
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="例：早めの相談で悪化を防げること。スポーツを続けながらケアできること。"
              rows={3}
            />
            <p className="text-xs text-slate-400">マイクボタンで、話した内容をそのまま文字にできます。</p>
          </div>
          <div className="space-y-1.5">
            <Label>注意事項（任意）</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例：断定的な表現は避ける、日付は入れない など"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hasMedia}
                onChange={(e) => setHasMedia(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              写真や動画あり
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={noPersonalInfo}
                onChange={(e) => setNoPersonalInfo(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              個人情報を含めない（患者名・学校名・顔写真など）
            </label>
          </div>

          {/* 画像・動画・生成AI画像（プレミアム限定） */}
          <div className="pt-2 border-t">
            {isPremium === false ? (
              <PremiumNotice />
            ) : (
              <div className="space-y-4">
                <MaterialUploader materials={materials} onChange={setMaterials} />

                {/* 写真から下書き（画像解析） */}
                {materials.some((m) => m.category === "image") && (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAnalyzePhoto}
                      disabled={analyzing}
                      className="w-full sm:w-auto border-blue-300 text-blue-700"
                    >
                      {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                      {analyzing ? "写真を読み取り中..." : "写真から下書きを作る"}
                    </Button>
                    {privacyWarnings.length > 0 && (
                      <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-semibold">写真に個人が特定できそうな写り込みがあります：</span>
                          <span className="ml-1">{privacyWarnings.join(" / ")}</span>
                          <div className="text-xs text-red-600 mt-0.5">投稿前に、ぼかす・トリミングするなどご確認ください。</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 制作モード（複数選択可） */}
                <div className="space-y-1.5">
                  <Label>何を作りますか？（複数選べます）</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {MEDIA_MODES.map((m) => {
                      const active = modes.includes(m.key);
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => toggleMode(m.key)}
                          className={
                            active
                              ? "px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-600 text-white"
                              : "px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400">
                    選んだ内容に合わせて、画像投稿用・リール用・生成AI画像プロンプトも一緒に作ります。何も選ばなければ文章だけ作ります。
                  </p>
                </div>

                {/* 動画の内容（リール/動画モード時） */}
                {showVideoCtx && (
                  <div className="space-y-1.5">
                    <Label>動画の内容（箇条書きでOK・リールの構成づくりに使います）</Label>
                    <Textarea
                      value={videoContext}
                      onChange={(e) => setVideoContext(e.target.value)}
                      placeholder="例：オスグッドのストレッチを実演。膝下を伸ばす→太ももの前を伸ばす→アイシングの順。最後に「無理せず相談を」で締め。"
                      rows={3}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 投稿予定日 */}
          <div className="space-y-1.5">
            <Label>投稿予定日（任意）</Label>
            <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="sm:w-48" />
          </div>

          <Button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="w-full sm:w-auto"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? "作成中..." : isPremium ? "AIで文章・素材案を作成" : "AIで文章を作成"}
          </Button>
        </CardContent>
      </Card>

      {/* ── 結果 ── */}
      {result && (
        <div className="space-y-4">
          {warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">医療広告ガイドラインに配慮し、自動で言い換えた表現があります：</span>
                <span className="ml-1">{warnings.join(" / ")}</span>
                <div className="text-xs text-amber-700 mt-0.5">投稿前に文章をご確認ください。</div>
              </div>
            </div>
          )}

          {/* Instagram */}
          <ResultCard
            icon={<Instagram className="w-4 h-4 text-pink-600" />}
            title="Instagram投稿文"
            copyText={() => result.instagram_text}
          >
            <Textarea
              value={result.instagram_text}
              onChange={(e) => patchResult({ instagram_text: e.target.value })}
              rows={8}
            />
            <div className="mt-2">
              <OpenInstagramButton text={() => result.instagram_text} />
            </div>
            <RegenBar channel="instagram" />
          </ResultCard>

          {/* Story */}
          <ResultCard
            icon={<Images className="w-4 h-4 text-purple-600" />}
            title="Instagramストーリー文（3枚）"
            copyText={() => storyToPlainText(result.story_slides)}
          >
            <div className="space-y-2">
              {result.story_slides.map((s, i) => (
                <div key={i}>
                  <Label className="text-xs text-slate-500">{i + 1}枚目</Label>
                  <Textarea value={s} onChange={(e) => patchStory(i, e.target.value)} rows={2} />
                </div>
              ))}
            </div>
            <RegenBar channel="story" />
          </ResultCard>

          {/* Google */}
          <ResultCard
            icon={<MapPin className="w-4 h-4 text-green-600" />}
            title="Googleビジネスプロフィール投稿文"
            copyText={() => result.google_text}
          >
            <Textarea
              value={result.google_text}
              onChange={(e) => patchResult({ google_text: e.target.value })}
              rows={5}
            />
            <div className="text-xs text-slate-400 mt-1">{result.google_text.length}文字</div>
            <RegenBar channel="google" />
          </ResultCard>

          {/* LINE */}
          <ResultCard
            icon={<MessageCircle className="w-4 h-4 text-emerald-600" />}
            title="LINE配信用文章"
            copyText={() => result.line_text}
          >
            <Textarea
              value={result.line_text}
              onChange={(e) => patchResult({ line_text: e.target.value })}
              rows={5}
            />
            <p className="text-xs text-slate-400 mt-1">
              保存すると「履歴」の詳細から、LINE連携済みの患者さんへそのまま一斉配信できます（コピペ不要）。
            </p>
            <RegenBar channel="line" />
          </ResultCard>

          {/* Blog */}
          {result.blog && (
            <ResultCard
              icon={<FileText className="w-4 h-4 text-orange-600" />}
              title="ブログ記事案"
              copyText={() => blogToPlainText(result.blog)}
            >
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-slate-500">SEOタイトル</Label>
                  <Input value={result.blog.seo_title} onChange={(e) => patchBlog({ seo_title: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">メタディスクリプション</Label>
                  <Textarea value={result.blog.meta_description} onChange={(e) => patchBlog({ meta_description: e.target.value })} rows={2} />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">想定キーワード</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {result.blog.keywords.map((k, i) => (
                      <Badge key={i} variant="secondary">{k}</Badge>
                    ))}
                    {result.blog.keywords.length === 0 && <span className="text-xs text-slate-400">（なし）</span>}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">見出し構成</Label>
                  <Textarea
                    value={result.blog.headings.join("\n")}
                    onChange={(e) => patchBlog({ headings: e.target.value.split("\n").filter((x) => x.trim()) })}
                    rows={Math.max(2, result.blog.headings.length)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">本文下書き</Label>
                  <Textarea value={result.blog.body} onChange={(e) => patchBlog({ body: e.target.value })} rows={8} />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">CTA文</Label>
                  <Textarea value={result.blog.cta} onChange={(e) => patchBlog({ cta: e.target.value })} rows={2} />
                </div>
              </div>
              <RegenBar channel="blog" />
            </ResultCard>
          )}

          {/* ストーリー追加（アンケート・質問・予約導線） */}
          {result.story_extras && <StoryExtrasCard pack={result.story_extras} />}

          {/* 画像投稿用 / リール用 / 生成AI画像 */}
          {imagePack && <ImagePackCard pack={imagePack} />}
          {reelPack && <ReelPackCard pack={reelPack} />}
          {aiImagePack && <AiImagePackCard pack={aiImagePack} />}

          {/* 保存 */}
          <div className="flex flex-wrap gap-2 sticky bottom-0 bg-white/90 backdrop-blur py-3 border-t">
            <Button type="button" onClick={() => handleSave("draft")} disabled={saving} variant="outline">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              下書き保存
            </Button>
            <Button type="button" onClick={() => handleSave("reviewed")} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              確認済みで保存
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 無料プラン向け：画像・動画・生成AI画像のアップグレード案内 */
function PremiumNotice() {
  return (
    <div className="rounded-lg border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-400">
          <Crown className="w-4 h-4 text-white" />
        </span>
        <span className="font-bold text-amber-900">プレミアムプランでさらに便利に</span>
      </div>
      <p className="text-sm text-amber-800 mb-2">
        いまのプランでは、各SNSの<strong>文章づくり</strong>をご利用いただけます。<br />
        プレミアムプランにすると、写真・動画・生成AI画像にも対応します。
      </p>
      <ul className="space-y-1 mb-3">
        {PREMIUM_FEATURES.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-amber-900">
            <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      <p className="text-xs text-amber-700">
        ご利用をご希望の方は、ボール接骨院までお問い合わせください。
      </p>
    </div>
  );
}

function ResultCard({
  icon,
  title,
  copyText,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  copyText: () => string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          {title}
        </CardTitle>
        <CopyButton text={copyText} />
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
