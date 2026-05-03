"use client";

import { useState, useTransition } from "react";
import { BellPlus, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createReminder } from "@/app/actions/reminders";
import { toast } from "sonner";

const QUICK_PRESETS: { label: string; minutes: number }[] = [
  { label: "5 分後", minutes: 5 },
  { label: "15 分後", minutes: 15 },
  { label: "30 分後", minutes: 30 },
  { label: "1 時間後", minutes: 60 },
  { label: "2 時間後", minutes: 120 },
  { label: "3 時間後", minutes: 180 },
];

function toLocalDatetimeInputValue(date: Date): string {
  // <input type="datetime-local"> 用の "YYYY-MM-DDTHH:mm"
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ReminderQuickAdd() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [presetMinutes, setPresetMinutes] = useState<number>(30);
  const [customDt, setCustomDt] = useState<string>(() => {
    const d = new Date(Date.now() + 30 * 60_000);
    return toLocalDatetimeInputValue(d);
  });
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!title.trim()) {
      toast.error("タイトルを入力してください");
      return;
    }
    let fireAtIso: string;
    if (mode === "preset") {
      fireAtIso = new Date(Date.now() + presetMinutes * 60_000).toISOString();
    } else {
      const d = new Date(customDt);
      if (Number.isNaN(d.getTime())) {
        toast.error("時刻が不正です");
        return;
      }
      fireAtIso = d.toISOString();
    }
    startTransition(async () => {
      const res = await createReminder({
        title: title.trim(),
        message: message.trim() || null,
        fireAt: fireAtIso,
      });
      if (!res.ok) {
        toast.error(res.error ?? "登録に失敗しました");
        return;
      }
      toast.success(
        `「${title.trim()}」を ${new Date(fireAtIso).toLocaleString("ja-JP", {
          hour: "2-digit",
          minute: "2-digit",
        })} に登録しました`,
      );
      // リセット
      setTitle("");
      setMessage("");
      setOpen(false);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-2xl shadow-amber-500/40 flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        aria-label="リマインダーを追加"
        title="リマインダーを追加"
      >
        <BellPlus className="w-6 h-6" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <BellPlus className="w-4 h-4 text-amber-600" />
              リマインダーを追加
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">タイトル *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例: 水素吸入の患者さんに声かけ"
                className="w-full h-10 px-3 rounded-lg border bg-white dark:bg-slate-900 text-sm"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">補足メッセージ（任意）</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="例: 18時のミーティング、資料も忘れずに"
                rows={2}
                className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-900 text-sm"
              />
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("preset")}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition ${
                    mode === "preset"
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  クイック選択
                </button>
                <button
                  type="button"
                  onClick={() => setMode("custom")}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition ${
                    mode === "custom"
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  時刻指定
                </button>
              </div>

              {mode === "preset" ? (
                <div className="grid grid-cols-3 gap-2">
                  {QUICK_PRESETS.map((p) => (
                    <button
                      key={p.minutes}
                      type="button"
                      onClick={() => setPresetMinutes(p.minutes)}
                      className={`py-2 px-3 rounded-lg text-sm font-semibold border transition flex items-center justify-center gap-1 ${
                        presetMinutes === p.minutes
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      {p.label}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="datetime-local"
                  value={customDt}
                  onChange={(e) => setCustomDt(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border bg-white dark:bg-slate-900 text-sm"
                />
              )}
            </div>

            <Button onClick={submit} disabled={pending || !title.trim()} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold gap-2">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellPlus className="w-4 h-4" />}
              登録する
            </Button>

            <p className="text-[10px] text-slate-500 leading-relaxed">
              ※ 同じ院のスタッフ全員に共有されます。発火時刻になると音つきポップアップで知らせます。
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
