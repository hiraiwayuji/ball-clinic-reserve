"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { BellPlus, Trash2 } from "lucide-react";
import {
  addNotificationTarget,
  deleteNotificationTarget,
  toggleNotificationTarget,
  type NotificationTargetRow,
} from "@/app/actions/security";

export default function NotificationTargetsManager({ initial }: { initial: NotificationTargetRow[] }) {
  const [rows, setRows] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reload() {
    window.location.reload();
  }

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await addNotificationTarget(fd);
      if (res.success) reload();
      else setError(res.error ?? "追加に失敗しました");
    });
  }

  function onDelete(id: string) {
    if (!confirm("この通知先を削除しますか？")) return;
    startTransition(async () => {
      const res = await deleteNotificationTarget(id);
      if (res.success) {
        setRows((rs) => rs.filter((r) => r.id !== id));
      } else {
        setError(res.error ?? "削除に失敗しました");
      }
    });
  }

  function onToggle(id: string, enabled: boolean) {
    startTransition(async () => {
      const res = await toggleNotificationTarget(id, enabled);
      if (res.success) {
        setRows((rs) => rs.map((r) => (r.id === id ? { ...r, enabled } : r)));
      } else {
        setError(res.error ?? "更新に失敗しました");
      }
    });
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {rows.length === 0 && (
          <li className="text-sm text-slate-500">
            まだ通知先が登録されていません。下のフォームから追加してください。<br />
            <span className="text-xs text-slate-400">
              （未登録時は環境変数 OWNER_LINE_USER_ID にフォールバックします）
            </span>
          </li>
        )}
        {rows.map((r) => (
          <li
            key={r.id}
            className={`flex flex-wrap items-center gap-3 border rounded-lg p-3 ${
              r.enabled ? "bg-white dark:bg-slate-800/40" : "bg-slate-50 dark:bg-slate-800/10 opacity-60"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-slate-800 dark:text-slate-100">{r.label}</div>
              <div className="text-xs text-slate-500 break-all">
                {r.line_user_id ? `LINE: ${r.line_user_id}` : null}
                {r.line_user_id && r.email ? " / " : null}
                {r.email ? `Mail: ${r.email}` : null}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => onToggle(r.id, e.target.checked)}
                disabled={pending}
              />
              通知ON
            </label>
            <Button onClick={() => onDelete(r.id)} variant="ghost" size="sm" disabled={pending}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </li>
        ))}
      </ul>

      <form onSubmit={onAdd} className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-800/30 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold">
          <BellPlus className="w-4 h-4" /> 通知先を追加
        </div>
        <input
          name="label"
          placeholder="ラベル（例: 院長 LINE / 受付スマホ）"
          className="w-full px-3 py-2 rounded-md border bg-white dark:bg-slate-900 text-sm"
          required
        />
        <input
          name="line_user_id"
          placeholder="LINE user_id（U で始まる ID）"
          className="w-full px-3 py-2 rounded-md border bg-white dark:bg-slate-900 text-sm font-mono"
        />
        <input
          name="email"
          type="email"
          placeholder="メールアドレス（任意）"
          className="w-full px-3 py-2 rounded-md border bg-white dark:bg-slate-900 text-sm"
        />
        <p className="text-xs text-slate-500">
          ※ LINE user_id は LINE 公式アカウントへ友だち追加 → 任意のメッセージ送信で `audit_log` か Webhook ログから取得できます。
        </p>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "追加中…" : "追加"}
        </Button>
      </form>
    </div>
  );
}
