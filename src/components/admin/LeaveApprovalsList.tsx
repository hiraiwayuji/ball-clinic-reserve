"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CalendarOff, CheckCircle2, XCircle, Loader2, User } from "lucide-react";
import {
  approveLeaveRequest,
  rejectLeaveRequest,
  type StaffOverrideRow,
} from "@/app/actions/staff-schedule";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function LeaveApprovalsList({ items }: { items: StaffOverrideRow[] }) {
  const [localItems, setLocalItems] = useState(items);

  if (localItems.length === 0) {
    return <p className="text-sm text-slate-400">休み希望の承認待ちはありません。</p>;
  }

  const handleRemove = (id: string) => {
    setLocalItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <ul className="space-y-3">
      {localItems.map((item) => (
        <LeaveApprovalRow key={item.id} item={item} onResolved={handleRemove} />
      ))}
    </ul>
  );
}

function formatDateJa(dateStr: string): string {
  // "2026-06-05" → "2026年6月5日（金）"
  try {
    const d = new Date(`${dateStr}T00:00:00+09:00`);
    const weekday = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${weekday}）`;
  } catch {
    return dateStr;
  }
}

function formatSubmittedAt(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 提出`;
  } catch {
    return "";
  }
}

function LeaveApprovalRow({
  item,
  onResolved,
}: {
  item: StaffOverrideRow;
  onResolved: (id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleApprove() {
    startTransition(async () => {
      const res = await approveLeaveRequest(item.id);
      if (res.success) {
        toast.success(
          `${item.staff_name ?? "スタッフ"}様の${formatDateJa(item.date)}を承認しました（予約自動ブロック有効）`,
        );
        onResolved(item.id);
        router.refresh();
      } else {
        toast.error(res.error ?? "承認に失敗しました");
      }
    });
  }

  function handleReject() {
    if (!confirm(`${item.staff_name ?? "スタッフ"}様の${formatDateJa(item.date)}の休み希望を却下しますか？`)) return;
    startTransition(async () => {
      const res = await rejectLeaveRequest(item.id);
      if (res.success) {
        toast.success(`却下しました（${item.staff_name ?? "スタッフ"}様にLINE等で理由を伝えてください）`);
        onResolved(item.id);
        router.refresh();
      } else {
        toast.error(res.error ?? "却下に失敗しました");
      }
    });
  }

  const isFullDay = !item.start_time && !item.end_time;
  const timeLabel = isFullDay
    ? "終日"
    : `${item.start_time ?? "—"} 〜 ${item.end_time ?? "—"}`;

  return (
    <li className="rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-900/10 dark:border-amber-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-800 text-[10px] font-black uppercase tracking-wider">
              <CalendarOff className="w-3 h-3" /> 休み希望
            </span>
            <span className="text-base font-bold text-slate-900 dark:text-slate-100">
              {formatDateJa(item.date)}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{timeLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-bold">{item.staff_name ?? "（スタッフ名不明）"}</span>
            {item.created_by_email && (
              <span className="text-xs text-slate-400">（{item.created_by_email}）</span>
            )}
          </div>
          {item.note && (
            <p className="text-sm text-slate-600 dark:text-slate-300 bg-white/60 dark:bg-slate-900/40 rounded p-2 border border-amber-100 dark:border-amber-900/30">
              💬 {item.note}
            </p>
          )}
          {item.created_at && (
            <p className="text-[11px] text-slate-400">{formatSubmittedAt(item.created_at)}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            onClick={handleApprove}
            disabled={pending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            size="sm"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
            承認
          </Button>
          <Button
            type="button"
            onClick={handleReject}
            disabled={pending}
            variant="outline"
            className="border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/40 dark:hover:bg-rose-950/30"
            size="sm"
          >
            <XCircle className="w-4 h-4 mr-1" />
            却下
          </Button>
        </div>
      </div>
    </li>
  );
}
