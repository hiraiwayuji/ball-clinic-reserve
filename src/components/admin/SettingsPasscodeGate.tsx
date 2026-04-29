"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Lock, ShieldAlert } from "lucide-react";
import { unlockSettingsAction } from "@/app/actions/security";

export default function SettingsPasscodeGate({ defaultHint }: { defaultHint?: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("passcode", code);
    startTransition(async () => {
      const res = await unlockSettingsAction(fd);
      if (res.success) {
        // 解錠後はサーバーコンポーネントを再評価したいので強制リロード
        window.location.reload();
      } else {
        setError(res.error ?? "解錠に失敗しました");
        setCode("");
      }
    });
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border rounded-2xl shadow-lg p-8 space-y-6">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
            <Lock className="w-7 h-7 text-amber-600 dark:text-amber-300" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">設定画面ロック</h1>
          <p className="text-sm text-slate-500">
            設定変更にはパスコード（数字 4〜6 桁）が必要です。
          </p>
          {defaultHint && <p className="text-xs text-slate-400">{defaultHint}</p>}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            maxLength={6}
            pattern="[0-9]{4,6}"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="• • • •"
            className="w-full text-center tracking-[0.5em] text-2xl font-mono py-3 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {error && (
            <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={pending || code.length < 4}>
            {pending ? "確認中…" : "解錠する"}
          </Button>
        </form>

        <p className="text-xs text-center text-slate-400">
          解錠後は 30 分間有効です。離席時はブラウザを閉じる、もしくは設定画面の「再ロック」をクリックしてください。
        </p>
      </div>
    </div>
  );
}
