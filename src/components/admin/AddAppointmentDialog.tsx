"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createManualReservation } from "@/app/actions/adminReserve";
import { toast } from "sonner";

import { getTimeSlots } from "@/lib/time-slots";

// 静的なTIME_SLOTSを削除

export function AddAppointmentDialog({ 
  onSuccess,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
  defaultDate,
  defaultTime
}: { 
  onSuccess?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultDate?: Date;
  defaultTime?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (externalOnOpenChange) externalOnOpenChange(val);
    else setInternalOpen(val);
  };

  const [date, setDate] = useState<Date | undefined>(defaultDate);
  const [time, setTime] = useState<string>(defaultTime || "");
  const [visitType, setVisitType] = useState<string>("new");
  const [recurringWeeks, setRecurringWeeks] = useState<string>("1");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ダイアログが開いた時に初期値をセットする
  useEffect(() => {
    if (open) {
      if (defaultDate) setDate(defaultDate);
      if (defaultTime) setTime(defaultTime);
    }
  }, [open, defaultDate, defaultTime]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date || !time) {
      toast.error("日付と時間を選択してください");
      return;
    }

    setIsSubmitting(true);
    
    try {
      const formData = new FormData(e.currentTarget);
      formData.append("date", format(date, "yyyy-MM-dd"));
      formData.append("time", time);
      formData.append("visitType", visitType);
      formData.append("recurringWeeks", recurringWeeks);

      const result = await createManualReservation(formData);
      
      if (result.success) {
        toast.success(Number(recurringWeeks) > 1 ? `${recurringWeeks}週分の予約を追加しました` : "予約を追加しました");
        setOpen(false);
        // フォームをリセット
        setDate(undefined);
        setTime("");
        setVisitType("new");
        setRecurringWeeks("1");
        
        // 親コンポーネントに変更を通知
        if (onSuccess) onSuccess();
      } else {
        toast.error(result.error || "エラーが発生しました");
      }
    } catch (error) {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-blue-600 text-primary-foreground shadow-sm hover:bg-blue-700 h-9 px-4 py-2">
        <Plus className="w-4 h-4 mr-2" />
        新規予約を追加
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>新規予約の手動追加</DialogTitle>
          <DialogDescription>
            電話や直接訪問で受けた予約情報を以下のフォームからシステムに登録します。
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>予約日 <span className="text-red-500">*</span></Label>
              <Popover>
                <PopoverTrigger className="inline-flex items-center whitespace-nowrap rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "yyyy/MM/dd (E)", { locale: ja }) : <span className="text-muted-foreground">選択</span>}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                    locale={ja}
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label>時間 <span className="text-red-500">*</span></Label>
              <select 
                value={time} 
                onChange={(e) => setTime(e.target.value)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {!date ? (
                  <option value="" disabled>先に日付を選択</option>
                ) : getTimeSlots(date, true).length === 0 ? (
                  <option value="" disabled>休診日です</option>
                ) : (
                  <option value="" disabled>時間を選択</option>
                )}
                
                {date && getTimeSlots(date, true).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">患者名 <span className="text-red-500">*</span></Label>
            <Input id="name" name="name" required placeholder="山田 太郎" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">電話番号 <span className="text-red-500">*</span></Label>
            <Input id="phone" name="phone" type="tel" required placeholder="090-0000-0000" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>所要時間 <span className="text-red-500">*</span></Label>
              <select 
                name="duration"
                defaultValue="30"
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="30">30分</option>
                <option value="60">1時間 (60分)</option>
                <option value="90">1時間30分</option>
                <option value="120">2時間</option>
                <option value="150">2時間30分</option>
                <option value="180">3時間</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>初診/再診 <span className="text-red-500">*</span></Label>
              <select 
                value={visitType}
                onChange={(e) => setVisitType(e.target.value)}
                required
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="new">初診</option>
                <option value="return">再診</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>繰り返し設定</Label>
              <select 
                value={recurringWeeks}
                onChange={(e) => setRecurringWeeks(e.target.value)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="1">今回のみ (繰り返しなし)</option>
                <option value="2">2週連続 (毎週)</option>
                <option value="3">3週連続 (毎週)</option>
                <option value="4">4週連続 (毎週)</option>
                <option value="8">8週連続 (約2ヶ月)</option>
                <option value="12">12週連続 (約3ヶ月)</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="symptoms">メモ（症状など）</Label>
            <Input id="symptoms" name="symptoms" placeholder="例: 腰痛（電話予約）" />
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={isSubmitting || !date || !time} className="bg-blue-600 hover:bg-blue-700">
              {isSubmitting ? "保存中..." : "予約を追加する"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
