"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Download, Type, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Pos = "top" | "center" | "bottom";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  imageSrc: string; // data URL or public URL
};

/** 画像に文字（タイトル）を重ねて、PNGでダウンロードできる簡易エディタ（Canvas）。 */
export default function TextOverlayDialog({ open, onOpenChange, imageSrc }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [pos, setPos] = useState<Pos>("bottom");
  const [light, setLight] = useState(true); // 文字を白(濃い帯)か、黒(明るい帯)か

  // 画像読み込み
  useEffect(() => {
    if (!open || !imageSrc) return;
    setReady(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { imgRef.current = img; setReady(true); };
    img.onerror = () => toast.error("画像を読み込めませんでした");
    img.src = imageSrc;
  }, [open, imageSrc]);

  // 再描画
  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const maxW = 1080;
    const scale = img.width > maxW ? maxW / img.width : 1;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, w, h);

    if (!title && !subtitle) return;

    const pad = Math.round(w * 0.05);
    const titleSize = Math.round(w * 0.075);
    const subSize = Math.round(w * 0.045);
    const lineGap = Math.round(titleSize * 0.28);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    const font = (size: number, bold = true) =>
      `${bold ? "bold " : ""}${size}px "Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif`;

    // 折り返し
    const wrap = (text: string, size: number) => {
      ctx.font = font(size);
      const max = w - pad * 2;
      const lines: string[] = [];
      let cur = "";
      for (const ch of text) {
        if (ch === "\n") { lines.push(cur); cur = ""; continue; }
        const test = cur + ch;
        if (ctx.measureText(test).width > max && cur) { lines.push(cur); cur = ch; }
        else cur = test;
      }
      if (cur) lines.push(cur);
      return lines;
    };

    const titleLines = title ? wrap(title, titleSize) : [];
    const subLines = subtitle ? wrap(subtitle, subSize) : [];
    const blockH =
      titleLines.length * (titleSize + lineGap) +
      (subLines.length ? Math.round(titleSize * 0.4) + subLines.length * (subSize + lineGap) : 0);

    // 帯（背景）
    const bandPad = Math.round(w * 0.04);
    const bandH = blockH + bandPad * 2;
    let bandY = 0;
    if (pos === "top") bandY = 0;
    else if (pos === "center") bandY = (h - bandH) / 2;
    else bandY = h - bandH;
    ctx.fillStyle = light ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.7)";
    ctx.fillRect(0, bandY, w, bandH);

    // 文字
    ctx.fillStyle = light ? "#ffffff" : "#0f172a";
    let y = bandY + bandPad + titleSize;
    ctx.font = font(titleSize);
    for (const line of titleLines) { ctx.fillText(line, w / 2, y); y += titleSize + lineGap; }
    if (subLines.length) {
      y += Math.round(titleSize * 0.2);
      ctx.font = font(subSize, false);
      for (const line of subLines) { ctx.fillText(line, w / 2, y); y += subSize + lineGap; }
    }
  }, [ready, title, subtitle, pos, light]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `post-image-${Date.now()}.png`;
      a.click();
      toast.success("画像を保存しました");
    } catch {
      toast.error("この画像は文字入れ保存に対応していません（生成した画像でお試しください）");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Type className="w-4 h-4 text-blue-600" /> 画像に文字を入れる
          </DialogTitle>
          <DialogDescription>文字を入れて、そのまま投稿用の画像としてダウンロードできます。</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-slate-50 flex items-center justify-center min-h-[180px]">
            {ready ? (
              <canvas ref={canvasRef} className="max-w-full max-h-[42vh] rounded" />
            ) : (
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-slate-500">大きい文字（タイトル）</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：成長期の膝の痛み、ご相談ください" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">小さい文字（サブ・任意）</Label>
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="例：藍住 ボール接骨院" />
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">位置</Label>
              <div className="flex gap-1">
                {([["top", "上"], ["center", "中"], ["bottom", "下"]] as [Pos, string][]).map(([p, l]) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPos(p)}
                    className={pos === p ? "px-3 py-1 rounded text-xs bg-blue-600 text-white" : "px-3 py-1 rounded text-xs bg-slate-100 text-slate-600"}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">文字色</Label>
              <div className="flex gap-1">
                <button type="button" onClick={() => setLight(true)} className={light ? "px-3 py-1 rounded text-xs bg-blue-600 text-white" : "px-3 py-1 rounded text-xs bg-slate-100 text-slate-600"}>白文字</button>
                <button type="button" onClick={() => setLight(false)} className={!light ? "px-3 py-1 rounded text-xs bg-blue-600 text-white" : "px-3 py-1 rounded text-xs bg-slate-100 text-slate-600"}>黒文字</button>
              </div>
            </div>
          </div>

          <Button onClick={download} disabled={!ready} className="w-full">
            <Download className="w-4 h-4" /> 画像をダウンロード
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
