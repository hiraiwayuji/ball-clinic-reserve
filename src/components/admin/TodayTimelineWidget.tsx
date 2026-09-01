"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { format, startOfWeek, addDays, addWeeks, isSameDay } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, Loader2, RotateCcw,
  UserCheck, CreditCard, XCircle, Plus, CalendarPlus, Pencil, Search, X,
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
  /** 複数担当の予約なら担当人数（2以上）。確認ダイアログに注意書きを出す */
  staffCount: number;
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

/**
 * タイムテーブル描画用に「表示上の時刻」を足した予約。
 * 複数担当の予約は担当ごとに時間を等分して別バーで描くので、
 * _displayStart/_displayEnd（そのバーの表示時刻）と
 * _splitIndex/_splitCount（何分割の何本目か）を持たせる。
 * モーダルや保存処理は必ず元の start_time / end_time を使う。
 */
type DisplayApt = TimelineAppointment & {
  _displayStart?: string;
  _displayEnd?: string;
  /** そのバーの先生が担当するメニュー名（主メニュー／追加メニューを担当順に対応させたもの） */
  _displayCourseName?: string;
  _splitIndex?: number;
  _splitCount?: number;
};

/** 分割バー同士を「同じ予約だ」と分かるようにつなぐ枠線色。予約IDから決めるので毎回同じ色になる。 */
const SPLIT_LINK_COLORS = ["#7c3aed", "#0891b2", "#db2777", "#ea580c", "#15803d", "#4f46e5"];
function splitLinkColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SPLIT_LINK_COLORS[h % SPLIT_LINK_COLORS.length];
}

/** 絞り込み比較用の正規化（大文字小文字と空白の違いを無視する） */
function normalizeQuery(s: string): string {
  return s.toLowerCase().replace(/[\s　]/g, "");
}

/** 絞り込み文字列に当てはまる予約か（空なら全部 true） */
function aptMatchesQuery(a: TimelineAppointment, normQuery: string): boolean {
  if (!normQuery) return true;
  const hay = normalizeQuery(
    [a.customer_name ?? "", a.medical_record_number ?? "", a.course_name ?? "", a.staff_name ?? ""].join(" "),
  );
  return hay.includes(normQuery);
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
  ngMode = false,
  onNgCell,
  compact = false,
}: {
  showPendingButton?: boolean;
  /** 予約画面の「休憩モード」。ON のあいだは空きセルのタップで休憩を追加する。 */
  breakMode?: boolean;
  onBreakCell?: (date: Date, time: string) => void;
  /** 予約画面の「予約NGモード」。ON のあいだは、担当未設定でない空きセルのタップで
   *  その先生・その1コマだけを即座に予約不可にする（ダイアログなし・すぐ×が置ける）。 */
  ngMode?: boolean;
  onNgCell?: (date: Date, time: string, staffId: string) => void;
  /** スマホ用。横並びグリッドではなく「先生を1人選んで縦に見る」表示にする */
  compact?: boolean;
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
  // Pointer Events でのドラッグ管理（マウスのドラッグと、タブレットの指でのドラッグを同じ経路で処理する）。
  // HTML5 ネイティブ D&D（旧実装）はタッチ端末では dragstart が発火しないため使えなかった。
  // state の再レンダー待ちだとタイミングがズレるので、直近の判定は ref で持つ。
  const pointerDragRef = useRef<{ aptId: string; startX: number; startY: number; moved: boolean } | null>(null);
  const dropTargetRef = useRef<{ dateKey: string; staffId: string; minute: number } | null>(null);

  /**
   * カーソル座標から「その予約の新しい開始時刻」を求める。
   * カーソルが乗っているマス＝そのまま新しい開始時刻（掴んだ位置による補正はしない。
   * 補正ありだと「バーのどこを掴んだか」で結果が変わり、ハイライトと登録時刻が
   * 食い違って見えるため。2026-09-01 藤川先生指摘で単純化）。
   * pointermove の連発は setState のたびに巨大なタイムライン全体を再描画するため、
   * 動きが速いドラッグだと描画が追いつかず、古いカーソル位置が残ることがある。
   * そのため pointerup では必ずその時点の座標でこの関数を呼び直し、
   * pointermove側の dropTargetRef には頼らない（あちらはハイライト表示専用）。
   */
  const computeDropTarget = (
    clientX: number,
    clientY: number,
  ): { dateKey: string; staffId: string; minute: number } | null => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const cell = el?.closest<HTMLElement>("[data-cell-date]");
    if (!cell) return null;
    return {
      dateKey: cell.dataset.cellDate!,
      staffId: cell.dataset.cellStaff!,
      minute: Number(cell.dataset.cellMinute),
    };
  };
  // ドラッグして動かした直後は、その pointerup に続く click（＝詳細モーダルを開く）を無視する
  const suppressNextClickRef = useRef(false);

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

  // 患者名などでの絞り込み（当てはまらない予約は薄く落とすだけで、消しはしない）
  const [filterText, setFilterText] = useState("");
  const normQuery = normalizeQuery(filterText);
  // マウスを乗せている予約の患者。同じ患者の他の予約に紫の枠を出す
  const [hoverCustomerId, setHoverCustomerId] = useState<string | null>(null);
  // スマホ表示で「いま見ている先生」
  const [compactStaffId, setCompactStaffId] = useState<string | null>(null);

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
    const label = b.staff_id ? "予約NG" : "休憩";
    if (!window.confirm(`${b.start_time}〜${b.end_time} の「${b.reason}」（${label}）を削除しますか？`)) return;
    const res = await deleteBlockedSlot(b.id);
    if (res.success) {
      toast.success(b.staff_id ? "予約NGを解除しました。" : "休憩を削除しました。");
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
    // 予約NGモード：担当が確定しているセルだけ即座に×を置く（担当未設定の列は対象外）
    if (ngMode && onNgCell) {
      if (staffId && staffId !== UNASSIGNED_KEY) {
        onNgCell(dateFromKey(dateKey), timeStr, staffId);
      } else {
        toast.error("担当未設定の列には予約NGを置けません（先生の列でタップしてください）");
      }
      return;
    }
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

  // 期間内に「同じ患者様の予約」が何件あるか。2件以上のときだけ結びつけ表示をする。
  const customerAptCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of allAppointments) {
      if (!a.customer_id || a.status === "cancelled") continue;
      m.set(a.customer_id, (m.get(a.customer_id) ?? 0) + 1);
    }
    return m;
  }, [allAppointments]);

  // 絞り込みに当てはまる予約の件数（キャンセル済みは数えない）
  const filteredCount = useMemo(
    () => (normQuery ? allAppointments.filter((a) => a.status !== "cancelled" && aptMatchesQuery(a, normQuery)).length : 0),
    [allAppointments, normQuery],
  );

  // いま結びつけて見せる患者。選択中の予約 → マウスを乗せている予約 の順で決める。
  const linkedCustomerId = (() => {
    const id = selectedApt?.customer_id ?? hoverCustomerId;
    if (!id) return null;
    return (customerAptCounts.get(id) ?? 0) >= 2 ? id : null;
  })();

  // 選択中の予約と同じ患者様の「他の予約」（詳細モーダルに一覧で出す）
  const selectedCustomerOtherApts = useMemo(() => {
    if (!selectedApt?.customer_id) return [];
    return allAppointments
      .filter((a) => a.customer_id === selectedApt.customer_id && a.id !== selectedApt.id && a.status !== "cancelled")
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [allAppointments, selectedApt]);

  // 担当未設定の予約を表示するデフォルト行（先頭スタッフ＝sort_order 最小のメイン担当）
  const defaultStaffId = data?.staff[0]?.id ?? null;

  // ドラッグ中の予約の所要時間（分）。ドロップ先のハイライトを「1コマだけ」ではなく
  // 実際の予約の長さぶん出すために使う（40分の予約を20分幅のマスだけでハイライトすると、
  // どちらの端をどこに合わせればいいか分からず誤操作の原因になる＝2026-09-01 藤川先生指摘）。
  const draggingAptDuration = (() => {
    if (!draggingAptId || !data) return null;
    const apt = allAppointments.find((x) => x.id === draggingAptId);
    if (!apt) return null;
    const s = minuteOfDayJst(apt.start_time);
    const e = apt.end_time ? minuteOfDayJst(apt.end_time) : s + data.slotMinutes;
    return Math.max(e - s, data.slotMinutes);
  })();

  // キャンセル済みは動かす意味がないのでドラッグ不可。
  // 複数担当の予約は行ごとに時間を分割して描いているが、掴めるのは先頭担当のバーだけにして
  // （下の draggable 判定）、動かすときは元の start_time を基準に予約まるごと移動させる。
  const canDrag = (a: TimelineAppointment): boolean => a.status !== "cancelled";

  // セルに落とした → 確認ダイアログ用の移動プランを作る
  // 週表示では別の日のブロックにも落とせるので、移動先の日付も受け取る。
  const handleDropOnCell = (toDateKey: string, toStaffId: string, toMinute: number) => {
    setDropTarget(null);
    const aptId = draggingAptId;
    setDraggingAptId(null);
    if (!aptId || !data) return;

    const apt = allAppointments.find((a) => a.id === aptId);
    if (!apt || !canDrag(apt)) return;

    // 複数担当の予約を「その予約にすでに入っている別の先生」の行へ落とすと
    // メイン担当と追加担当が同じ人になってしまうので止める。
    if ((apt.additional_staff ?? []).some((add) => add?.staff_id === toStaffId)) {
      toast.error("その先生はもうこの予約の担当に入っています（担当の入れ替えは予約変更からどうぞ）");
      return;
    }

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
      staffCount: (apt.additional_staff?.length ?? 0) + 1,
    });
  };

  // 確認ダイアログの「移動する」
  const runMove = async (allowOverlap: boolean = false) => {
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
        // 院長が「重なりを承知で進める」を押したときは allowOverlap を必ず添える
        // （サーバー側で role が owner かをもう一度見る）
        staffChanged
          ? { staffId: toStaffId, ...(allowOverlap ? { allowOverlap: true } : {}) }
          : (allowOverlap ? { allowOverlap: true } : undefined),
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
      } else if ("overlap" in res && res.overlap) {
        // 担当かぶりは直してもらわないと通さない。消えるトーストだと読み飛ばされる。
        const plan = movePlan;
        // 院長でも通せないかぶり（DBの除外制約で弾かれる担当）のときは再実行ボタンを出さない
        if ("needsOwner" in res && res.needsOwner) {
          setOverlapRetry(() => async () => { setMovePlan(plan); await runMove(true); });
        } else {
          setOverlapRetry(null);
        }
        setOverlapError(res.error ?? "同じ担当の重複予約はできません。");
        setMovePlan(null);
      } else {
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
  // 担当かぶりで動かせなかったときのお知らせ。閉じるまで残す（2026-08-22 ぼーるくん依頼）。
  const [overlapError, setOverlapError] = useState<string | null>(null);
  // かぶりで止まった操作を、院長の判断でやり直すための再実行関数
  const [overlapRetry, setOverlapRetry] = useState<null | (() => Promise<void>)>(null);
  const shiftAppointmentTime = async (apt: TimelineAppointment, deltaMinutes: number, allowOverlap: boolean = false) => {
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
        // 院長が「重なりを承知で進める」を押したときだけ許可を添える
        allowOverlap ? { allowOverlap: true } : undefined,
      );
      if (res.success) {
        toast.success(`${apt.customer_name ?? "患者"}様を ${timeLabel} に変更しました`);
        setSelectedApt(null);
        refresh();
      } else if ("overlap" in res && res.overlap) {
        if ("needsOwner" in res && res.needsOwner) {
          setOverlapRetry(() => async () => { await shiftAppointmentTime(apt, deltaMinutes, true); });
        } else {
          setOverlapRetry(null);
        }
        setOverlapError(res.error ?? "同じ担当の重複予約はできません。");
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
    const map = new Map<string, DisplayApt[]>();

    for (const a of day.appointments) {
      const allStaffIds: string[] = [];
      allStaffIds.push(a.staff_id ?? defaultStaffId ?? UNASSIGNED_KEY);
      // その先生が担当するメニュー名。1人目＝主メニュー、2人目以降＝追加メニューの順番で対応させる。
      // これを出さないと「経絡治療は森藤先生しかできないのに森川先生の行に経絡治療と出る」
      // （実際に森川先生が担当しているのは追加メニューの保険施術）という誤解になる。
      const courseNames: (string | null)[] = [a.course_name ?? null];
      const addCourses = a.additional_courses ?? [];
      for (const add of a.additional_staff ?? []) {
        if (add?.staff_id && !allStaffIds.includes(add.staff_id)) {
          const idx = allStaffIds.length - 1; // 追加スタッフの何人目か（0始まり）
          allStaffIds.push(add.staff_id);
          courseNames.push(addCourses[idx]?.course_name ?? null);
        }
      }

      if (allStaffIds.length <= 1) {
        // スタッフ1人の場合はそのまま
        const key = allStaffIds[0];
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(a);
        continue;
      }

      // 複数スタッフ: サーバーが計算した staff_spans（メニューの所要時間で分けたもの）を使う。
      // 2人の先生が同時に1人の患者さんに入ることはなく、前後に分けて施術するため
      //（例: 60分＝保険施術20分＋鍼灸3部位40分 なら 20分で交代。人数で等分すると30分になり実際と10分ずれる）。
      // 古いデータなどで spans が無いときだけ、従来どおり人数で等分する。
      const spans = a.staff_spans ?? [];
      const spanOf = (staffId: string) => spans.find((sp) => sp.staff_id === staffId);

      const startMin = minuteOfDayJst(a.start_time);
      const endMinRaw = a.end_time ? minuteOfDayJst(a.end_time) : startMin + slotMinutes;
      const totalDuration = Math.max(endMinRaw - startMin, slotMinutes * allStaffIds.length);
      const perStaff = Math.round(totalDuration / allStaffIds.length);
      const shiftIso = (isoBase: string, minuteOffset: number): string => {
        return new Date(new Date(isoBase).getTime() + minuteOffset * 60 * 1000).toISOString();
      };

      allStaffIds.forEach((staffId, idx) => {
        if (!map.has(staffId)) map.set(staffId, []);
        const sp = spanOf(staffId);
        const displayStart = sp ? sp.start : shiftIso(a.start_time, idx * perStaff);
        const displayEnd = sp ? sp.end : shiftIso(a.start_time, (idx + 1) * perStaff);
        map.get(staffId)!.push({
          ...a,
          _displayStart: displayStart,
          _displayEnd: displayEnd,
          _displayCourseName: sp?.course_name ?? courseNames[idx] ?? a.course_name ?? undefined,
          _splitIndex: idx,
          _splitCount: allStaffIds.length,
        });
      });
    }
    return map;
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
        {/* 患者名でその日の予約を探す。当てはまらない予約は薄くなるだけで、位置は変わらない。 */}
        <div className="w-full flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="患者名・カルテ番号で絞り込み"
              aria-label="患者名・カルテ番号で絞り込み"
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 pl-8 pr-8 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            {filterText && (
              <button
                type="button"
                onClick={() => setFilterText("")}
                aria-label="絞り込みを消す"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {normQuery && (
            <span className="text-xs font-bold text-slate-500 tabular-nums">
              {filteredCount}件
              {filteredCount === 0 && <span className="ml-1 font-normal">（見つかりません）</span>}
            </span>
          )}
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
        ) : data && compact ? (
          /* ── スマホ表示：横に広いグリッドは指1本では追えないので、
                「先生を1人選んで、時間を縦に見る」形にする ── */
          <div className="space-y-5">
            {data.days.map((day) => {
              const dayDate = dateFromKey(day.date);
              const timeMarks = buildTimeMarks(day, data.slotMinutes);
              const aptsByStaff = buildAptsByStaff(day, data.slotMinutes);
              const staffSchedules = schedulesByDate[day.date] ?? [];
              const isToday = isSameDay(dayDate, new Date());
              // 受付最終日を過ぎた先生は出さない（PC表示と同じルール）
              const lanes = staffRows.filter(
                (s) => !s.booking_until || day.date <= String(s.booking_until).slice(0, 10),
              );
              const activeStaff = lanes.find((s) => s.id === compactStaffId) ?? lanes[0] ?? null;
              // 表示中の先生に関係する枠だけ（院ぜんたいの休憩＝staff_id無し、またはこの先生だけの予約NG）
              const dayBlocks = blockedSlots.filter(
                (b) => b.date === day.date && (!b.staff_id || b.staff_id === activeStaff?.id),
              );
              const apts = activeStaff ? (aptsByStaff.get(activeStaff.id) ?? []) : [];
              const sched = activeStaff ? staffSchedules.find((sc) => sc.staffId === activeStaff.id) : undefined;
              const scheduleStart = day.scheduleStartHour * 60;
              // 最後の目盛りは「営業終了時刻」のラベルなので行にはしない
              const rowMarks = timeMarks.slice(0, -1);
              // 縦表示では分割せず「本当の開始時刻」の行に置く（時刻の読み違いが起きないように）
              const byRow = new Map<number, DisplayApt[]>();
              for (const a of apts) {
                const sMin = minuteOfDayJst(a.start_time);
                const idx = Math.min(
                  Math.max(Math.floor((sMin - scheduleStart) / data.slotMinutes), 0),
                  Math.max(rowMarks.length - 1, 0),
                );
                if (!byRow.has(idx)) byRow.set(idx, []);
                byRow.get(idx)!.push(a);
              }
              return (
                <div key={day.date}>
                  <div
                    className={`px-2 py-1.5 mb-2 rounded-lg border text-sm font-bold flex items-center gap-2 ${
                      day.isHoliday
                        ? "bg-slate-100 border-slate-300 text-slate-500 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400"
                        : isToday
                          ? "bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-200"
                          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <span>{format(dayDate, "M月d日(E)", { locale: ja })}</span>
                    {day.isHoliday && (
                      <span className="text-[10px] font-black bg-slate-500 text-white px-1.5 py-0.5 rounded">休診日</span>
                    )}
                    {isToday && <span className="text-[10px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded">今日</span>}
                    <span className="ml-auto text-[11px] font-normal text-slate-400 tabular-nums">
                      {day.appointments.filter((a) => a.status !== "cancelled").length}件
                    </span>
                  </div>

                  {/* 先生の切り替え（横スクロール） */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1.5" style={{ scrollbarWidth: "none" }}>
                    {lanes.map((s) => {
                      const count = (aptsByStaff.get(s.id) ?? []).filter((a) => a.status !== "cancelled").length;
                      const on = activeStaff?.id === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setCompactStaffId(s.id)}
                          aria-pressed={on}
                          className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border transition-colors ${
                            on
                              ? "bg-blue-600 border-blue-600 text-white"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {s.name}
                          <span
                            className={`text-[10px] font-black tabular-nums rounded-full px-1.5 ${
                              on ? "bg-white/25 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {sched?.isOff && (
                    <p className="my-1.5 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800">
                      {activeStaff?.name} はこの日お休みです
                    </p>
                  )}

                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    {rowMarks.map((m, i) => {
                      const rowApts = byRow.get(i) ?? [];
                      const isHour = m.minute % 60 === 0;
                      // その時間にかかっている休憩（予約不可）。これを出さないと空きに見えて二重に入れてしまう。
                      const coveringBlock = (minute: number) =>
                        dayBlocks.find(
                          (b) => hmToMinutes(b.start_time) < minute + data.slotMinutes && hmToMinutes(b.end_time) > minute,
                        );
                      const rowBlock = coveringBlock(m.minute);
                      const prevBlock = i > 0 ? coveringBlock(rowMarks[i - 1].minute) : undefined;
                      const isBlockStart = !!rowBlock && prevBlock?.id !== rowBlock.id;
                      return (
                        <div
                          key={m.minute}
                          className="flex items-stretch border-b last:border-b-0 border-slate-100 dark:border-slate-800"
                        >
                          <div
                            className={`w-14 shrink-0 px-2 py-2 text-[11px] tabular-nums border-r border-slate-100 dark:border-slate-800 ${
                              isHour
                                ? "font-black text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50"
                                : "font-semibold text-slate-400 dark:text-slate-500"
                            }`}
                          >
                            {minutesToHm(m.minute)}
                          </div>
                          <div className="flex-1 min-w-0 p-1 space-y-1">
                            {/* 休憩（院ぜんたい・staff_id無し）／予約NG（先生1人だけ）の帯。先頭の行にだけ内容と削除ボタンを出す。 */}
                            {isBlockStart && rowBlock && (
                              <div className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${
                                rowBlock.staff_id
                                  ? "border-rose-300 bg-rose-100 dark:bg-rose-900/30 dark:border-rose-700"
                                  : "border-amber-300 bg-amber-100 dark:bg-amber-900/30 dark:border-amber-700"
                              }`}>
                                <span className={`text-[11px] font-bold truncate ${
                                  rowBlock.staff_id ? "text-rose-800 dark:text-rose-200" : "text-amber-800 dark:text-amber-200"
                                }`}>
                                  {rowBlock.staff_id ? "✕" : "🍵"} {rowBlock.start_time}〜{rowBlock.end_time} {rowBlock.reason}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteBlocked(rowBlock)}
                                  className={`ml-auto shrink-0 rounded px-1.5 font-bold ${
                                    rowBlock.staff_id ? "text-rose-800 dark:text-rose-200" : "text-amber-800 dark:text-amber-200"
                                  }`}
                                  aria-label={rowBlock.staff_id ? "この予約NGを解除" : "この休憩を削除"}
                                >
                                  ×
                                </button>
                              </div>
                            )}
                            {rowApts.length === 0 ? (
                              rowBlock ? (
                                isBlockStart ? null : (
                                  <div className={`px-2 py-1.5 text-[11px] font-bold ${
                                    rowBlock.staff_id ? "text-rose-700/70 dark:text-rose-300/70" : "text-amber-700/70 dark:text-amber-300/70"
                                  }`}>
                                    {rowBlock.staff_id ? "予約NG中" : "休憩中（予約不可）"}
                                  </div>
                                )
                              ) : (
                                <button
                                  type="button"
                                  disabled={!activeStaff}
                                  onClick={() => activeStaff && handleEmptyCellClick(day.date, activeStaff.id, m.minute)}
                                  aria-label={`${format(dayDate, "M月d日", { locale: ja })} ${minutesToHm(m.minute)} に${breakMode ? "休憩を追加" : "新規予約を追加"}`}
                                  className="w-full text-left text-[11px] font-bold text-slate-300 dark:text-slate-600 py-1.5 px-2 rounded-lg active:bg-blue-50 dark:active:bg-blue-900/20"
                                >
                                  ＋
                                </button>
                              )
                            ) : (
                              rowApts.map((a) => {
                                const cls = statusColor(a.status, a.checkin_status, a.is_first_visit);
                                const isCancelled = a.status === "cancelled";
                                const splitCount = a._splitCount ?? 1;
                                const hasMultiStaff = splitCount > 1;
                                const linkColor = hasMultiStaff ? splitLinkColor(a.id) : null;
                                const isLinkedCustomer = !!linkedCustomerId && a.customer_id === linkedCustomerId;
                                const dimmed = !aptMatchesQuery(a, normQuery);
                                return (
                                  <button
                                    key={`${a.id}-${activeStaff?.id ?? ""}`}
                                    type="button"
                                    onClick={() => setSelectedApt(a)}
                                    className={`w-full text-left rounded-lg border px-2 py-1.5 ${cls} ${
                                      isLinkedCustomer ? "ring-2 ring-violet-400" : ""
                                    } ${dimmed ? "opacity-25" : ""}`}
                                    style={linkColor ? { borderColor: linkColor, borderWidth: "2px" } : undefined}
                                  >
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[11px] font-black tabular-nums">
                                        {fmtTime(a.start_time)}
                                        {a.end_time && `–${fmtTime(a.end_time)}`}
                                      </span>
                                      <span className={`text-sm font-bold ${isCancelled ? "line-through" : ""}`}>
                                        {a.customer_name ?? "(顧客名なし)"}
                                      </span>
                                      {a.medical_record_number && (
                                        <span className="text-[10px] font-bold opacity-70 tabular-nums">
                                          No.{a.medical_record_number}
                                        </span>
                                      )}
                                      {a.is_first_visit && (
                                        <span className="text-[9px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded-full">初診</span>
                                      )}
                                      {!isCancelled && monthCrossIds.has(a.id) && (
                                        <span className="text-[9px] font-black bg-violet-600 text-white px-1.5 py-0.5 rounded-full">月初</span>
                                      )}
                                      {hasMultiStaff && (
                                        <span
                                          className="text-[9px] font-black text-white px-1.5 py-0.5 rounded-full"
                                          style={{ backgroundColor: linkColor ?? "#7c3aed" }}
                                        >
                                          担当{splitCount}人 {(a._splitIndex ?? 0) + 1}/{splitCount}
                                        </span>
                                      )}
                                    </div>
                                    {isCancelled ? (
                                      <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                        {cancelKindLabel(a.cancel_kind, a.no_show)}
                                      </div>
                                    ) : (a._displayCourseName ?? a.course_name) ? (
                                      <div className="text-[11px] truncate opacity-80">
                                        {a.department === "カフェ" ? "☕ " : ""}{a._displayCourseName ?? a.course_name}
                                        {/* 複数担当のときは、その先生が担当するメニューだけを出す */}
                                        {!hasMultiStaff && ((a.additional_courses?.length ?? 0) > 0) && ` ＋${a.additional_courses?.length}`}
                                      </div>
                                    ) : null}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
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
              {/* 色の見かた（凡例）。どこが予約を取れる時間か分かるようにする。
                  「その先生が入れない時間」に予約を取ってしまう事故が続いたため
                  （2026-08-22 ぼーるくん依頼）。 */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 text-[10px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-600 dark:text-slate-300">色の見かた</span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block w-4 h-3 rounded-sm border border-emerald-200"
                    style={{ backgroundColor: "rgba(220, 252, 231, 0.9)" }}
                  />
                  予約を取れる時間
                </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block w-4 h-3 rounded-sm border border-slate-300"
                    style={{
                      backgroundColor: "rgba(148, 163, 184, 0.14)",
                      backgroundImage:
                        "repeating-linear-gradient(-45deg, rgba(100,116,139,0.35) 0px, rgba(100,116,139,0.35) 2px, transparent 2px, transparent 6px)",
                    }}
                  />
                  取れない時間（勤務時間外・休憩・休み）
                </span>
              </div>
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
                // 院ぜんたいを塞ぐ休憩だけ（staff_id が入った「先生1人だけの予約NG」は各先生の行に出す）
                const dayBlocks = blockedSlots.filter((b) => b.date === day.date && !b.staff_id);
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
                const sortedApts = [...apts].sort(
                  (a, b) => minuteOfDayJst(a._displayStart ?? a.start_time) - minuteOfDayJst(b._displayStart ?? b.start_time),
                );
                const laneEnds: number[] = [];
                const laneOf = new Map<string, number>();
                for (const a of sortedApts) {
                  const sMin = minuteOfDayJst(a._displayStart ?? a.start_time);
                  const eMin = Math.max(
                    (a._displayEnd ?? a.end_time) ? minuteOfDayJst(a._displayEnd ?? a.end_time!) : sMin + data.slotMinutes,
                    sMin + data.slotMinutes,
                  );
                  // 複数スタッフ予約は staff ごとに別キーを使う
                  const laneKey = a._displayStart ? `${a.id}-${s.id}` : a.id;
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
                //
                // 勤務表が未登録の先生（source="none"／からだの島田先生など）は start/end が null。
                // 従来はレーンがまっ白＝「取れるのか取れないのか分からない」状態だった。
                //
                // ここで営業時間ぜんぶを緑にしてよいのは、**予約の制限設定を1つも持たない先生だけ**。
                // patient 側は staff-availability.ts の buildStaffSchedule が null を返す
                //（＝制限なし＝院の営業時間どおり受け付ける）ので、それと同じ条件でそろえる。
                // 出勤日制（schedule_based_booking）の先生は、出勤日を登録しないと1枠も取れないため、
                // 緑にすると逆の誤情報になる（ボールの さみ・ヘッドスパが該当。2026-08-22 検品指摘）。
                const noSchedule = schedStart === null || schedEnd === null;
                const canFillWholeDay = noSchedule && sched?.hasBookingLimit === false;
                const schedBand = (schedStart !== null && schedEnd !== null)
                  ? bandStyle(schedStart, schedEnd, scheduleStart, scheduleEnd)
                  : (canFillWholeDay ? bandStyle(scheduleStart, scheduleEnd, scheduleStart, scheduleEnd) : null);

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
                    {/* 勤務時間バー（予約バーの後ろ、z-index 低め）＝ここが「予約を取れる時間」 */}
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
                    {/* 勤務時間の外（出勤前・退勤後）＝予約を取れない時間。
                        ここを白のままにしていたため「空いている」と見えて、
                        その先生が入れない時間に予約を取ってしまう事故が起きていた
                        （2026-08-22 ぼーるくん「取れる時間を把握していないので色を変えて」）。
                        休み・休診日と同じ斜線グレーに統一する＝斜線＝予約不可。 */}
                    {schedStart !== null && schedEnd !== null && !sched?.isOff && !day.isHoliday && (() => {
                      const offStyle = {
                        backgroundColor: "rgba(148, 163, 184, 0.14)",
                        backgroundImage:
                          "repeating-linear-gradient(-45deg, rgba(100,116,139,0.20) 0px, rgba(100,116,139,0.20) 2px, transparent 2px, transparent 9px)",
                        zIndex: 0,
                      } as const;
                      const before = schedStart > scheduleStart
                        ? bandStyle(scheduleStart, schedStart, scheduleStart, scheduleEnd) : null;
                      const after = schedEnd < scheduleEnd
                        ? bandStyle(schedEnd, scheduleEnd, scheduleStart, scheduleEnd) : null;
                      return (
                        <>
                          {before && (
                            <div
                              className="absolute top-0 bottom-0 pointer-events-none"
                              style={{ ...before, ...offStyle }}
                              title={`${s.name}さんの勤務時間外（予約不可）`}
                            />
                          )}
                          {after && (
                            <div
                              className="absolute top-0 bottom-0 pointer-events-none"
                              style={{ ...after, ...offStyle }}
                              title={`${s.name}さんの勤務時間外（予約不可）`}
                            />
                          )}
                        </>
                      );
                    })()}
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
                          className="absolute top-0 bottom-0 pointer-events-none flex items-start justify-start"
                          style={{
                            ...brkBand,
                            // 勤務時間外と同じ「斜線＝予約不可」の見た目に揃える。
                            // 従来は薄いグレーだけで、空きと見分けがつきにくかった。
                            backgroundColor: "rgba(148, 163, 184, 0.14)",
                            backgroundImage:
                              "repeating-linear-gradient(-45deg, rgba(100,116,139,0.20) 0px, rgba(100,116,139,0.20) 2px, transparent 2px, transparent 9px)",
                            zIndex: 1,
                          }}
                          title={`${s.name}さんの休憩（予約不可）`}
                        >
                          {/* ラベルは帯の左上に寄せる。中央に白背景で置くと、
                              休憩時間に入っている予約バーの文字が読めなくなる（2026-08-22 検品指摘）。 */}
                          <span className="text-[8px] text-slate-500 dark:text-slate-400 font-bold tracking-tight select-none pl-0.5 leading-none pt-px">休憩</span>
                        </div>
                      );
                    })()}
                    {/* この先生だけの予約NG帯（受付が忙しい時に即置きした×）。クリックで解除できる。 */}
                    {blockedSlots
                      .filter((b) => b.date === day.date && b.staff_id === s.id)
                      .map((b) => {
                        const ngBand = bandStyle(hmToMinutes(b.start_time), hmToMinutes(b.end_time), scheduleStart, scheduleEnd);
                        if (!ngBand) return null;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => handleDeleteBlocked(b)}
                            className="absolute top-0 bottom-0 flex items-center justify-center gap-0.5 border-x border-rose-400/60 bg-rose-200/70 dark:bg-rose-800/50 hover:bg-rose-300/80 dark:hover:bg-rose-700/60"
                            style={{ ...ngBand, zIndex: 2 }}
                            title={`${s.name}さんの ${b.start_time}〜${b.end_time} は予約NG（${b.reason}）・クリックで解除`}
                          >
                            <span className="text-[10px] font-black text-rose-800 dark:text-rose-100">✕</span>
                          </button>
                        );
                      })}
                    <div data-staff-name-col className="px-2 py-1 text-sm font-medium text-slate-800 dark:text-slate-100 flex flex-col gap-0.5 sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-200 dark:border-slate-700" style={{ gridRow: "1 / -1", gridColumn: "1" }}>
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
                      {/* 勤務表が未登録のとき。制限なしの先生は営業時間ぜんぶ受け付ける扱い、
                          出勤日制の先生は出勤日を登録しないと1枠も取れないので、文言を分ける。 */}
                      {noSchedule && !sched?.isOff && !day.isHoliday && (
                        <span
                          className="self-start text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-px dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800"
                          title={canFillWholeDay
                            ? "この先生の勤務時間が登録されていないため、院の営業時間すべてを『予約を取れる時間』として表示しています。設定＞スタッフ勤務時間 で登録すると正しく色分けされます。"
                            : "この先生は出勤日・受付時間の設定がある一方で、勤務時間が登録されていません。設定＞スタッフ勤務時間 で登録するまで、取れる時間を色で示せません。"}
                        >
                          {canFillWholeDay ? "勤務未登録" : "出勤日 未設定"}
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
                      // ハイライトは1マスだけでなく、予約の所要時間ぶんの範囲で出す
                      // （40分の予約を20分幅のマスだけでハイライトすると、バーとマスの大きさが
                      // 合わず「どちらの端をどこに合わせるか」分からなくなるため）。
                      const isDropHere =
                        dropTarget != null &&
                        dropTarget.dateKey === day.date &&
                        dropTarget.staffId === s.id &&
                        m.minute >= dropTarget.minute &&
                        m.minute < dropTarget.minute + (draggingAptDuration ?? data.slotMinutes);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleEmptyCellClick(day.date, s.id, m.minute)}
                          data-cell-date={day.date}
                          data-cell-staff={s.id}
                          data-cell-minute={m.minute}
                          aria-label={`${format(dayDate, "M月d日", { locale: ja })} ${s.name} ${m.label} に${breakMode ? "休憩を追加" : "新規予約を追加"}`}
                          title={breakMode
                            ? `${format(dayDate, "M/d", { locale: ja })} ${m.label} ・クリックで休憩（予約ブロック）`
                            : `${format(dayDate, "M/d", { locale: ja })} ${s.name} ${m.label} ・クリックで新規予約`}
                          // 🚨 gridColumn は必ず明示する。auto配置に任せると、位置を明示している
                          // 予約バーが先に席を取り、マスはバーの列を「スキップ」して右へ流れる
                          // （CSS Grid自動配置の仕様）。その結果、バーより右のマス全部が
                          // バーの幅ぶんズレて、ヘッダーの時刻・ドラッグの落下地点・空きクリックの
                          // 時刻がすべて狂っていた（2026-09-01 藤川先生報告のドラッグずれの根本原因。
                          // 例: バー2本(各40分)の右側では常に80分手前に登録されていた）。
                          // 1列目はスタッフ名なので +2。
                          style={{ gridRow: "1 / -1", gridColumn: `${i + 2}` }}
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
                      // 複数スタッフ予約は _displayStart/_displayEnd でずらした時刻・担当メニューを使う
                      const startMin = minuteOfDayJst(a._displayStart ?? a.start_time);
                      const endMinRaw = (a._displayEnd ?? a.end_time)
                        ? minuteOfDayJst(a._displayEnd ?? a.end_time!)
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
                      const displayStartLabel = fmtTime(a._displayStart ?? a.start_time);
                      // その先生のレーンに出すメニュー名（複数スタッフ予約は担当ぶんだけ）
                      const laneCourseName = a._displayCourseName ?? a.course_name;
                      // 複数担当の予約は担当ごとに時間を等分してずらして描いている。
                      // バーの左端だけ見ると「実際には無い時刻」に見えるので、
                      // 予約そのものの通し時刻と「1/2・2/2」を必ずバーに出す。
                      const splitCount = a._splitCount ?? 1;
                      const hasMultiStaff = splitCount > 1;
                      const splitLabel = hasMultiStaff ? `${(a._splitIndex ?? 0) + 1}/${splitCount}` : "";
                      const wholeTimeLabel = `${fmtTime(a.start_time)}${a.end_time ? `–${fmtTime(a.end_time)}` : ""}`;
                      // 分割バー同士を同じ枠線色でつないで「1件の予約」だと分かるようにする
                      const linkColor = hasMultiStaff ? splitLinkColor(a.id) : null;
                      // 掴めるのは先頭担当のバーだけ。動かすと予約まるごと（全担当ぶん）動く。
                      const draggable = canDrag(a) && (!hasMultiStaff || (a._splitIndex ?? 0) === 0);
                      // 同じ患者様の他の予約に紫の枠を出す（選択中／マウスを乗せている患者）
                      const isLinkedCustomer = !!linkedCustomerId && a.customer_id === linkedCustomerId;
                      // 絞り込みに当てはまらない予約は薄く落とす（消しはしない）
                      const dimmed = !aptMatchesQuery(a, normQuery);
                      const opacityCls = dimmed ? "opacity-25" : draggingAptId === a.id ? "opacity-40" : "";
                      return (
                        <button
                          key={`${a.id}-${s.id}`}
                          type="button"
                          onClick={() => {
                            if (suppressNextClickRef.current) { suppressNextClickRef.current = false; return; }
                            setSelectedApt(a);
                          }}
                          onMouseEnter={() => setHoverCustomerId(a.customer_id)}
                          onMouseLeave={() => setHoverCustomerId(null)}
                          onFocus={() => setHoverCustomerId(a.customer_id)}
                          onBlur={() => setHoverCustomerId(null)}
                          draggable={false}
                          onPointerDown={(e) => {
                            if (!draggable || e.button !== 0) return;
                            pointerDragRef.current = { aptId: a.id, startX: e.clientX, startY: e.clientY, moved: false };
                          }}
                          onPointerMove={(e) => {
                            const st = pointerDragRef.current;
                            if (!st || st.aptId !== a.id) return;
                            if (!st.moved) {
                              const dx = e.clientX - st.startX;
                              const dy = e.clientY - st.startY;
                              // 数px以上動いてから「ドラッグ」とみなす（タップと区別するため）
                              if (Math.hypot(dx, dy) < 6) return;
                              st.moved = true;
                              suppressNextClickRef.current = true;
                              setDraggingAptId(a.id);
                              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                            }
                            e.preventDefault();
                            // ドラッグ中は全バーが pointer-events-none になるので、下のセルを直接拾える。
                            // ここでの計算は「ハイライト表示用」の目安。巨大なタイムライン全体の再描画を
                            // 伴うため、動きが速いドラッグだと処理が追いつかず古い座標になりうる
                            // （実際に落とす場所は onPointerUp でその時点の座標から取り直す＝下記参照）。
                            const next = computeDropTarget(e.clientX, e.clientY);
                            dropTargetRef.current = next;
                            setDropTarget((prev) =>
                              prev?.dateKey === next?.dateKey && prev?.staffId === next?.staffId && prev?.minute === next?.minute
                                ? prev
                                : next,
                            );
                          }}
                          onPointerUp={(e) => {
                            const st = pointerDragRef.current;
                            pointerDragRef.current = null;
                            if (!st || st.aptId !== a.id) return;
                            if (st.moved) {
                              e.preventDefault();
                              // pointermove側のdropTargetRefは描画の遅れで古い可能性があるため使わず、
                              // 離した瞬間の座標でその場で計算し直す（ドラッグのズレの主原因への対策）。
                              const target = computeDropTarget(e.clientX, e.clientY);
                              setDraggingAptId(null);
                              setDropTarget(null);
                              dropTargetRef.current = null;
                              if (target) handleDropOnCell(target.dateKey, target.staffId, target.minute);
                            }
                          }}
                          onPointerCancel={() => {
                            pointerDragRef.current = null;
                            dropTargetRef.current = null;
                            suppressNextClickRef.current = false;
                            setDraggingAptId(null);
                            setDropTarget(null);
                          }}
                          style={{
                            touchAction: draggable ? "none" : undefined,
                            gridColumn: `${gridColStart} / span ${colSpan}`,
                            gridRow: (laneOf.get(`${a.id}-${s.id}`) ?? laneOf.get(a.id) ?? 0) + 1,
                            alignSelf: "stretch",
                            // グリッドアイテムの既定 min-width は auto。className の truncate（overflow:hidden;
                            // white-space:nowrap）だけでは、長い患者名・メニュー名が「省略される前の
                            // 折り返さない全文の幅」で列の最小サイズ計算に効いてしまい、その予約が
                            // またがる列だけヘッダーより広がって、ヘッダーのラベルと実際のマス位置が
                            // ズレる（＝ドラッグの登録時刻が離した場所より手前になる）原因になっていた。
                            // 2026-09-01 実測で発見（藤川先生指摘のドラッグのズレの根本原因）。
                            minWidth: 0,
                            marginLeft: `${(offsetFrac / colSpan) * 100}%`,
                            width: `${Math.min((widthCols / colSpan) * 100, 100)}%`,
                            ...(linkColor ? { borderColor: linkColor, borderWidth: "2px" } : {}),
                          }}
                          className={`text-[11px] leading-tight rounded border px-1 py-0.5 my-0.5 text-left truncate transition-all ${cls} ${
                            isLinkedCustomer ? "ring-2 ring-violet-400" : "hover:ring-2 hover:ring-blue-400"
                          } ${
                            draggable ? "cursor-grab active:cursor-grabbing" : ""
                          } ${
                            // ドラッグ中はバーを「透過」させ、下に隠れているセルにも落とせるようにする
                            draggingAptId ? "pointer-events-none" : ""
                          } ${opacityCls}`}
                          title={isCancelled
                            ? `${displayStartLabel} ${a.customer_name ?? ""} ${cancelKindLabel(a.cancel_kind, a.no_show)}（タップで復活できます）`
                            : hasMultiStaff
                              ? `${a.customer_name ?? ""}${a.medical_record_number ? ` (No.${a.medical_record_number})` : ""} ${laneCourseName ?? ""}（${s.name}先生の担当ぶん）\n通しの予約時間 ${wholeTimeLabel}（担当${splitCount}人・このバーは${splitLabel}）\n${draggable ? "このバーをドラッグすると予約まるごと動きます" : "移動は先頭の先生のバーからどうぞ"}`
                              : `${displayStartLabel} ${a.customer_name ?? ""}${a.medical_record_number ? ` (No.${a.medical_record_number})` : ""} ${laneCourseName ?? ""}・ドラッグで時間や先生を変えられます`}
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
                            {hasMultiStaff && (
                              <span
                                className="ml-1 text-[9px] font-black px-1 rounded text-white"
                                style={{ backgroundColor: linkColor ?? "#7c3aed" }}
                                title={`担当${splitCount}人で分けて表示しています（${splitLabel}本目）`}
                              >
                                {splitLabel}
                              </span>
                            )}
                          </div>
                          {isCancelled ? (
                            <div className="truncate text-[9px] font-bold text-slate-400 dark:text-slate-500">
                              {cancelKindLabel(a.cancel_kind, a.no_show)}
                            </div>
                          ) : (
                            <>
                              {/* 複数担当のときは「本当の予約時間」をバーに出す。
                                  バーの位置は担当ごとにずらしてあるので、これが無いと時刻を読み違える。 */}
                              {hasMultiStaff && (
                                <div
                                  className="truncate text-[9px] font-bold tabular-nums"
                                  style={{ color: linkColor ?? undefined }}
                                >
                                  通し {wholeTimeLabel}
                                </div>
                              )}
                              {laneCourseName && (
                                <div className="truncate opacity-80">
                                  {a.department === "カフェ" ? "☕ " : ""}{laneCourseName}
                                  {/* 複数スタッフの予約は、その先生が担当するメニューだけを出す
                                      （他の先生のメニューまで出すと「この先生はこれをやらない」誤解になる） */}
                                  {!hasMultiStaff && ((a.additional_courses?.length ?? 0) > 0) && ` ＋${a.additional_courses?.length}`}
                                </div>
                              )}
                            </>
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

      {/* 担当かぶりで動かせなかったときのお知らせ（直すまで通さない） */}
      {overlapError && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div
            className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border-2 max-w-sm w-full p-5 space-y-3 ${
              userRole === "owner" && overlapRetry
                ? "border-amber-300 dark:border-amber-700"
                : "border-rose-300"
            }`}
          >
            {/* 院長先生が通せる場面で「動かせません」と言い切らない（2026-08-29。
                新規追加・予約編集のダイアログと同じ形にそろえた） */}
            <p
              className={`text-base font-bold ${
                userRole === "owner" && overlapRetry
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-rose-700 dark:text-rose-300"
              }`}
            >
              {userRole === "owner" && overlapRetry
                ? "⚠ その時間には、すでに予約が入っています"
                : "⚠ この予約は動かせません"}
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">
              {overlapError}
            </p>
            {userRole === "owner" && overlapRetry ? (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                <span className="font-bold">重ねて診る予定なら</span>、下の
                <span className="font-bold">「重なりを承知で進める（院長）」</span>
                でそのまま動かせます。予約のメモに院長承認の印が残ります。<br />
                重ねない予定なら、<span className="font-bold">担当の先生を変える</span>か、
                <span className="font-bold">別の時間にずらして</span>ください。
              </div>
            ) : (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 px-3 py-2 text-xs text-rose-800 dark:text-rose-200 leading-relaxed">
                同じ先生の同じ時間に2件の予約は入れられません。<br />
                <span className="font-bold">担当の先生を変える</span>か、
                <span className="font-bold">別の時間にずらす</span>と動かせます。
                {userRole !== "owner" && (
                  <>
                    <br />
                    どうしても重ねる必要があるときは、<span className="font-bold">院長先生の許可</span>が必要です。
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => { setOverlapError(null); setOverlapRetry(null); }}
              className="w-full h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              戻って直す
            </button>
            {/* 院長先生だけは、事情が分かっているので承知のうえで通せる */}
            {userRole === "owner" && overlapRetry && (
              <button
                type="button"
                onClick={async () => {
                  const retry = overlapRetry;
                  setOverlapError(null);
                  setOverlapRetry(null);
                  await retry();
                }}
                className="w-full h-10 rounded-xl border border-amber-300 text-amber-800 dark:text-amber-200 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-sm font-bold"
              >
                重なりを承知で進める（院長）
              </button>
            )}
          </div>
        </div>
      )}

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
              {movePlan.staffCount > 1 && (
                <p className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                  この予約は担当{movePlan.staffCount}人です。分けて表示している{movePlan.staffCount}本のバーは
                  まとめて動きます（通しの予約時間ごと移動します）。
                </p>
              )}
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
                onClick={() => runMove(false)}
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
              {(selectedApt.additional_staff?.length ?? 0) > 0 && (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                  担当{(selectedApt.additional_staff?.length ?? 0) + 1}人の予約です。タイムテーブルでは先生ごとに
                  時間を分けて{(selectedApt.additional_staff?.length ?? 0) + 1}本のバーで表示していますが、
                  実際の予約時間は上の
                  <span className="font-bold tabular-nums">
                    {" "}{fmtTime(selectedApt.start_time)}
                    {selectedApt.end_time && `–${fmtTime(selectedApt.end_time)}`}{" "}
                  </span>
                  です。
                </div>
              )}
              {selectedApt.status !== "cancelled" && monthCrossIds.has(selectedApt.id) && (
                <div className="rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 px-3 py-2 text-xs font-semibold text-violet-800 dark:text-violet-200">
                  🔖 月またぎ：先月から継続の患者様の今月最初の来院です。
                  保険証の確認など、月初の対応をお願いします。
                </div>
              )}
              {/* 同じ患者様の他の予約。表の上では紫の枠でつながっているものを、ここでは一覧で出す。 */}
              {selectedCustomerOtherApts.length > 0 && (
                <div className="rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 px-3 py-2">
                  <p className="text-xs font-bold text-violet-800 dark:text-violet-200 mb-1">
                    同じ患者様の予約が この表示期間に あと{selectedCustomerOtherApts.length}件あります
                  </p>
                  <ul className="space-y-0.5">
                    {selectedCustomerOtherApts.map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedApt(o)}
                          className="w-full text-left text-xs text-violet-800 dark:text-violet-200 hover:underline tabular-nums"
                        >
                          {format(dateFromKey(jstDateKey(o.start_time)), "M/d(E)", { locale: ja })}{" "}
                          {fmtTime(o.start_time)}
                          {o.course_name && <span className="ml-1 font-normal opacity-80">{o.course_name}</span>}
                          {o.staff_name && <span className="ml-1 font-normal opacity-60">/ {o.staff_name}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
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
                      } else if ("overlap" in res && res.overlap) {
                        const target = selectedApt;
                        if (!("needsOwner" in res && res.needsOwner)) setOverlapRetry(null);
                        else setOverlapRetry(() => async () => {
                          const again = await restoreCancelledAppointment(target.id, true);
                          if (again.success) { toast.success(`${target.customer_name ?? "患者"}様の予約を元に戻しました`); refresh(); }
                          else toast.error(again.error ?? "元に戻せませんでした");
                        });
                        setSelectedApt(null);
                        setOverlapError(res.error ?? "同じ担当の重複予約はできません。");
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
                {/* ずらす幅は院の予約枠（clinic_settings.slot_duration_minutes）の1・2・3倍。
                    30分決め打ちにすると、20分単位で運用している からだ鍼灸整骨院で
                    枠とズレた時刻に動いてしまう（2026-08-10 藤川先生／絶対ルール）。
                    からだ=20分 → ±20/40/60、30分の院 → ±30/60/90。 */}
                {(() => {
                  const step = data?.slotMinutes ?? 30;
                  return [-3, -2, -1, 1, 2, 3].map((n) => n * step);
                })().map((d) => (
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
