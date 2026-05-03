"use client";

import { useEffect } from "react";
import { Bell, CheckCircle2, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playReminderChime } from "@/lib/reminder-sound";
import type { ReminderRow } from "@/app/actions/reminders";

type Props = {
  reminder: ReminderRow;
  onDone: () => void;
  onSnooze: (minutes: number) => void;
  onDismiss: () => void;
};

/** 発火したリマインダーを画面中央で派手に通知するモーダル。 */
export default function ReminderPopup({ reminder, onDone, onSnooze, onDismiss }: Props) {
  useEffect(() => {
    // マウント時に音を 1 回鳴らす
    playReminderChime();
    // タイトルを点滅させて気づきやすく
    const orig = typeof document !== "undefined" ? document.title : "";
    let toggle = false;
    const id = setInterval(() => {
      if (typeof document === "undefined") return;
      toggle = !toggle;
      document.title = toggle ? `🔔 ${reminder.title}` : orig;
    }, 1000);
    return () => {
      clearInterval(id);
      if (typeof document !== "undefined") document.title = orig;
    };
  }, [reminder.title]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative max-w-md w-full bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 rounded-3xl shadow-[0_25px_70px_rgba(245,158,11,0.6)] border-4 border-amber-200/40 [animation:var(--animate-pulse-soft,pulse_1.5s_ease-in-out_infinite)]">
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white"
          aria-label="閉じる"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center shrink-0">
              <Bell className="w-7 h-7 text-white animate-bounce" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-amber-100/90 font-bold">
                リマインダー
              </p>
              <p className="text-[10px] text-amber-100/70">
                {new Date(reminder.fire_at).toLocaleString("ja-JP", { hour: "2-digit", minute: "2-digit" })} 設定
                {reminder.created_by_email ? ` ・ ${reminder.created_by_email}` : ""}
              </p>
            </div>
          </div>

          <h2 className="text-2xl font-black mb-3 leading-tight">{reminder.title}</h2>
          {reminder.message && (
            <p className="text-sm text-amber-50/95 mb-6 whitespace-pre-wrap leading-relaxed">{reminder.message}</p>
          )}

          <div className="space-y-2">
            <Button
              onClick={onDone}
              className="w-full bg-white hover:bg-amber-50 text-orange-700 font-bold py-3 text-base h-auto rounded-2xl gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              完了した
            </Button>
            <div className="grid grid-cols-3 gap-2">
              {[5, 15, 30].map((m) => (
                <button
                  key={m}
                  onClick={() => onSnooze(m)}
                  className="bg-white/20 hover:bg-white/30 text-white font-semibold py-2 text-xs rounded-xl flex items-center justify-center gap-1"
                >
                  <Clock className="w-3 h-3" />
                  {m}分後
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
