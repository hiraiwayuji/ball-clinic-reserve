"use client";

import { useEffect, useState, useId } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Inbox, ChevronRight as ChevronRightIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { EditAppointmentDialog } from "@/components/admin/EditAppointmentDialog";
import { getMyClinicId } from "@/app/actions/auth";
import { realtimeGuard } from "@/lib/realtime-guard";

const PENDING_SELECT =
  `id, start_time, end_time, memo, is_first_visit, status, customer_id, series_id, clinic_id, course_id, course_name, staff_id, staff_name, room_id, room_name, department, party_size, customers(name, phone, medical_record_number, birth_date)`;

interface PendingReservationsButtonProps {
  /** 確定・編集が反映されたとき、呼び出し元の画面も再取得させるためのコールバック */
  onChanged?: () => void;
  /** 既に clinic_id を持っている画面は渡す（無ければ自前で取得する） */
  clinicId?: string | null;
  /** ボタンの大きさ（既存ヘッダーに合わせる） */
  size?: "sm" | "default";
}

/**
 * 「仮予約（確認待ち）」ボタン＋件数バッジ＋一覧ダイアログ。
 * ネット予約で入った status="pending" の予約を、表示中の日付に関係なく
 * 「今日以降の全件」で拾い、件数を出す。一覧の行をタップすると既存の
 * 予約編集ダイアログが開き、そこで「予約確定」「LINE通知」「修正」ができる。
 *
 * 受付業務中（ダッシュボード）でも予約確認中（予約カレンダー）でも、
 * 仮予約が入ったらすぐ気づけるよう、両画面のヘッダーに置ける自己完結部品。
 */
export function PendingReservationsButton({
  onChanged,
  clinicId: clinicIdProp,
  size = "sm",
}: PendingReservationsButtonProps) {
  const channelKey = useId();
  const [clinicId, setClinicId] = useState<string | null>(clinicIdProp ?? null);
  const [pending, setPending] = useState<any[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // clinic_id が渡されていなければ自分で取得する
  useEffect(() => {
    if (clinicIdProp != null) {
      setClinicId(clinicIdProp);
      return;
    }
    getMyClinicId().then(setClinicId).catch(() => {});
  }, [clinicIdProp]);

  // 仮予約（確認待ち）の取得。今日0時以降の status=pending を全件。
  useEffect(() => {
    async function fetchPending() {
      if (clinicId == null) return;
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const supabase = createClient();
        const { data } = await supabase
          .from("appointments")
          .select(PENDING_SELECT)
          .eq("clinic_id", clinicId)
          .eq("status", "pending")
          .gte("start_time", todayStart.toISOString())
          .order("start_time", { ascending: true });
        setPending(data ?? []);
      } catch (error) {
        console.error("Error fetching pending appointments:", error);
      }
    }
    fetchPending();
  }, [clinicId, refreshKey]);

  // Realtime: appointments 変更で件数を更新（受付中に仮予約が入ったら即反映）
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`pending-reservations-${channelKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, realtimeGuard(() => {
        setRefreshKey((k) => k + 1);
      }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [channelKey]);

  const count = pending.length;

  return (
    <>
      <Button
        variant="default"
        size={size}
        onClick={() => setListOpen(true)}
        className={
          count > 0
            ? "relative bg-amber-500 hover:bg-amber-600 text-white shadow-sm flex items-center gap-1.5 font-bold"
            : "relative bg-white border border-slate-300 text-slate-500 hover:bg-slate-50 flex items-center gap-1.5 font-semibold"
        }
      >
        <Inbox className="w-4 h-4" />
        <span>仮予約</span>
        {count > 0 ? (
          <span className="inline-flex items-center justify-center min-w-[1.4rem] h-5 px-1 rounded-full bg-white text-amber-600 text-xs font-black tabular-nums">
            {count}
          </span>
        ) : (
          <span className="text-xs font-semibold">0件</span>
        )}
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
          </span>
        )}
      </Button>

      {/* 仮予約（確認待ち）一覧ダイアログ */}
      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="w-full max-w-lg mx-auto max-h-[88dvh] overflow-y-auto p-0 gap-0 rounded-2xl">
          <DialogHeader className="px-5 pt-5 pb-4 border-b sticky top-0 bg-white z-10">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Inbox className="w-5 h-5 text-amber-500" />
              仮予約（確認待ち）
              <span className="ml-1 inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-amber-100 text-amber-700 text-sm font-black tabular-nums">
                {count}
              </span>
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 mt-1">
              ネット予約から届いた、まだ確定していない予約です。内容を確認して「予約確定」してください。
            </DialogDescription>
          </DialogHeader>

          <div className="px-4 py-4 space-y-2">
            {count === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <Inbox className="w-7 h-7 text-emerald-400" />
                </div>
                <p className="font-bold text-slate-700">確認待ちの仮予約はありません</p>
                <p className="text-sm text-slate-400 mt-1">新しいネット予約が届くとここに表示されます。</p>
              </div>
            ) : (
              pending.map((apt) => {
                const cust = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
                const start = new Date(apt.start_time);
                return (
                  <button
                    key={apt.id}
                    type="button"
                    onClick={() => {
                      setSelected({ ...apt, customers: cust });
                      setListOpen(false);
                      setEditOpen(true);
                    }}
                    className="w-full text-left rounded-xl border-2 border-amber-200 bg-amber-50/60 hover:border-amber-400 hover:bg-amber-50 px-4 py-3 transition-all flex items-center gap-3"
                  >
                    <div className="flex flex-col items-center justify-center bg-white rounded-lg border border-amber-200 px-2.5 py-1.5 shrink-0">
                      <span className="text-[11px] font-bold text-amber-600 leading-none">
                        {format(start, "M/d", { locale: ja })}
                      </span>
                      <span className="text-sm font-black text-slate-800 leading-tight tabular-nums">
                        {format(start, "HH:mm")}
                      </span>
                      <span className="text-[10px] text-slate-400 leading-none">
                        {format(start, "（E）", { locale: ja })}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-800 truncate">
                        {cust?.name ?? "（お名前未登録）"}
                        <span className="text-slate-400 text-sm">様</span>
                        {apt.is_first_visit && (
                          <span className="ml-2 text-[10px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded-full align-middle">
                            初診
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {apt.course_name ? `${apt.course_name}` : "メニュー指定なし"}
                        {apt.memo ? `・${apt.memo}` : ""}
                      </p>
                      {cust?.phone && (
                        <p className="text-[11px] text-slate-400 truncate tabular-nums">{cust.phone}</p>
                      )}
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-amber-400 shrink-0" />
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 予約編集（確定・LINE通知・修正） */}
      {selected && (
        <EditAppointmentDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          appointment={selected}
          onSuccess={() => {
            setRefreshKey((k) => k + 1);
            setSelected(null);
            onChanged?.();
          }}
        />
      )}
    </>
  );
}
