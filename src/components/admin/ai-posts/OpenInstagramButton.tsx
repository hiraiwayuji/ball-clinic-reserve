"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Instagram, Check } from "lucide-react";
import { toast } from "sonner";

type Props = {
  /** Instagramに貼り付ける本文（押した瞬間にコピーされる） */
  text: string | (() => string);
  className?: string;
};

/**
 * 本文を自動コピーして Instagram を開くボタン。
 * スマホはアプリ、PCはWebのInstagramを新しいタブで開く。あとは貼り付けるだけ。
 */
export default function OpenInstagramButton({ text, className }: Props) {
  const [done, setDone] = useState(false);

  async function handle() {
    const value = typeof text === "function" ? text() : text;
    if (!value?.trim()) {
      toast.error("先に投稿文を作ってください");
      return;
    }
    // 1) 本文をコピー
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // コピー失敗してもInstagramは開く（手入力できるように）
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
    toast.success("本文をコピーしました。Instagramで長押し→「ペースト」で貼り付けてください");

    // 2) Instagramを開く（スマホはアプリ、PCはWeb）
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isMobile = /iphone|ipad|ipod|android/i.test(ua);
    if (isMobile) {
      // アプリを試し、ダメならWebへ
      const t = setTimeout(() => { window.location.href = "https://www.instagram.com/"; }, 800);
      window.location.href = "instagram://app";
      window.addEventListener("pagehide", () => clearTimeout(t), { once: true });
    } else {
      window.open("https://www.instagram.com/", "_blank", "noopener");
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      onClick={handle}
      className={"bg-gradient-to-r from-pink-500 to-fuchsia-600 hover:from-pink-600 hover:to-fuchsia-700 text-white " + (className ?? "")}
    >
      {done ? <Check className="w-3.5 h-3.5" /> : <Instagram className="w-3.5 h-3.5" />}
      コピーしてInstagramを開く
    </Button>
  );
}
