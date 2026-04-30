"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Unlock, Lock, AlertTriangle } from "lucide-react";
import { setAutoLockDisabledAction } from "@/app/actions/security";

export default function SettingsAutoLockToggle({
  initialDisabled,
}: {
  initialDisabled: boolean;
}) {
  const [disabled, setDisabled] = useState(initialDisabled);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setMsg(null);
    startTransition(async () => {
      const res = await setAutoLockDisabledAction(next);
      if (res.success) {
        setDisabled(next);
        setMsg({
          type: "ok",
          text: next
            ? "自動再ロックを無効にしました。次回 0000（またはパスコード）で解錠したあとはロックされません。"
            : "自動再ロックを有効に戻しました。次回解錠から 30 分で再ロックされます。",
        });
      } else {
        setMsg({ type: "err", text: res.error ?? "保存に失敗しました" });
      }
    });
  }

  return (
    <div className="space-y-3 max-w-xl">
      <div className="flex items-start gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
        {disabled ? (
          <Unlock className="w-4 h-4 mt-0.5 text-amber-600" />
        ) : (
          <Lock className="w-4 h-4 mt-0.5 text-emerald-600" />
        )}
        <span>自動再ロック（30 分）</span>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        スタッフのいない院ではパスコードを毎回入力するのは煩わしいので、
        <strong>自動再ロックを無効化</strong>
        できます。OFF にすると、最初に 0000（またはパスコード）で解錠したあとは、
        この画面の「再ロック」ボタンを押すまでロック状態になりません。
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={!disabled ? "default" : "outline"}
          onClick={() => toggle(false)}
          disabled={pending || !disabled}
        >
          ON（30 分で自動再ロック・推奨）
        </Button>
        <Button
          type="button"
          size="sm"
          variant={disabled ? "default" : "outline"}
          onClick={() => toggle(true)}
          disabled={pending || disabled}
        >
          OFF（手動でロックするまで解錠維持）
        </Button>
      </div>

      {disabled && (
        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            自動再ロックは無効です。第三者が端末を触れる環境では必ず ON に戻してください。
          </span>
        </div>
      )}

      {msg && (
        <p
          className={
            msg.type === "ok"
              ? "text-emerald-600 text-xs"
              : "text-rose-600 text-xs"
          }
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
