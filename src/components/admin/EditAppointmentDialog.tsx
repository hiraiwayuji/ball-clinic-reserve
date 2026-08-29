"use client";

import { useState, useEffect } from "react";
import { format, parseISO, addDays } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarIcon, Trash2, MessageCircle, CheckCircle, X, Clock, CalendarRange, CalendarPlus, Bell, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  updateAppointmentDetails,
  deleteAppointment,
  cancelAppointmentKeepRecord,
  updateAppointmentStatus,
  sendLineConfirmation,
  notifyWaitlistOpening,
  addAddonToAppointment,
  addAdjacentAppointment,
  getAddonCourseInfo,
  type WaitlistCandidate,
} from "@/app/actions/adminReserve";
import { getCourses, getStaffList, getRooms, type ReservationCourse, type ReservationStaff, type ReservationRoom } from "@/app/actions/courses";
import { getMyRole } from "@/app/actions/auth";
import { AddAppointmentDialog } from "./AddAppointmentDialog";
import { toast } from "sonner";
import { getTimeSlots } from "@/lib/time-slots";
import { useClinicSlotDuration } from "@/lib/use-clinic-slot-duration";
import { OverlapFixList } from "@/components/admin/OverlapFixList";

interface EditAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: any;
  onSuccess?: () => void;
}

export function EditAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  onSuccess,
}: EditAppointmentDialogProps) {
  const slotMinutes = useClinicSlotDuration();
  // スタッフ別（タイムテーブル）から開くと customers ではなく customer_name で渡ってくる。
  // 名前が空のまま「次回予約」へ進むと患者が紐付かず、別レコードが作られてしまう。
  const patientName: string = appointment?.customers?.name ?? appointment?.customer_name ?? "";
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState<string>("");
  const [duration, setDuration] = useState<string>("30");
  const [visitType, setVisitType] = useState<string>("return");
  const [memo, setMemo] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastVisitDate, setLastVisitDate] = useState<Date | null>(null);
  const [visitCount, setVisitCount] = useState<number | null>(null);
  const [deleteChoiceOpen, setDeleteChoiceOpen] = useState(false);
  // 担当かぶりで保存できなかったときのお知らせ。
  // トーストは数秒で消えて読み飛ばされるため、閉じるまで残るダイアログで出す
  // （2026-08-22 ぼーるくん「注意メッセージを出しても読まない人がいる」）。
  const [overlapError, setOverlapError] = useState<string | null>(null);
  // ログイン中の権限。かぶりを承知で通せるのはオーナー（院長先生）だけ。
  const [userRole, setUserRole] = useState<string | null>(null);
  const isOwner = userRole === "owner";
  // かぶりで止まった操作を、院長の判断でやり直すための覚え書き
  const [pendingOverlapAction, setPendingOverlapAction] =
    useState<null | "save" | "adjacent">(null);
  useEffect(() => { getMyRole().then((r) => setUserRole(r)).catch(() => {}); }, []);
  const [seriesFutureCount, setSeriesFutureCount] = useState<number>(0);
  // キャンセル待ち：削除で空きが出たとき候補を出して LINE で空きを知らせる
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistCandidates, setWaitlistCandidates] = useState<WaitlistCandidate[]>([]);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [notifiedIds, setNotifiedIds] = useState<string[]>([]);
  // 予約確定の直後に「LINEを送りますか？」を確認するポップ
  const [lineConfirmOpen, setLineConfirmOpen] = useState(false);
  const [lineSending, setLineSending] = useState(false);
  // 次回予約（この患者の新規予約をプリフィルして開く）
  const [nextOpen, setNextOpen] = useState(false);
  const [custPhone, setCustPhone] = useState<string>("");
  const [custMrn, setCustMrn] = useState<string>("");
  // 次回予約フォームの初期日時（1週間後の同じ曜日・同じ時刻）
  const [nextDefaultDate, setNextDefaultDate] = useState<Date | undefined>();
  const [nextDefaultTime, setNextDefaultTime] = useState<string>("");
  // 「施術後に○○を追加」用の設定メニュー
  const [addonInfo, setAddonInfo] = useState<{ courseId: string; name: string; allowConcurrent: boolean } | null>(null);
  // 直前・直後追加パネル
  const [adjacentPanel, setAdjacentPanel] = useState<"before" | "after" | null>(null);
  const [adjacentCourseId, setAdjacentCourseId] = useState<string>("");
  const [adjacentStaffId, setAdjacentStaffId] = useState<string>("");

  // コース・スタッフ・個室マスタ
  const [courses, setCourses] = useState<ReservationCourse[]>([]);
  const [staffList, setStaffList] = useState<ReservationStaff[]>([]);
  const [rooms, setRooms] = useState<ReservationRoom[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");
  const [roomId, setRoomId] = useState<string>("");
  // 追加メニュー・追加担当（同じ予約にひもづく2件目以降）。
  // 新規追加ダイアログと同じ形で、ここでも足したり外したりできる。
  const [additionalCourses, setAdditionalCourses] = useState<string[]>([]);
  const [additionalStaff, setAdditionalStaff] = useState<string[]>([]);
  // 元の値（変更検知用：未変更なら updateAppointmentDetails に options を渡さない）
  const [initialCourseId, setInitialCourseId] = useState<string>("");
  const [initialStaffId, setInitialStaffId] = useState<string>("");
  const [initialRoomId, setInitialRoomId] = useState<string>("");
  const [initialAdditionalCourses, setInitialAdditionalCourses] = useState<string[]>([]);
  const [initialAdditionalStaff, setInitialAdditionalStaff] = useState<string[]>([]);

  // slot サイズ刻みで 120分まで（既存予約が slot 倍数でないケースも拾えるよう現在値もマージ）
  const durationOptions = (() => {
    const base = Array.from(
      { length: Math.floor(120 / slotMinutes) },
      (_, i) => (i + 1) * slotMinutes,
    );
    const cur = Number(duration);
    if (cur && !base.includes(cur)) {
      base.push(cur);
      base.sort((a, b) => a - b);
    }
    return base;
  })();

  useEffect(() => {
    if (open && appointment) {
      const startDateTime = parseISO(appointment.start_time);
      setDate(startDateTime);
      setTime(format(startDateTime, "HH:mm"));

      // 前回来院日・来院回数を取得（マルチテナント漏洩防止のため clinic_id でも絞る）
      const aptClinicId = appointment.clinic_id ?? null;
      if (appointment.customer_id && aptClinicId) {
        const supabase = createClient();
        supabase
          .from("appointments")
          .select("start_time")
          .eq("clinic_id", aptClinicId)
          .eq("customer_id", appointment.customer_id)
          .neq("status", "cancelled")
          .neq("id", appointment.id)
          .lt("start_time", appointment.start_time)
          .order("start_time", { ascending: false })
          .limit(1)
          .then(({ data }) => {
            setLastVisitDate(data && data.length > 0 ? new Date(data[0].start_time) : null);
          });
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", aptClinicId)
          .eq("customer_id", appointment.customer_id)
          .neq("status", "cancelled")
          .neq("id", appointment.id)
          .lt("start_time", appointment.start_time)
          .then(({ count }) => {
            setVisitCount(count ?? 0);
          });
        // 次回予約のプリフィル用に電話番号・カルテ番号を取得（本人を確実に特定するため）
        supabase
          .from("customers")
          .select("phone, medical_record_number")
          .eq("clinic_id", aptClinicId)
          .eq("id", appointment.customer_id)
          .maybeSingle()
          .then(({ data }) => {
            setCustPhone(data?.phone ?? appointment.customers?.phone ?? appointment.customer_phone ?? "");
            setCustMrn(data?.medical_record_number ?? "");
          });
      } else {
        setLastVisitDate(null);
        setVisitCount(null);
        setCustPhone(appointment.customers?.phone ?? appointment.customer_phone ?? "");
        setCustMrn("");
      }

      let diffMinutes = 30;
      if (appointment.end_time) {
        const endDateTime = parseISO(appointment.end_time);
        diffMinutes = Math.round(
          (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60)
        );
      }
      setDuration(diffMinutes > 0 ? diffMinutes.toString() : "30");
      setVisitType(appointment.is_first_visit ? "new" : "return");
      setMemo(appointment.memo || "");

      // 既存の course_id / staff_id / room_id をセット
      const cId = appointment.course_id ?? "";
      const sId = appointment.staff_id ?? "";
      const rId = appointment.room_id ?? "";
      setCourseId(cId);
      setStaffId(sId);
      setRoomId(rId);
      setInitialCourseId(cId);
      setInitialStaffId(sId);
      setInitialRoomId(rId);

      // 追加メニュー・追加担当の既存値
      const addC: string[] = (appointment.additional_courses ?? [])
        .map((c: any) => c?.course_id).filter(Boolean);
      const addS: string[] = (appointment.additional_staff ?? [])
        .map((s: any) => s?.staff_id).filter(Boolean);
      setAdditionalCourses(addC);
      setAdditionalStaff(addS);
      setInitialAdditionalCourses(addC);
      setInitialAdditionalStaff(addS);

      // マスタ取得（既に取得済みなら再取得しない）
      if (courses.length === 0) {
        getCourses().then(setCourses).catch(() => {});
      }
      if (staffList.length === 0) {
        getStaffList().then(setStaffList).catch(() => {});
      }
      if (rooms.length === 0) {
        getRooms().then(setRooms).catch(() => {});
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appointment]);

  // 追加メニュー設定を取得（「施術後に○○を追加」ボタン用）
  useEffect(() => { getAddonCourseInfo().then(setAddonInfo).catch(() => setAddonInfo(null)); }, []);

  // メニューを選び直したときだけ所要時間を入れ直す。
  // メイン＋追加メニューの合計にする（保険施術20分＋鍼灸1部位20分 → 40分）。
  // 初期表示では動かさない：既存予約の所要時間を手で調整してある場合に上書きしないため。
  const applyDurationFor = (mainId: string, addIds: string[]) => {
    const ids = [mainId, ...addIds].filter(Boolean);
    if (ids.length === 0) return;
    const total = ids.reduce(
      (sum, id) => sum + (courses.find((c) => c.id === id)?.duration_minutes ?? 0),
      0,
    );
    if (total > 0) setDuration(String(total));
  };

  const handleCourseChange = (id: string) => {
    setCourseId(id);
    applyDurationFor(id, additionalCourses);
  };

  const changeAdditionalCourses = (next: string[]) => {
    setAdditionalCourses(next);
    applyDurationFor(courseId, next);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await saveAppointment(false);
  };

  const saveAppointment = async (allowOverlap: boolean) => {
    if (!date || !time || !appointment) {
      toast.error("日付と時間を選択してください");
      return;
    }
    // メイン担当が空のまま追加担当だけ入れると、タイムテーブルで
    // 「先頭スタッフ＋追加担当」の2レーンに分かれて誤解のもとになる。
    if (additionalStaff.filter(Boolean).length > 0 && !staffId) {
      toast.error("追加担当を入れるときは、担当スタッフも選んでください");
      return;
    }
    setIsSubmitting(true);
    try {
      // 変更があった項目だけ options に含める（"" は「解除」扱い → null）
      const options: {
        courseId?: string | null;
        staffId?: string | null;
        roomId?: string | null;
        additionalCourseIds?: string[];
        additionalStaffIds?: string[];
        allowOverlap?: boolean;
      } = {};
      if (allowOverlap) options.allowOverlap = true;
      if (courseId !== initialCourseId) options.courseId = courseId === "" ? null : courseId;
      if (staffId !== initialStaffId) options.staffId = staffId === "" ? null : staffId;
      if (roomId !== initialRoomId) options.roomId = roomId === "" ? null : roomId;
      // 追加メニュー・追加担当は「置き換え」。空にした＝全部外す、も送れるようにする。
      // 未選択の行（""）は送らない。
      const addC = additionalCourses.filter(Boolean);
      const addS = additionalStaff.filter(Boolean);
      const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
      if (!sameList(addC, initialAdditionalCourses)) options.additionalCourseIds = addC;
      if (!sameList(addS, initialAdditionalStaff)) options.additionalStaffIds = addS;

      const result = await updateAppointmentDetails(
        appointment.id,
        format(date, "yyyy-MM-dd"),
        time,
        memo,
        visitType === "new",
        Number(duration),
        Object.keys(options).length > 0 ? options : undefined,
      );
      if (result.success) {
        toast.success("予約を更新しました");
        onOpenChange(false);
        onSuccess?.();
      } else if ("overlap" in result && result.overlap) {
        // 担当かぶりは直してもらわないと保存させない。ダイアログで残す。
        setPendingOverlapAction(("needsOwner" in result && result.needsOwner) ? "save" : null);
        setOverlapError(result.error || "同じ担当の重複予約はできません。");
      } else {
        toast.error(result.error || "エラーが発生しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 予約に「設定された追加メニュー」を追加（施術前 / 施術後 / 同時刻）。同一患者へ直接ひもづけ。
  const handleAddAddon = async (timing: "before" | "after" | "same") => {
    if (!appointment) return;
    const label = addonInfo?.name ?? "メニュー";
    setIsSubmitting(true);
    try {
      const res = await addAddonToAppointment(appointment.id, timing);
      if (res.success) {
        toast.success(
          timing === "same" ? `同時刻に${label}を追加しました`
            : timing === "before" ? `施術前に${label}を追加しました`
            : `施術後に${label}を追加しました`,
        );
        onSuccess?.();
        onOpenChange(false);
      } else {
        // NOTE: addAddonToAppointment は overlap / needsOwner を返さない（承認ルートが無い）。
        // 以前ここに overlap 分岐があったが、到達しないうえに pendingOverlapAction に
        // "adjacent" を入れており、将来 needsOwner を返すようにすると
        // 承認ボタンが handleAddAdjacent を呼んで無反応になる罠だった（2026-08-29 検品指摘）。
        // 承認ルートを付けるときは "addon" として別に配線すること。
        toast.error(res.error ?? "追加に失敗しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 削除ボタン押下: 常に選択ダイアログを開く。
  // 「キャンセル（記録を残す）」と「完全に削除」を選べるようにして、
  // あとから見たとき『キャンセルなのか入れ忘れなのか』が分かるようにする。
  const handleDeleteClick = async () => {
    if (!appointment) return;
    if (appointment.series_id) {
      // 同一シリーズ内のこの予約を含む将来の件数を数える（モーダルに件数表示・自院のみ）
      try {
        const supabase = createClient();
        if (!appointment.clinic_id) {
          setSeriesFutureCount(1);
        } else {
          const { count } = await supabase
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .eq("clinic_id", appointment.clinic_id)
            .eq("series_id", appointment.series_id)
            .neq("status", "cancelled")
            .gte("start_time", appointment.start_time);
          setSeriesFutureCount(count ?? 1);
        }
      } catch {
        setSeriesFutureCount(1);
      }
    } else {
      setSeriesFutureCount(0);
    }
    setDeleteChoiceOpen(true);
  };

  // 削除/キャンセル後の共通処理（キャンセル待ちがいればお知らせポップを出す）
  const afterRemoval = (cands: WaitlistCandidate[]) => {
    onSuccess?.();
    if (cands.length > 0) {
      // 空きが出た → キャンセル待ちの方へ知らせるポップアップを出す（本体はそのまま）
      setWaitlistCandidates(cands);
      setNotifiedIds([]);
      setWaitlistOpen(true);
    } else {
      onOpenChange(false);
    }
  };

  // キャンセル扱い（記録を残す）。カレンダーには薄く表示され、枠は空きに戻る。
  const runCancelKeepRecord = async () => {
    if (!appointment) return;
    setIsSubmitting(true);
    setDeleteChoiceOpen(false);
    try {
      const result = await cancelAppointmentKeepRecord(appointment.id);
      if (result.success) {
        toast.success("キャンセルにしました（カレンダーに薄く残ります）");
        afterRemoval(((result as any).waitlistCandidates ?? []) as WaitlistCandidate[]);
      } else {
        toast.error(result.error || "エラーが発生しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const runDelete = async (scope: "one" | "future") => {
    if (!appointment) return;
    setIsSubmitting(true);
    setDeleteChoiceOpen(false);
    try {
      const result = await deleteAppointment(appointment.id, scope);
      if (result.success) {
        const n = (result as any).deletedCount ?? 1;
        toast.success(scope === "future" && n > 1
          ? `連続予約 ${n} 件を削除しました`
          : "予約を削除しました");
        afterRemoval(((result as any).waitlistCandidates ?? []) as WaitlistCandidate[]);
      } else {
        toast.error(result.error || "エラーが発生しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeWaitlist = () => {
    setWaitlistOpen(false);
    onOpenChange(false);
  };

  const handleNotifyWaitlist = async (id: string) => {
    setNotifyingId(id);
    try {
      const r = await notifyWaitlistOpening(id);
      if (r.success) {
        toast.success("キャンセル待ちの方へ、LINEで空きをお知らせしました");
        setNotifiedIds((prev) => [...prev, id]);
      } else {
        toast.error(r.error || "送信に失敗しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setNotifyingId(null);
    }
  };

  const handleSendLine = async () => {
    if (!appointment) return;
    // 仮予約のまま「LINE通知」を押す＝この予約を受け付ける意味なので、
    // 先に予約確定してから送る。こうすると確認待ちリストから自動で消える。
    const wasPending = appointment.status === "pending";
    setIsSubmitting(true);
    try {
      if (wasPending) {
        const confirmed = await updateAppointmentStatus(appointment.id, "confirmed");
        if (!confirmed.success) {
          toast.error(confirmed.error || "予約確定に失敗しました");
          return;
        }
      }
      const result = await sendLineConfirmation(appointment.id);
      if (result.success) {
        toast.success(wasPending ? "予約を確定し、LINEを送信しました" : "LINEを送信しました");
      } else {
        // LINE未連携などで送れなくても、確定は済んでいるのでリストからは消す
        toast.error(result.error || "LINE送信に失敗しました");
      }
      if (wasPending) {
        // 確定済み＝処理済みなので一覧を更新して閉じる（確認待ちから外れる）
        onSuccess?.();
        onOpenChange(false);
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
        // ★ここで onSuccess() を呼ぶと親が selectedAppointment を null にして
        //   このダイアログごとアンマウントされ、直後の「LINEを送りますか？」ポップが
        //   表示される前に消えてしまう（＝一覧に戻ってしまう）バグだった。
        //   一覧の更新は、ポップを閉じたあと（送る／送らない）に行う。
        setLineConfirmOpen(true);
      } else {
        toast.error(result.error || "エラーが発生しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 確定ポップ内「送る」: LINE確定通知を送ってから閉じる
  const handleConfirmSendLine = async () => {
    if (!appointment) return;
    setLineSending(true);
    try {
      const result = await sendLineConfirmation(appointment.id);
      if (result.success) {
        toast.success("予約確定のLINEを送信しました");
      } else {
        toast.error(result.error || "LINE送信に失敗しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setLineSending(false);
      setLineConfirmOpen(false);
      // ポップを閉じてから一覧を更新（確定済みステータスを反映）
      onSuccess?.();
      onOpenChange(false);
    }
  };

  // 確定ポップ内「送らない」: 送信せず閉じる（一覧は確定済みに更新）
  const handleSkipLine = () => {
    setLineConfirmOpen(false);
    onSuccess?.();
    onOpenChange(false);
  };

  // 直前・直後に任意コースを追加予約
  const handleAddAdjacent = async (allowOverlap: boolean = false) => {
    if (!adjacentCourseId) { toast.error("コースを選んでください"); return; }
    if (!adjacentPanel) return;
    setIsSubmitting(true);
    try {
      const res = await addAdjacentAppointment(
        appointment.id,
        adjacentCourseId,
        adjacentStaffId || null,
        adjacentPanel,
        allowOverlap,
      );
      if (res.success) {
        const c = courses.find(c => c.id === adjacentCourseId);
        toast.success(`${adjacentPanel === "before" ? "直前" : "直後"}に${c?.name ?? "メニュー"}を追加しました`);
        setAdjacentPanel(null);
        setAdjacentCourseId("");
        setAdjacentStaffId("");
        onSuccess?.();
        onOpenChange(false);
      } else if ("overlap" in res && res.overlap) {
        // 「直前に追加」「直後に追加」は担当の初期値が元予約と同じ先生なので、
        // 1つ前・1つ後の患者さんの枠にそのまま重なりやすい。
        // ここに分岐が無く、院長が押しても消えるトーストで終わっていた
        // （＝画面は「担当者を変えてください」と言うのに、実際は院長なら通せる。2026-08-29 検品指摘）。
        setPendingOverlapAction(("needsOwner" in res && res.needsOwner) ? "adjacent" : null);
        setOverlapError(res.error ?? "同じ担当の重複予約はできません。");
      } else {
        toast.error(res.error ?? "追加に失敗しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 次回予約: この患者をプリフィルした新規予約フォームを開く（編集は閉じる）
  // 初期日時は「いま表示中の予約日時」を基準に1週間後の同じ曜日・同じ時刻にする。
  const handleNextAppointment = () => {
    const base = date ?? parseISO(appointment.start_time);
    setNextDefaultDate(addDays(base, 7));
    setNextDefaultTime(time || format(parseISO(appointment.start_time), "HH:mm"));
    onOpenChange(false);
    setNextOpen(true);
  };

  if (!appointment) return null;

  const selectClass =
    "flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg mx-auto max-h-[92dvh] overflow-y-auto p-0 gap-0 rounded-2xl">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b sticky top-0 bg-white z-10">
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle className="text-base font-bold">予約の編集</DialogTitle>
              <p className="text-sm text-slate-500 mt-0.5">
                {patientName}
                <span className="text-slate-400">様</span>
                {custMrn && (
                  <span className="ml-2 text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-full border border-slate-200 tabular-nums">
                    No.{custMrn}
                  </span>
                )}
                {appointment.is_first_visit && (
                  <span className="ml-2 text-[10px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
                    初診
                  </span>
                )}
              </p>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="w-3 h-3" />
                  前回来院:{" "}
                  <span className="font-semibold text-slate-700">
                    {lastVisitDate
                      ? format(lastVisitDate, "yyyy年M月d日（E）", { locale: ja })
                      : "初来院"}
                  </span>
                </span>
                {visitCount !== null && (
                  <span className="text-xs text-slate-400">
                    通算 <span className="font-bold text-slate-600">{visitCount}</span> 回目
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4 space-y-4">
            {/* 日付 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                予約日 <span className="text-red-500">*</span>
              </Label>
              <Popover>
                <PopoverTrigger className="flex items-center w-full h-11 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm hover:bg-accent transition-colors text-left">
                  <CalendarIcon className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
                  {date ? (
                    format(date, "yyyy年M月d日（E）", { locale: ja })
                  ) : (
                    <span className="text-muted-foreground">日付を選択</span>
                  )}
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-0 z-[200]"
                  align="start"
                  side="bottom"
                  sideOffset={4}
                >
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

            {/* 時間 + 所要時間 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  時間 <span className="text-red-500">*</span>
                </Label>
                <select
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={selectClass}
                >
                  {!date ? (
                    <option value="" disabled>先に日付を選択</option>
                  ) : getTimeSlots(date, { bypassRestrictions: true, slotMinutes }).length === 0 ? (
                    <option value="" disabled>休診日</option>
                  ) : (
                    <option value="" disabled>時間を選択</option>
                  )}
                  {date &&
                    getTimeSlots(date, { bypassRestrictions: true, slotMinutes }).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  所要時間
                </Label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className={selectClass}
                >
                  {durationOptions.map((m) => (
                    <option key={m} value={m}>{m}分</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 初診/再診 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                初診 / 再診
              </Label>
              <div className="flex gap-2">
                {["new", "return"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisitType(v)}
                    className={`flex-1 h-11 rounded-lg border text-sm font-semibold transition-all ${
                      visitType === v
                        ? v === "new"
                          ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                          : "bg-blue-600 border-blue-600 text-white shadow-sm"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {v === "new" ? "初診" : "再診"}
                  </button>
                ))}
              </div>
            </div>

            {/* コース・メニュー */}
            {courses.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  メニュー / コース
                </Label>
                <select value={courseId} onChange={(e) => handleCourseChange(e.target.value)} className={selectClass}>
                  <option value="">指定なし</option>
                  {courses
                    .filter(c => c.is_active || c.id === initialCourseId)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}（{c.duration_minutes}分{c.price != null ? ` / ¥${c.price.toLocaleString()}` : ""}）
                        {!c.is_active ? "（非公開）" : ""}
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-500">変更すると売上一括入力の元情報も更新されます。</p>

                {/* 追加メニュー（2部位目など・複数可）。削除して入れ直さなくてもここで足せる。 */}
                {additionalCourses.map((cid, idx) => (
                  <div key={`addc-${idx}`} className="flex gap-2 items-center mt-1.5">
                    <span className="text-[10px] text-slate-400 w-10 shrink-0">＋{idx + 2}個目</span>
                    <select
                      value={cid}
                      onChange={(e) => {
                        const next = [...additionalCourses];
                        next[idx] = e.target.value;
                        changeAdditionalCourses(next);
                      }}
                      className={`${selectClass} flex-1`}
                    >
                      <option value="">追加メニューを選択</option>
                      {courses
                        .filter(c => c.is_active || initialAdditionalCourses.includes(c.id))
                        .map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}（{c.duration_minutes}分{c.price != null ? ` / ¥${c.price.toLocaleString()}` : ""}）
                            {!c.is_active ? "（非公開）" : ""}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => changeAdditionalCourses(additionalCourses.filter((_, i) => i !== idx))}
                      className="px-2 py-1 text-rose-500 hover:bg-rose-50 rounded text-sm"
                      aria-label="追加メニューを削除"
                    >×</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setAdditionalCourses([...additionalCourses, ""])}
                  className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 mt-1"
                >
                  <Plus className="w-3 h-3" /> メニューを追加
                </button>
              </div>
            )}

            {/* 担当スタッフ */}
            {staffList.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  担当スタッフ
                </Label>
                <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={selectClass}>
                  <option value="">指定なし</option>
                  {/* 受付スタッフ(show_in_timeline=false)は除外。ただし既にこの予約の担当なら表示を維持 */}
                  {staffList
                    .filter(s => (s.is_active && s.show_in_timeline !== false) || s.id === initialStaffId)
                    .map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}{!s.is_active ? "（非公開）" : ""}
                      </option>
                    ))}
                </select>

                {/* 追加担当（ダブル施術など・複数可） */}
                {additionalStaff.map((sid, idx) => (
                  <div key={`adds-${idx}`} className="flex gap-2 items-center mt-1.5">
                    <span className="text-[10px] text-slate-400 w-10 shrink-0">＋{idx + 2}人目</span>
                    <select
                      value={sid}
                      onChange={(e) => {
                        const next = [...additionalStaff];
                        next[idx] = e.target.value;
                        setAdditionalStaff(next);
                      }}
                      className={`${selectClass} flex-1`}
                    >
                      <option value="">追加担当を選択</option>
                      {staffList
                        .filter(s => (s.is_active && s.show_in_timeline !== false) || initialAdditionalStaff.includes(s.id))
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name}{!s.is_active ? "（非公開）" : ""}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setAdditionalStaff(additionalStaff.filter((_, i) => i !== idx))}
                      className="px-2 py-1 text-rose-500 hover:bg-rose-50 rounded text-sm"
                      aria-label="追加担当を削除"
                    >×</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setAdditionalStaff([...additionalStaff, ""])}
                  className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 mt-1"
                >
                  <Plus className="w-3 h-3" /> 担当を追加
                </button>
                {additionalStaff.filter(Boolean).length > 0 && !staffId && (
                  <p className="text-[10px] text-amber-600 font-semibold">
                    追加担当を入れるときは、上のメインの担当スタッフも選んでください。
                  </p>
                )}
              </div>
            )}

            {/* 個室 */}
            {rooms.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  個室
                </Label>
                <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={selectClass}>
                  <option value="">指定なし</option>
                  {rooms
                    .filter(r => r.is_active || r.id === initialRoomId)
                    .map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name}{!r.is_active ? "（非公開）" : ""}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* メモ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                メモ（症状など）
              </Label>
              <Input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="例: 腰痛（電話予約）"
                className="h-11"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 pt-3 border-t space-y-2 sticky bottom-0 bg-white">
            {/* Primary action */}
            <Button
              type="submit"
              disabled={isSubmitting || !date || !time}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
            >
              {isSubmitting ? "保存中..." : "変更を保存"}
            </Button>

            {/* 次回予約（この患者の新規予約をプリフィルして開く） */}
            <Button
              type="button"
              variant="outline"
              onClick={handleNextAppointment}
              disabled={isSubmitting}
              className="w-full h-11 border-blue-300 text-blue-700 hover:bg-blue-50 rounded-xl font-bold"
            >
              <CalendarPlus className="w-4 h-4 mr-1.5" />
              次回予約を入れる
            </Button>

            {/* 直前・直後に任意コースを追加 */}
            {courses.length > 0 && (
              <div className="space-y-2">
                {/* トリガーボタン行 */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAdjacentPanel(adjacentPanel === "before" ? null : "before");
                      setAdjacentCourseId("");
                      setAdjacentStaffId("");
                    }}
                    className={`flex-1 h-9 rounded-xl border text-xs font-bold transition-all ${
                      adjacentPanel === "before"
                        ? "bg-violet-600 border-violet-600 text-white"
                        : "border-violet-300 text-violet-700 hover:bg-violet-50"
                    }`}
                  >
                    ← 直前に追加
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdjacentPanel(adjacentPanel === "after" ? null : "after");
                      setAdjacentCourseId("");
                      setAdjacentStaffId("");
                    }}
                    className={`flex-1 h-9 rounded-xl border text-xs font-bold transition-all ${
                      adjacentPanel === "after"
                        ? "bg-violet-600 border-violet-600 text-white"
                        : "border-violet-300 text-violet-700 hover:bg-violet-50"
                    }`}
                  >
                    直後に追加 →
                  </button>
                </div>

                {/* 展開パネル */}
                {adjacentPanel && (
                  <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-2">
                    <p className="text-[11px] font-bold text-violet-700">
                      {adjacentPanel === "before" ? "直前に追加するメニュー" : "直後に追加するメニュー"}
                    </p>
                    <select
                      value={adjacentCourseId}
                      onChange={(e) => {
                        setAdjacentCourseId(e.target.value);
                        // コースに required_staff_id があれば自動セット
                        const c = courses.find(c => c.id === e.target.value);
                        if ((c as any)?.required_staff_id) setAdjacentStaffId((c as any).required_staff_id);
                        else setAdjacentStaffId(staffId);
                      }}
                      className="w-full h-9 rounded-lg border border-violet-300 bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                    >
                      <option value="">コースを選択</option>
                      {courses.filter(c => c.is_active).map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}（{c.duration_minutes}分{c.price != null ? ` / ¥${c.price.toLocaleString()}` : ""}）
                        </option>
                      ))}
                    </select>
                    <select
                      value={adjacentStaffId}
                      onChange={(e) => setAdjacentStaffId(e.target.value)}
                      className="w-full h-9 rounded-lg border border-violet-300 bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                    >
                      <option value="">担当を選択（任意）</option>
                      {staffList.filter(s => s.is_active && s.show_in_timeline !== false).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleAddAdjacent(false)}
                      disabled={isSubmitting || !adjacentCourseId}
                      className="w-full h-9 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold transition"
                    >
                      {isSubmitting ? "追加中..." : `${adjacentPanel === "before" ? "直前" : "直後"}に追加する`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 施術前／施術後／同時刻に○○を追加（設定 addon_course_id がある院のみ・追加メニュー自体には出さない） */}
            {addonInfo && appointment.course_id !== addonInfo.courseId && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAddAddon("before")}
                  disabled={isSubmitting}
                  className="h-10 border-cyan-300 text-cyan-700 hover:bg-cyan-50 rounded-xl text-sm"
                >
                  ＋ 施術前に{addonInfo.name}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAddAddon("after")}
                  disabled={isSubmitting}
                  className="h-10 border-cyan-300 text-cyan-700 hover:bg-cyan-50 rounded-xl text-sm"
                >
                  ＋ 施術後に{addonInfo.name}
                </Button>
                {/* 「同時刻」は水素のように別の時間が要らないメニューだけ */}
                {addonInfo.allowConcurrent && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleAddAddon("same")}
                    disabled={isSubmitting}
                    className="col-span-2 h-10 border-cyan-300 text-cyan-700 hover:bg-cyan-50 rounded-xl text-sm"
                  >
                    ＋ 同時刻に{addonInfo.name}
                  </Button>
                )}
              </div>
            )}

            {/* Secondary actions */}
            <div className="flex gap-2">
              {appointment.status === "pending" && (
                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isSubmitting}
                  className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm"
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  予約確定
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={handleSendLine}
                disabled={isSubmitting}
                className="flex-1 h-10 border-green-400 text-green-700 hover:bg-green-50 rounded-xl text-sm"
              >
                <MessageCircle className="w-4 h-4 mr-1" />
                LINE通知
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteClick}
                disabled={isSubmitting}
                className="flex-1 h-10 rounded-xl text-sm"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                削除
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>

      {/* 次回予約フォーム（この患者をプリフィル） */}
      <AddAppointmentDialog
        open={nextOpen}
        onOpenChange={setNextOpen}
        hideTrigger
        defaultDate={nextDefaultDate}
        defaultTime={nextDefaultTime}
        defaultCustomerId={appointment.customer_id ?? undefined}
        defaultName={patientName}
        defaultPhone={custPhone}
        defaultMedicalRecordNumber={custMrn || undefined}
        defaultCourseId={appointment.course_id ?? undefined}
        defaultStaffId={appointment.staff_id ?? undefined}
        defaultVisitType="return"
        onSuccess={onSuccess}
      />

      {/* 担当かぶりで保存できなかったときのお知らせ（直すまで保存させない） */}
      <Dialog open={!!overlapError} onOpenChange={(o) => { if (!o) setOverlapError(null); }}>
        <DialogContent
          className={`max-w-sm border-2 ${
            isOwner && pendingOverlapAction ? "border-amber-300" : "border-rose-300"
          }`}
        >
          <DialogHeader>
            {/* 院長先生が通せる場面で「保存できません」と言い切ると、下の承認ボタンと
                真逆のことを言うことになる。見出しだけ読んで諦める形になるので出し分ける
                （2026-08-29。新規追加ダイアログと同じ形にそろえた） */}
            <DialogTitle
              className={`flex items-center gap-2 ${
                isOwner && pendingOverlapAction ? "text-amber-700" : "text-rose-700"
              }`}
            >
              <span aria-hidden>⚠</span>
              {isOwner && pendingOverlapAction
                ? "この時間には、すでに予約が入っています"
                : "この予約は保存できません"}
            </DialogTitle>
            <DialogDescription className="whitespace-pre-line text-slate-700 leading-relaxed">
              {overlapError}
            </DialogDescription>
          </DialogHeader>
          {isOwner && pendingOverlapAction ? (
            <div className="rounded-xl bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-900 leading-relaxed">
              <span className="font-bold">重ねて診る予定なら</span>、下の
              <span className="font-bold">「重なりを承知で進める（院長）」</span>
              でそのまま保存できます。予約のメモに院長承認の印が残ります。<br />
              重ねない予定なら、<span className="font-bold">担当の先生を変える</span>か、
              <span className="font-bold">時間をずらして</span>ください。
            </div>
          ) : (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800 leading-relaxed">
              同じ先生の同じ時間に2件の予約は入れられません。<br />
              <span className="font-bold">担当の先生を変える</span>か、
              <span className="font-bold">時間をずらす</span>と保存できます。
              {!isOwner && (
                <>
                  <br />
                  どうしても重ねる必要があるときは、<span className="font-bold">院長先生の許可</span>が必要です。
                  先生にご確認ください。
                </>
              )}
            </div>
          )}
          {/* 「だめ」で終わらせず、その場で取れる候補を出す（2026-08-22 ぼーるくん） */}
          <OverlapFixList
            staffId={staffId || null}
            dateStr={date ? format(date, "yyyy-MM-dd") : ""}
            time={time}
            durationMinutes={Number(duration) || slotMinutes}
            excludeAppointmentId={appointment?.id ?? null}
            courseId={courseId || null}
            onPickTime={(hm) => { setTime(hm); setOverlapError(null); setPendingOverlapAction(null); }}
            onPickStaff={(id) => { setStaffId(id); setOverlapError(null); setPendingOverlapAction(null); }}
            viewerIsOwner={isOwner}
          />
          <DialogFooter className="mt-2 flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              onClick={() => { setOverlapError(null); setPendingOverlapAction(null); }}
              className="w-full h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              戻って直す
            </Button>
            {/* 院長先生だけは、事情が分かっているので承知のうえで通せる */}
            {isOwner && pendingOverlapAction && (
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={async () => {
                  const action = pendingOverlapAction;
                  setOverlapError(null);
                  setPendingOverlapAction(null);
                  if (action === "save") await saveAppointment(true);
                  else if (action === "adjacent") await handleAddAdjacent(true);
                }}
                className="w-full h-10 rounded-xl border-amber-300 text-amber-800 hover:bg-amber-50 text-sm font-bold"
              >
                重なりを承知で進める（院長）
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 予約確定後のLINE送信確認ポップ */}
      <Dialog open={lineConfirmOpen} onOpenChange={(o) => { if (!o) handleSkipLine(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" />
              予約確定のLINEを送りますか？
            </DialogTitle>
            <DialogDescription>
              {patientName}
              <span className="text-slate-400">様</span>
              に、予約が確定したことをLINEでお知らせできます。
              <br />
              <span className="text-xs text-slate-400">
                ※LINE未連携の方には送信できません（その場合はメッセージが表示されます）。
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleSkipLine}
              disabled={lineSending}
              className="flex-1"
            >
              送らない
            </Button>
            <Button
              type="button"
              onClick={handleConfirmSendLine}
              disabled={lineSending}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              <MessageCircle className="w-4 h-4 mr-1" />
              {lineSending ? "送信中..." : "LINEを送る"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* キャンセル／削除の選択ダイアログ */}
      <Dialog open={deleteChoiceOpen} onOpenChange={setDeleteChoiceOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarRange className="w-5 h-5 text-amber-500" />
              キャンセル・削除
            </DialogTitle>
            <DialogDescription>
              {appointment.series_id
                ? "この予約は連続予約（毎週繰り返し）として登録されています。どうしますか？"
                : "この予約をどうしますか？"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <button
              type="button"
              onClick={runCancelKeepRecord}
              disabled={isSubmitting}
              className="w-full text-left rounded-xl border-2 border-blue-300 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 px-4 py-3 transition-all disabled:opacity-50"
            >
              <p className="font-bold text-sm text-blue-700 dark:text-blue-300">
                キャンセルにする（おすすめ）
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {date ? format(date, "M月d日（E）", { locale: ja }) : ""} {time} をキャンセル。
                カレンダーに薄く「キャンセル」と残るので、あとから見ても分かります。枠は空きに戻ります。
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirm("この予約を完全に削除しますか？（記録は残りません）")) return;
                runDelete("one");
              }}
              disabled={isSubmitting}
              className="w-full text-left rounded-xl border-2 border-slate-200 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 px-4 py-3 transition-all disabled:opacity-50"
            >
              <p className="font-bold text-sm text-slate-700 dark:text-slate-200">完全に削除（記録も消す）</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                間違えて入れた予約を消すとき用。カレンダーには何も残りません。
              </p>
            </button>

            {/* まとめ削除は一番下・区切りの下に置く。すぐ上のキャンセルを押すつもりで
                触れてしまうと、以降の通院予約が全部消えるため */}
            {appointment.series_id && (
              <>
                <div className="border-t border-slate-200 dark:border-slate-700 pt-2 mt-1" />
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(
                      `この日以降の連続予約 ${seriesFutureCount} 件をまとめて削除します。\n`
                      + `元に戻せません。本当によろしいですか？`,
                    )) return;
                    runDelete("future");
                  }}
                  disabled={isSubmitting}
                  className="w-full text-left rounded-xl border-2 border-rose-200 hover:border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-4 py-3 transition-all disabled:opacity-50"
                >
                  <p className="font-bold text-sm text-rose-700 dark:text-rose-300">
                    この日以降の連続予約をすべて削除（{seriesFutureCount}件）
                  </p>
                  <p className="text-xs text-rose-500 dark:text-rose-400 mt-0.5">
                    毎週の通院が終わりになったときなど。「この日およびそれ以降」の予約をまとめて削除します。元に戻せません。
                  </p>
                </button>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteChoiceOpen(false)}
              disabled={isSubmitting}
            >
              キャンセル
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* キャンセル待ち：空きが出た方へのお知らせ */}
      <Dialog open={waitlistOpen} onOpenChange={(o) => { if (!o) closeWaitlist(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-500" />
              この方に予約できるようになりました
            </DialogTitle>
            <DialogDescription>
              キャンセルで枠が空きました。キャンセル待ちの方へ、LINEで空きをお知らせしましょう（先着順でのご案内です）。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-72 overflow-y-auto">
            {waitlistCandidates.map((c) => {
              const notified = notifiedIds.includes(c.appointmentId);
              return (
                <div
                  key={c.appointmentId}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                      {c.customerName}
                      {c.isFirstVisit && <span className="ml-1.5 text-[10px] text-amber-600">初診</span>}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      希望 {format(parseISO(c.startTime), "M/d HH:mm", { locale: ja })}
                      {!c.hasLine && "・LINE未登録"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!c.hasLine || notifyingId === c.appointmentId || notified}
                    onClick={() => handleNotifyWaitlist(c.appointmentId)}
                    className="bg-green-600 hover:bg-green-700 text-white shrink-0 disabled:opacity-50"
                  >
                    <MessageCircle className="w-4 h-4 mr-1" />
                    {notified ? "送信済み" : notifyingId === c.appointmentId ? "送信中..." : "LINEで知らせる"}
                  </Button>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeWaitlist}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
