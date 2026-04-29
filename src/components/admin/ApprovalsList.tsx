"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle } from "lucide-react";
import { approvePendingChange, rejectPendingChange, type PendingChangeRow } from "@/app/actions/security";

export default function ApprovalsList({ items }: { items: PendingChangeRow[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">承認待ちの申請はありません。</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <ApprovalRow key={item.id} item={item} />
      ))}
    </ul>
  );
}

function ApprovalRow({ item }: { item: PendingChangeRow }) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function handleApprove() {
    startTransition(async () => {
      const res = await approvePendingChange(item.id, note);
      if (res.success) {
        setMsg("承認しました");
        setTimeout(() => window.location.reload(), 600);
      } else {
        setMsg(res.error ?? "承認に失敗しました");
      }
    });
  }

  function handleReject() {
    startTransition(async () => {
      const res = await rejectPendingChange(item.id, note);
      if (res.success) {
        setMsg("却下しました");
        setTimeout(() => window.location.reload(), 600);
      } else {
        setMsg(res.error ?? "却下に失敗しました");
      }
    });
  }

  return (
    <li className="border rounded-xl p-4 bg-slate-50 dark:bg-slate-800/30">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{new Date(item.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</span>
        <span>申請者: {item.requested_email ?? "(不明)"} ({item.requested_role})</span>
        <span>対象: {item.target_table}</span>
      </div>
      {item.reason && <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{item.reason}</p>}
      <details className="mt-2">
        <summary className="text-xs text-slate-500 cursor-pointer">変更内容（payload）を表示</summary>
        <pre className="mt-2 text-xs bg-white dark:bg-slate-900 border rounded p-2 overflow-auto max-h-64">
          {JSON.stringify(item.payload, null, 2)}
        </pre>
      </details>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="（任意）レビューコメント"
          className="text-xs px-3 py-1.5 rounded border bg-white dark:bg-slate-900 flex-1 min-w-0"
        />
        <Button onClick={handleApprove} size="sm" disabled={pending} className="bg-emerald-600 hover:bg-emerald-700">
          <CheckCircle2 className="w-4 h-4 mr-1" />
          承認
        </Button>
        <Button onClick={handleReject} size="sm" variant="destructive" disabled={pending}>
          <XCircle className="w-4 h-4 mr-1" />
          却下
        </Button>
      </div>
      {msg && <p className="mt-2 text-xs text-slate-500">{msg}</p>}
    </li>
  );
}
