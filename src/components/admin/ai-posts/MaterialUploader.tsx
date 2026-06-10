"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, Loader2, X, ImageIcon, Film, Type } from "lucide-react";
import { toast } from "sonner";
import TextOverlayDialog from "./TextOverlayDialog";
import { createClient } from "@/lib/supabase/client";
import {
  MATERIAL_KINDS,
  ACCEPTED_MIME,
  MAX_MATERIALS,
  MAX_MATERIAL_BYTES,
  type Material,
  type MaterialKind,
} from "@/lib/ai-marketing";

const BUCKET = "ai-marketing-materials";

function extOf(name: string) {
  return (name.split(".").pop() || "").toLowerCase();
}
function guessKind(mime: string): MaterialKind {
  return mime.startsWith("video") ? "動画" : "写真";
}

type Props = {
  materials: Material[];
  onChange: (next: Material[]) => void;
};

export default function MaterialUploader({ materials, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [overlaySrc, setOverlaySrc] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);

    if (materials.length + list.length > MAX_MATERIALS) {
      toast.error(`素材は最大${MAX_MATERIALS}点までです`);
      return;
    }

    const supabase = createClient();
    setUploading(true);
    const added: Material[] = [];
    try {
      for (const file of list) {
        if (!ACCEPTED_MIME.includes(file.type)) {
          toast.error(`未対応の形式です: ${file.name}（jpg/png/webp/mp4/mov/webm）`);
          continue;
        }
        if (file.size > MAX_MATERIAL_BYTES) {
          toast.error(`サイズが大きすぎます（100MBまで）: ${file.name}`);
          continue;
        }
        const rand = Math.random().toString(36).slice(2, 9);
        const path = `materials/${Date.now()}-${rand}.${extOf(file.name)}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (error) {
          console.error("upload error", error);
          toast.error(`アップロード失敗: ${file.name}`);
          continue;
        }
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        added.push({
          url: data.publicUrl,
          mime: file.type,
          category: file.type.startsWith("video") ? "video" : "image",
          kind: guessKind(file.type),
          memo: "",
          name: file.name,
          size: file.size,
        });
      }
      if (added.length) {
        onChange([...materials, ...added]);
        toast.success(`${added.length}点アップロードしました`);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function update(i: number, patch: Partial<Material>) {
    onChange(materials.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  function remove(i: number) {
    onChange(materials.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>素材アップロード（写真・動画 / 最大{MAX_MATERIALS}点）</Label>
        <span className="text-xs text-slate-400">{materials.length}/{MAX_MATERIALS}</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_MIME.join(",")}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || materials.length >= MAX_MATERIALS}
        className="w-full border-dashed h-20 text-slate-500"
      >
        {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
        {uploading ? "アップロード中..." : "写真・動画を選ぶ（jpg/png/webp/mp4/mov/webm）"}
      </Button>

      {materials.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {materials.map((m, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-2 space-y-2">
              <div className="relative">
                {m.category === "video" ? (
                  <video src={m.url} controls className="w-full h-36 object-cover rounded bg-black" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt={m.name} className="w-full h-36 object-cover rounded bg-slate-100" />
                )}
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1"
                  aria-label="削除"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <span className="absolute bottom-1 left-1 flex items-center gap-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                  {m.category === "video" ? <Film className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                  {m.category === "video" ? "動画" : "画像"}
                </span>
              </div>
              <Select value={m.kind} onValueChange={(v) => v && update(i, { kind: v as MaterialKind })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MATERIAL_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                className="h-8 text-xs"
                placeholder="素材メモ（例：水素吸入中の様子）"
                value={m.memo}
                onChange={(e) => update(i, { memo: e.target.value })}
              />
              {m.category === "image" && (
                <Button type="button" size="sm" variant="outline" className="h-7 w-full text-xs" onClick={() => setOverlaySrc(m.url)}>
                  <Type className="w-3 h-3" /> この写真に文字を入れる
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <TextOverlayDialog open={!!overlaySrc} onOpenChange={(o) => !o && setOverlaySrc(null)} imageSrc={overlaySrc || ""} />
    </div>
  );
}
