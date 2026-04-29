"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { KeyRound } from "lucide-react";
import { updateSettingsPasscodeAction } from "@/app/actions/security";

export default function SettingsPasscodeChangeForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) {
      setMsg({ type: "err", text: "新しいパスコードが一致しません" });
      return;
    }
    const fd = new FormData();
    fd.set("currentPasscode", current);
    fd.set("newPasscode", next);
    startTransition(async () => {
      const res = await updateSettingsPasscodeAction(fd);
      if (res.success) {
        setMsg({ type: "ok", text: "パスコードを変更しました。再ロックされたので再度入力してください。" });
        setCurrent("");
        setNext("");
        setConfirm("");
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setMsg({ type: "err", text: res.error ?? "変更に失敗しました" });
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-md">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
        <KeyRound className="w-4 h-4" />
        設定画面パスコードの変更
      </div>
      <p className="text-xs text-slate-500">数字 4〜6 桁。スタッフに知られない番号を選んでください。</p>
      <Input label="現在のパスコード" value={current} onChange={setCurrent} />
      <Input label="新しいパスコード" value={next} onChange={setNext} />
      <Input label="新しいパスコード（確認）" value={confirm} onChange={setConfirm} />
      {msg && (
        <p className={msg.type === "ok" ? "text-emerald-600 text-xs" : "text-rose-600 text-xs"}>{msg.text}</p>
      )}
      <Button type="submit" disabled={pending || !current || !next || !confirm} size="sm">
        {pending ? "保存中…" : "パスコードを変更"}
      </Button>
    </form>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-600 dark:text-slate-400">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="mt-1 w-full text-center tracking-[0.4em] font-mono py-2 px-3 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
      />
    </label>
  );
}
