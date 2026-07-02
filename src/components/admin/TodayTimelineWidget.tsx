"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
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
import { getTimelineForDate, type TimelineData, type TimelineAppointment } from "@/app/actions/timeline";
import { updateCheckinStatus, addAddonToAppointment, getAddonCourseInfo, sendReviewRequest, getReviewRequestConfig } from "@/app/actions/adminReserve";
import { getStaffSchedulesForDate, upsertStaffScheduleForDate, type StaffDaySchedule } from "@/app/actions/staff-schedule";
import { getMyRole } from "@/app/actions/auth";
import type { ClinicRole } from "@/app/actions/auth";
import { AddAppointmentDialog } from "@/components/admin/AddAppointmentDialog";
import { EditAppointmentDialog } from "@/components/admin/EditAppointmentDialog";
import { PendingReservationsButton } from "@/components/admin/PendingReservationsButton";

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

function statusColor(status: string, checkin: string | null, isFirstVisit: boolean): string {
  if (status === "waiting") return "bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100";
  if (checkin === "arrived") return "bg-emerald-100 border-emerald-400 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100";
  if (checkin === "done") return "bg-slate-100 border-slate-300 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300";
  if (isFirstVisit) return "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100";
  return "bg-sky-50 border-sky-300 text-sky-900 dark:bg-sky-900/30 dark:text-sky-100";
}

export default function TodayTimelineWidget({
  showPendingButton = true,
}: { showPendingButton?: boolean } = {}) {
  const router = useRouter();
  const [date, setDate] = useState<Date | null>(null);
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedApt, setSelectedApt] = useState<TimelineAppointment | null>(null);
  // 「施術後に○○を追加」用：院ごとに設定された追加メニュー（未設定ならボタン非表示）
  const [addonInfo, setAddonInfo] = useState<{ courseId: string; name: string; allowConcurrent: boolean } | null>(null);
  // Googleクチコミ依頼が使えるか（設定URLがある院のみボタン表示）
  const [reviewEnabled, setReviewEnabled] = useState(false);

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

  // スタッフ勤務スケジュール
  const [staffSchedules, setStaffSchedules] = useState<StaffDaySchedule[]>([]);
  const [userRole, setUserRole] = useState<ClinicRole | null>(null);
  // 勤務時間編集ポップアップ
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState<string>("");
  const [editEnd, setEditEnd] = useState<string>("");
  const [editBreakStart, setEditBreakStart] = useState<string>("");
  const [editBreakEnd, setEditBreakEnd] = useState<string>("");
  const [editIsOff, setEditIsOff] = useState<boolean>(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  // 受付AI調整メッセージ
  const [receptionAiMsg, setReceptionAiMsg] = useState<string | null>(null);

  useEffect(() => { setDate(new Date()); }, []);

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

  const fetchSchedules = useCallback(async (d: Date) => {
    const dateStr = format(d, "yyyy-MM-dd");
    const res = await getStaffSchedulesForDate(dateStr);
    if (res.success && res.schedules) {
      setStaffSchedules(res.schedules);
    }
  }, []);

  const fetchData = useCallback(async (d: Date) => {
    setLoading(true);
    setError(null);
    const [res] = await Promise.all([
      getTimelineForDate(format(d, "yyyy-MM-dd")),
      fetchSchedules(d),
    ]);
    if (res.success && res.data) {
      setData(res.data);
    } else {
      setError(res.error ?? "取得失敗");
    }
    setLoading(false);
  }, [fetchSchedules]);

  useEffect(() => {
    if (!date) return;
    fetchData(date);
  }, [date, fetchData]);

  // Realtime: appointments 変更で再取得
  useEffect(() => {
    if (!date) return;
    const sb = createClient();
    const ch = sb.channel("timeline-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, realtimeGuard(() => fetchData(date)))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [date, fetchData]);

  const goPrev = () => date && setDate(new Date(date.getTime() - 24 * 3600 * 1000));
  const goNext = () => date && setDate(new Date(date.getTime() + 24 * 3600 * 1000));
  const goToday = () => setDate(new Date());

  // 空きセルクリック → 新規予約ダイアログを開く
  const handleEmptyCellClick = (staffId: string, minuteOfDay: number) => {
    if (!date) return;
    const hh = Math.floor(minuteOfDay / 60);
    const mm = minuteOfDay % 60;
    const timeStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    setReserveDialog({
      open: true,
      staffId: staffId === UNASSIGNED_KEY ? undefined : staffId,
      time: timeStr,
      date: date,
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
        if (date) fetchData(date);
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
        if (date) fetchData(date);
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
    const rows: { id: string; name: string; monthly_visit_target?: number | null }[] =
      data.staff.map(s => ({ id: s.id, name: s.name, monthly_visit_target: s.monthly_visit_target ?? null }));
    return rows;
  }, [data]);

  // 担当未設定の予約を表示するデフォルト行（先頭スタッフ＝sort_order 最小のメイン担当）
  const defaultStaffId = data?.staff[0]?.id ?? null;

  // 時間軸の刻みリスト（営業終了時刻のラベルも末尾に含める）
  const timeMarks = useMemo(() => {
    if (!data) return [] as { label: string; minute: number }[];
    const out: { label: string; minute: number }[] = [];
    const startMin = data.scheduleStartHour * 60;
    const endMin = data.scheduleEndHour * 60;
    // <= で営業終了時刻のラベルも出す（例: close=20:00 なら 20:00 が最終マーク）
    for (let m = startMin; m <= endMin; m += data.slotMinutes) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      out.push({
        label: mm === 0 ? `${h}:00` : `:${String(mm).padStart(2, "0")}`,
        minute: m,
      });
    }
    return out;
  }, [data]);

  // 予約をスタッフごとにグループ化
  // 複数スタッフの予約は、合計施術時間を等分してスタッフごとに時間帯をずらして表示する
  // （例: 17:00-17:40 を A先生・B先生で 17:00-17:20 / 17:20-17:40 に分割）
  // _displayStart / _displayEnd はタイムテーブル表示専用で、モーダルは元の start_time を使う
  const aptsByStaff = useMemo(() => {
    type DisplayApt = TimelineAppointment & { _displayStart?: string; _displayEnd?: string };
    const map = new Map<string, DisplayApt[]>();
    if (!data) return map as Map<string, TimelineAppointment[]>;

    for (const a of data.appointments) {
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
      const endMinRaw = a.end_time ? minuteOfDayJst(a.end_time) : startMin + data.slotMinutes;
      const totalDuration = Math.max(endMinRaw - startMin, data.slotMinutes * allStaffIds.length);
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
  }, [data, defaultStaffId]);

  if (!date) return null;

  return (
    <Card className="shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">
            予約タイムテーブル ({format(date, "M/d (E)", { locale: ja })})
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {/* 受付業務中でも仮予約が入ったらすぐ気づけるよう、タイムテーブル上にも件数を出す */}
          {showPendingButton && (
            <PendingReservationsButton onChanged={() => date && fetchData(date)} />
          )}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={goPrev} aria-label="前日">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToday}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" />今日
            </Button>
            <Button variant="outline" size="sm" onClick={goNext} aria-label="翌日">
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
            <div className="min-w-[900px]">
              {/* 時間軸ヘッダ */}
              <div
                className="grid items-center text-[10px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700"
                style={{ gridTemplateColumns: `140px repeat(${timeMarks.length}, minmax(28px, 1fr))` }}
              >
                <div className="px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-between gap-1">
                  <span>先生</span>
                  <span className="text-[9px] font-normal text-slate-400 normal-case">
                    {data.monthLabel}実績/目標
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
                const scheduleStart = data.scheduleStartHour * 60;
                const scheduleEnd = data.scheduleEndHour * 60;
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
                                const dateLabel = date ? format(date, "M月d日(E)", { locale: ja }) : "";
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
                      const sMin = hmToMinutes(sc.startTime);
                      const eMin = hmToMinutes(sc.endTime);
                      const left = Math.max(0, ((sMin - scheduleStart) / totalGridMinutes) * 100);
                      const width = Math.min(100 - left, ((Math.min(eMin, scheduleEnd) - Math.max(sMin, scheduleStart)) / totalGridMinutes) * 100);
                      if (width <= 0) return null;
                      return (
                        <div
                          key={sc.staffId}
                          className="absolute top-1 bottom-1 rounded"
                          style={{
                            left: `calc(140px + ${left}%)`,
                            width: `${width}%`,
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

              {/* スタッフ行 */}
              {staffRows.map((s) => {
                const apts = aptsByStaff.get(s.id) ?? [];
                // 担当未設定分の実績はデフォルト行（先頭スタッフ）に合算する
                const monthCount = (data.staffMonthCounts?.[s.id] ?? 0)
                  + (s.id === defaultStaffId ? (data.staffMonthCounts?.[UNASSIGNED_KEY] ?? 0) : 0);
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
                const scheduleStart = data.scheduleStartHour * 60;
                const scheduleEnd = data.scheduleEndHour * 60;
                const totalGridMinutes = scheduleEnd - scheduleStart;
                // 勤務時間バーの CSS left/width (%)
                const barLeft = (schedStart !== null && totalGridMinutes > 0)
                  ? Math.max(0, ((schedStart - scheduleStart) / totalGridMinutes) * 100)
                  : null;
                const barWidth = (schedStart !== null && schedEnd !== null && totalGridMinutes > 0)
                  ? Math.min(100, ((Math.min(schedEnd, scheduleEnd) - Math.max(schedStart, scheduleStart)) / totalGridMinutes) * 100)
                  : null;

                const isEditing = editingStaffId === s.id;

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
                    {/* 勤務時間バー（予約バーの後ろ、z-index 低め） */}
                    {barLeft !== null && barWidth !== null && !sched?.isOff && (
                      <div
                        className="absolute top-0 bottom-0 pointer-events-none"
                        style={{
                          left: `calc(140px + ${barLeft}%)`,
                          width: `${barWidth}%`,
                          backgroundColor: "rgba(220, 252, 231, 0.5)",
                          zIndex: 0,
                        }}
                      />
                    )}
                    {/* 休憩バンド（グレー帯） */}
                    {(() => {
                      if (!sched || sched.isOff || !sched.breakStart || !sched.breakEnd) return null;
                      const brkStart = hmToMinutes(sched.breakStart);
                      const brkEnd = hmToMinutes(sched.breakEnd);
                      if (brkEnd <= brkStart) return null;
                      const brkLeft = Math.max(0, ((brkStart - scheduleStart) / totalGridMinutes) * 100);
                      const brkWidth = Math.min(
                        100 - brkLeft,
                        ((Math.min(brkEnd, scheduleEnd) - Math.max(brkStart, scheduleStart)) / totalGridMinutes) * 100,
                      );
                      if (brkWidth <= 0) return null;
                      return (
                        <div
                          className="absolute top-0 bottom-0 pointer-events-none flex items-center justify-center"
                          style={{
                            left: `calc(140px + ${brkLeft}%)`,
                            width: `${brkWidth}%`,
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
                              setEditingStaffId(null);
                            } else {
                              setEditingStaffId(s.id);
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
                            ? `${data.monthLabel}実績 ${monthCount} / 目標 ${target}（達成率 ${Math.round((monthCount / target) * 100)}%）`
                            : `${data.monthLabel}の予約件数（キャンセル除く）`}
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
                        <span className="text-[9px] text-rose-400 font-semibold">休み</span>
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
                                if (!date) return;
                                setScheduleLoading(true);
                                try {
                                  const res = await upsertStaffScheduleForDate(
                                    s.id,
                                    format(date, "yyyy-MM-dd"),
                                    editIsOff ? null : editStart,
                                    editIsOff ? null : editEnd,
                                    editIsOff,
                                    editBreakStart || null,
                                    editBreakEnd || null,
                                  );
                                  if (res.success) {
                                    toast.success("勤務時間を更新しました");
                                    setEditingStaffId(null);
                                    await fetchSchedules(date);
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
                              onClick={() => setEditingStaffId(null)}
                              className="flex-1 text-[11px] border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-700"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* グリッドセル（クリックで新規予約） */}
                    {timeMarks.map((m, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleEmptyCellClick(s.id, m.minute)}
                        aria-label={`${s.name} ${m.label} に新規予約を追加`}
                        title={`${s.name} ${m.label} ・クリックで新規予約`}
                        style={{ gridRow: "1 / -1" }}
                        className={`h-full hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors cursor-pointer ${
                          m.label.includes(":00")
                            ? "border-l border-slate-300 dark:border-slate-600"
                            : "border-l border-slate-100 dark:border-slate-800"
                        }`}
                      />
                    ))}
                    {/* 予約バー（absolute 配置） */}
                    {apts.map((a) => {
                      // 複数スタッフ予約は _displayStart/_displayEnd でずらした時刻を使う
                      const dispA = a as typeof a & { _displayStart?: string; _displayEnd?: string };
                      const startMin = minuteOfDayJst(dispA._displayStart ?? a.start_time);
                      const endMinRaw = (dispA._displayEnd ?? a.end_time)
                        ? minuteOfDayJst(dispA._displayEnd ?? a.end_time!)
                        : startMin + data.slotMinutes;
                      const endMin = Math.max(endMinRaw, startMin + data.slotMinutes);
                      const scheduleStart = data.scheduleStartHour * 60;
                      const scheduleEnd = data.scheduleEndHour * 60;
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
                      const displayStartLabel = fmtTime(dispA._displayStart ?? a.start_time);
                      const hasMultiStaff = (dispA._displayStart !== undefined);
                      return (
                        <button
                          key={`${a.id}-${s.id}`}
                          type="button"
                          onClick={() => setSelectedApt(a)}
                          className={`text-[11px] leading-tight rounded border px-1 py-0.5 my-0.5 text-left truncate hover:ring-2 hover:ring-blue-400 transition-all ${cls}`}
                          style={{
                            gridColumn: `${gridColStart} / span ${colSpan}`,
                            gridRow: (laneOf.get(`${a.id}-${s.id}`) ?? laneOf.get(a.id) ?? 0) + 1,
                            alignSelf: "stretch",
                            marginLeft: `${(offsetFrac / colSpan) * 100}%`,
                            width: `${Math.min((widthCols / colSpan) * 100, 100)}%`,
                          }}
                          title={`${displayStartLabel} ${a.customer_name ?? ""}${a.medical_record_number ? ` (No.${a.medical_record_number})` : ""} ${a.course_name ?? ""}${hasMultiStaff ? "（時間分割表示）" : ""}`}
                        >
                          <div className="truncate font-semibold">
                            {!a.staff_id && (
                              <span className="mr-0.5 text-[9px] font-bold text-rose-500" title="担当未設定（予約変更から担当を設定できます）">●</span>
                            )}
                            {a.customer_name ?? "(顧客名なし)"}
                            {a.medical_record_number && (
                              <span className="ml-1 text-[9px] font-bold opacity-70 tabular-nums">No.{a.medical_record_number}</span>
                            )}
                            {a.is_first_visit ? " ⓢ" : ""}
                            {a.party_size != null && (
                              <span className="ml-1 text-[9px] font-bold text-orange-600">{a.party_size}名</span>
                            )}
                            {((a.additional_staff?.length ?? 0) > 0) && (
                              <span className="ml-1 text-[9px] font-normal opacity-70">×{(a.additional_staff?.length ?? 0) + 1}人</span>
                            )}
                          </div>
                          {a.course_name && (
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
          </div>
        )}
      </CardContent>

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
                <span className="text-slate-500">状態:</span> {selectedApt.status}{selectedApt.is_first_visit && " (初診)"}
                {selectedApt.checkin_status && (
                  <span className="ml-2 text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 font-semibold">
                    {selectedApt.checkin_status === "arrived" ? "受付済" :
                     selectedApt.checkin_status === "in_treatment" ? "施術中" :
                     selectedApt.checkin_status === "done" ? "完了" : selectedApt.checkin_status}
                  </span>
                )}
              </div>
              {selectedApt.memo && <div><span className="text-slate-500">メモ:</span> <span className="whitespace-pre-wrap">{selectedApt.memo}</span></div>}
            </div>

            {/* アクションボタン: 受付 / 会計へ / 次回予約 */}
            <div className="flex flex-col gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
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
            if (date) fetchData(date);
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
          onSuccess={() => date && fetchData(date)}
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
            if (date) fetchData(date);
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
