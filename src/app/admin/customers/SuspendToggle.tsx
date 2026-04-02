"use client";

import { useTransition } from "react";
import { toggleBookingSuspension } from "@/app/actions/adminCustomers";

export function SuspendToggle({ customerId, suspended }: { customerId: string; suspended: boolean }) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(() => toggleBookingSuspension(customerId, !suspended));
  };

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
        suspended
          ? "bg-red-100 text-red-700 hover:bg-red-200"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {isPending ? "処理中..." : suspended ? "停止中（解除する）" : "予約停止する"}
    </button>
  );
}
