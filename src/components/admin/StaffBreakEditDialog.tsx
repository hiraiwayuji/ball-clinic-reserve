"use client";

import { useEffect, useState } from "react";
import { Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { setStaffBreakForDate } from "@/app/actions/staff-schedule";

const toMin = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (n: number) => {
  const c = Math.max(0, Math.min(23 * 60 + 55, n));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
};

export type StaffBreakEditTarget = {
  staffId: string;
  staffName: string;
  /** "yyyy-MM-dd" */
  dateStr: string;
  /** 見出し用 "9月24日(木)" */
  dateLabel: string;
  /** いまその日に効いている休憩（無ければ null） */
  current: { start: string; end: string } | null;
  /** いつもの休憩（勤務表の毎週の設定。無ければ null） */
  weekly: { start: string; end: string } | null;
  /** その日だけ変更している最中か */
  isDateOverride: boolean;
};

/**
 * 先生の休憩を「その日だけ」動かす・短くする・長くする・無しにする。
 * 予約表の休憩（斜線）の「休憩 ✎」から開く。
 */
export function StaffBreakEditDialog({
  target,
  onClose,
  slotMinutes,
  onSaved,
}: {
  target: StaffBreakEditTarget | null;
  onClose: () => void;
  slotMinutes: number;
  onSaved: () => void;
}) {
  const step = slotMinutes > 0 ? slotMinutes : 20;
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("13:00");
  const [saving, setSaving] = useState(false);

  // 開くたびに、いまの休憩（無ければいつもの休憩）を初期値にする
  useEffect(() => {
    if (!target) return;
    const base = target.current ?? target.weekly ?? { start: "12:00", end: "13:00" };
    setStart(base.start);
    setEnd(base.end);
  }, [target]);

  if (!target) return null;

  const valid = /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && toMin(end) > toMin(start);
  const lengthMin = valid ? toMin(end) - toMin(start) : 0;

  const move = (delta: number) => {
    if (!valid) return;
    const len = toMin(end) - toMin(start);
    const ns = Math.max(0, Math.min(24 * 60 - 5 - len, toMin(start) + delta));
    setStart(fromMin(ns));
    setEnd(fromMin(ns + len));
  };
  const resize = (delta: number) => {
    if (!valid) return;
    const ne = toMin(end) + delta;
    if (ne <= toMin(start)) return; // 0分以下にはしない
    setEnd(fromMin(ne));
  };

  const run = async (mode: "set" | "none" | "reset") => {
    if (mode === "set" && !valid) {
      toast.error("終了は開始より後の時刻にしてください。");
      return;
    }
    setSaving(true);
    try {
      const res = await setStaffBreakForDate(
        target.staffId,
        target.dateStr,
        mode,
        mode === "set" ? start : null,
        mode === "set" ? end : null,
      );
      if (res.success) {
        toast.success(
          mode === "set"
            ? `${target.staffName}さんの ${target.dateLabel} の休憩を ${start}〜${end} にしました。`
            : mode === "none"
              ? `${target.staffName}さんの ${target.dateLabel} は休憩なしにしました。`
              : `${target.staffName}さんの ${target.dateLabel} をいつもの休憩に戻しました。`,
        );
        onSaved();
        onClose();
      } else {
        toast.error(res.error || "保存に失敗しました。");
      }
    } finally {
      setSaving(false);
    }
  };

  const chip =
    "h-9 px-3 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200";

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coffee className="w-5 h-5 text-amber-600" />
            {target.staffName}さんの休憩を変える
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 leading-relaxed dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-100">
            <p className="font-bold text-sm">{target.dateLabel} だけの変更です</p>
            <p>
              いつもの休憩：
              <span className="font-semibold">
                {target.weekly ? `${target.weekly.start}〜${target.weekly.end}` : "なし"}
              </span>
              {target.isDateOverride && (
                <span className="ml-2 inline-block rounded bg-amber-600 text-white px-1.5 py-0.5 text-[10px] font-black">
                  この日は変更中
                </span>
              )}
            </p>
            <p className="mt-1">ほかの日は変わりません。患者さんのWeb予約にもすぐ反映されます。すでに入っている予約は動きません。</p>
          </div>

          {/* ① 時間を決める */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">① この日の休憩の時間</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[11px] text-slate-500">開始</span>
                <input
                  type="time"
                  step={300}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  aria-label="休憩の開始"
                  className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:bg-slate-800 dark:border-slate-600"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-slate-500">終了</span>
                <input
                  type="time"
                  step={300}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  aria-label="休憩の終了"
                  className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:bg-slate-800 dark:border-slate-600"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              {valid ? `長さ ${lengthMin}分` : "終了は開始より後の時刻にしてください"}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chip} disabled={!valid || saving} onClick={() => move(-step)}>← {step}分 早く</button>
              <button type="button" className={chip} disabled={!valid || saving} onClick={() => move(step)}>{step}分 遅く →</button>
              <button type="button" className={chip} disabled={!valid || saving || lengthMin <= step} onClick={() => resize(-step)}>{step}分 短く</button>
              <button type="button" className={chip} disabled={!valid || saving} onClick={() => resize(step)}>{step}分 長く</button>
            </div>
          </div>

          {/* ② 保存 */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">② 保存する</Label>
            <Button
              onClick={() => run("set")}
              disabled={saving || !valid}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
            >
              {saving ? "保存中…" : `この日の休憩を ${start}〜${end} にする`}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => run("none")} disabled={saving}>
                この日は休憩なし
              </Button>
              <Button
                variant="outline"
                onClick={() => run("reset")}
                disabled={saving || !target.isDateOverride}
                title={target.isDateOverride ? "" : "この日はいつもの休憩のままです"}
              >
                いつもの時間に戻す
              </Button>
            </div>
            <Button variant="ghost" onClick={onClose} disabled={saving} className="w-full">
              変えずに閉じる
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
