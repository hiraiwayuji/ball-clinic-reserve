"use client";

import { useState, useTransition } from "react";
import { ClipboardCheck, ChevronDown, ChevronUp, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  updateIntakeChecklistItem,
  type IntakeCheckKey,
  type IntakeChecklist,
} from "@/app/actions/adminReserve";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";

const ITEMS: { key: IntakeCheckKey; label: string }[] = [
  { key: "explanation",       label: "回答書の説明" },
  { key: "personal_info",     label: "レセコンに個人情報入力" },
  { key: "injury_info",       label: "負傷名・負傷原因入力" },
  { key: "karte_print",       label: "カルテ印刷" },
  { key: "insurance_confirm", label: "印刷物と保険証の確認" },
];

interface Props {
  appointmentId: string;
  initialChecklist: IntakeChecklist | null;
  staffName: string; // ログイン中のスタッフ名（チェック者として記録）
  trigger: "first_visit" | "insurance_changed" | "long_absence"; // 表示理由
}

export function IntakeChecklistPanel({ appointmentId, initialChecklist, staffName, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [checklist, setChecklist] = useState<IntakeChecklist>(initialChecklist ?? {});
  const [isPending, startTransition] = useTransition();

  const checkedCount = ITEMS.filter(i => checklist[i.key]?.checked).length;
  const allDone = checkedCount === ITEMS.length;

  const triggerLabel =
    trigger === "first_visit"       ? "初診" :
    trigger === "insurance_changed" ? "保険証変更" : "長期未来院（初診扱い）";

  const triggerColor =
    trigger === "first_visit"       ? "bg-rose-500" :
    trigger === "insurance_changed" ? "bg-amber-500" : "bg-orange-500";

  const handleToggle = (key: IntakeCheckKey) => {
    startTransition(async () => {
      const res = await updateIntakeChecklistItem(appointmentId, key, staffName);
      if (res.success && res.checklist) {
        setChecklist(res.checklist);
      } else {
        toast.error(res.error ?? "保存に失敗しました");
      }
    });
  };

  return (
    <div className="mt-2">
      {/* トリガーバッジ兼トグルボタン */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={[
          "flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all",
          allDone
            ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
            : "text-white border border-transparent",
          !allDone ? triggerColor : "",
        ].join(" ")}
      >
        <ClipboardCheck className="w-3.5 h-3.5" />
        {allDone ? `✓ 受付チェック完了 (${checkedCount}/5)` : `受付チェック ${checkedCount}/5 — ${triggerLabel}`}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {/* チェックリスト本体 */}
      {open && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
            <p className="text-[11px] font-bold text-slate-600">
              {triggerLabel}の受付チェックリスト
              <span className="ml-2 text-slate-400 font-normal">チェックした人が記録されます</span>
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {ITEMS.map(({ key, label }) => {
              const item = checklist[key];
              const checked = item?.checked === true;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => handleToggle(key)}
                    disabled={isPending}
                    className={[
                      "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                      checked ? "bg-emerald-50 hover:bg-emerald-100" : "hover:bg-slate-50",
                      isPending ? "opacity-60 pointer-events-none" : "",
                    ].join(" ")}
                  >
                    {/* チェックボックス風アイコン */}
                    <div className={[
                      "shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                      checked
                        ? "bg-emerald-500 border-emerald-500"
                        : "bg-white border-slate-300",
                    ].join(" ")}>
                      {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </div>

                    {/* ラベルとチェック者 */}
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-semibold ${checked ? "text-emerald-700" : "text-slate-700"}`}>
                        {label}
                      </span>
                      {checked && item?.by && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {item.by}
                          {item.at && (
                            <span className="ml-1">
                              {format(parseISO(item.at), "HH:mm", { locale: ja })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 解除ヒント */}
                    {checked && (
                      <X className="shrink-0 w-3.5 h-3.5 text-slate-300 hover:text-rose-400" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {allDone && (
            <div className="px-3 py-2 bg-emerald-50 text-center text-[11px] font-bold text-emerald-700 border-t border-emerald-200">
              ✓ 全項目チェック完了
            </div>
          )}
        </div>
      )}
    </div>
  );
}
