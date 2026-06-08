"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { format } from "date-fns";
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
import { createManualReservation, getAddonCourseInfo } from "@/app/actions/adminReserve";
import { findSameDayAppointmentsByName } from "@/app/actions/duplicateCheck";
import { searchPatientsForBooking, PatientSuggestion } from "@/app/actions/patientSearch";
import { getCourses, getStaffList, getRooms, type ReservationCourse, type ReservationStaff, type ReservationRoom } from "@/app/actions/courses";
import { toast } from "sonner";
import { getTimeSlots } from "@/lib/time-slots";
import { useClinicSlotDuration } from "@/lib/use-clinic-slot-duration";

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
}) {
  const slotMinutes = useClinicSlotDuration();
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
  const [duration, setDuration] = useState<string>(String(slotMinutes));
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 同じ日に同名患者の予約がある場合の確認（それでも登録するか）
  const [dupWarning, setDupWarning] = useState<{
    appointments: { id: string; time: string; medicalRecordNumber: string | null }[];
    customerCount: number;
    formData: FormData;
  } | null>(null);

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
  // 追加メニュー・追加担当（同じ予約に複数項目を紐付け）
  const [additionalCourses, setAdditionalCourses] = useState<string[]>([]);
  const [additionalStaff, setAdditionalStaff] = useState<string[]>([]);
  // ダブル施術：さみ整体↔ボール担当を同時に組む（相方を additional に自動セット）
  const [doubleOn, setDoubleOn] = useState(false);
  // 施術後に○○を追加：設定された追加メニュー（after=施術後 / same=同時刻）
  const [addAddon, setAddAddon] = useState(false);
  const [addonTiming, setAddonTiming] = useState<"after" | "same">("after");
  const [addonInfo, setAddonInfo] = useState<{ courseId: string; name: string } | null>(null);

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
        setCourseId(defaultCourseId);
        // 既存コースの duration を反映
        const c = courses.find((c) => c.id === defaultCourseId);
        if (c) setDuration(String(c.duration_minutes));
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
      setRecurringWeeks("1");
      setDuration(String(slotMinutes));
      setCourseId("");
      setStaffId("");
      setRoomId("");
      setAdditionalCourses([]);
      setAdditionalStaff([]);
      setDoubleOn(false);
      setAddAddon(false);
      setAddonTiming("after");
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
      if (c) {
        setCourseId(defaultCourseId);
        setDuration(String(c.duration_minutes));
      }
    }
  }, [open, defaultCourseId, courses]);

  // コース選択時に所要時間も連動して更新
  const handleCourseChange = (id: string) => {
    setCourseId(id);
    if (id) {
      const c = courses.find(c => c.id === id);
      if (c) setDuration(String(c.duration_minutes));
    }
  };

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

  const toggleDouble = () => {
    if (doubleOn) {
      // OFF：相方を外す
      setDoubleOn(false);
      setAdditionalStaff([]);
      setAdditionalCourses([]);
      return;
    }
    if (isSamiPrimary && ballStaff) {
      // さみ整体 → ボール担当をプラス
      setAdditionalStaff([ballStaff.id]);
      setAdditionalCourses([]);
    } else if (isBallPrimary) {
      // ボール担当施術 → さみ整体をプラス（担当も さみ）
      setAdditionalCourses(samiCourse ? [samiCourse.id] : []);
      setAdditionalStaff(samiStaff ? [samiStaff.id] : []);
    }
    setDoubleOn(true);
  };

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
    formData.set("additionalCourseIds", JSON.stringify(additionalCourses.filter(Boolean)));
    formData.set("additionalStaffIds", JSON.stringify(additionalStaff.filter(Boolean)));
    // 「施術後に○○を追加」（設定された追加メニューがあり、施術がそのメニュー自体でないとき）
    if (addAddon && addonInfo && courseId !== addonInfo.courseId) {
      formData.set("addAddon", "true");
      formData.set("addonTiming", addonTiming);
    }
    formData.append("date", format(date, "yyyy-MM-dd"));
    formData.append("time", time);
    formData.append("visitType", visitType);
    formData.append("recurringWeeks", recurringWeeks);
    formData.set("duration", duration);
    if (courseId) formData.append("courseId", courseId);
    if (staffId) formData.append("staffId", staffId);
    if (roomId) formData.append("roomId", roomId);

    // ── 同日重複チェック ──
    // 同じ日に同名の患者さんの予約があれば、誤登録防止のため確認をはさむ
    setIsSubmitting(true);
    try {
      const dup = await findSameDayAppointmentsByName(format(date, "yyyy-MM-dd"), nameValue);
      if (dup.appointments.length > 0) {
        setDupWarning({
          appointments: dup.appointments.map((a) => ({
            id: a.id,
            time: a.time,
            medicalRecordNumber: a.medicalRecordNumber,
          })),
          customerCount: dup.customerCount,
          formData,
        });
        setIsSubmitting(false);
        return; // 確認待ち
      }
    } catch {
      // 重複チェックに失敗しても登録自体は止めない
    }

    await performSubmit(formData);
  };

  // 実際の予約登録処理（重複チェックを通過 or 確認後に呼ぶ）
  const performSubmit = async (formData: FormData) => {
    setIsSubmitting(true);
    try {
      const result = await createManualReservation(formData);
      if (result.success) {
        toast.success(
          Number(recurringWeeks) > 1
            ? `${recurringWeeks}週分の予約を追加しました`
            : "予約を追加しました"
        );
        setDupWarning(null);
        setOpen(false);
        setDate(undefined);
        setTime("");
        setVisitType("new");
        setRecurringWeeks("1");
        setDuration(String(slotMinutes));
        setCourseId("");
        setStaffId("");
        setRoomId("");
        onSuccess?.();
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
                  {nameValue.trim()}様は、選択された日にすでに予約が入っています。
                </p>
              </div>
              <ul className="space-y-1 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {dupWarning.appointments.map((a) => (
                  <li key={a.id}>
                    ・{a.time}
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
                  onClick={() => performSubmit(dupWarning.formData)}
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
                  {!date ? (
                    <option value="" disabled>先に日付を選択</option>
                  ) : getTimeSlots(date, { bypassRestrictions: true, slotMinutes }).length === 0 ? (
                    <option value="" disabled>休診日</option>
                  ) : (
                    <option value="" disabled>時間を選択</option>
                  )}
                  {date && getTimeSlots(date, { bypassRestrictions: true, slotMinutes }).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  所要時間
                </Label>
                <select value={duration} onChange={(e) => setDuration(e.target.value)} className={selectClass}>
                  {durationOptions.map((m) => (
                    <option key={m} value={m}>{m}分</option>
                  ))}
                </select>
              </div>
            </div>

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
                      ? "✓ ダブル施術 ON（同時に2人で施術）"
                      : `＋ ダブル施術にする（${isSamiPrimary ? "ボール担当も同時" : "さみ整体も同時"}）`}
                  </button>
                )}

                {/* 追加メニュー（複数選択可） */}
                {additionalCourses.map((cid, idx) => (
                  <div key={`addc-${idx}`} className="flex gap-2 items-center mt-1.5">
                    <span className="text-[10px] text-slate-400 w-10 shrink-0">＋{idx + 2}個目</span>
                    <select
                      value={cid}
                      onChange={(e) => {
                        const next = [...additionalCourses];
                        next[idx] = e.target.value;
                        setAdditionalCourses(next);
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
                      onClick={() => setAdditionalCourses(additionalCourses.filter((_, i) => i !== idx))}
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
                {addAddon && (
                  <div className="flex gap-2">
                    {([["after", "施術後に追加"], ["same", "同時刻に追加"]] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setAddonTiming(val)}
                        className={`flex-1 h-10 rounded-lg border text-sm font-semibold transition-all ${
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
                  {staffList.filter(s => s.is_active).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>

                {/* 追加担当（複数選択可） */}
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
                      {staffList.filter(s => s.is_active).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
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

            {/* 繰り返し */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                繰り返し設定
              </Label>
              <select
                value={recurringWeeks}
                onChange={(e) => setRecurringWeeks(e.target.value)}
                className={selectClass}
              >
                <option value="1">今回のみ（繰り返しなし）</option>
                <option value="2">2週連続（毎週）</option>
                <option value="3">3週連続（毎週）</option>
                <option value="4">4週連続（毎週）</option>
                <option value="8">8週連続（約2ヶ月）</option>
                <option value="12">12週連続（約3ヶ月）</option>
              </select>
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
            <Button
              type="submit"
              disabled={isSubmitting || !date || !time}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
            >
              {isSubmitting ? "保存中..." : "予約を追加する"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="w-full h-10 rounded-xl text-sm"
            >
              キャンセル
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
