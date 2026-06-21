"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarIcon, Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { createBlockedSlot } from "@/app/actions/blocked-slots";
import { getAdminTimeSlots } from "@/lib/time-slots";
import { useClinicSlotDuration } from "@/lib/use-clinic-slot-duration";
import { useClinicSchedule } from "@/lib/use-clinic-schedule";

const toMin = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

export function AddBreakDialog({
  open,
  onOpenChange,
  defaultDate,
  defaultStart,
  defaultEnd,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  defaultStart?: string;
  defaultEnd?: string;
  onSuccess?: () => void;
}) {
  const slotMinutes = useClinicSlotDuration();
  const schedule = useClinicSchedule();
  const [date, setDate] = useState<Date | undefined>(defaultDate);
  const [start, setStart] = useState(defaultStart || "12:00");
  const [end, setEnd] = useState(defaultEnd || "13:00");
  const [reason, setReason] = useState("休憩");
  const [saving, setSaving] = useState(false);

  // ダイアログを開くたびに、呼び出し元の初期値へリセット
  useEffect(() => {
    if (open) {
      setDate(defaultDate);
      setStart(defaultStart || "12:00");
      setEnd(defaultEnd || "13:00");
      setReason("休憩");
    }
  }, [open, defaultDate, defaultStart, defaultEnd]);

  // 開始の選択肢（院の表示範囲）。終了は最後の枠＋1コマも選べるよう末尾に追加。
  const startOptions = useMemo(
    () => getAdminTimeSlots(slotMinutes, schedule),
    [slotMinutes, schedule],
  );
  const endOptions = useMemo(() => {
    const opts = startOptions.filter((t) => toMin(t) > toMin(start));
    const lastSlot = startOptions[startOptions.length - 1];
    if (lastSlot) {
      const after = fromMin(toMin(lastSlot) + slotMinutes);
      if (toMin(after) > toMin(start)) opts.push(after);
    }
    return opts;
  }, [startOptions, start, slotMinutes]);

  // 開始を変えたら、終了が開始以下にならないよう自動補正
  useEffect(() => {
    if (toMin(end) <= toMin(start)) {
      setEnd(fromMin(Math.min(toMin(start) + (slotMinutes || 30), 23 * 60 + 59)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  const handleSave = async () => {
    if (!date) {
      toast.error("日付を選んでください。");
      return;
    }
    if (toMin(end) <= toMin(start)) {
      toast.error("終了時刻は開始時刻より後にしてください。");
      return;
    }
    setSaving(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const res = await createBlockedSlot(dateStr, start, end, reason);
      if (res.success) {
        toast.success("休憩を追加しました。");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(res.error || "追加に失敗しました。");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coffee className="w-5 h-5 text-amber-600" />
            休憩を追加
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <p className="text-xs text-slate-500 leading-relaxed">
            この時間帯はカレンダー上で「休憩」と表示され、患者さんのWeb予約でも
            <span className="font-semibold text-slate-700">予約できなく</span>なります。
          </p>

          {/* 日付 */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">日付</Label>
            <Popover>
              <PopoverTrigger className="flex items-center w-full h-11 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm hover:bg-accent transition-colors text-left">
                <CalendarIcon className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
                {date ? format(date, "yyyy年M月d日（E）", { locale: ja }) : "日付を選ぶ"}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[200]" align="start" side="bottom" sideOffset={4}>
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  locale={ja}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* 時間 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">開始</Label>
              <select
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                {startOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">終了</Label>
              <select
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                {endOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* メモ */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">メモ（任意）</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="休憩 / 昼休み / 会議 など"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              キャンセル
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {saving ? "保存中…" : "この時間を休憩にする"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
