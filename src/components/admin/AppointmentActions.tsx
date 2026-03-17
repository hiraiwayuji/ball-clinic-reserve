"use client";

import { useState } from "react";
import { MoreHorizontal, CalendarCheck, Ban, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { updateAppointmentStatus, deleteAppointment } from "@/app/actions/adminReserve";
import { toast } from "sonner";

interface AppointmentActionsProps {
  appointmentId: string;
  currentStatus: string;
}

export function AppointmentActions({ appointmentId, currentStatus }: AppointmentActionsProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // ステータス変更処理
  const handleStatusChange = async (newStatus: "confirmed" | "cancelled" | "pending" | "waiting") => {
    if (newStatus === currentStatus || isUpdating) return;
    
    setIsUpdating(true);
    try {
      const result = await updateAppointmentStatus(appointmentId, newStatus);
      if (result.success) {
        toast.success("ステータスを更新しました");
      } else {
        toast.error(result.error || "ステータス更新に失敗しました");
      }
    } catch (error) {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsUpdating(false);
    }
  };

  // 削除処理
  const handleDelete = async () => {
    if (isUpdating) return;
    
    setIsUpdating(true);
    try {
      const result = await deleteAppointment(appointmentId);
      if (result.success) {
        toast.success("予約を削除しました");
        setShowDeleteDialog(false);
      } else {
        toast.error(result.error || "予約の削除に失敗しました");
      }
    } catch (error) {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer disabled:pointer-events-none disabled:opacity-50" disabled={isUpdating}>
        <span className="sr-only">メニューを開く</span>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5 text-sm font-semibold">操作アクション</div>
        <DropdownMenuSeparator />
        
        {currentStatus !== "confirmed" && (
          <DropdownMenuItem onClick={() => handleStatusChange("confirmed")} className="text-green-600 focus:text-green-700 cursor-pointer">
            <CalendarCheck className="mr-2 h-4 w-4" />
            予約を「確定」にする
          </DropdownMenuItem>
        )}
        
        {currentStatus !== "cancelled" && (
          <DropdownMenuItem onClick={() => handleStatusChange("cancelled")} className="text-orange-600 focus:text-orange-700 cursor-pointer">
            <Ban className="mr-2 h-4 w-4" />
            「キャンセル」する
          </DropdownMenuItem>
        )}
        
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onSelect={(e) => {
            e.preventDefault();
            setShowDeleteDialog(true);
          }} 
          className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          予約データを削除する
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>予約の削除</DialogTitle>
          <DialogDescription>
            この予約データを完全に削除しますか？<br />
            この操作は取り消せません。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={isUpdating}>
            キャンセル
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isUpdating}>
            {isUpdating ? "削除中..." : "削除する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
