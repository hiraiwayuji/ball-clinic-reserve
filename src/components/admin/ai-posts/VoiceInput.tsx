"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { transcribeVoice } from "@/app/actions/ai-marketing";

type Props = {
  /** 文字起こし結果を受け取る（既存テキストへの追記は呼び出し側で判断） */
  onResult: (text: string) => void;
  /** ボタンの短いラベル（省略時は「話して入力」） */
  label?: string;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = String(reader.result || "");
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * マイクで話して入力。
 * 1) ブラウザ内蔵の音声認識（Chrome/Edge の SpeechRecognition）があればそれを使う（速い・確実）。
 * 2) 無ければ録音 → サーバー(AI)で文字起こしにフォールバック。
 */
export default function VoiceInput({ onResult, label = "話して入力" }: Props) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  // SpeechRecognition 用
  const srRef = useRef<unknown>(null);
  const finalTextRef = useRef("");
  // MediaRecorder 用
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function getSR(): (new () => unknown) | null {
    if (typeof window === "undefined") return null;
    const w = window as unknown as Record<string, unknown>;
    return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as (new () => unknown) | null;
  }

  // ── 1) ブラウザ内蔵の音声認識 ──
  function startSR(SR: new () => unknown) {
    try {
      const rec = new SR() as {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        start: () => void;
        stop: () => void;
        onresult: (e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void;
        onerror: (e: { error?: string }) => void;
        onend: () => void;
      };
      rec.lang = "ja-JP";
      rec.interimResults = true;
      rec.continuous = true;
      finalTextRef.current = "";
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalTextRef.current += r[0].transcript;
        }
      };
      rec.onerror = (e) => {
        setRecording(false);
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          toast.error("マイクの使用が許可されていません");
        } else if (e.error !== "aborted" && e.error !== "no-speech") {
          toast.error("うまく聞き取れませんでした。もう一度お試しください");
        }
      };
      rec.onend = () => {
        setRecording(false);
        const text = finalTextRef.current.trim();
        if (text) { onResult(text); toast.success("文字にしました"); }
      };
      srRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error("マイクを開始できませんでした");
    }
  }

  // ── 2) 録音 → サーバーで文字起こし（フォールバック）──
  async function startRecorder() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("この端末ではマイクが使えません");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size === 0) { toast.error("録音できませんでした"); return; }
        setBusy(true);
        try {
          const base64 = await blobToBase64(blob);
          const res = await transcribeVoice(base64, blob.type);
          if (!res.success || !res.text) { toast.error(res.error || "文字起こしに失敗しました"); return; }
          onResult(res.text);
          toast.success("文字にしました");
        } finally {
          setBusy(false);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      toast.error("マイクの使用が許可されていません");
    }
  }

  function start() {
    const SR = getSR();
    if (SR) startSR(SR);
    else startRecorder();
  }

  function stop() {
    const sr = srRef.current as { stop: () => void } | null;
    if (sr) { sr.stop(); return; }
    recorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={recording ? "destructive" : "outline"}
      disabled={busy}
      onClick={recording ? stop : start}
      className="h-8 shrink-0"
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : recording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
      {busy ? "文字にしています..." : recording ? "録音を止める" : label}
    </Button>
  );
}
