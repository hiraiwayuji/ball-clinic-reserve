"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

type Props = {
  /** コピーするテキスト（関数でも可：押した瞬間に評価） */
  text: string | (() => string);
  label?: string;
  className?: string;
};

/** 各出力欄の「コピー」ボタン。クリップボードへコピーし、一瞬チェックマークに変わる。 */
export default function CopyButton({ text, label = "コピー", className }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const value = typeof text === "function" ? text() : text;
    if (!value) {
      toast.error("コピーする文章がありません");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("コピーしました");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("コピーに失敗しました");
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className={className}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {label}
    </Button>
  );
}
