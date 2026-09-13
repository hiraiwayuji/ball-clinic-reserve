"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, Trash2, Video, X, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  listTrainingPhotos, createTrainingPhotoUpload, confirmTrainingPhoto, updateTrainingPhoto, deleteTrainingPhoto,
  type TrainingPhoto,
} from "@/app/actions/training";

const BUCKET = "training-photos";
/** 長い辺の最大ピクセル（撮ったままだと大きすぎて保存も表示も重い） */
const MAX_SIDE = 2000;
/** バケットの上限は 5MB。少し余裕をもたせる */
const MAX_BYTES = 4.5 * 1024 * 1024;

/** 画像を縮小して JPEG にする。読めない形式なら例外。 */
async function toJpeg(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("読み込めない画像です"));
        el.src = url;
      });
      source = img;
      width = img.naturalWidth;
      height = img.naturalHeight;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(source, 0, 0, w, h);
  bitmap?.close();
  for (const quality of [0.85, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return { blob, width: w, height: h };
  }
  throw new Error("写真のサイズが大きすぎます");
}

/**
 * 評価の回ごとの写真。
 * 追加の入り口は3つ（写真系機能の標準）: ファイルを選ぶ／スマホのカメラで撮る／パソコンのカメラで撮る。
 * 写真は非公開の保存場所に置き、表示は期限つきのURL。患者さんのレポートには「載せる」にしたものだけ出る。
 */
export default function TrainingPhotos({ assessmentId }: { assessmentId: string }) {
  const [photos, setPhotos] = useState<TrainingPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listTrainingPhotos([assessmentId]);
      if (res.success) setPhotos(res.photos ?? []);
      else toast.error(res.error ?? "写真を読み込めませんでした");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => { load(); }, [load]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }, []);

  // 画面を離れたらカメラを必ず止める
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const uploadOne = async (file: Blob) => {
    setUploading((n) => n + 1);
    try {
      const { blob, width, height } = await toJpeg(file);
      const ticket = await createTrainingPhotoUpload(assessmentId);
      if (!ticket.success || !ticket.path || !ticket.token) throw new Error(ticket.error ?? "保存の準備に失敗しました");
      const supabase = createClient();
      const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: "image/jpeg" });
      if (error) throw new Error("写真の送信に失敗しました");
      const done = await confirmTrainingPhoto({ assessmentId, path: ticket.path, width, height, sizeBytes: blob.size });
      if (!done.success) throw new Error(done.error ?? "写真の登録に失敗しました");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "写真の保存に失敗しました");
      return false;
    } finally {
      setUploading((n) => n - 1);
    }
  };

  const handleFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (captureRef.current) captureRef.current.value = "";
    if (files.length === 0) return;
    let ok = 0;
    for (const f of files) if (await uploadOne(f)) ok++;
    if (ok > 0) {
      toast.success(`写真を${ok}枚保存しました`);
      await load();
    }
  };

  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("このブラウザではカメラを使えません。「ファイルを選ぶ」から追加してください。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      toast.error(
        name === "NotAllowedError"
          ? "カメラが許可されていません。アドレスバーのカメラのマークから「許可」を選んでください。"
          : "カメラを起動できませんでした。「ファイルを選ぶ」から追加してください。",
      );
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    stopCamera();
    if (!blob) return;
    if (await uploadOne(blob)) {
      toast.success("写真を保存しました");
      await load();
    }
  };

  const patchPhoto = async (id: string, patch: { caption?: string | null; showInReport?: boolean }) => {
    setPhotos((list) => list.map((p) => (p.id === id
      ? { ...p, ...(patch.caption !== undefined ? { caption: patch.caption } : {}), ...(patch.showInReport !== undefined ? { showInReport: patch.showInReport } : {}) }
      : p)));
    const res = await updateTrainingPhoto(id, patch);
    if (!res.success) {
      toast.error(res.error ?? "更新に失敗しました");
      await load();
    }
  };

  const remove = async (id: string) => {
    if (!confirm("この写真を削除しますか？（元に戻せません）")) return;
    const res = await deleteTrainingPhoto(id);
    if (res.success) {
      setPhotos((list) => list.filter((p) => p.id !== id));
      toast.success("写真を削除しました");
    } else {
      toast.error(res.error ?? "削除に失敗しました");
    }
  };

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-bold text-slate-600 mr-1">写真 {loading ? "" : `${photos.length}枚`}</span>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        <input ref={captureRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading > 0}
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-white border text-xs font-bold text-slate-600 disabled:opacity-50">
          <ImagePlus className="w-3.5 h-3.5" />ファイルを選ぶ
        </button>
        <button type="button" onClick={() => captureRef.current?.click()} disabled={uploading > 0}
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-white border text-xs font-bold text-slate-600 disabled:opacity-50 md:hidden">
          <Camera className="w-3.5 h-3.5" />スマホで撮る
        </button>
        <button type="button" onClick={openCamera} disabled={uploading > 0}
          className="hidden md:inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-white border text-xs font-bold text-slate-600 disabled:opacity-50">
          <Video className="w-3.5 h-3.5" />パソコンのカメラで撮る
        </button>
        {uploading > 0 && <span className="text-xs text-slate-500 inline-flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" />保存中…</span>}
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
          {photos.map((p) => (
            <figure key={p.id} className="rounded-lg border bg-white overflow-hidden">
              {p.url ? (
                <a href={p.url} target="_blank" rel="noreferrer" className="block relative group" title="大きく表示">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption ?? "トレーニングの写真"} className="w-full aspect-square object-cover" />
                  <ExternalLink className="w-4 h-4 text-white absolute top-1.5 right-1.5 drop-shadow opacity-0 group-hover:opacity-100" />
                </a>
              ) : (
                <div className="w-full aspect-square flex items-center justify-center text-[11px] text-slate-400">表示できません</div>
              )}
              <figcaption className="p-1.5 space-y-1">
                <input
                  defaultValue={p.caption ?? ""}
                  maxLength={60}
                  placeholder="メモ（例: 前屈 指先が床まで）"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (p.caption ?? "")) patchPhoto(p.id, { caption: v || null });
                  }}
                  className="w-full h-8 px-2 rounded border text-xs"
                />
                <div className="flex items-center justify-between gap-1">
                  <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                    <input type="checkbox" checked={p.showInReport} onChange={(e) => patchPhoto(p.id, { showInReport: e.target.checked })} className="w-3.5 h-3.5 accent-emerald-600" />
                    レポートに載せる
                  </label>
                  <button type="button" onClick={() => remove(p.id)} className="p-1 text-slate-300 hover:text-red-500" aria-label="写真を削除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {cameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" role="dialog" aria-label="カメラで撮影">
          <div className="bg-white rounded-2xl overflow-hidden w-full max-w-lg">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-sm font-bold">カメラで撮影</span>
              <button type="button" onClick={stopCamera} className="p-1.5 rounded text-slate-500" aria-label="閉じる"><X className="w-5 h-5" /></button>
            </div>
            <video ref={videoRef} playsInline muted className="w-full bg-black aspect-video object-contain" />
            <div className="p-3 flex gap-2">
              <button type="button" onClick={stopCamera} className="flex-1 h-11 rounded-lg border text-sm font-bold text-slate-600">やめる</button>
              <button type="button" onClick={capture} className="flex-1 h-11 rounded-lg bg-emerald-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1">
                <Camera className="w-4 h-4" />撮影して保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
