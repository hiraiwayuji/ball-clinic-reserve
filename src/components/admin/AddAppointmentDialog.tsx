"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { format, addDays } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarIcon, Plus, X, User, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createManualReservation, getAddonCourseInfo, checkAddAppointmentOverlap, type AddOverlapResult } from "@/app/actions/adminReserve";
import { getAdminDaySlots, type AdminDaySlot } from "@/app/actions/adminDaySlots";
import { getMyRole } from "@/app/actions/auth";
import { findSameDayAppointmentsByName } from "@/app/actions/duplicateCheck";
import { searchPatientsForBooking, PatientSuggestion } from "@/app/actions/patientSearch";
import { getCourses, getStaffList, getRooms, type ReservationCourse, type ReservationStaff, type ReservationRoom } from "@/app/actions/courses";
import { toast } from "sonner";
import { useClinicSlotDuration } from "@/lib/use-clinic-slot-duration";
import type { SlotMinutes } from "@/lib/time-slots";
import { OverlapFixList } from "@/components/admin/OverlapFixList";

/** 院の枠として扱える値（10/15/20/30）か。それ以外が来たらフックの値に任せる */
const isSlotMinutes = (v: number | undefined): v is SlotMinutes =>
  v === 10 || v === 15 || v === 20 || v === 30;

export function AddAppointmentDialog({
  onSuccess,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
  defaultDate,
  defaultTime,
  defaultStaffId,
  defaultCourseId,
  defaultName,
  defaultPhone,
  defaultMedicalRecordNumber,
  defaultVisitType,
  defaultCustomerId,
  hideTrigger = false,
  slotMinutes: slotMinutesProp,
}: {
  onSuccess?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultDate?: Date;
  defaultTime?: string;
  defaultStaffId?: string;
  defaultCourseId?: string;
  defaultName?: string;
  defaultPhone?: string;
  defaultMedicalRecordNumber?: string;
  defaultVisitType?: string;
  /** この患者の予約と確定している場合の customer_id。氏名・電話を変更せず登録すれば、電話/氏名照合をバイパスして確実に同一患者へひもづく。 */
  defaultCustomerId?: string;
  hideTrigger?: boolean;
  /**
   * 院の予約枠（分）。タイムテーブルのようにすでに取得済みの画面から渡すと、
   * フックの初回値（30）で一瞬「30分」と出てから切り替わる、を防げる。
   * 渡されればフックより優先する。
   */
  slotMinutes?: number;
}) {
  const hookSlotMinutes = useClinicSlotDuration();
  const slotMinutes: SlotMinutes = isSlotMinutes(slotMinutesProp) ? slotMinutesProp : hookSlotMinutes;
  // 所要時間をユーザーが手で触ったか。触るまでは院の枠（slotMinutes）の変化に追従させる。
  const [durationTouched, setDurationTouched] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (externalOnOpenChange) externalOnOpenChange(val);
    else setInternalOpen(val);
  };

  const [date, setDate] = useState<Date | undefined>(defaultDate);
  const [time, setTime] = useState<string>(defaultTime || "");
  const [visitType, setVisitType] = useState<string>("new");
  const [duration, setDuration] = useState<string>(String(slotMinutes));
  // まとめ予約：1件目（上の予約日/時間）に加えて、押さえる追加の日時。
  // 事故の患者さんなど来院日がバラバラなケースを、1回の登録でまとめて取れるようにする。
  // staffId / courseId が "" の行は1件目と同じ（日によって担当やメニューが違うときだけ選び直す）。
  const [extraSlots, setExtraSlots] = useState<
    { key: string; date: Date | undefined; time: string; staffId: string; courseId: string }[]
  >([]);
  // 「日付×担当」ごとの時間枠（そのレーンの埋まり具合つき）。key = "yyyy-MM-dd|staffId"
  const [daySlots, setDaySlots] = useState<Record<string, AdminDaySlot[]>>({});
  const [slotsLoading, setSlotsLoading] = useState(false);
  const slotKeySeq = useRef(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 同じ日に同名患者の予約がある場合の確認（それでも登録するか）
  const [dupWarning, setDupWarning] = useState<{
    appointments: { id: string; date: string; time: string; medicalRecordNumber: string | null }[];
    customerCount: number;
    formData: FormData;
  } | null>(null);
  // ログイン中の権限。担当かぶりを承知で通せるのはオーナー（院長先生）だけ
  // （2026-08-22 ぼーるくん「スタッフレベルではわからないこともあるので」）。
  const [userRole, setUserRole] = useState<string | null>(null);
  useEffect(() => { getMyRole().then((r) => setUserRole(r)).catch(() => {}); }, []);
  const isOwner = userRole === "owner";
  // 担当かぶり時の確認。reassign=さみ整体へ振替を提案 / warn=かぶっているので登録させない案内。
  // warn は「閉じる」しか出さない＝直さないと登録できない（2026-08-22 ぼーるくん依頼）。
  const [overlapPrompt, setOverlapPrompt] = useState<
    | {
        mode: "reassign";
        staffName: string;
        sami: { staffId: string; staffName: string; courseId: string; courseName: string; durationMinutes: number };
        formData: FormData;
      }
    | {
        mode: "warn";
        staffName: string;
        message?: string;
        formData: FormData;
        /** true = 院長先生がこの場で「重なりを承知で登録する」を押して通せる */
        ownerOverridable?: boolean;
      }
    | null
  >(null);

  // slot サイズ刻みで 120分まで（slot=20 → 20/40/60/80/100/120）
  // コース duration が slot 倍数でないケースも拾えるよう、現在値を含めてマージする
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

  // コース・スタッフ・個室マスタ（ダイアログを開いたとき1回だけ取得）
  const [courses, setCourses] = useState<ReservationCourse[]>([]);
  const [staffList, setStaffList] = useState<ReservationStaff[]>([]);
  const [rooms, setRooms] = useState<ReservationRoom[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");
  const [roomId, setRoomId] = useState<string>("");
  // 追加メニュー（メニュー＋担当のセットで積む）。
  // ・担当が空 → 同じ予約に合算（保険施術20分＋鍼灸20分＝40分の1枠）
  // ・担当を選んだ → その担当の枠として「施術の直後に連続」する別レコードにする。
  //   同じ時刻に2人をぶら下げると AI秘書の「複数担当が同時刻」アラートになるため、時間で分ける。
  const [additionalItems, setAdditionalItems] = useState<{ courseId: string; staffId: string }[]>([]);
  // ダブル施術：さみ整体↔ボール担当を同時に組む（相方を additional に自動セット）
  const [doubleOn, setDoubleOn] = useState(false);
  // 施術前/後に○○を追加：設定された追加メニュー（before=施術前 / after=施術後 / same=同時刻）
  const [addAddon, setAddAddon] = useState(false);
  const [addonTiming, setAddonTiming] = useState<"before" | "after" | "same">("after");
  const [addonInfo, setAddonInfo] = useState<{ courseId: string; name: string; allowConcurrent: boolean } | null>(null);

  // 患者サジェスト
  const [nameValue, setNameValue] = useState("");
  const [phoneValue, setPhoneValue] = useState("");
  const [medicalRecordNumberValue, setMedicalRecordNumberValue] = useState("");
  const [suggestions, setSuggestions] = useState<PatientSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientSuggestion | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      if (defaultDate) setDate(defaultDate);
      if (defaultTime) setTime(defaultTime);
      if (defaultStaffId) setStaffId(defaultStaffId);
      if (defaultCourseId) {
        // 所要時間はメニュー合計から自動で入る（下の useEffect）
        setCourseId(defaultCourseId);
      } else {
        setDuration(String(slotMinutes));
      }
      if (defaultName) setNameValue(defaultName);
      if (defaultPhone) setPhoneValue(defaultPhone);
      if (defaultMedicalRecordNumber) setMedicalRecordNumberValue(defaultMedicalRecordNumber);
      if (defaultVisitType) setVisitType(defaultVisitType);
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
      if (!addonInfo) {
        getAddonCourseInfo().then(setAddonInfo).catch(() => {});
      }
    } else {
      // ダイアログを閉じたらリセット
      setNameValue("");
      setPhoneValue("");
      setMedicalRecordNumberValue("");
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedPatient(null);
      setVisitType("new");
      setExtraSlots([]);
      setDaySlots({});
      setDuration(String(slotMinutes));
      setDurationTouched(false);
      setCourseId("");
      setStaffId("");
      setRoomId("");
      setAdditionalItems([]);
      setDoubleOn(false);
      setAddAddon(false);
      setAddonTiming("after");
      setOverlapPrompt(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDate, defaultTime, defaultStaffId, defaultCourseId, defaultName, defaultPhone, defaultMedicalRecordNumber, defaultVisitType]);

  // staffList ロード完了後に defaultStaffId を再適用
  // （初回 setStaffId 時点で staffList が空だと <select> に対応 option がなく表示されないため）
  useEffect(() => {
    if (open && defaultStaffId && staffList.some((s) => s.id === defaultStaffId)) {
      setStaffId(defaultStaffId);
    }
  }, [open, defaultStaffId, staffList]);

  // courses ロード完了後に defaultCourseId を再適用（同じ理由）
  useEffect(() => {
    if (open && defaultCourseId) {
      const c = courses.find((c) => c.id === defaultCourseId);
      if (c) setCourseId(defaultCourseId);
    }
  }, [open, defaultCourseId, courses]);

  // 患者が確定したら「前回同様の施術内容」を先に入れておく。
  // ・受付→売上の元データ（過去予約の course/staff）を patientSearch が返す。
  // ・まだ手入力していない欄だけ埋める（手で選んだ内容は上書きしない）。
  // ・コース/担当マスタの読み込みが後追いでも反映されるよう、masters を依存に入れる。
  useEffect(() => {
    if (!open || !selectedPatient) return;
    const p = selectedPatient;
    if (p.lastCourseId && !courseId) {
      // マスタ未ロード時は c が見つからない → courses ロード後に再実行される。
      // 廃止済み（is_active=false）コースはプルダウンに無いのでセットしない。
      const c = courses.find((c) => c.id === p.lastCourseId);
      if (c && c.is_active) setCourseId(p.lastCourseId);
    }
    if (p.lastStaffId && !staffId) {
      setStaffId(p.lastStaffId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedPatient, courses, staffList]);

  const handleCourseChange = (id: string) => setCourseId(id);

  // 担当を指定した追加メニュー＝別レコードにするので、この枠の所要時間には含めない。
  const chainedItems = additionalItems.filter((it) => it.courseId && it.staffId);
  const mergedCourseIds = additionalItems.filter((it) => it.courseId && !it.staffId).map((it) => it.courseId);

  // 選んでいるメニューの合計所要時間（メイン＋担当なしの追加メニュー）。
  // 追加メニューは同じ予約に連続で入るので、その分だけ枠を長く取る必要がある
  // （保険施術20分＋鍼灸1部位20分 → 40分）。1つも選んでいないときは null。
  const selectedCoursesDuration = (() => {
    const ids = [courseId, ...mergedCourseIds].filter(Boolean);
    if (ids.length === 0) return null;
    const total = ids.reduce(
      (sum, id) => sum + (courses.find((c) => c.id === id)?.duration_minutes ?? 0),
      0,
    );
    return total > 0 ? total : null;
  })();

  // メニューが変わったら所要時間を自動で入れ直す。
  // 手で選び直した所要時間は、次にメニューを変えるまでそのまま残る。
  useEffect(() => {
    if (selectedCoursesDuration == null) return;
    setDuration(String(selectedCoursesDuration));
  }, [selectedCoursesDuration]);

  // メニュー未選択で、所要時間をまだ手で触っていない間は、院の枠に追従させる。
  // フックの初回値は 30 なので、これが無いと 20分枠の院で「30分」のまま登録される。
  useEffect(() => {
    if (durationTouched || selectedCoursesDuration != null) return;
    setDuration(String(slotMinutes));
  }, [slotMinutes, durationTouched, selectedCoursesDuration]);

  // ── まとめ予約（1回で複数日を押さえる） ──
  // 1件目は上の「予約日」「時間」「担当スタッフ」。2件目以降が extraSlots。
  // 行の担当が未指定（""）なら1件目と同じ担当を使う。
  const pickedSlots = [
    { date, time, staffId },
    ...extraSlots.map((s) => ({ date: s.date, time: s.time, staffId: s.staffId || staffId })),
  ];
  // 同じ日時を2回選んでもサーバー側で1件に畳まれるので、件数も畳んで数える
  const pickedCount = new Set(
    pickedSlots
      .filter((s) => s.date && s.time)
      .map((s) => `${format(s.date as Date, "yyyy-MM-dd")}T${s.time}`),
  ).size;

  const nextSlotKey = () => {
    slotKeySeq.current += 1;
    return `slot-${slotKeySeq.current}`;
  };

  // 追加行の初期値は「直前の日時の1週間後・同じ時刻」。毎週通う人はそのまま押していける。
  const addExtraSlot = () => {
    const last = extraSlots.length > 0
      ? extraSlots[extraSlots.length - 1]
      : { date, time, staffId: "", courseId: "" };
    const from = last.date ?? date;
    setExtraSlots((v) => [
      ...v,
      {
        key: nextSlotKey(),
        date: from ? addDays(from, 7) : undefined,
        time: last.time || time,
        staffId: last.staffId,
        courseId: last.courseId,
      },
    ]);
  };

  // 「毎週◯週分」をまとめてリストに足すショートカット
  const addWeeklyBatch = (weeks: number) => {
    if (!date || !time) {
      toast.error("先に1件目の日付と時間を選んでください");
      return;
    }
    const last = extraSlots.length > 0
      ? extraSlots[extraSlots.length - 1]
      : { date, time, staffId: "", courseId: "" };
    const from = last.date ?? date;
    const t = last.time || time;
    const sid = last.staffId;
    const cid = last.courseId;
    setExtraSlots((v) => [
      ...v,
      ...Array.from({ length: weeks }, (_, i) => ({
        key: nextSlotKey(),
        date: addDays(from, (i + 1) * 7),
        time: t,
        staffId: sid,
        courseId: cid,
      })),
    ]);
  };

  const updateExtraSlot = (
    key: string,
    patch: Partial<{ date: Date | undefined; time: string; staffId: string; courseId: string }>,
  ) => setExtraSlots((v) => v.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const removeExtraSlot = (key: string) =>
    setExtraSlots((v) => v.filter((s) => s.key !== key));

  // 空き枠は「日付×担当」ごとに変わる（行ごとに担当を変えられるため）
  const slotKeyOf = (d: Date, sid: string) => `${format(d, "yyyy-MM-dd")}|${sid}`;

  // 選ばれている「日付×担当」ぶんの時間枠を取りにいく。
  // メニュー・所要時間が変わると埋まり具合も変わるので、依存に入れて取り直す。
  const slotFetchKey = Array.from(
    new Set(pickedSlots.filter((s) => s.date).map((s) => slotKeyOf(s.date as Date, s.staffId))),
  ).join(",");

  useEffect(() => {
    if (!open) return;
    const keys = slotFetchKey.split(",").filter(Boolean);
    if (keys.length === 0) {
      setDaySlots({});
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    (async () => {
      const entries = await Promise.all(
        keys.map(async (k) => {
          const [d, sid] = k.split("|");
          try {
            const slots = await getAdminDaySlots({
              date: d,
              staffId: sid || null,
              courseId: courseId || null,
              durationMinutes: Number(duration) || slotMinutes,
              slotMinutes,
            });
            return [k, slots] as const;
          } catch {
            // 取得できなくても登録は止めない（空きは不明として全枠出す）
            return [k, [] as AdminDaySlot[]] as const;
          }
        }),
      );
      if (cancelled) return;
      setDaySlots(Object.fromEntries(entries));
      setSlotsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, slotFetchKey, courseId, duration, slotMinutes]);

  const slotInfoOf = (d: Date | undefined, t: string, sid: string): AdminDaySlot | null => {
    if (!d || !t) return null;
    return daySlots[slotKeyOf(d, sid)]?.find((s) => s.time === t) ?? null;
  };

  const isSlotBlocked = (d: Date | undefined, t: string, sid: string) =>
    !!slotInfoOf(d, t, sid)?.blocked;

  /**
   * 「院長先生でも選べない」枠か。
   *
   * 2026-08-22 に埋まっている枠を院を問わず選べなくしたが、そのとき
   * プルダウンの option を院長先生ぶんまで disabled にしてしまい、
   * 同じ 8/22 に作った「重なりを承知で登録する（院長）」の承認ルートが
   * 画面から一切たどり着けなくなっていた（2026-08-29 藤川先生より報告）。
   *
   * DB の除外制約が効く担当（prevent_overlap=true・ボール系）は院長先生でも
   * 登録できないので今までどおり選ばせない。アプリのガードだけで止めている担当
   * （からだ・マッスル等、同時に複数人を診る運用）は院長先生だけ選べるようにする。
   */
  const isSlotHardBlocked = (d: Date | undefined, t: string, sid: string) => {
    const info = slotInfoOf(d, t, sid);
    if (!info?.blocked) return false;
    return !isOwner || info.dbEnforced === true;
  };

  // 選んだ日時が既存予約とぶつかっているものだけを拾う（休憩・休診日はここでは出さない）。
  // 重ねて取れる院（prevent_overlap=false）でも、気づかず重ねてしまわないよう必ず知らせる。
  const overlapAlerts = pickedSlots
    .map((p) => ({ p, slot: slotInfoOf(p.date, p.time, p.staffId) }))
    .filter((x) => !!x.slot?.note?.includes("予約あり"))
    .map((x) => ({
      key: `${x.p.date ? format(x.p.date as Date, "M/d") : ""} ${x.p.time}`,
      note: x.slot!.note as string,
      blocked: x.slot!.blocked,
      fitMinutes: x.slot!.fitMinutes ?? null,
      dbEnforced: x.slot!.dbEnforced === true,
    }));

  // 院長先生なら、そのまま重ねて登録できる状態か。
  // DB の除外制約が効く担当（ボール系）が1つでも混ざっていたら登録自体が通らないので、
  // そのときは「できます」と書かない（できないことを できるように書かない）。
  const ownerCanPassOverlap =
    isOwner && overlapAlerts.length > 0 && overlapAlerts.every((a) => !a.dbEnforced);

  // 時間プルダウンの中身。その行の担当がすでに埋まっている枠は選ばせない。
  // 休憩・休診日は「（休憩）」等と添えるだけで選べる（院内は例外的にねじ込む運用があるため）。
  const renderTimeOptions = (d: Date | undefined, sid: string) => {
    if (!d) return <option value="" disabled>先に日付を選択</option>;
    const slots = daySlots[slotKeyOf(d, sid)];
    if (!slots || slots.length === 0) {
      return <option value="" disabled>{slotsLoading ? "空きを確認中..." : "時間を選択"}</option>;
    }
    // カレンダーでタップした時刻が営業時間外などで一覧に無いときも、その時刻を必ず出す。
    // （選択肢に無いと別の時刻が選ばれているように見え、押した枠と違う時間で登録される事故になる）
    const extra = time && !slots.some((s) => s.time === time) ? [{ time, blocked: false, note: "時間外" } as AdminDaySlot] : [];
    return (
      <>
        <option value="" disabled>時間を選択</option>
        {[...extra, ...slots].map((s) => (
          <option key={s.time} value={s.time} disabled={s.blocked && (!isOwner || s.dbEnforced === true)}>
            {/* 院長先生が承知のうえで選べる枠に「×」を出すと、選べるのに選べないように見える。
                選べるものは「▲…重ねて登録できます」と書き分ける（2026-08-29） */}
            {s.blocked
              ? s.blocked && isOwner && s.dbEnforced !== true
                ? `▲ ${s.time}（${s.note ?? "予約あり"}・重ねて登録できます）`
                : `× ${s.time}（${s.note ?? "予約あり"}）`
              : s.note
                ? `${s.time}（${s.note}）`
                : s.time}
          </option>
        ))}
      </>
    );
  };

  // 施術担当に出すスタッフ（受付助手＝show_in_timeline=false は除く）
  const treatmentStaff = staffList.filter((s) => s.is_active && s.show_in_timeline !== false);
  const commonStaffName = staffList.find((s) => s.id === staffId)?.name ?? null;
  // まとめ予約の2件目以降で「1件目と同じ」と出すためのメニュー名
  const commonCourseName = courses.find((c) => c.id === courseId)?.name ?? null;

  // ── ダブル施術（さみ整体 ↔ ボール担当を同時に） ──
  const samiStaff = staffList.find((s) => s.name === "さみ");
  const ballStaff = staffList.find((s) => s.name === "ボール");
  const samiCourse = courses.find((c) => c.name === "さみ整体");
  const selectedCourseObj = courses.find((c) => c.id === courseId);
  // 主役レーンの担当 = 選択コースの担当 or 選んだ担当スタッフ
  const primaryStaffId = selectedCourseObj?.required_staff_id || staffId || "";
  const isSamiPrimary = !!(samiStaff && primaryStaffId === samiStaff.id);
  const isBallPrimary = !!(ballStaff && primaryStaffId === ballStaff.id);
  const canDouble = !!(samiStaff && ballStaff && (isSamiPrimary || isBallPrimary));

  // ダブル施術は「相方の施術を主施術の直後に連続」で入れる（同時刻に相乗りさせない）。
  // 相方の担当・コースは submit 時に算出してサーバへ渡す。
  const toggleDouble = () => setDoubleOn((v) => !v);

  // 名前入力でデバウンス検索
  const handleNameChange = useCallback((value: string) => {
    setNameValue(value);
    setSelectedPatient(null);
    setSuggestions([]);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (value.trim().length < 1) {
      setShowSuggestions(false);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchPatientsForBooking(value);
        setSuggestions(results);

        // 入力名と完全一致する候補が1件だけ → 自動で電話番号を反映
        // （サジェストをクリックする運用を覚えなくてもカルテ番号を見ずに済むように）
        // 半角/全角スペースの揺れを吸収するため、空白を全部除いて比較する
        const normalize = (s: string) => s.replace(/[\s　]+/g, "");
        const trimmed = value.trim();
        const trimmedKey = normalize(trimmed);
        const exact = results.filter((r) => normalize(r.name) === trimmedKey);
        if (exact.length === 1) {
          const p = exact[0];
          setSelectedPatient(p);
          setPhoneValue(p.phone);
          // カルテ番号は DB 登録ありの時だけ反映（手入力中の番号を消さない）
          if (p.medicalRecordNumber) {
            setMedicalRecordNumberValue(p.medicalRecordNumber);
          }
          if (p.totalVisits > 0) setVisitType("return");
          setShowSuggestions(false);
        } else {
          setShowSuggestions(results.length > 0);
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  // 患者を選択
  const handleSelectPatient = (patient: PatientSuggestion) => {
    setSelectedPatient(patient);
    setNameValue(patient.name);
    setPhoneValue(patient.phone);
    setMedicalRecordNumberValue(patient.medicalRecordNumber ?? "");
    setShowSuggestions(false);
    // 来院履歴があれば再診に設定
    if (patient.totalVisits > 0) setVisitType("return");
  };

  // サジェスト外クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date || !time) {
      toast.error("日付と時間を選択してください");
      return;
    }
    // 追加した日時の入力もれ
    if (extraSlots.some((s) => !s.date || !s.time)) {
      toast.error("追加した日時に、日付か時間が入っていないものがあります");
      return;
    }
    // 担当が埋まっている枠が選ばれたまま残っていないか
    // （時間を選んだあとに担当やメニューを変えると、埋まりに変わることがある）
    // 院長先生がアプリのガードだけの枠を選んだときは、ここでは止めない。
    // このあとの runOverlapGate で「重なりを承知で登録する」の確認に進む。
    const blockedPicked = pickedSlots.filter((s) => isSlotHardBlocked(s.date, s.time, s.staffId));
    if (blockedPicked.length > 0) {
      // どの予約とぶつかっているか・何分なら入るかまで出す（ただ「埋まっています」だと直しようがない）
      const label = blockedPicked
        .map((s) => {
          const head = `${format(s.date as Date, "M/d")} ${s.time}`;
          const info = slotInfoOf(s.date, s.time, s.staffId);
          if (!info?.note) return `${head} は担当がすでに埋まっています`;
          return info.fitMinutes
            ? `${head} は ${info.note}（所要時間を${info.fitMinutes}分にすれば入ります）`
            : `${head} は ${info.note}`;
        })
        .join("／");
      toast.error(`${label}。時間か所要時間を選び直してください。`);
      return;
    }

    const formData = new FormData(e.currentTarget);
    formData.set("name", nameValue);
    formData.set("phone", phoneValue);
    formData.set("medicalRecordNumber", medicalRecordNumberValue.trim());

    // 既存患者が確定している場合は customer_id を直接渡し、電話/氏名照合をバイパスして確実にひもづける。
    // ・サジェストから選んだ患者 → その id を優先
    // ・氏名と電話をプリフィルのまま変更していない → defaultCustomerId（次回予約など）
    // ・氏名/電話を書き換えた → customer_id を送らず通常の照合（新規 or 別人）に委ねる
    const resolvedCustomerId =
      selectedPatient?.id ??
      (defaultCustomerId &&
      nameValue.trim() === (defaultName ?? "").trim() &&
      phoneValue.trim() === (defaultPhone ?? "").trim()
        ? defaultCustomerId
        : null);
    if (resolvedCustomerId) formData.set("customerId", resolvedCustomerId);
    // 担当なしの追加メニュー＝同じ予約にぶら下げる（所要時間も合算済み）
    formData.set("additionalCourseIds", JSON.stringify(mergedCourseIds));
    // 担当つきの追加メニュー＝施術の直後に続けて、その担当の別枠として作る
    formData.set("chainedMenus", JSON.stringify(chainedItems));
    // ダブル施術：相方の施術を「主施術の直後に連続」でサーバに作らせる（同時刻NG）
    if (doubleOn && canDouble) {
      if (isSamiPrimary && ballStaff) {
        // さみ整体 → ボール施術を直後に
        formData.set("doublePartnerStaffId", ballStaff.id);
      } else if (isBallPrimary && samiStaff) {
        // ボール施術 → さみ整体を直後に
        formData.set("doublePartnerStaffId", samiStaff.id);
        if (samiCourse) formData.set("doublePartnerCourseId", samiCourse.id);
      }
    }
    // 「施術後に○○を追加」（設定された追加メニューがあり、施術がそのメニュー自体でないとき）
    if (addAddon && addonInfo && courseId !== addonInfo.courseId) {
      formData.set("addAddon", "true");
      // 「同時刻」は allowConcurrent（水素など）のときだけ。それ以外は施術後に固定。
      // 「施術前」はどのメニューでも可（開始時刻の直前に収める）。
      const timing = addonTiming === "same" && !addonInfo.allowConcurrent ? "after" : addonTiming;
      formData.set("addonTiming", timing);
    }
    formData.append("date", format(date, "yyyy-MM-dd"));
    formData.append("time", time);
    formData.append("visitType", visitType);
    // まとめ予約：2件目以降の日時。サーバー側で1件目と束ねて登録する。
    // staffId / courseId が空の行は1件目と同じものになる（サーバー側で補完）。
    formData.set(
      "extraDateTimes",
      JSON.stringify(
        extraSlots
          .filter((s) => s.date && s.time)
          .map((s) => ({
            date: format(s.date as Date, "yyyy-MM-dd"),
            time: s.time,
            staffId: s.staffId || "",
            courseId: s.courseId || "",
          })),
      ),
    );
    formData.set("duration", duration);
    if (courseId) formData.append("courseId", courseId);
    if (staffId) formData.append("staffId", staffId);
    if (roomId) formData.append("roomId", roomId);

    // ── 同日重複チェック ──
    // 同じ日に同名の患者さんの予約があれば、誤登録防止のため確認をはさむ。
    // まとめ予約では選んだ日すべてを調べる（追加した日にだけ既存予約がある、を見逃さないため）。
    setIsSubmitting(true);
    try {
      const targetDates = Array.from(
        new Set(pickedSlots.filter((s) => s.date).map((s) => format(s.date as Date, "yyyy-MM-dd"))),
      );
      const results = await Promise.all(
        targetDates.map(async (d) => ({ date: d, res: await findSameDayAppointmentsByName(d, nameValue) })),
      );
      const hits = results.flatMap(({ date: d, res }) =>
        res.appointments.map((a) => ({
          id: a.id,
          date: d,
          time: a.time,
          medicalRecordNumber: a.medicalRecordNumber,
        })),
      );
      if (hits.length > 0) {
        setDupWarning({
          appointments: hits,
          customerCount: Math.max(0, ...results.map((r) => r.res.customerCount)),
          formData,
        });
        setIsSubmitting(false);
        return; // 確認待ち
      }
    } catch {
      // 重複チェックに失敗しても登録自体は止めない
    }

    await runOverlapGate(formData);
  };

  // 担当レーンの時間かぶりをサーバーで確認し、必要なら確認ダイアログを出す。
  // ・かぶりなし → そのまま登録。
  // ・ボールがかぶり＆さみ出勤日で空き → 「さみ整体へ振替」を提案。
  // ・それ以外のかぶり → 「重複予約はできません」の案内（同一レーンの重複は DB が弾く）。
  const runOverlapGate = async (formData: FormData) => {
    setIsSubmitting(true);
    setDupWarning(null);
    // 院長先生が「重なりを承知で登録する」を押したときだけ、かぶりの許可を添える。
    // ここで付けるのは、同日重複の確認ダイアログ（「それでも登録する」）を通ると
    // handleSubmit を経由せずこの関数に入るため。以前は handleSubmit 側で付けており、
    // 同日に同名の予約がある患者さんだと院長でも永久に登録できなかった（2026-08-29 検品指摘）。
    // スタッフの画面ではボタン自体が押せないので、ここは付かない。
    // 最終判断はサーバー側（role が owner か）で必ずもう一度見る。
    if (ownerCanPassOverlap) formData.set("allowOverlap", "true");
    let res: AddOverlapResult = { kind: "none" };
    try {
      res = await checkAddAppointmentOverlap({
        date: (formData.get("date") as string) || "",
        time: (formData.get("time") as string) || "",
        durationMinutes: Number(formData.get("duration")) || slotMinutes,
        staffId: (formData.get("staffId") as string) || null,
        courseId: (formData.get("courseId") as string) || null,
      });
    } catch {
      // 重複チェックに失敗しても登録自体は止めない
    }
    if (res.kind === "reassign_sami") {
      setOverlapPrompt({ mode: "reassign", staffName: res.staffName, sami: res.sami, formData });
      setIsSubmitting(false);
      return;
    }
    if (res.kind === "warn") {
      const canOwnerPass = isOwner && res.ownerOverridable;
      // 院長先生が「重なりを承知で登録する」を押した場合は通す。
      // 最終判断はサーバー側（role が owner か）で必ずもう一度見る。
      if (formData.get("allowOverlap") === "true") {
        await performSubmit(formData, "重なりを承知のうえで登録しました");
        return;
      }
      setOverlapPrompt({ mode: "warn", staffName: res.staffName, formData, ownerOverridable: canOwnerPass });
      setIsSubmitting(false);
      return;
    }
    await performSubmit(formData);
  };

  // 「さみ整体へ振り替える」を確定：担当・コース・所要時間をさみ整体に差し替えて登録。
  const confirmReassignToSami = async () => {
    if (!overlapPrompt || overlapPrompt.mode !== "reassign") return;
    const { sami, formData } = overlapPrompt;
    formData.set("staffId", sami.staffId);
    formData.set("courseId", sami.courseId);
    formData.set("duration", String(sami.durationMinutes));
    formData.set("reassignReport", `ボール重複のためさみ整体（${sami.staffName}）へ振替`);
    // 振替後は「ボールが主役」の前提が崩れるので、ダブル施術・追加メニューは解除する。
    formData.delete("doublePartnerStaffId");
    formData.delete("doublePartnerCourseId");
    formData.delete("chainedMenus");
    formData.delete("addAddon");
    formData.delete("addonTiming");
    await performSubmit(formData, `さみ整体（${sami.staffName}）に振り替えて登録しました`);
  };

  // 実際の予約登録処理（重複チェックを通過 or 確認後に呼ぶ）
  const performSubmit = async (formData: FormData, successMessage?: string) => {
    setIsSubmitting(true);
    try {
      const result = await createManualReservation(formData);
      if (result.success) {
        toast.success(
          successMessage ??
          (pickedCount > 1
            ? `${pickedCount}件の予約をまとめて追加しました`
            : "予約を追加しました")
        );
        // 追加メニューの担当が先約とぶつかった等、登録できなかったぶんはここで知らせる
        if ("warning" in result && result.warning) {
          toast.warning(String(result.warning), { duration: 10000 });
        }
        setDupWarning(null);
        setOverlapPrompt(null);
        setOpen(false);
        setDate(undefined);
        setTime("");
        setVisitType("new");
        setExtraSlots([]);
        setDaySlots({});
        setDuration(String(slotMinutes));
        setDurationTouched(false);
        setCourseId("");
        setStaffId("");
        setRoomId("");
        setAdditionalItems([]);
        onSuccess?.();
      } else if ("overlap" in result && result.overlap) {
        // 担当かぶりは直してもらわないと登録させない。
        // トーストは数秒で消えて読み飛ばされるので、閉じるまで残るダイアログにする
        // （2026-08-22 ぼーるくん「注意メッセージを出しても読まない人がいる」）。
        setOverlapPrompt({
          mode: "warn",
          staffName: commonStaffName ?? "担当",
          message: String(result.error ?? ""),
          formData,
          // ここはサーバーに弾かれた後。DB制約で弾かれたのかアプリのガードなのかを
          // この場では区別できないので、承認ボタンは出さない（できないことを見せない）。
          ownerOverridable: false,
        });
      } else {
        toast.error(result.error || "エラーが発生しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectClass =
    "flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-blue-600 text-white shadow-sm hover:bg-blue-700 h-9 px-4 py-2">
          <Plus className="w-4 h-4 mr-2" />
          新規予約を追加
        </DialogTrigger>
      )}

      <DialogContent className="w-full max-w-lg mx-auto max-h-[92dvh] overflow-y-auto p-0 gap-0 rounded-2xl">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b sticky top-0 bg-white z-10">
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle className="text-base font-bold">新規予約の手動追加</DialogTitle>
              <p className="text-sm text-slate-500 mt-0.5">電話・直接受付の予約を登録します</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        {/* 同日重複の確認オーバーレイ */}
        {dupWarning && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-amber-300 p-5 space-y-4">
              <div>
                <p className="text-base font-bold text-amber-900">
                  ⚠ 同じ日にこの患者さんの予約があります
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  {nameValue.trim()}様は、選ばれた日にすでに予約が入っています。
                </p>
              </div>
              <ul className="space-y-1 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {dupWarning.appointments.map((a) => (
                  <li key={a.id}>
                    ・{format(new Date(`${a.date}T00:00:00+09:00`), "M/d（E）", { locale: ja })} {a.time}
                    {a.medicalRecordNumber ? `（カルテ ${a.medicalRecordNumber}）` : ""}
                  </li>
                ))}
              </ul>
              {dupWarning.customerCount > 1 && (
                <p className="text-[11px] text-amber-700 leading-snug">
                  ※ 同名の患者さんが {dupWarning.customerCount} 件登録されています。別人（兄弟・親子）の可能性もご確認ください。
                </p>
              )}
              <p className="text-sm font-semibold text-slate-700">
                それでもこの内容で登録しますか？
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => runOverlapGate(dupWarning.formData)}
                  disabled={isSubmitting}
                  className="flex-1 h-11 bg-amber-600 hover:bg-amber-700 rounded-xl font-bold text-white"
                >
                  {isSubmitting ? "登録中..." : "それでも登録する"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDupWarning(null)}
                  disabled={isSubmitting}
                  className="flex-1 h-11 rounded-xl"
                >
                  やめる
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 担当かぶりの確認（さみ整体へ振替 / 重複はできない案内） */}
        {overlapPrompt && (
          <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/50 p-4">
            {/* 枠の色も見出しにそろえる。振替の提案は従来どおり琥珀、
                かぶりの案内は「院長が通せるか」で琥珀／赤（2026-08-29 検品指摘） */}
            <div
              className={`w-full max-w-sm bg-white rounded-2xl shadow-2xl border-2 p-5 space-y-4 ${
                overlapPrompt.mode === "reassign" || (isOwner && overlapPrompt.ownerOverridable)
                  ? "border-amber-300"
                  : "border-rose-300"
              }`}
            >
              {overlapPrompt.mode === "reassign" ? (
                <>
                  <div>
                    <p className="text-base font-bold text-amber-900">
                      ⚠ ボールがこの時間に埋まっています
                    </p>
                    <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                      選択した時間はボールさんの予約がすでに入っています。<br />
                      この日は<span className="font-bold">さみさんが出勤</span>していて枠が空いています。
                      <span className="font-bold">さみ整体（{overlapPrompt.sami.staffName}）</span>に振り替えますか？
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      onClick={confirmReassignToSami}
                      disabled={isSubmitting}
                      className="h-11 bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold text-white"
                    >
                      {isSubmitting ? "登録中..." : `さみ整体（${overlapPrompt.sami.staffName}）に振り替えて登録`}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setOverlapPrompt(null)}
                      disabled={isSubmitting}
                      className="h-10 rounded-xl text-slate-500"
                    >
                      やめる
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* 院長先生がこの場で通せるときに「登録できません」と書くと、
                      すぐ下の承認ボタンと真逆のことを言うことになる（2026-08-29 検品指摘）。
                      通せるときは「すでに予約が入っています」という事実だけを書く。 */}
                  <div>
                    <p
                      className={`text-base font-bold ${
                        isOwner && overlapPrompt.ownerOverridable ? "text-amber-700" : "text-rose-700"
                      }`}
                    >
                      {isOwner && overlapPrompt.ownerOverridable
                        ? "⚠ この時間には、すでに予約が入っています"
                        : "⚠ この予約は登録できません"}
                    </p>
                    <p className="text-sm text-slate-700 mt-1 leading-relaxed whitespace-pre-line">
                      {overlapPrompt.message
                        ? overlapPrompt.message
                        : `${overlapPrompt.staffName}さんは、この時間にすでに別のご予約が入っています。`}
                    </p>
                  </div>
                  {isOwner && overlapPrompt.ownerOverridable ? (
                    <div className="rounded-xl bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-900 leading-relaxed">
                      <span className="font-bold">重ねて診る予定なら</span>、下の
                      <span className="font-bold">「重なりを承知で登録する（院長）」</span>
                      でそのまま登録できます。予約のメモに院長承認の印が残ります。<br />
                      重ねない予定なら、<span className="font-bold">担当の先生を変える</span>か、
                      <span className="font-bold">時間をずらして</span>ください。
                    </div>
                  ) : (
                    <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800 leading-relaxed">
                      同じ先生の同じ時間に2件の予約は入れられません。<br />
                      <span className="font-bold">担当の先生を変える</span>か、
                      <span className="font-bold">時間をずらす</span>と登録できます。
                      {!isOwner && (
                        <>
                          <br />
                          院長先生に頼むとき：院長のログインでこの画面を開き
                          『重なりを承知で登録する（院長）』を押してもらってください。
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
                    courseId={courseId || null}
                    onPickTime={(hm) => { setTime(hm); setOverlapPrompt(null); }}
                    onPickStaff={(id) => { setStaffId(id); setOverlapPrompt(null); }}
                    viewerIsOwner={isOwner}
                  />
                  <div className="flex flex-col gap-2">
                    {/* 院長先生の逃げ道。ここが無いと、プルダウンの空き情報が読めていない
                        （読込中・時間外の枠など）ときに院長でも行き止まりになる
                        （2026-08-29 検品指摘）。DB制約で弾かれる担当では出さない。 */}
                    {isOwner && overlapPrompt.ownerOverridable && (
                      <Button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => {
                          const fd = overlapPrompt.formData;
                          fd.set("allowOverlap", "true");
                          setOverlapPrompt(null);
                          performSubmit(fd, "重なりを承知のうえで登録しました");
                        }}
                        className="h-11 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold"
                      >
                        重なりを承知で登録する（院長）
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => setOverlapPrompt(null)}
                      disabled={isSubmitting}
                      className="h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold"
                    >
                      戻って直す
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4 space-y-4">
            {/* 予約日 */}
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
                <PopoverContent className="w-auto p-0 z-[200]" align="start" side="bottom" sideOffset={4}>
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
                <select value={time} onChange={(e) => setTime(e.target.value)} className={selectClass}>
                  {renderTimeOptions(date, staffId)}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  所要時間
                </Label>
                <select
                  value={duration}
                  onChange={(e) => { setDurationTouched(true); setDuration(e.target.value); }}
                  className={selectClass}
                >
                  {durationOptions.map((m) => (
                    <option key={m} value={m}>{m}分</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 選んだ日時が既存予約とぶつかっているときの注意。
                同じ担当のかぶりは登録できないので、必ず赤で「直してください」と出す。
                以前はここに「重ねて診る予定ならこのまま登録して大丈夫です。」と書いていたが、
                サーバー側でかぶりを止めるようにしたため、間違った操作を後押ししたうえで
                弾く形になっていた（2026-08-22 検品指摘）。 */}
            {overlapAlerts.length > 0 && (
              <div
                className={`rounded-md border px-3 py-2 text-xs space-y-1 ${
                  ownerCanPassOverlap
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-red-200 bg-red-50 text-red-800"
                }`}
              >
                {overlapAlerts.map((a) => (
                  <div key={a.key}>
                    <span className="font-semibold">⚠ {a.key}</span> は {a.note}
                    {a.fitMinutes ? (
                      <>。所要時間を <b>{a.fitMinutes}分</b> にすれば重なりません。</>
                    ) : ownerCanPassOverlap ? (
                      <>。</>
                    ) : (
                      <>。この時間は登録できません。</>
                    )}
                  </div>
                ))}
                {ownerCanPassOverlap ? (
                  <>
                    <div className="pt-0.5 font-bold">
                      重ねて診る予定なら、このまま登録できます。
                    </div>
                    <div className="pt-1 text-[11px] text-amber-800 border-t border-amber-300 mt-1">
                      下の「重なりを承知で登録する（院長）」で登録すると、予約のメモに
                      院長承認の印が残ります。重ねない予定なら、担当の先生を変えるか時間をずらしてください。
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pt-0.5 font-bold">
                      担当の先生を変えるか、時間をずらしてください。
                    </div>
                    {isOwner ? (
                      // 院長本人が見ている画面で「院長先生の許可が必要」と出すと意味が通らない。
                      // この担当は DB 側で重ねられないので、院長でも登録できないことをそのまま書く。
                      <div className="pt-1 text-[11px] font-bold text-red-700 border-t border-red-200 mt-1">
                        重ねて登録できない担当（1人ずつしか診ない設定の先生）が含まれています。
                        院長の権限でも登録できないので、その日時の担当か時間を変えてください。
                      </div>
                    ) : (
                      <div className="pt-1 text-[11px] font-bold text-red-700 border-t border-red-200 mt-1">
                        どうしても重ねる必要があるときは、<u>院長先生の許可</u>が必要です。
                        先生にご確認ください。
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 患者名（サジェスト付き） */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                患者名 <span className="text-red-500">*</span>
              </Label>
              <div className="relative" ref={suggestionsRef}>
                <div className="relative">
                  <Input
                    name="name"
                    required
                    placeholder="山田 太郎"
                    value={nameValue}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    className="h-11 pr-8"
                    autoComplete="off"
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-3.5 w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>

                {/* サジェストドロップダウン */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="px-3 py-1.5 bg-slate-50 border-b text-xs text-slate-500 font-medium">
                      既存の患者さん（クリックで選択）
                    </div>
                    {suggestions.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectPatient(patient)}
                        className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-bold text-slate-800">
                                {patient.name}
                                {patient.medicalRecordNumber && (
                                  <span className="ml-2 text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                                    カルテ {patient.medicalRecordNumber}
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-slate-500">{patient.phone}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {patient.daysSinceLastVisit !== null ? (
                              <div className="flex items-center gap-1 text-xs">
                                <Clock className="w-3 h-3 text-blue-400" />
                                <span className={`font-semibold ${
                                  patient.daysSinceLastVisit <= 7 ? "text-green-600" :
                                  patient.daysSinceLastVisit <= 30 ? "text-blue-600" :
                                  patient.daysSinceLastVisit <= 90 ? "text-amber-600" : "text-red-500"
                                }`}>
                                  {patient.daysSinceLastVisit}日前に来院
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">来院記録なし</span>
                            )}
                            <p className="text-xs text-slate-400 mt-0.5">計{patient.totalVisits}回</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 選択済み患者バッジ */}
              {selectedPatient && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mt-1">
                  <User className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs text-blue-700 font-medium">既存患者として登録</span>
                  {selectedPatient.daysSinceLastVisit !== null && (
                    <span className="text-xs text-blue-500 ml-auto">
                      前回来院: {selectedPatient.daysSinceLastVisit}日前
                    </span>
                  )}
                </div>
              )}

              {/* 前回同様の施術内容を自動セット＋初診料の注意（再診のみ） */}
              {selectedPatient && selectedPatient.totalVisits > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mt-1 space-y-0.5">
                  {selectedPatient.lastCourseName ? (
                    <p className="text-xs text-emerald-800 font-semibold">
                      前回と同じ施術内容をセットしました：{selectedPatient.lastCourseName}
                      {selectedPatient.lastStaffName ? `（担当：${selectedPatient.lastStaffName}）` : ""}
                    </p>
                  ) : (
                    <p className="text-xs text-emerald-800 font-semibold">
                      再診としてセットしました
                    </p>
                  )}
                  <p className="text-[11px] text-emerald-700 leading-snug">
                    2回目以降のため初診料は付きません。内容が違う場合は下のメニュー・担当を変更してください。
                  </p>
                </div>
              )}

              {/* 同名複数アラート（兄弟・親子の可能性） */}
              {(() => {
                const trimmed = nameValue.trim();
                if (!trimmed) return null;
                // 半角/全角スペースの揺れを吸収して比較
                const norm = (s: string) => s.replace(/[\s　]+/g, "");
                const key = norm(trimmed);
                const same = suggestions.filter((s) => norm(s.name) === key);
                if (same.length < 2) return null;
                return (
                  <div className="bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 mt-1">
                    <p className="text-xs text-amber-900 font-bold">
                      ⚠ 同名の患者さんが {same.length} 件登録されています
                    </p>
                    <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                      兄弟・親子で同姓同名の可能性があります。サジェストから本人を選ぶか、カルテ番号で別人として登録してください。
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* 電話番号 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                電話番号 <span className="text-red-500">*</span>
              </Label>
              <Input
                name="phone"
                type="tel"
                required
                placeholder="090-0000-0000"
                value={phoneValue}
                onChange={(e) => setPhoneValue(e.target.value)}
                className="h-11"
              />
            </div>

            {/* カルテ番号（任意。親子で同じ電話番号の場合の本人特定に使用） */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                カルテ番号 <span className="text-slate-400 font-normal normal-case">（任意）</span>
              </Label>
              <Input
                type="text"
                placeholder="例: A-1234（親子で電話番号が同じ場合は必ず入力）"
                value={medicalRecordNumberValue}
                onChange={(e) => setMedicalRecordNumberValue(e.target.value)}
                className="h-11"
                autoComplete="off"
              />
              <p className="text-[10px] text-slate-500">
                紙カルテに振った番号をそのまま入力してください。<br />
                同じ番号があれば「同じ人」として上書き、なければ新規カルテになります。
              </p>
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
                          ? "bg-amber-500 border-amber-500 text-white"
                          : "bg-blue-600 border-blue-600 text-white"
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
                  {courses.filter(c => c.is_active).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}（{c.duration_minutes}分{c.price != null ? ` / ¥${c.price.toLocaleString()}` : ""}）
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500">選ぶと所要時間も自動で入ります。売上一括入力の元情報にも反映されます。</p>

                {/* ダブル施術（さみ整体↔ボール担当を同時に） */}
                {canDouble && (
                  <button
                    type="button"
                    onClick={toggleDouble}
                    aria-pressed={doubleOn}
                    className={`mt-2 w-full h-11 rounded-lg border text-sm font-bold transition-all ${
                      doubleOn
                        ? "bg-violet-600 border-violet-600 text-white"
                        : "border-violet-300 text-violet-700 hover:bg-violet-50"
                    }`}
                  >
                    {doubleOn
                      ? "✓ ダブル施術 ON（主施術の直後に連続）"
                      : `＋ ダブル施術にする（${isSamiPrimary ? "ボール施術を直後に" : "さみ整体を直後に"}）`}
                  </button>
                )}

                {/* 追加メニュー（メニュー＋担当のセットで積む） */}
                {additionalItems.map((item, idx) => {
                  const itemCourse = courses.find((c) => c.id === item.courseId);
                  return (
                    <div key={`addc-${idx}`} className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50/70 p-2 space-y-1.5">
                      <div className="flex gap-2 items-center">
                        <span className="text-[10px] text-slate-400 w-10 shrink-0">＋{idx + 2}個目</span>
                        <select
                          value={item.courseId}
                          onChange={(e) => {
                            const next = [...additionalItems];
                            next[idx] = { ...next[idx], courseId: e.target.value };
                            setAdditionalItems(next);
                          }}
                          className={`${selectClass} flex-1`}
                        >
                          <option value="">追加メニューを選択</option>
                          {courses.filter(c => c.is_active).map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name}（{c.duration_minutes}分{c.price != null ? ` / ¥${c.price.toLocaleString()}` : ""}）
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setAdditionalItems(additionalItems.filter((_, i) => i !== idx))}
                          className="px-2 py-1 text-rose-500 hover:bg-rose-50 rounded text-sm"
                          aria-label="追加メニューを削除"
                        >×</button>
                      </div>
                      {treatmentStaff.length > 0 && (
                        <div className="flex gap-2 items-center">
                          <span className="text-[10px] text-slate-400 w-10 shrink-0">担当</span>
                          <select
                            value={item.staffId}
                            onChange={(e) => {
                              const next = [...additionalItems];
                              next[idx] = { ...next[idx], staffId: e.target.value };
                              setAdditionalItems(next);
                            }}
                            className={`${selectClass} flex-1`}
                          >
                            <option value="">上と同じ担当（時間もまとめる）</option>
                            {treatmentStaff.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <p className="text-[11px] text-slate-500 pl-12">
                        {item.staffId
                          ? `施術の直後に、この担当の枠として続けて登録します${itemCourse ? `（${itemCourse.duration_minutes}分）` : ""}`
                          : "上の施術と同じ枠にまとめます（所要時間に足されます）"}
                      </p>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setAdditionalItems([...additionalItems, { courseId: "", staffId: "" }])}
                  className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 mt-1"
                >
                  <Plus className="w-3 h-3" /> メニューを追加
                </button>
              </div>
            )}

            {/* 施術後に○○を追加（設定された追加メニューがあり・施術がそのメニュー自体でないとき表示） */}
            {addonInfo && courseId !== addonInfo.courseId && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setAddAddon((v) => !v)}
                  aria-pressed={addAddon}
                  className={`w-full flex items-center justify-between gap-2 h-11 px-3 rounded-lg border text-sm font-bold transition-all ${
                    addAddon ? "bg-cyan-600 border-cyan-600 text-white" : "border-cyan-300 text-cyan-700 hover:bg-cyan-50"
                  }`}
                >
                  <span>＋ {addonInfo.name}を追加する</span>
                  <span className={`text-xs ${addAddon ? "text-white/90" : "text-cyan-500"}`}>{addAddon ? "ON" : "OFF"}</span>
                </button>
                {/* 施術前/施術後はどのメニューでも選べる。「同時刻に追加」は水素のように
                    別の時間が要らないメニュー(allowConcurrent)だけ。 */}
                {addAddon && (
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["before", "施術前に追加"],
                      ["after", "施術後に追加"],
                      ...(addonInfo.allowConcurrent ? [["same", "同時刻に追加"]] : []),
                    ] as Array<["before" | "after" | "same", string]>).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setAddonTiming(val)}
                        className={`h-10 rounded-lg border text-sm font-semibold transition-all ${
                          addonTiming === val ? "bg-cyan-100 border-cyan-400 text-cyan-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
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
                  {/* 受付スタッフ（show_in_timeline=false の受付助手等）は施術担当に出さない */}
                  {treatmentStaff.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>

                {/* 2人目の担当は「メニューを追加」→ その行で担当を選ぶ形に一本化した。
                    同じ時刻に2人をぶら下げると、施術時間が分からず AI秘書の
                    「複数担当が同時刻」アラートになるため（2026-08-07 藤川先生の指摘）。 */}
                <p className="text-[11px] text-slate-500 mt-1">
                  別の先生が続けて入るときは、上の「メニューを追加」でメニューと担当を選んでください。
                </p>
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
                  {rooms.filter(r => r.is_active).map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* まとめ予約：1回の登録で複数日を押さえる */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                予約する日時
              </Label>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 space-y-2">
                {/* 1件目 = 上で選んだ予約日・時間 */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-10 shrink-0 text-[11px] font-semibold text-slate-400">1件目</span>
                  {date && time ? (
                    <span className="font-bold text-slate-800">
                      {format(date, "M/d（E）", { locale: ja })} {time}
                      {commonCourseName && (
                        <span className="font-normal text-slate-500">／{commonCourseName}</span>
                      )}
                      {commonStaffName && (
                        <span className="font-normal text-slate-500">／{commonStaffName}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-400">上で日付と時間を選んでください</span>
                  )}
                </div>

                {extraSlots.map((s, i) => (
                  <div key={s.key} className="rounded-lg border border-slate-200 bg-white p-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-10 shrink-0 text-[11px] font-semibold text-slate-400">
                        {i + 2}件目
                      </span>
                      <Popover>
                        <PopoverTrigger className="flex items-center flex-1 min-w-0 h-10 rounded-md border border-input bg-white px-2.5 text-sm shadow-sm hover:bg-accent transition-colors text-left">
                          <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
                          {s.date ? (
                            <span className="truncate">{format(s.date, "M/d（E）", { locale: ja })}</span>
                          ) : (
                            <span className="text-muted-foreground">日付</span>
                          )}
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 z-[200]" align="start" side="bottom" sideOffset={4}>
                          <Calendar
                            mode="single"
                            selected={s.date}
                            onSelect={(d) => updateExtraSlot(s.key, { date: d })}
                            initialFocus
                            locale={ja}
                          />
                        </PopoverContent>
                      </Popover>
                      <select
                        value={s.time}
                        onChange={(e) => updateExtraSlot(s.key, { time: e.target.value })}
                        className="flex h-10 w-[7.5rem] shrink-0 rounded-md border border-input bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {renderTimeOptions(s.date, s.staffId || staffId)}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeExtraSlot(s.key)}
                        className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="この日時を削除"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* 日によってメニューが違うときだけ選び直す（未指定なら1件目と同じメニュー） */}
                    {courses.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="w-10 shrink-0 text-[11px] text-slate-400">メニュー</span>
                        <select
                          value={s.courseId}
                          onChange={(e) => updateExtraSlot(s.key, { courseId: e.target.value })}
                          className="flex h-9 flex-1 min-w-0 rounded-md border border-input bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">
                            1件目と同じ{commonCourseName ? `（${commonCourseName}）` : "（指定なし）"}
                          </option>
                          {courses.filter((c) => c.is_active).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}（{c.duration_minutes}分{c.price != null ? ` / ¥${c.price.toLocaleString()}` : ""}）
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* 日によって担当が違うときだけ選び直す（未指定なら1件目と同じ担当） */}
                    {treatmentStaff.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="w-10 shrink-0 text-[11px] text-slate-400">担当</span>
                        <select
                          value={s.staffId}
                          onChange={(e) => updateExtraSlot(s.key, { staffId: e.target.value })}
                          className="flex h-9 flex-1 min-w-0 rounded-md border border-input bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">
                            1件目と同じ{commonStaffName ? `（${commonStaffName}）` : "（指定なし）"}
                          </option>
                          {treatmentStaff.map((st) => (
                            <option key={st.id} value={st.id}>{st.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* 1件目と違うメニューにすると、そのメニューの所要時間で登録される */}
                    {s.courseId && s.courseId !== courseId && (
                      <p className="text-[10px] text-slate-400 pl-12">
                        この回は
                        {courses.find((c) => c.id === s.courseId)?.duration_minutes ?? 0}分で登録します。
                      </p>
                    )}
                  </div>
                ))}

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={addExtraSlot}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> 日時を追加
                  </button>
                  <select
                    value=""
                    onChange={(e) => {
                      const w = Number(e.target.value);
                      if (w > 0) addWeeklyBatch(w);
                      e.target.value = "";
                    }}
                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">毎週まとめて追加…</option>
                    <option value="1">翌週の同じ時間（1回分）</option>
                    <option value="3">毎週3回分</option>
                    <option value="7">毎週7回分（約2ヶ月）</option>
                    <option value="11">毎週11回分（約3ヶ月）</option>
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                {pickedCount > 1
                  ? `同じ患者さん・同じ内容で ${pickedCount}件 をまとめて登録します。`
                  : "事故の患者さんなど、来院日が決まっている場合は「日時を追加」で複数日をまとめて押さえられます。"}
              </p>
            </div>

            {/* メモ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                メモ（症状など）
              </Label>
              <Input name="symptoms" placeholder="例: 腰痛（電話予約）" className="h-11" />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 pt-3 border-t sticky bottom-0 bg-white space-y-2">
            {/* 担当がかぶっている間は押させない。
                「注意メッセージを出しても読まない人がいる。間違いを直さないと
                予約できないようにしてほしい」（2026-08-22 ぼーるくん）への対応。 */}
            {/* 担当がかぶっている間、スタッフには押させない。
                院長先生（オーナー）だけは判断できるので、承知のうえで登録できる
                （2026-08-22 ぼーるくん「登録できない場合はオーナーの許可が必要ってことに」）。 */}
            <Button
              type="submit"
              disabled={
                isSubmitting || !date || !time || (overlapAlerts.length > 0 && !ownerCanPassOverlap)
              }
              className={`w-full h-11 rounded-xl font-bold disabled:opacity-60 ${
                ownerCanPassOverlap
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isSubmitting
                ? "保存中..."
                : overlapAlerts.length > 0
                  ? ownerCanPassOverlap
                    ? "重なりを承知で登録する（院長）"
                    : isOwner
                      ? "この時間は重ねて登録できません"
                      : "重なっているので登録できません"
                  : pickedCount > 1
                    ? `この内容で ${pickedCount}件 まとめて登録する`
                    : "予約を追加する"}
            </Button>
            {/* スタッフには「許可が必要」だけでは何をすればいいか分からない。
                院長に頼むときの手順を1行で書く（2026-09-02 からだ受付向け） */}
            {overlapAlerts.length > 0 && !isOwner && (
              <p className="text-[11px] text-rose-700 leading-snug">
                院長先生に頼むとき：院長のログインでこの画面を開き
                『重なりを承知で登録する（院長）』を押してもらってください。
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="w-full h-10 rounded-xl text-sm"
            >
              閉じる
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
