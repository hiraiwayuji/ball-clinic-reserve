"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Lock, ShieldCheck } from "lucide-react";
import { lockSettingsAction } from "@/app/actions/security";

export default function SettingsLockBar({ autoLockDisabled = false }: { autoLockDisabled?: boolean }) {
  const [pending, startTransition] = useTransition();

  function handleLock() {
    startTransition(async () => {
      await lockSettingsAction();
      window.location.reload();
    });
  }

  return (
    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-800 rounded-xl px-4 py-2 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-sm">
        <ShieldCheck className="w-4 h-4" />
        <span>
          {autoLockDisabled
            ? "設定画面を解錠中（自動再ロックは無効・手動でロックしてください）"
            : "設定画面を解錠中（30 分で自動再ロック）"}
        </span>
      </div>
      <Button onClick={handleLock} variant="ghost" size="sm" disabled={pending}>
        <Lock className="w-4 h-4 mr-1" />
        {pending ? "ロック中…" : "再ロック"}
      </Button>
    </div>
  );
}
