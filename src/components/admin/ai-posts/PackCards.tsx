"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImageIcon, Film, Sparkles, MessageCircleQuestion, Wand2, Loader2, Download, Type } from "lucide-react";
import { toast } from "sonner";
import CopyButton from "./CopyButton";
import TextOverlayDialog from "./TextOverlayDialog";
import { generateAiImage } from "@/app/actions/ai-marketing";
import {
  imagePackToPlainText,
  reelPackToPlainText,
  aiImagePackToPlainText,
  storyExtrasToPlainText,
  type ImagePack,
  type ReelPack,
  type AiImagePack,
  type StoryExtras,
} from "@/lib/ai-marketing";

function PackCard({
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
        <CardTitle className="flex items-center gap-2 text-sm">{icon}{title}</CardTitle>
        <CopyButton text={copyText} label="全部コピー" />
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <p className="whitespace-pre-wrap text-slate-700">{value}</p>
    </div>
  );
}
function ListRow({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <ul className="list-disc pl-5 text-slate-700 space-y-0.5">
        {items.map((t, i) => <li key={i} className="whitespace-pre-wrap">{t}</li>)}
      </ul>
    </div>
  );
}
/** プロンプト1行＋個別コピー */
function PromptRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="rounded-md bg-slate-50 border border-slate-200 p-2">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-medium text-slate-600">{label}</div>
        <CopyButton text={value} />
      </div>
      <p className="whitespace-pre-wrap text-slate-700 text-xs">{value}</p>
    </div>
  );
}

export function ImagePackCard({ pack }: { pack: ImagePack }) {
  return (
    <PackCard
      icon={<ImageIcon className="w-4 h-4 text-pink-600" />}
      title="画像投稿用"
      copyText={() => imagePackToPlainText(pack)}
    >
      <Row label="画像タイトル" value={pack.image_title} />
      <ListRow label="画像内テロップ" items={pack.in_image_telop} />
      <Row label="デザイン方向性" value={pack.design_direction} />
      <Row label="Canva作成指示" value={pack.canva_instructions} />
      <Row label="サムネイルタイトル" value={pack.thumbnail_title} />
      <Row label="投稿文" value={pack.post_text} />
      {pack.hashtags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pack.hashtags.map((h, i) => <Badge key={i} variant="secondary">{h}</Badge>)}
        </div>
      )}
      <Row label="画像説明文" value={pack.image_description} />
      <Row label="代替テキスト" value={pack.alt_text} />
      {pack.privacy_checklist?.length > 0 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-2">
          <div className="text-xs font-medium text-amber-800 mb-1">個人情報チェック</div>
          <ul className="space-y-0.5 text-amber-800 text-xs">
            {pack.privacy_checklist.map((t, i) => <li key={i}>□ {t}</li>)}
          </ul>
        </div>
      )}
    </PackCard>
  );
}

export function ReelPackCard({ pack }: { pack: ReelPack }) {
  return (
    <PackCard
      icon={<Film className="w-4 h-4 text-indigo-600" />}
      title="リール動画用"
      copyText={() => reelPackToPlainText(pack)}
    >
      <Row label="リールタイトル" value={pack.reel_title} />
      <Row label="冒頭3秒フック" value={pack.hook} />
      <ListRow label="15秒構成" items={pack.structure_15s} />
      <ListRow label="30秒構成" items={pack.structure_30s} />
      <ListRow label="カット構成案" items={pack.cut_structure} />
      <ListRow label="テロップ一覧" items={pack.telops} />
      <Row label="ナレーション案" value={pack.narration} />
      <Row label="サムネイル文言" value={pack.thumbnail_text} />
      <Row label="投稿文（キャプション）" value={pack.post_text} />
      <Row label="X投稿文" value={pack.x_text} />
    </PackCard>
  );
}

/** プロンプト＋「このプロンプトで実際に画像を作る」ボタン＋結果プレビュー */
function ImageGenRow({
  label,
  prompt,
  aspect,
  onAddText,
}: {
  label: string;
  prompt: string;
  aspect: "square" | "portrait" | "landscape";
  onAddText: (dataUrl: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [img, setImg] = useState<string | null>(null);
  if (!prompt) return null;

  async function gen() {
    setLoading(true);
    try {
      const res = await generateAiImage(prompt, aspect);
      if (!res.success || !res.dataUrl) { toast.error(res.error || "画像の生成に失敗しました"); return; }
      setImg(res.dataUrl);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-md bg-slate-50 border border-slate-200 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-slate-600">{label}</div>
        <div className="flex items-center gap-1.5">
          <CopyButton text={prompt} />
          <Button type="button" size="sm" onClick={gen} disabled={loading} className="h-8 bg-fuchsia-600 hover:bg-fuchsia-700">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            画像を作る
          </Button>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-slate-700 text-xs">{prompt}</p>
      {img && (
        <div className="space-y-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt="生成画像" className="w-full max-w-xs rounded border" />
          <div className="flex gap-1.5">
            <Button type="button" size="sm" variant="outline" onClick={() => onAddText(img)} className="h-8">
              <Type className="w-3.5 h-3.5" /> 文字を入れる
            </Button>
            <a href={img} download={`ai-image-${Date.now()}.png`}>
              <Button type="button" size="sm" variant="outline" className="h-8">
                <Download className="w-3.5 h-3.5" /> 保存
              </Button>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export function AiImagePackCard({ pack }: { pack: AiImagePack }) {
  const [overlaySrc, setOverlaySrc] = useState<string | null>(null);
  return (
    <PackCard
      icon={<Sparkles className="w-4 h-4 text-fuchsia-600" />}
      title="生成AI画像（プロンプト＋画像づくり）"
      copyText={() => aiImagePackToPlainText(pack)}
    >
      <p className="text-xs text-slate-400">
        「画像を作る」を押すと、その指示文でAIが実際の画像を作ります。作った画像に文字を入れて保存もできます。
      </p>
      <ImageGenRow label="画像生成（基本）" prompt={pack.prompt} aspect="square" onAddText={setOverlaySrc} />
      <ImageGenRow label="縦長(9:16・ストーリー向き)" prompt={pack.prompt_portrait} aspect="portrait" onAddText={setOverlaySrc} />
      <ImageGenRow label="正方形(1:1)" prompt={pack.prompt_square} aspect="square" onAddText={setOverlaySrc} />
      <ImageGenRow label="ブログアイキャッチ(16:9)" prompt={pack.prompt_blog_eyecatch} aspect="landscape" onAddText={setOverlaySrc} />

      <div className="pt-1 text-xs text-slate-400">他ツール用のプロンプト（コピーして各サービスへ）</div>
      <PromptRow label="Canva用" value={pack.canva_prompt} />
      <PromptRow label="Sora用（動画）" value={pack.sora_prompt} />
      <PromptRow label="Midjourney用" value={pack.midjourney_prompt} />
      <PromptRow label="ChatGPT画像生成用" value={pack.chatgpt_prompt} />
      <Row label="画像内文字案" value={pack.in_image_text} />
      {pack.notes && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
          <span className="font-medium">注意書き：</span>{pack.notes}
        </div>
      )}

      <TextOverlayDialog open={!!overlaySrc} onOpenChange={(o) => !o && setOverlaySrc(null)} imageSrc={overlaySrc || ""} />
    </PackCard>
  );
}

export function StoryExtrasCard({ pack }: { pack: StoryExtras }) {
  if (!pack.survey && !pack.question_sticker && !pack.reserve_cta) return null;
  return (
    <PackCard
      icon={<MessageCircleQuestion className="w-4 h-4 text-purple-600" />}
      title="ストーリー追加（アンケート・質問・導線）"
      copyText={() => storyExtrasToPlainText(pack)}
    >
      <Row label="アンケート案" value={pack.survey} />
      <Row label="質問スタンプ案" value={pack.question_sticker} />
      <Row label="予約導線文" value={pack.reserve_cta} />
    </PackCard>
  );
}
