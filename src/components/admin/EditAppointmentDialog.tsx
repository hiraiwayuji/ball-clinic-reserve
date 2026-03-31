"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarIcon, Edit, Trash2, MessageCircle } from "lucide-react";
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
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { updateAppointmentDetails, deleteAppointment, updateAppointmentStatus, sendLineConfirmation } from "@/app/actions/adminReserve";
import { CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { getTimeSlots } from "@/lib/time-slots";

interface EditAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: any;
  onSuccess?: () => void;
}

export function EditAppointmentDialog({ open, onOpenChange, appointment, onSuccess }: EditAppointmentDialogProps) {
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState<string>("");
  const [duration, setDuration] = useState<string>("30");
  const [visitType, setVisitType] = useState<string>("return");
  const [memo, setMemo] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && appointment) {
      const startDateTime = parseISO(appointment.start_time);
      setDate(startDateTime);
      setTime(format(startDateTime, "HH:mm"));
      
      let diffMinutes = 30;
      if (appointment.end_time) {
        const endDateTime = parseISO(appointment.end_time);
        diffMinutes = Math.round((endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60));
      }
      setDuration(diffMinutes > 0 ? diffMinutes.toString() : "30");

      setVisitType(appointment.is_first_visit ? "new" : "return");
      setMemo(appointment.memo || "");
    }
  }, [open, appointment]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date || !time || !appointment) {
      toast.error("日付と時間を選択してください");
      return;
    }

    setIsSubmitting(true);
    
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const isFirstVisit = visitType === "new";

      const result = await updateAppointmentDetails(
        appointment.id,
        dateStr,
        time,
        memo,
        isFirstVisit,
        Number(duration)
      );
      
      if (result.success) {
        toast.success("予約を更新しました");
        onOpenChange(false);
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

  const handleDelete = async () => {
    if (!appointment) return;
    if (!confirm("本当にこの予約を削除（キャンセル）しますか？")) return;

    setIsSubmitting(true);
    try {
      const result = await deleteAppointment(appointment.id);
      if (result.success) {
        toast.success("予約を削除しました");
        onOpenChange(false);
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

  const handleSendLine = async () => {
    if (!appointment) return;
    setIsSubmitting(true);
    try {
      const result = await sendLineConfirmation(appointment.id);
      if (result.success) {
        toast.success("LINEを送信しました");
      } else {
        toast.error(result.error || "LINE送信に失敗しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (!appointment) return;
    setIsSubmitting(true);
    try {
      const result = await updateAppointmentStatus(appointment.id, "confirmed");
      if (result.success) {
        toast.success("予約を確定しました");
        onOpenChange(false);
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

  if (!appointment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>予約の編集・削除</DialogTitle>
          <DialogDescription>
            対象患者: <span className="font-bold text-black">{appointment.customers?.name}</span>様
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
                <PopoverContent className="w-auto p-0 z-[100]">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>所要時間 <span className="text-red-500">*</span></Label>
              <select 
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="memo">メモ（症状など）</Label>
            <Input 
              id="memo" 
              name="memo" 
              value={memo} 
              onChange={(e) => setMemo(e.target.value)}
              placeholder="例: 腰痛（電話予約）" 
            />
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            <div className="flex gap-2">
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
                <Trash2 className="w-4 h-4 mr-2" />
                削除
              </Button>
              {appointment.status === "pending" && (
                <Button type="button" variant="default" onClick={handleConfirm} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  確定
                </Button>
              )}
              <Button type="button" variant="outline" onClick={handleSendLine} disabled={isSubmitting} className="border-green-400 text-green-700 hover:bg-green-50">
                <MessageCircle className="w-4 h-4 mr-2" />
                LINE通知
              </Button>
            </div>
            <div className="space-x-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                キャンセル
              </Button>
              <Button type="submit" disabled={isSubmitting || !date || !time} className="bg-blue-600 hover:bg-blue-700">
                {isSubmitting ? "保存中..." : "変更を保存"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
