"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { format, startOfWeek, addDays, addWeeks, isSameDay } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, Loader2, RotateCcw,
  UserCheck, CreditCard, XCircle, Plus, CalendarPlus, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { realtimeGuard } from "@/lib/realtime-guard";
import { getTimelineRange, type TimelineData, type TimelineDay, type TimelineAppointment } from "@/app/actions/timeline";
import { updateCheckinStatus, addAddonToAppointment, getAddonCourseInfo, sendReviewRequest, getReviewRequestConfig, restoreCancelledAppointment, deleteAppointment, setCancelledGhostHidden, getMonthCrossingFirstVisits, updateAppointmentDetails } from "@/app/actions/adminReserve";
import { cancelKindLabel } from "@/components/admin/CancelledAppointmentDialog";
import { getStaffSchedulesForDates, upsertStaffScheduleForDate, type StaffDaySchedule } from "@/app/actions/staff-schedule";
import { getMyRole } from "@/app/actions/auth";
import type { ClinicRole } from "@/app/actions/auth";
import { AddAppointmentDialog } from "@/components/admin/AddAppointmentDialog";
import { EditAppointmentDialog } from "@/components/admin/EditAppointmentDialog";
import { PendingReservationsButton } from "@/components/admin/PendingReservationsButton";
import { getBlockedSlots, deleteBlockedSlot, type BlockedSlot } from "@/app/actions/blocked-slots";

// スタッフ未指定の予約をまとめる仮想列
const UNASSIGNED_KEY = "__unassigned__";

function jstHourMinute(iso: string): { hour: number; minute: number } {
  // ISO 文字列を Asia/Tokyo の時刻として解釈
  const d = new Date(iso);
  // toLocaleString で 'Asia/Tokyo' に変換 → 解析
  const parts = d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).split(":");
  return { hour: parseInt(parts[0], 10) || 0, minute: parseInt(parts[1], 10) || 0 };
}

function minuteOfDayJst(iso: string): number {
  const { hour, minute } = jstHourMinute(iso);
  return hour * 60 + minute;
}

function fmtTime(iso: string): string {
  const { hour, minute } = jstHourMinute(iso);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** ISO文字列 → JSTでの "yyyy-MM-dd"（その予約がどの日のブロックに属するか） */
function jstDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 分（0時からの通算） → "HH:MM" */
function minutesToHm(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** ドラッグで動かした予約の「移動先」。確認ダイアログに出してから実行する。 */
type MovePlan = {
  apt: TimelineAppointment;
  toStaffId: string;
  toStaffName: string;
  fromStaffName: string;
  /** 別の先生の行に落とした＝担当を付け替える */
  staffChanged: boolean;
  /** 週表示で別の日のブロックに落とした＝日付も変える */
  dateChanged: boolean;
  fromDateLabel: string;
  /** 移動先の日付 "yyyy-MM-dd" */
  toDateKey: string;
  toDateLabel: string;
  fromTimeLabel: string;
  toTimeLabel: string;
  durationMinutes: number;
};

/** 表示レンジ。"day"=1日だけ / "week"=月曜〜日曜を縦に7つ */
type RangeMode = "day" | "week";
const RANGE_MODE_STORAGE_KEY = "admin_timeline_range_mode";

/** Date → "yyyy-MM-dd" */
const dateKeyOf = (d: Date) => format(d, "yyyy-MM-dd");
/** "yyyy-MM-dd" → その日のローカル 0:00 の Date */
const dateFromKey = (key: string) => new Date(`${key}T00:00:00`);
/** from〜to（両端含む）の "yyyy-MM-dd" 一覧 */
function eachDateKey(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  const last = dateFromKey(toKey);
  for (let d = dateFromKey(fromKey); d <= last; d = addDays(d, 1)) out.push(dateKeyOf(d));
  return out;
}

function statusColor(status: string, checkin: string | null, isFirstVisit: boolean): string {
  // キャンセル済みは薄いゴースト表示（枠は空き扱い。誰がキャンセルしたか一目でわかるように残す）
  if (status === "cancelled") return "bg-slate-50/70 border-dashed border-slate-300 text-slate-400 dark:bg-slate-800/30 dark:border-slate-600 dark:text-slate-500";
  if (status === "waiting") return "bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100";
  if (checkin === "arrived") return "bg-emerald-100 border-emerald-400 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100";
  if (checkin === "done") return "bg-slate-100 border-slate-300 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300";
  if (isFirstVisit) return "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100";
  return "bg-sky-50 border-sky-300 text-sky-900 dark:bg-sky-900/30 dark:text-sky-100";
}

/**
 * 時間帯の帯（勤務時間・休憩・受付カバー）の位置。
 * グリッドの1列目はスタッフ名の 140px なので、％は「140px を除いた残り幅」に対して掛ける。
 * （140px を含む全幅に掛けていたため、帯が右にズレて実際の時刻と合っていなかった）
 */
function bandStyle(startMin: number, endMin: number, scheduleStart: number, scheduleEnd: number) {
  const total = scheduleEnd - scheduleStart;
  if (total <= 0) return null;
  const l = Math.max(0, (Math.max(startMin, scheduleStart) - scheduleStart) / total);
  const r = Math.min(1, (Math.min(endMin, scheduleEnd) - scheduleStart) / total);
  if (r <= l) return null;
  return {
    left: `calc(140px + (100% - 140px) * ${l})`,
    width: `calc((100% - 140px) * ${r - l})`,
  };
}

export default function TodayTimelineWidget({
  showPendingButton = true,
  breakMode = false,
  onBreakCell,
}: {
  showPendingButton?: boolean;
  /** 予約画面の「休憩モード」。ON のあいだは空きセルのタップで休憩を追加する。 */
  breakMode?: boolean;
  onBreakCell?: (date: Date, time: string) => void;
} = {}) {
  const router = useRouter();
  // 基準日。week のときはこの日を含む「月曜〜日曜」を表示する。
  const [date, setDate] = useState<Date | null>(null);
  const [rangeMode, setRangeMode] = useState<RangeMode>("day");
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedApt, setSelectedApt] = useState<TimelineAppointment | null>(null);
  // 「施術後に○○を追加」用：院ごとに設定された追加メニュー（未設定ならボタン非表示）
  const [addonInfo, setAddonInfo] = useState<{ courseId: string; name: string; allowConcurrent: boolean } | null>(null);
  // Googleクチコミ依頼が使えるか（設定URLがある院のみボタン表示）
  const [reviewEnabled, setReviewEnabled] = useState(false);

  // 臨時の休憩枠（予約ブロック）。休憩モードで足したぶんをこの画面にも帯で出す。
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);

  // 新規予約ダイアログ（空きセルクリックで開く）
  const [reserveDialog, setReserveDialog] = useState<{
    open: boolean;
    staffId?: string;
    time?: string;
    date?: Date;
  }>({ open: false });

  // 「次回予約」ダイアログ（予約詳細から起動。元予約の course_id/staff_id/時刻をプリセット）
  const [nextReserveDialog, setNextReserveDialog] = useState<{
    open: boolean;
    name?: string;
    courseId?: string;
    staffId?: string;
    time?: string;
  }>({ open: false });

  // 「予約変更」ダイアログ（既存予約の編集）
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    appointment: TimelineAppointment | null;
  }>({ open: false, appointment: null });

  // 受付・会計ボタンの非同期処理ロック
  const [actionLoading, setActionLoading] = useState(false);

  // ── 予約バーのドラッグ＆ドロップ移動 ──
  // ドラッグ中の予約ID（このあいだは全バーを pointer-events-none にして、
  // バーの下に隠れているセルにも落とせるようにする）
  const [draggingAptId, setDraggingAptId] = useState<string | null>(null);
  // ドラッグが今どのセルの上にあるか（ハイライト用）
  const [dropTarget, setDropTarget] = useState<{ dateKey: string; staffId: string; minute: number } | null>(null);
  // 落とした先の確認ダイアログ（誤ドラッグでそのまま動くと事故になるため一度確認する）
  const [movePlan, setMovePlan] = useState<MovePlan | null>(null);
  const [moving, setMoving] = useState(false);

  // スタッフ勤務スケジュール（"yyyy-MM-dd" → その日のスタッフ勤務）
  const [schedulesByDate, setSchedulesByDate] = useState<Record<string, StaffDaySchedule[]>>({});
  const [userRole, setUserRole] = useState<ClinicRole | null>(null);
  // 勤務時間編集ポップアップ。週表示では同じ先生が7日ぶん並ぶので "日付|staffId" で1つに絞る
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editStart, setEditStart] = useState<string>("");
  const [editEnd, setEditEnd] = useState<string>("");
  const [editBreakStart, setEditBreakStart] = useState<string>("");
  const [editBreakEnd, setEditBreakEnd] = useState<string>("");
  const [editIsOff, setEditIsOff] = useState<boolean>(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  // 受付AI調整メッセージ
  const [receptionAiMsg, setReceptionAiMsg] = useState<string | null>(null);
  // 月またぎ（先月から継続の患者様の今月最初の来院）バッジ対象の予約ID
  const [monthCrossIds, setMonthCrossIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDate(new Date());
    // 前回選んでいた表示（1日 / 1週間）を復元する
    try {
      const saved = localStorage.getItem(RANGE_MODE_STORAGE_KEY);
      if (saved === "week" || saved === "day") setRangeMode(saved);
    } catch {}
  }, []);

  const changeRangeMode = (mode: RangeMode) => {
    setRangeMode(mode);
    try { localStorage.setItem(RANGE_MODE_STORAGE_KEY, mode); } catch {}
  };

  // ロール取得（owner のみスケジュール編集可）
  useEffect(() => { getMyRole().then(setUserRole).catch(() => {}); }, []);

  // 追加メニュー設定を取得（「施術後に○○を追加」ボタンの表示・ラベル用）
  useEffect(() => { getAddonCourseInfo().then(setAddonInfo).catch(() => setAddonInfo(null)); }, []);

  // Googleクチコミ依頼の可否（設定URLがあるか）
  useEffect(() => { getReviewRequestConfig().then((c) => setReviewEnabled(c.enabled)).catch(() => setReviewEnabled(false)); }, []);

  // 来院後のGoogleクチコミお願いLINEを送る
  const handleSendReview = async (apt: TimelineAppointment) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const res = await sendReviewRequest(apt.id);
      if (res.success) toast.success(`${apt.customer_name ?? "患者"}様へ口コミお願いLINEを送りました`);
      else toast.error(res.error ?? "送信に失敗しました");
    } finally {
      setActionLoading(false);
    }
  };

  // 表示する期間（両端含む）。week は月曜〜日曜。
  const rangeFromKey = date
    ? dateKeyOf(rangeMode === "week" ? startOfWeek(date, { weekStartsOn: 1 }) : date)
    : null;
  const rangeToKey = date
    ? dateKeyOf(rangeMode === "week" ? addDays(startOfWeek(date, { weekStartsOn: 1 }), 6) : date)
    : null;

  // 再取得は「期間が変わったとき」だけ。週表示なら週内の日移動では一切取り直さない。
  const fetchRange = useCallback(async (fromKey: string, toKey: string) => {
    setError(null);
    // 月またぎバッジ（先月から継続・今月最初の来院）は期間ぶんまとめて取得
    const rangeStartISO = new Date(`${fromKey}T00:00:00+09:00`).toISOString();
    const rangeEndISO = new Date(`${toKey}T00:00:00+09:00`).toISOString();
    getMonthCrossingFirstVisits(rangeStartISO, new Date(new Date(rangeEndISO).getTime() + 24 * 3600 * 1000).toISOString())
      .then((ids) => setMonthCrossIds(new Set(ids)))
      .catch(() => setMonthCrossIds(new Set()));

    const [res, schedRes] = await Promise.all([
      getTimelineRange(fromKey, toKey),
      getStaffSchedulesForDates(eachDateKey(fromKey, toKey)),
    ]);
    if (res.success && res.data) {
      setData(res.data);
    } else {
      setError(res.error ?? "取得失敗");
    }
    if (schedRes.success && schedRes.byDate) setSchedulesByDate(schedRes.byDate);
    setLoading(false);
  }, []);

  // 期間が変わったときだけ取り直す（画面は消さず、前の内容を残したまま差し替える）
  useEffect(() => {
    if (!rangeFromKey || !rangeToKey) return;
    fetchRange(rangeFromKey, rangeToKey);
  }, [rangeFromKey, rangeToKey, fetchRange]);

  // 休憩枠（予約ブロック）を期間ぶん取得
  const fetchBlocked = useCallback(async (fromKey: string, toKey: string) => {
    try {
      setBlockedSlots(await getBlockedSlots(fromKey, toKey));
    } catch {
      // 取れなくてもタイムテーブル自体は出す
    }
  }, []);

  useEffect(() => {
    if (!rangeFromKey || !rangeToKey) return;
    fetchBlocked(rangeFromKey, rangeToKey);
  }, [rangeFromKey, rangeToKey, fetchBlocked]);

  // 予約の追加・変更のあとに今の期間を取り直す
  const rangeRef = useRef<{ from: string; to: string } | null>(null);
  rangeRef.current = rangeFromKey && rangeToKey ? { from: rangeFromKey, to: rangeToKey } : null;
  const refresh = useCallback(() => {
    const r = rangeRef.current;
    if (r) { fetchRange(r.from, r.to); fetchBlocked(r.from, r.to); }
  }, [fetchRange, fetchBlocked]);

  // Realtime: appointments / 休憩枠の変更で再取得。
  // 購読は張りっぱなしにし、日付が変わっても貼り直さない（毎回の再購読がもたつきの元だった）。
  useEffect(() => {
    const sb = createClient();
    const ch = sb.channel("timeline-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, realtimeGuard(() => refresh()))
      .on("postgres_changes", { event: "*", schema: "public", table: "clinic_blocked_slots" }, realtimeGuard(() => refresh()))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [refresh]);

  // 休憩枠の削除（帯の × ボタン）
  const handleDeleteBlocked = async (b: BlockedSlot) => {
    if (!window.confirm(`${b.start_time}〜${b.end_time} の「${b.reason}」を削除しますか？`)) return;
    const res = await deleteBlockedSlot(b.id);
    if (res.success) {
      toast.success("休憩を削除しました。");
      refresh();
    } else {
      toast.error(res.error ?? "削除に失敗しました。");
    }
  };

  // 1日表示なら前後1日、週表示なら前後1週間ぶん動かす
  const goPrev = () => date && setDate(rangeMode === "week" ? addWeeks(date, -1) : addDays(date, -1));
  const goNext = () => date && setDate(rangeMode === "week" ? addWeeks(date, 1) : addDays(date, 1));
  const goToday = () => setDate(new Date());

  // 空きセルクリック → 新規予約ダイアログを開く
  // （休憩モードONのときは予約ではなく「休憩（予約ブロック）」を追加する）
  const handleEmptyCellClick = (dateKey: string, staffId: string, minuteOfDay: number) => {
    const hh = Math.floor(minuteOfDay / 60);
    const mm = minuteOfDay % 60;
    const timeStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    if (breakMode && onBreakCell) {
      onBreakCell(dateFromKey(dateKey), timeStr);
      return;
    }
    setReserveDialog({
      open: true,
      staffId: staffId === UNASSIGNED_KEY ? undefined : staffId,
      time: timeStr,
      date: dateFromKey(dateKey),
    });
  };

  // 受付（チェックイン）
  const handleCheckin = async (apt: TimelineAppointment) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const res = await updateCheckinStatus(apt.id, "arrived");
      if (res.success) {
        toast.success(`${apt.customer_name ?? "患者"} を受付しました`);
        setSelectedApt(null);
        refresh();
      } else {
        toast.error(res.error ?? "受付処理に失敗しました");
      }
    } finally {
      setActionLoading(false);
    }
  };

  // 予約に「設定された追加メニュー」を追加（施術前 / 施術後 / 同時刻）。同一患者へ直接ひもづけ＝重複アラート無し。
  const handleAddAddon = async (apt: TimelineAppointment, timing: "before" | "after" | "same") => {
    if (actionLoading) return;
    const label = addonInfo?.name ?? "メニュー";
    setActionLoading(true);
    try {
      const res = await addAddonToAppointment(apt.id, timing);
      if (res.success) {
        toast.success(
          timing === "same" ? `同時刻に${label}を追加しました`
            : timing === "before" ? `施術前に${label}を追加しました`
            : `施術後に${label}を追加しました`,
        );
        setSelectedApt(null);
        refresh();
      } else {
        toast.error(res.error ?? "追加に失敗しました");
      }
    } finally {
      setActionLoading(false);
    }
  };

  // 会計画面へ遷移（会計後の「次回予約ワンクリック」用に元予約の情報も URL に詰める）
  const handleGoToSales = (apt: TimelineAppointment) => {
    const params = new URLSearchParams();
    params.set("name", apt.customer_name ?? "");
    params.set("first_visit", String(apt.is_first_visit));
    if (apt.course_name) params.set("course", apt.course_name);
    // 次回予約用: コース・担当・時間枠（時刻部分）を引き継ぐ
    if (apt.customer_id) params.set("customer_id", apt.customer_id);
    if (apt.staff_id) params.set("staff_id", apt.staff_id);
    if (apt.staff_name) params.set("staff_name", apt.staff_name);
    if (apt.course_id) params.set("course_id", apt.course_id);
    // 時間枠（hh:mm）も引き継ぐ
    try {
      const t = new Date(apt.start_time);
      const hh = t.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", hour12: false }).padStart(2, "0");
      const mm = t.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", minute: "2-digit" }).padStart(2, "0");
      params.set("next_time", `${hh}:${mm}`);
    } catch {}
    setSelectedApt(null);
    router.push(`/admin/sales?${params.toString()}`);
  };

  // "HH:MM" → 分
  function hmToMinutes(hm: string): number {
    const [h, m] = hm.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  // スタッフ行（「未指定」という担当は存在しないので仮想列は作らない。
  // 担当未設定の予約は先頭スタッフ＝院のメイン担当（ボール/院長）の行に表示する）
  const staffRows = useMemo(() => {
    if (!data) return [];
    const rows: { id: string; name: string; monthly_visit_target?: number | null; booking_until?: string | null }[] =
      data.staff.map(s => ({
        id: s.id,
        name: s.name,
        monthly_visit_target: s.monthly_visit_target ?? null,
        booking_until: s.booking_until ?? null,
      }));
    return rows;
  }, [data]);

  /** 期間内の全予約（どの日のブロックから掴んだ予約でも引けるようにする） */
  const allAppointments = useMemo(
    () => (data?.days ?? []).flatMap((d) => d.appointments),
    [data],
  );

  // 担当未設定の予約を表示するデフォルト行（先頭スタッフ＝sort_order 最小のメイン担当）
  const defaultStaffId = data?.staff[0]?.id ?? null;

  // 複数担当の予約は行ごとに時間を分割して描いているので、1本だけ動かすと辻褄が合わない。
  // キャンセル済みも動かす意味がないので、どちらもドラッグ不可にする。
  const canDrag = (a: TimelineAppointment): boolean =>
    a.status !== "cancelled" && (a.additional_staff?.length ?? 0) === 0;

  // セルに落とした → 確認ダイアログ用の移動プランを作る
  // 週表示では別の日のブロックにも落とせるので、移動先の日付も受け取る。
  const handleDropOnCell = (toDateKey: string, toStaffId: string, toMinute: number) => {
    setDropTarget(null);
    const aptId = draggingAptId;
    setDraggingAptId(null);
    if (!aptId || !data) return;

    const apt = allAppointments.find((a) => a.id === aptId);
    if (!apt || !canDrag(apt)) return;

    const fromMinute = minuteOfDayJst(apt.start_time);
    const fromDateKey = jstDateKey(apt.start_time);
    // 担当未設定の予約は先頭スタッフの行に描いているので、その行を「今いる行」とみなす
    const fromLaneId = apt.staff_id ?? defaultStaffId;
    if (toDateKey === fromDateKey && toStaffId === fromLaneId && toMinute === fromMinute) return; // 動いていない

    const durationMinutes = apt.end_time
      ? Math.max(
          Math.round((new Date(apt.end_time).getTime() - new Date(apt.start_time).getTime()) / 60000),
          data.slotMinutes,
        )
      : data.slotMinutes;

    setMovePlan({
      apt,
      toStaffId,
      toStaffName: staffRows.find((s) => s.id === toStaffId)?.name ?? "担当",
      fromStaffName: apt.staff_name ?? staffRows.find((s) => s.id === fromLaneId)?.name ?? "担当未設定",
      staffChanged: toStaffId !== fromLaneId,
      dateChanged: toDateKey !== fromDateKey,
      fromDateLabel: format(dateFromKey(fromDateKey), "M/d(E)", { locale: ja }),
      toDateKey,
      toDateLabel: format(dateFromKey(toDateKey), "M/d(E)", { locale: ja }),
      fromTimeLabel: fmtTime(apt.start_time),
      toTimeLabel: minutesToHm(toMinute),
      durationMinutes,
    });
  };

  // 確認ダイアログの「移動する」
  const runMove = async () => {
    if (!movePlan) return;
    const { apt, toStaffId, toStaffName, staffChanged, dateChanged, toDateKey, toDateLabel, toTimeLabel, durationMinutes } = movePlan;
    setMoving(true);
    try {
      const res = await updateAppointmentDetails(
        apt.id,
        toDateKey,
        toTimeLabel,
        apt.memo ?? "",
        apt.is_first_visit,
        durationMinutes,
        // 同じ先生の行のなかで時間だけ動かした場合は担当に触らない
        // （担当未設定の予約を勝手に先頭スタッフの担当にしてしまわないため）
        staffChanged ? { staffId: toStaffId } : undefined,
      );
      if (res.success) {
        const whenLabel = dateChanged ? `${toDateLabel} ${toTimeLabel}` : toTimeLabel;
        toast.success(
          staffChanged
            ? `${apt.customer_name ?? "患者"}様を ${toStaffName}・${whenLabel} に移しました`
            : `${apt.customer_name ?? "患者"}様を ${whenLabel} に移しました`,
        );
        setMovePlan(null);
        refresh();
      } else {
        // 「その先生はその時間に別の予約が入っています」等はここに出る
        toast.error(res.error ?? "移動に失敗しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setMoving(false);
    }
  };

  // 予約の詳細から時間だけをその場でずらす。
  // これまでは「予約変更」を開いてプルダウンを選んで保存、と5タップ必要だった。
  const [shiftingTime, setShiftingTime] = useState(false);
  const shiftAppointmentTime = async (apt: TimelineAppointment, deltaMinutes: number) => {
    const start = new Date(apt.start_time);
    const end = apt.end_time ? new Date(apt.end_time) : new Date(start.getTime() + 30 * 60000);
    const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
    const next = new Date(start.getTime() + deltaMinutes * 60000);
    const dateKey = next.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const timeLabel = next.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });
    setShiftingTime(true);
    try {
      const res = await updateAppointmentDetails(
        apt.id, dateKey, timeLabel, apt.memo ?? "", apt.is_first_visit, durationMinutes,
      );
      if (res.success) {
        toast.success(`${apt.customer_name ?? "患者"}様を ${timeLabel} に変更しました`);
        setSelectedApt(null);
        refresh();
      } else {
        toast.error(res.error ?? "時間の変更に失敗しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setShiftingTime(false);
    }
  };

  // 時間軸の刻みリスト（営業終了時刻のラベルも末尾に含める）。
  // 土曜は営業時間が違うので、日ごとに作る。
  const buildTimeMarks = (day: TimelineDay, slotMinutes: number) => {
    const out: { label: string; minute: number }[] = [];
    const startMin = day.scheduleStartHour * 60;
    const endMin = day.scheduleEndHour * 60;
    // <= で営業終了時刻のラベルも出す（例: close=20:00 なら 20:00 が最終マーク）
    for (let m = startMin; m <= endMin; m += slotMinutes) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      out.push({
        label: mm === 0 ? `${h}:00` : `:${String(mm).padStart(2, "0")}`,
        minute: m,
      });
    }
    return out;
  };

  // 予約をスタッフごとにグループ化
  // 複数スタッフの予約は、合計施術時間を等分してスタッフごとに時間帯をずらして表示する
  // （例: 17:00-17:40 を A先生・B先生で 17:00-17:20 / 17:20-17:40 に分割）
  // _displayStart / _displayEnd はタイムテーブル表示専用で、モーダルは元の start_time を使う
  const buildAptsByStaff = (day: TimelineDay, slotMinutes: number) => {
    type DisplayApt = TimelineAppointment & { _displayStart?: string; _displayEnd?: string };
    const map = new Map<string, DisplayApt[]>();

    for (const a of day.appointments) {
      const allStaffIds: string[] = [];
      allStaffIds.push(a.staff_id ?? defaultStaffId ?? UNASSIGNED_KEY);
      for (const add of a.additional_staff ?? []) {
        if (add?.staff_id && !allStaffIds.includes(add.staff_id)) {
          allStaffIds.push(add.staff_id);
        }
      }

      if (allStaffIds.length <= 1) {
        // スタッフ1人の場合はそのまま
        const key = allStaffIds[0];
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(a);
        continue;
      }

      // 複数スタッフ: 合計時間をスタッフ数で等分し時間帯をずらす
      const startMin = minuteOfDayJst(a.start_time);
      const endMinRaw = a.end_time ? minuteOfDayJst(a.end_time) : startMin + slotMinutes;
      const totalDuration = Math.max(endMinRaw - startMin, slotMinutes * allStaffIds.length);
      const perStaff = Math.round(totalDuration / allStaffIds.length);

      // ISO 文字列を分単位でずらすヘルパー
      const shiftIso = (isoBase: string, minuteOffset: number): string => {
        return new Date(new Date(isoBase).getTime() + minuteOffset * 60 * 1000).toISOString();
      };

      allStaffIds.forEach((staffId, idx) => {
        if (!map.has(staffId)) map.set(staffId, []);
        const displayStart = shiftIso(a.start_time, idx * perStaff);
        const displayEnd = shiftIso(a.start_time, (idx + 1) * perStaff);
        map.get(staffId)!.push({ ...a, _displayStart: displayStart, _displayEnd: displayEnd });
      });
    }
    return map as Map<string, TimelineAppointment[]>;
  };

  if (!date) return null;

  return (
    <Card className="shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">
            予約タイムテーブル
            <span className="ml-1 font-normal text-slate-500">
              {rangeMode === "week" && rangeFromKey && rangeToKey
                ? `(${format(dateFromKey(rangeFromKey), "M/d(E)", { locale: ja })}〜${format(dateFromKey(rangeToKey), "M/d(E)", { locale: ja })})`
                : `(${format(date, "M/d (E)", { locale: ja })})`}
            </span>
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {/* 受付業務中でも仮予約が入ったらすぐ気づけるよう、タイムテーブル上にも件数を出す */}
          {showPendingButton && (
            <PendingReservationsButton onChanged={refresh} />
          )}
          {/* 1日 / 1週間 の切替（選んだ方は次回も覚えている） */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {([["day", "1日"], ["week", "1週間"]] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => changeRangeMode(mode)}
                aria-pressed={rangeMode === mode}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                  rangeMode === mode
                    ? "bg-blue-600 text-white"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={goPrev} aria-label={rangeMode === "week" ? "前の週" : "前日"}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToday}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" />{rangeMode === "week" ? "今週" : "今日"}
            </Button>
            <Button variant="outline" size="sm" onClick={goNext} aria-label={rangeMode === "week" ? "次の週" : "翌日"}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />読込中...
          </div>
        ) : error ? (
          <div className="text-rose-600 text-sm py-6 text-center">エラー: {error}</div>
        ) : data && data.staff.length === 0 ? (
          <div className="text-slate-500 text-sm py-6 text-center">
            スタッフが登録されていません。設定 → スタッフから追加してください。
          </div>
        ) : data && (
          <div className="overflow-x-auto">
            {/* 1日表示なら1ブロック、週表示なら月曜〜日曜の7ブロックを縦に積む（下スクロールで日曜まで） */}
            {data.days.map((day) => {
              const dayDate = dateFromKey(day.date);
              const staffSchedules = schedulesByDate[day.date] ?? [];
              const timeMarks = buildTimeMarks(day, data.slotMinutes);
              const aptsByStaff = buildAptsByStaff(day, data.slotMinutes);
              const monthCounts = data.staffMonthCounts[day.monthKey] ?? {};
              const isToday = isSameDay(dayDate, new Date());
              const dow = dayDate.getDay();
              return (
            <div className="min-w-[900px] mb-6 last:mb-0" key={day.date}>
              {/* 週表示のときだけ日付の見出しを出す。
                  横スクロール（overflow-x）と position:sticky は同じ入れ子では両立しないので、
                  貼り付けずに各日の先頭へ普通の見出しとして置く。 */}
              {rangeMode === "week" && (
                <div
                  className={`px-2 py-1.5 mb-1 rounded-md border text-sm font-bold flex items-center gap-2 ${
                    day.isHoliday
                      ? "bg-slate-100 border-slate-300 text-slate-500 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400"
                      : isToday
                        ? "bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-200"
                        : "bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <span className={day.isHoliday ? "" : dow === 0 ? "text-rose-600" : dow === 6 ? "text-blue-600" : ""}>
                    {format(dayDate, "M月d日(E)", { locale: ja })}
                  </span>
                  {day.isHoliday && (
                    <span className="text-[10px] font-black bg-slate-500 text-white px-1.5 py-0.5 rounded">休診日</span>
                  )}
                  {isToday && <span className="text-[10px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded">今日</span>}
                  <span className="ml-auto text-[11px] font-normal text-slate-400 tabular-nums">
                    {day.appointments.filter((a) => a.status !== "cancelled").length}件
                  </span>
                </div>
              )}
              {/* 時間軸ヘッダ */}
              <div
                className="grid items-center text-[10px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700"
                style={{ gridTemplateColumns: `140px repeat(${timeMarks.length}, minmax(28px, 1fr))` }}
              >
                <div className="px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-between gap-1">
                  <span>先生</span>
                  <span className="text-[9px] font-normal text-slate-400 normal-case">
                    {day.monthLabel}実績/目標
                  </span>
                </div>
                {timeMarks.map((m, i) => (
                  <div
                    key={i}
                    className={`text-center py-1 ${m.label.includes(":00") ? "border-l border-slate-300 dark:border-slate-600 font-semibold text-slate-700 dark:text-slate-200" : ""}`}
                  >
                    {m.label}
                  </div>
                ))}
              </div>

              {/* 受付スタッフ カバーストリップ */}
              {(() => {
                const receptionSchedules = staffSchedules.filter((sc) => sc.role === "reception");
                if (receptionSchedules.length === 0) return null;
                const scheduleStart = day.scheduleStartHour * 60;
                const scheduleEnd = day.scheduleEndHour * 60;
                const totalGridMinutes = scheduleEnd - scheduleStart;
                // 9:00–18:00 がカバーされているか
                const coverStart = 9 * 60;
                const coverEnd = 18 * 60;
                const covered = receptionSchedules.some((sc) => {
                  if (sc.isOff || !sc.startTime || !sc.endTime) return false;
                  return hmToMinutes(sc.startTime) <= coverStart && hmToMinutes(sc.endTime) >= coverEnd;
                });
                return (
                  <div
                    className="grid relative border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30"
                    style={{ gridTemplateColumns: `140px repeat(${timeMarks.length}, minmax(28px, 1fr))`, minHeight: "20px" }}
                  >
                    <div className="px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400 sticky left-0 bg-slate-50 dark:bg-slate-800/30 z-10 border-r border-slate-200 dark:border-slate-700 flex items-center gap-1" style={{ gridRow: "1" }}>
                      受付
                      {!covered && (
                        <>
                          <span className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1 rounded font-bold">⚠ カバー不足</span>
                          {userRole === "owner" && (
                            <button
                              type="button"
                              onClick={() => {
                                const dateLabel = format(dayDate, "M月d日(E)", { locale: ja });
                                const onDuty = receptionSchedules.filter((sc) => !sc.isOff && sc.startTime);
                                const onDutyNames = onDuty.map((sc) => `${sc.staffName}（${sc.startTime}〜${sc.endTime}）`).join("、") || "なし";
                                const offDuty = receptionSchedules.filter((sc) => sc.isOff || !sc.startTime);
                                const msg = offDuty.length > 0
                                  ? `${dateLabel}の受付担当がカバーできていません。\n\n現在出勤予定：${onDutyNames}\n\n${offDuty.map(sc => sc.staffName).join("さん、")}さん、${dateLabel}の受付に入れませんか？\n朝〜夕方（9時〜18時）が理想ですが、一部でも大丈夫です！`
                                  : `${dateLabel}の受付が9〜18時をカバーできていません。\n現在出勤予定：${onDutyNames}\n\n受付の方、時間延長できる方はいませんか？`;
                                setReceptionAiMsg(msg);
                              }}
                              className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.5 rounded font-bold hover:bg-blue-200 dark:hover:bg-blue-900/60 transition"
                            >
                              AI調整
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {receptionSchedules.map((sc) => {
                      if (sc.isOff || !sc.startTime || !sc.endTime) return null;
                      const band = bandStyle(
                        hmToMinutes(sc.startTime),
                        hmToMinutes(sc.endTime),
                        scheduleStart,
                        scheduleEnd,
                      );
                      if (!band) return null;
                      return (
                        <div
                          key={sc.staffId}
                          className="absolute top-1 bottom-1 rounded"
                          style={{
                            ...band,
                            backgroundColor: sc.displayColor ?? "#94a3b8",
                            opacity: 0.5,
                            zIndex: 1,
                          }}
                          title={`${sc.staffName} ${sc.startTime}–${sc.endTime}`}
                        />
                      );
                    })}
                  </div>
                );
              })()}

              {/* 臨時の休憩（予約ブロック）ストリップ。
                  院ぜんたいを塞ぐので、スタッフ行とは別に1本の帯で出す。× で削除できる。 */}
              {(() => {
                const dayBlocks = blockedSlots.filter((b) => b.date === day.date);
                if (dayBlocks.length === 0) return null;
                const scheduleStart = day.scheduleStartHour * 60;
                const scheduleEnd = day.scheduleEndHour * 60;
                return (
                  <div
                    className="grid relative border-b border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-900/10"
                    style={{ gridTemplateColumns: `140px repeat(${timeMarks.length}, minmax(28px, 1fr))`, minHeight: "22px" }}
                  >
                    <div className="px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 sticky left-0 bg-amber-50 dark:bg-amber-900/20 z-10 border-r border-amber-200 dark:border-amber-800/60 flex items-center gap-1" style={{ gridRow: "1" }}>
                      🍵 休憩（予約不可）
                    </div>
                    {dayBlocks.map((b) => {
                      const band = bandStyle(hmToMinutes(b.start_time), hmToMinutes(b.end_time), scheduleStart, scheduleEnd);
                      if (!band) return null;
                      return (
                        <div
                          key={b.id}
                          className="absolute top-0.5 bottom-0.5 rounded border border-amber-300 bg-amber-200/80 dark:bg-amber-800/50 dark:border-amber-700 flex items-center justify-center gap-1 overflow-hidden"
                          style={{ ...band, zIndex: 2 }}
                          title={`${b.start_time}〜${b.end_time} ${b.reason}`}
                        >
                          <span className="text-[10px] font-bold text-amber-800 dark:text-amber-200 truncate px-1">
                            {b.start_time}〜{b.end_time} {b.reason}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteBlocked(b)}
                            className="shrink-0 rounded px-1 text-amber-800 dark:text-amber-200 hover:bg-amber-300/70 font-bold"
                            title="この休憩を削除"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* スタッフ行。
                  退職などで「受付最終日」を過ぎた先生は、その日以降のレーンを出さない
                  （空のレーンが残ると、まだ入れられると勘違いするため）。 */}
              {staffRows
                .filter((s) => !s.booking_until || day.date <= String(s.booking_until).slice(0, 10))
                .map((s) => {
                const apts = aptsByStaff.get(s.id) ?? [];
                // 担当未設定分の実績はデフォルト行（先頭スタッフ）に合算する
                const monthCount = (monthCounts[s.id] ?? 0)
                  + (s.id === defaultStaffId ? (monthCounts[UNASSIGNED_KEY] ?? 0) : 0);
                const target = s.monthly_visit_target ?? 0;
                // 達成率に応じてバッジ色を切替: 100%以上=緑、80%以上=青、それ未満=スレート
                const achievementBadge = target > 0
                  ? (monthCount >= target
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : monthCount >= target * 0.8
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")
                  : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
                // ── 時間がかぶる予約を縦に段積み（サブレーン）して全部見えるようにする ──
                // 複数スタッフ予約は _displayStart/_displayEnd を使って実際の表示時刻でレーン計算する。
                type DispApt = TimelineAppointment & { _displayStart?: string; _displayEnd?: string };
                const sortedApts = [...apts].sort((a, b) => {
                  const da = a as DispApt;
                  const db = b as DispApt;
                  return minuteOfDayJst(da._displayStart ?? a.start_time) - minuteOfDayJst(db._displayStart ?? b.start_time);
                });
                const laneEnds: number[] = [];
                const laneOf = new Map<string, number>();
                for (const a of sortedApts) {
                  const da = a as DispApt;
                  const sMin = minuteOfDayJst(da._displayStart ?? a.start_time);
                  const eMin = Math.max(
                    (da._displayEnd ?? a.end_time) ? minuteOfDayJst(da._displayEnd ?? a.end_time!) : sMin + data.slotMinutes,
                    sMin + data.slotMinutes,
                  );
                  // 複数スタッフ予約は staff ごとに別キーを使う
                  const laneKey = da._displayStart ? `${a.id}-${s.id}` : a.id;
                  let lane = laneEnds.findIndex((end) => end <= sMin);
                  if (lane === -1) { lane = laneEnds.length; laneEnds.push(eMin); }
                  else laneEnds[lane] = eMin;
                  laneOf.set(laneKey, lane);
                }
                const laneCount = Math.max(1, laneEnds.length);
                const sched = staffSchedules.find((sc) => sc.staffId === s.id);
                const schedStart = sched?.startTime ? hmToMinutes(sched.startTime) : null;
                const schedEnd = sched?.endTime ? hmToMinutes(sched.endTime) : null;
                const scheduleStart = day.scheduleStartHour * 60;
                const scheduleEnd = day.scheduleEndHour * 60;
                // 勤務時間バーの位置（スタッフ名の 140px を除いた幅に対して計算する）
                const schedBand = (schedStart !== null && schedEnd !== null)
                  ? bandStyle(schedStart, schedEnd, scheduleStart, scheduleEnd)
                  : null;

                const editKey = `${day.date}|${s.id}`;
                const isEditing = editingKey === editKey;

                return (
                  <div
                    key={s.id}
                    className="grid relative border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                    style={{
                      gridTemplateColumns: `140px repeat(${timeMarks.length}, minmax(28px, 1fr))`,
                      gridTemplateRows: `repeat(${laneCount}, minmax(24px, auto))`,
                      minHeight: "48px",
                    }}
                  >
                    {/* 休みの日は行まるごとに斜線をかけて一目で分かるようにする（2026-08-07 藤川先生の要望）。
                        名前の下の小さい「休み」文字だけだと見落とすため。 */}
                    {(sched?.isOff || day.isHoliday) && (
                      <div
                        className="absolute top-0 bottom-0 pointer-events-none"
                        style={{
                          left: "140px",
                          right: 0,
                          zIndex: 0,
                          backgroundColor: "rgba(148, 163, 184, 0.14)",
                          backgroundImage:
                            "repeating-linear-gradient(-45deg, rgba(100,116,139,0.20) 0px, rgba(100,116,139,0.20) 2px, transparent 2px, transparent 9px)",
                        }}
                      />
                    )}
                    {/* 勤務時間バー（予約バーの後ろ、z-index 低め） */}
                    {schedBand && !sched?.isOff && !day.isHoliday && (
                      <div
                        className="absolute top-0 bottom-0 pointer-events-none"
                        style={{
                          ...schedBand,
                          backgroundColor: "rgba(220, 252, 231, 0.5)",
                          zIndex: 0,
                        }}
                      />
                    )}
                    {/* 休憩バンド（グレー帯） */}
                    {(() => {
                      if (!sched || sched.isOff || !sched.breakStart || !sched.breakEnd) return null;
                      const brkBand = bandStyle(
                        hmToMinutes(sched.breakStart),
                        hmToMinutes(sched.breakEnd),
                        scheduleStart,
                        scheduleEnd,
                      );
                      if (!brkBand) return null;
                      return (
                        <div
                          className="absolute top-0 bottom-0 pointer-events-none flex items-center justify-center"
                          style={{
                            ...brkBand,
                            backgroundColor: "rgba(100, 116, 139, 0.18)",
                            zIndex: 1,
                          }}
                        >
                          <span className="text-[8px] text-slate-500 dark:text-slate-400 font-semibold tracking-tight select-none">休憩</span>
                        </div>
                      );
                    })()}
                    <div className="px-2 py-1 text-sm font-medium text-slate-800 dark:text-slate-100 flex flex-col gap-0.5 sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-200 dark:border-slate-700" style={{ gridRow: "1 / -1" }}>
                      <div className="flex items-center justify-between gap-1">
                      {userRole === "owner" ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              setEditingKey(null);
                            } else {
                              setEditingKey(editKey);
                              setEditStart(sched?.startTime ?? "09:00");
                              setEditEnd(sched?.endTime ?? "18:00");
                              setEditBreakStart(sched?.breakStart ?? "");
                              setEditBreakEnd(sched?.breakEnd ?? "");
                              setEditIsOff(sched?.isOff ?? false);
                            }
                          }}
                          className="truncate text-left hover:text-blue-600 dark:hover:text-blue-400 underline-offset-2 hover:underline"
                          title="クリックして勤務時間を編集"
                        >
                          {s.name}
                        </button>
                      ) : (
                        <span className="truncate">{s.name}</span>
                      )}
                      {(monthCount > 0 || target > 0) ? (
                        <span
                          className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums ${achievementBadge}`}
                          title={target > 0
                            ? `${day.monthLabel}実績 ${monthCount} / 目標 ${target}（達成率 ${Math.round((monthCount / target) * 100)}%）`
                            : `${day.monthLabel}の予約件数（キャンセル除く）`}
                        >
                          {target > 0 ? `${monthCount} / ${target}` : monthCount}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] text-slate-300 dark:text-slate-600 tabular-nums">—</span>
                      )}
                      </div>
                      {/* 勤務時間表示 */}
                      {sched && !sched.isOff && sched.startTime && sched.endTime && (
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 tabular-nums">
                          {sched.startTime}–{sched.endTime}
                          {sched.source === "override" && " ✏"}
                        </span>
                      )}
                      {sched?.isOff && (
                        <span className="self-start text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded px-1.5 py-px dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800">
                          休み
                        </span>
                      )}
                      {/* 勤務時間編集ポップアップ（owner のみ） */}
                      {isEditing && (
                        <div
                          className="absolute left-0 top-full z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg p-3 w-52"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">{s.name} の勤務時間</div>
                          <label className="flex items-center gap-2 mb-2 text-xs text-slate-600 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={editIsOff}
                              onChange={(e) => setEditIsOff(e.target.checked)}
                              className="w-3.5 h-3.5"
                            />
                            休み
                          </label>
                          {!editIsOff && (
                            <div className="flex flex-col gap-1.5 mb-2">
                              <label className="text-[10px] text-slate-500 dark:text-slate-400">出勤</label>
                              <div className="flex items-center gap-1">
                                <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="flex-1 text-xs border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100" />
                                <span className="text-[10px] text-slate-400">〜</span>
                                <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="flex-1 text-xs border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100" />
                              </div>
                              <label className="text-[10px] text-orange-500 dark:text-orange-400 font-semibold mt-1">休憩（予約ブロック）</label>
                              <div className="flex items-center gap-1">
                                <input type="time" value={editBreakStart} onChange={(e) => setEditBreakStart(e.target.value)} className="flex-1 text-xs border border-orange-300 dark:border-orange-700 rounded px-1.5 py-1 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100" placeholder="なし" />
                                <span className="text-[10px] text-slate-400">〜</span>
                                <input type="time" value={editBreakEnd} onChange={(e) => setEditBreakEnd(e.target.value)} className="flex-1 text-xs border border-orange-300 dark:border-orange-700 rounded px-1.5 py-1 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100" placeholder="なし" />
                              </div>
                              <p className="text-[9px] text-orange-400">休憩中は患者さんの予約をブロックします</p>
                            </div>
                          )}
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              disabled={scheduleLoading}
                              onClick={async () => {
                                setScheduleLoading(true);
                                try {
                                  const res = await upsertStaffScheduleForDate(
                                    s.id,
                                    day.date,
                                    editIsOff ? null : editStart,
                                    editIsOff ? null : editEnd,
                                    editIsOff,
                                    editBreakStart || null,
                                    editBreakEnd || null,
                                  );
                                  if (res.success) {
                                    toast.success("勤務時間を更新しました");
                                    setEditingKey(null);
                                    refresh();
                                  } else {
                                    toast.error(res.error ?? "更新に失敗しました");
                                  }
                                } finally {
                                  setScheduleLoading(false);
                                }
                              }}
                              className="flex-1 text-[11px] bg-blue-600 hover:bg-blue-700 text-white rounded px-2 py-1 disabled:opacity-50"
                            >
                              {scheduleLoading ? "保存中…" : "保存"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingKey(null)}
                              className="flex-1 text-[11px] border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-700"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* グリッドセル（クリックで新規予約 / 予約バーのドロップ先） */}
                    {timeMarks.map((m, i) => {
                      const isDropHere =
                        dropTarget?.dateKey === day.date && dropTarget?.staffId === s.id && dropTarget?.minute === m.minute;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleEmptyCellClick(day.date, s.id, m.minute)}
                          onDragOver={(e) => {
                            if (!draggingAptId) return;
                            e.preventDefault(); // これを呼ばないとドロップできない
                            e.dataTransfer.dropEffect = "move";
                            if (!isDropHere) setDropTarget({ dateKey: day.date, staffId: s.id, minute: m.minute });
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            handleDropOnCell(day.date, s.id, m.minute);
                          }}
                          aria-label={`${format(dayDate, "M月d日", { locale: ja })} ${s.name} ${m.label} に${breakMode ? "休憩を追加" : "新規予約を追加"}`}
                          title={breakMode
                            ? `${format(dayDate, "M/d", { locale: ja })} ${m.label} ・クリックで休憩（予約ブロック）`
                            : `${format(dayDate, "M/d", { locale: ja })} ${s.name} ${m.label} ・クリックで新規予約`}
                          style={{ gridRow: "1 / -1" }}
                          className={`h-full transition-colors cursor-pointer ${
                            isDropHere
                              ? "bg-blue-200 dark:bg-blue-800/60 ring-1 ring-inset ring-blue-500"
                              : breakMode
                                ? "hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                : "hover:bg-blue-50 dark:hover:bg-blue-900/20"
                          } ${
                            m.label.includes(":00")
                              ? "border-l border-slate-300 dark:border-slate-600"
                              : "border-l border-slate-100 dark:border-slate-800"
                          }`}
                        />
                      );
                    })}
                    {/* 予約バー（absolute 配置） */}
                    {apts.map((a) => {
                      // 複数スタッフ予約は _displayStart/_displayEnd でずらした時刻を使う
                      const dispA = a as typeof a & { _displayStart?: string; _displayEnd?: string };
                      const startMin = minuteOfDayJst(dispA._displayStart ?? a.start_time);
                      const endMinRaw = (dispA._displayEnd ?? a.end_time)
                        ? minuteOfDayJst(dispA._displayEnd ?? a.end_time!)
                        : startMin + data.slotMinutes;
                      const endMin = Math.max(endMinRaw, startMin + data.slotMinutes);
                      const scheduleStart = day.scheduleStartHour * 60;
                      const scheduleEnd = day.scheduleEndHour * 60;
                      // 範囲外ならスキップ
                      if (endMin <= scheduleStart || startMin >= scheduleEnd) return null;
                      const clippedStart = Math.max(startMin, scheduleStart);
                      const clippedEnd = Math.min(endMin, scheduleEnd);
                      // 列位置は小数になり得る（例: 17:50 開始は 30分刻みだと 11.67 列目）。
                      // CSS grid の列番号に小数を渡すと無効値になり末尾へ飛ぶため、
                      // 整数列に乗せたうえで margin-left / width のパーセントで分単位の位置を再現する。
                      const startCol = (clippedStart - scheduleStart) / data.slotMinutes; // 0-index・小数可
                      const endCol = (clippedEnd - scheduleStart) / data.slotMinutes;
                      const gridStartIdx = Math.floor(startCol);
                      const gridEndIdx = Math.max(gridStartIdx + 1, Math.ceil(endCol));
                      const colSpan = gridEndIdx - gridStartIdx;
                      const offsetFrac = startCol - gridStartIdx;                 // 開始位置のズレ（列単位）
                      const widthCols = Math.max(endCol - startCol, 0.5);         // 視認性のため最低半列分
                      // CSS grid 上での位置: 1列目がスタッフ名なので +2
                      const gridColStart = gridStartIdx + 2;
                      const cls = statusColor(a.status, a.checkin_status, a.is_first_visit);
                      const isCancelled = a.status === "cancelled";
                      const displayStartLabel = fmtTime(dispA._displayStart ?? a.start_time);
                      const hasMultiStaff = (dispA._displayStart !== undefined);
                      const draggable = canDrag(a);
                      return (
                        <button
                          key={`${a.id}-${s.id}`}
                          type="button"
                          onClick={() => setSelectedApt(a)}
                          draggable={draggable}
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            // Firefox はデータをセットしないとドラッグが始まらない
                            e.dataTransfer.setData("text/plain", a.id);
                            setDraggingAptId(a.id);
                          }}
                          onDragEnd={() => { setDraggingAptId(null); setDropTarget(null); }}
                          className={`text-[11px] leading-tight rounded border px-1 py-0.5 my-0.5 text-left truncate hover:ring-2 hover:ring-blue-400 transition-all ${cls} ${
                            draggable ? "cursor-grab active:cursor-grabbing" : ""
                          } ${
                            // ドラッグ中はバーを「透過」させ、下に隠れているセルにも落とせるようにする
                            draggingAptId ? "pointer-events-none" : ""
                          } ${draggingAptId === a.id ? "opacity-40" : ""}`}
                          style={{
                            gridColumn: `${gridColStart} / span ${colSpan}`,
                            gridRow: (laneOf.get(`${a.id}-${s.id}`) ?? laneOf.get(a.id) ?? 0) + 1,
                            alignSelf: "stretch",
                            marginLeft: `${(offsetFrac / colSpan) * 100}%`,
                            width: `${Math.min((widthCols / colSpan) * 100, 100)}%`,
                          }}
                          title={isCancelled
                            ? `${displayStartLabel} ${a.customer_name ?? ""} ${cancelKindLabel(a.cancel_kind, a.no_show)}（タップで復活できます）`
                            : `${displayStartLabel} ${a.customer_name ?? ""}${a.medical_record_number ? ` (No.${a.medical_record_number})` : ""} ${a.course_name ?? ""}${hasMultiStaff ? "（時間分割表示・ドラッグ移動はできません）" : "・ドラッグで時間や先生を変えられます"}`}
                        >
                          <div className={`truncate font-semibold ${isCancelled ? "line-through" : ""}`}>
                            {!a.staff_id && !isCancelled && (
                              <span className="mr-0.5 text-[9px] font-bold text-rose-500" title="担当未設定（予約変更から担当を設定できます）">●</span>
                            )}
                            {a.customer_name ?? "(顧客名なし)"}
                            {a.medical_record_number && (
                              <span className="ml-1 text-[9px] font-bold opacity-70 tabular-nums">No.{a.medical_record_number}</span>
                            )}
                            {a.is_first_visit ? " ⓢ" : ""}
                            {!isCancelled && monthCrossIds.has(a.id) && (
                              <span
                                className="ml-1 text-[9px] font-bold bg-violet-600 text-white px-1 rounded"
                                title="先月から継続の患者様・今月最初の来院です（保険証確認など月初の対応を）"
                              >
                                月初
                              </span>
                            )}
                            {a.party_size != null && (
                              <span className="ml-1 text-[9px] font-bold text-orange-600">{a.party_size}名</span>
                            )}
                            {((a.additional_staff?.length ?? 0) > 0) && (
                              <span className="ml-1 text-[9px] font-normal opacity-70">×{(a.additional_staff?.length ?? 0) + 1}人</span>
                            )}
                          </div>
                          {isCancelled ? (
                            <div className="truncate text-[9px] font-bold text-slate-400 dark:text-slate-500">
                              {cancelKindLabel(a.cancel_kind, a.no_show)}
                            </div>
                          ) : a.course_name && (
                            <div className="truncate opacity-80">
                              {a.department === "カフェ" ? "☕ " : ""}{a.course_name}
                              {((a.additional_courses?.length ?? 0) > 0) && ` ＋${a.additional_courses?.length}`}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* ドラッグで移動したときの確認 */}
      {movePlan && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => !moving && setMovePlan(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-bold text-slate-900 dark:text-slate-100">
              この予約を移しますか？
            </div>
            <div className="space-y-2 text-sm">
              <div className="font-bold text-slate-800 dark:text-slate-100">
                {movePlan.apt.customer_name ?? "(顧客名なし)"}
                <span className="text-slate-400 font-normal">様</span>
                {movePlan.apt.course_name && (
                  <span className="ml-2 text-xs font-normal text-slate-500">{movePlan.apt.course_name}</span>
                )}
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 space-y-1">
                {/* 週表示で別の日に落としたときだけ「日付」の行を出す */}
                {movePlan.dateChanged && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-xs w-10 shrink-0">日付</span>
                    <span className="text-slate-400 line-through">{movePlan.fromDateLabel}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-bold text-blue-700 dark:text-blue-300">{movePlan.toDateLabel}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-xs w-10 shrink-0">時間</span>
                  <span className="tabular-nums text-slate-400 line-through">{movePlan.fromTimeLabel}</span>
                  <span className="text-slate-400">→</span>
                  <span className="tabular-nums font-bold text-blue-700 dark:text-blue-300">
                    {movePlan.toTimeLabel}
                  </span>
                  <span className="text-[11px] text-slate-400">（{movePlan.durationMinutes}分）</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-xs w-10 shrink-0">担当</span>
                  {movePlan.staffChanged ? (
                    <>
                      <span className="text-slate-400 line-through">{movePlan.fromStaffName}</span>
                      <span className="text-slate-400">→</span>
                      <span className="font-bold text-blue-700 dark:text-blue-300">{movePlan.toStaffName}</span>
                    </>
                  ) : (
                    <span className="text-slate-600 dark:text-slate-300">
                      {movePlan.fromStaffName}
                      <span className="ml-1 text-[11px] text-slate-400">（変わりません）</span>
                    </span>
                  )}
                </div>
              </div>
              {movePlan.apt.status === "waiting" && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  この予約はキャンセル待ちです。
                </p>
              )}
              <p className="text-[11px] text-slate-500">
                患者様へのLINEは自動では送られません。必要なときは予約変更の画面からお送りください。
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMovePlan(null)}
                disabled={moving}
                className="flex-1"
              >
                やめる
              </Button>
              <Button
                type="button"
                onClick={runMove}
                disabled={moving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {moving ? "移動中…" : "移動する"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 予約詳細モーダル（簡易） */}
      {selectedApt && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedApt(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-5 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                  {selectedApt.customer_name ?? "(顧客名なし)"}
                  {selectedApt.medical_record_number && (
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-600 tabular-nums">
                      No.{selectedApt.medical_record_number}
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-500">
                  {fmtTime(selectedApt.start_time)}
                  {selectedApt.end_time && ` - ${fmtTime(selectedApt.end_time)}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedApt(null)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
              >×</button>
            </div>
            <div className="space-y-1.5 text-sm">
              {selectedApt.department === "カフェ" && (
                <div className="inline-flex items-center gap-2">
                  <span className="text-[11px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">☕ カフェ</span>
                  {selectedApt.party_size != null && (
                    <span className="text-sm font-bold text-orange-700">{selectedApt.party_size}名</span>
                  )}
                </div>
              )}
              {(selectedApt.course_name || (selectedApt.additional_courses?.length ?? 0) > 0) && (
                <div>
                  <span className="text-slate-500">{selectedApt.department === "カフェ" ? "席種:" : "メニュー:"}</span>{" "}
                  {[
                    selectedApt.course_name,
                    ...(selectedApt.additional_courses ?? []).map((c) => c.course_name),
                  ].filter(Boolean).join("、")}
                </div>
              )}
              {(selectedApt.staff_name || (selectedApt.additional_staff?.length ?? 0) > 0) && (
                <div>
                  <span className="text-slate-500">担当:</span>{" "}
                  {[
                    selectedApt.staff_name,
                    ...(selectedApt.additional_staff ?? []).map((s) => s.staff_name),
                  ].filter(Boolean).join("、")}
                </div>
              )}
              {selectedApt.room_name && <div><span className="text-slate-500">部屋:</span> {selectedApt.room_name}</div>}
              <div>
                <span className="text-slate-500">状態:</span>{" "}
                {selectedApt.status === "cancelled"
                  ? `${cancelKindLabel(selectedApt.cancel_kind, selectedApt.no_show)}済み（この枠は空き扱い）`
                  : selectedApt.status}
                {selectedApt.is_first_visit && " (初診)"}
                {selectedApt.checkin_status && (
                  <span className="ml-2 text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 font-semibold">
                    {selectedApt.checkin_status === "arrived" ? "受付済" :
                     selectedApt.checkin_status === "in_treatment" ? "施術中" :
                     selectedApt.checkin_status === "done" ? "完了" : selectedApt.checkin_status}
                  </span>
                )}
              </div>
              {selectedApt.memo && <div><span className="text-slate-500">メモ:</span> <span className="whitespace-pre-wrap">{selectedApt.memo}</span></div>}
              {selectedApt.status !== "cancelled" && monthCrossIds.has(selectedApt.id) && (
                <div className="rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 px-3 py-2 text-xs font-semibold text-violet-800 dark:text-violet-200">
                  🔖 月またぎ：先月から継続の患者様の今月最初の来院です。
                  保険証の確認など、月初の対応をお願いします。
                </div>
              )}
            </div>

            {/* キャンセル済み: 復活 / 完全削除のみ */}
            {selectedApt.status === "cancelled" ? (
              <div className="flex flex-col gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <Button
                  onClick={async () => {
                    setActionLoading(true);
                    try {
                      const res = await restoreCancelledAppointment(selectedApt.id);
                      if (res.success) {
                        toast.success(`${selectedApt.customer_name ?? "患者"}様の予約を元に戻しました`);
                        setSelectedApt(null);
                        refresh();
                      } else {
                        toast.error(res.error ?? "元に戻せませんでした");
                      }
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  disabled={actionLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <RotateCcw className="w-4 h-4 mr-1.5" />
                  予約を元に戻す（復活）
                </Button>
                {(selectedApt.cancel_kind === "approved" || selectedApt.cancel_kind === "clinic_reason") && (
                  <Button
                    onClick={async () => {
                      setActionLoading(true);
                      try {
                        const res = await setCancelledGhostHidden(selectedApt.id, true);
                        if (res.success) {
                          toast.success("カレンダーから隠しました（記録は残っています）");
                          setSelectedApt(null);
                          refresh();
                        } else {
                          toast.error(res.error ?? "更新に失敗しました");
                        }
                      } finally {
                        setActionLoading(false);
                      }
                    }}
                    disabled={actionLoading}
                    variant="outline"
                    className="w-full border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    カレンダーから隠す（削除はしない）
                  </Button>
                )}
                <Button
                  onClick={async () => {
                    if (!confirm(`${selectedApt.customer_name ?? ""}様のキャンセル記録を完全に削除しますか？\n（薄い表示も消えます。元に戻せません）`)) return;
                    setActionLoading(true);
                    try {
                      const res = await deleteAppointment(selectedApt.id, "one");
                      if (res.success) {
                        toast.success("キャンセル記録を削除しました");
                        setSelectedApt(null);
                        refresh();
                      } else {
                        toast.error(res.error ?? "削除に失敗しました");
                      }
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  disabled={actionLoading}
                  variant="outline"
                  className="w-full border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400"
                >
                  <XCircle className="w-4 h-4 mr-1.5" />
                  この記録を完全に削除
                </Button>
              </div>
            ) : (
            <div className="flex flex-col gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
              {/* 時間だけを動かす。予約変更ダイアログを開かずに済むように */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">時間をずらす</span>
                {[-30, -20, -10, 10, 20, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={shiftingTime || actionLoading}
                    onClick={() => shiftAppointmentTime(selectedApt, d)}
                    className="flex-1 px-1 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 tabular-nums"
                  >
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleCheckin(selectedApt)}
                  disabled={actionLoading || selectedApt.checkin_status === "arrived"}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <UserCheck className="w-4 h-4 mr-1.5" />
                  {selectedApt.checkin_status === "arrived" ? "受付済" : "受付"}
                </Button>
                <Button
                  onClick={() => handleGoToSales(selectedApt)}
                  disabled={actionLoading}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CreditCard className="w-4 h-4 mr-1.5" />
                  会計へ
                </Button>
              </div>

              {/* 施術後に○○を追加（設定 addon_course_id がある院のみ・追加メニュー自体には出さない） */}
              {addonInfo && selectedApt.course_id !== addonInfo.courseId && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => handleAddAddon(selectedApt, "before")}
                    disabled={actionLoading}
                    variant="outline"
                    className="border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/50"
                  >
                    ＋ 施術前に{addonInfo.name}
                  </Button>
                  <Button
                    onClick={() => handleAddAddon(selectedApt, "after")}
                    disabled={actionLoading}
                    variant="outline"
                    className="border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/50"
                  >
                    ＋ 施術後に{addonInfo.name}
                  </Button>
                  {/* 「同時刻」は水素のように別の時間が要らないメニューだけ */}
                  {addonInfo.allowConcurrent && (
                    <Button
                      onClick={() => handleAddAddon(selectedApt, "same")}
                      disabled={actionLoading}
                      variant="outline"
                      className="col-span-2 border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/50"
                    >
                      ＋ 同時刻に{addonInfo.name}
                    </Button>
                  )}
                </div>
              )}

              {/* Googleクチコミお願いLINE（設定URLがある院のみ） */}
              {reviewEnabled && (
                <Button
                  type="button"
                  onClick={() => handleSendReview(selectedApt)}
                  disabled={actionLoading}
                  variant="outline"
                  className="w-full border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/50"
                >
                  ★ Google口コミをお願いする（LINE送信）
                </Button>
              )}

              <Button
                onClick={() => {
                  let timeStr: string | undefined;
                  try {
                    const t = new Date(selectedApt.start_time);
                    const hh = t.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", hour12: false }).padStart(2, "0");
                    const mm = t.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", minute: "2-digit" }).padStart(2, "0");
                    timeStr = `${hh}:${mm}`;
                  } catch {}
                  setNextReserveDialog({
                    open: true,
                    name: selectedApt.customer_name ?? undefined,
                    courseId: selectedApt.course_id ?? undefined,
                    staffId: selectedApt.staff_id ?? undefined,
                    time: timeStr,
                  });
                  setSelectedApt(null);
                }}
                variant="outline"
                className="w-full border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
              >
                <CalendarPlus className="w-4 h-4 mr-1.5" />
                次回予約を入れる（同じコース・担当でプリセット）
              </Button>
              <Button
                onClick={() => {
                  setEditDialog({ open: true, appointment: selectedApt });
                  setSelectedApt(null);
                }}
                variant="outline"
                className="w-full border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Pencil className="w-4 h-4 mr-1.5" />
                予約変更（時刻・コース・担当・メモを編集）
              </Button>
            </div>
            )}
          </div>
        </div>
      )}

      {/* 次回予約ダイアログ */}
      {nextReserveDialog.open && (
        <AddAppointmentDialog
          open={nextReserveDialog.open}
          onOpenChange={(o) => setNextReserveDialog((s) => ({ ...s, open: o }))}
          defaultName={nextReserveDialog.name}
          defaultCourseId={nextReserveDialog.courseId}
          defaultStaffId={nextReserveDialog.staffId}
          defaultTime={nextReserveDialog.time}
          hideTrigger
          onSuccess={() => {
            toast.success("次回予約を登録しました");
            setNextReserveDialog({ open: false });
            refresh();
          }}
        />
      )}

      {/* 空きセルクリックで開く新規予約ダイアログ */}
      {reserveDialog.open && (
        <AddAppointmentDialog
          open={reserveDialog.open}
          onOpenChange={(o) => setReserveDialog((s) => ({ ...s, open: o }))}
          defaultDate={reserveDialog.date}
          defaultTime={reserveDialog.time}
          defaultStaffId={reserveDialog.staffId}
          hideTrigger
          onSuccess={refresh}
        />
      )}

      {/* 予約変更ダイアログ */}
      {editDialog.open && editDialog.appointment && (
        <EditAppointmentDialog
          open={editDialog.open}
          onOpenChange={(o) => setEditDialog((s) => ({ ...s, open: o }))}
          appointment={editDialog.appointment}
          onSuccess={() => {
            setEditDialog({ open: false, appointment: null });
            refresh();
          }}
        />
      )}

      {/* 受付AI調整メッセージ モーダル */}
      {receptionAiMsg && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setReceptionAiMsg(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">受付調整 LINE 下書き</p>
              <button type="button" onClick={() => setReceptionAiMsg(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700 leading-relaxed">
              {receptionAiMsg}
            </pre>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(receptionAiMsg);
                toast.success("コピーしました");
                setReceptionAiMsg(null);
              }}
              className="w-full py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold transition"
            >
              コピーして閉じる
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
