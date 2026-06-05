"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parse, isValid } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarIcon, ArrowLeft, CheckCircle2, Phone, MapPin, MessageCircle, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { createReservation, getDailyAvailability } from "@/app/actions/reserve";
import { getClinicHolidays, type ClinicHoliday } from "@/app/actions/holidays";
import { getActiveCourses, getActiveStaff, getActiveRooms, type ReservationCourse, type ReservationStaff, type ReservationRoom } from "@/app/actions/courses";
import { useSearchParams } from "next/navigation";
import { getTimeSlots, isDateWithinAllowedRange } from "@/lib/time-slots";
import { useClinicSlotDuration } from "@/lib/use-clinic-slot-duration";
import { useClinicSchedule } from "@/lib/use-clinic-schedule";
import { toast } from "sonner";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
import ReserveLandingPage from "./ReserveLandingPage";
import { getPublicClinicSettings } from "@/app/actions/publicSettings";
import { getPublicClinicHours } from "@/app/actions/settings";
import ClinicWordmark from "@/components/ClinicWordmark";
import type { LinkedCustomer } from "@/lib/line-links";

const SELECTED_CUSTOMER_KEY = "ballClinic_selectedCustomerId";
const FAMILY_LIST_KEY = "ballClinic_familyList";
// 初めての方をアンケートへ送る際、選んだ日時・お名前・電話を退避するキー。
// アンケート完了後にこの内容で仮予約を確定し、「もう一度日程選び」をさせない。
const PENDING_BOOKING_KEY = "ballClinic_pendingBooking";

// 「友だち追加」用 URL は /R/ti/p/ 形式。/ti/p/ だけだと既に友だちでないと開けず
// 「LINEの友だちではないユーザー」エラーになる
const LINE_URL = process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL ?? "https://line.me/R/ti/p/%40shc8761q";

function ReserveContent() {
  const slotMinutes = useClinicSlotDuration();
  const schedule = useClinicSchedule();
  const searchParams = useSearchParams();
  const initialDateStr = searchParams.get("date");
  const initialTime = searchParams.get("time");
  const initialCourseId = searchParams.get("courseId");

  const initialDate = initialDateStr ? (() => {
    const parsed = parse(initialDateStr, "yyyy-MM-dd", new Date());
    return isValid(parsed) ? parsed : undefined;
  })() : undefined;

  const [date, setDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (initialDate) setDate(initialDate);
  }, []);

  const [time, setTime] = useState<string>(initialTime || "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [visitType, setVisitType] = useState<string>("");
  const [lineRegistered, setLineRegistered] = useState(false);
  const [bookedTimes, setBookedTimes] = useState<string[]>([]);
  const [courses, setCourses] = useState<ReservationCourse[]>([]);
  const [staffList, setStaffList] = useState<ReservationStaff[]>([]);
  const [rooms, setRooms] = useState<ReservationRoom[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isWaitingResult, setIsWaitingResult] = useState(false);
  const [requiresQuestionnaire, setRequiresQuestionnaire] = useState(false);
  // 予約完了後の「LINE連携のお願い」ポップアップ（アンケート済み・LINE未連携の人向け）
  const [showLineLinkPopup, setShowLineLinkPopup] = useState(false);
  const [lineLinkPhone4, setLineLinkPhone4] = useState<string | null>(null);
  // 同じ日の重複（ブロック → LINE 誘導）
  const [duplicateSameDay, setDuplicateSameDay] = useState(false);
  // 別の日の重複（警告 → 本人が院に確認済みなら続行）。値は既存予約の日時表示
  const [duplicateOtherDay, setDuplicateOtherDay] = useState<string | null>(null);
  // 別日重複の確認後に再送信するための FormData 退避
  const pendingFormData = useRef<FormData | null>(null);
  // アンケート誘導ボックスへ自動スクロールするための ref（初めての方の戸惑い防止）
  const questionnaireBoxRef = useRef<HTMLDivElement | null>(null);
  const [clinicHolidays, setClinicHolidays] = useState<ClinicHoliday[]>([]);
  // LINE 経由で選択された家族 customer（あれば name/phone をプリフィル + customerId を送信）
  const [selectedFamilyMember, setSelectedFamilyMember] = useState<LinkedCustomer | null>(null);
  // 予約フロー：datetime_first (既存) / menu_first (からだ等の治療院系UX)
  const [reserveFlow, setReserveFlow] = useState<"datetime_first" | "menu_first">("datetime_first");

  // 営業時間・休診日（DB＝院ごと。ハードコード禁止）
  const [hoursLines, setHoursLines] = useState<string[]>([]);
  const [hoursClosed, setHoursClosed] = useState<string>("");

  useEffect(() => {
    getPublicClinicSettings().then(s => {
      if (s?.public_reserve_flow === "menu_first") setReserveFlow("menu_first");
    });
    getPublicClinicHours().then(h => {
      const lines = (h?.hours_lines && h.hours_lines.length > 0)
        ? h.hours_lines
        : [CLINIC_CONFIG.hoursLine1, ...(CLINIC_CONFIG.hoursLine2 ? [CLINIC_CONFIG.hoursLine2] : [])];
      setHoursLines(lines);
      setHoursClosed(h?.hours_closed || CLINIC_CONFIG.hoursClosed || "");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    getClinicHolidays().then(setClinicHolidays);
    getActiveCourses().then(list => {
      setCourses(list);
      // ?courseId=xxx で来た場合、該当コースを初期選択
      if (initialCourseId && list.some(c => c.id === initialCourseId)) {
        setSelectedCourseId(initialCourseId);
      }
    });
    getActiveStaff().then(setStaffList);
    getActiveRooms().then(setRooms);

    // 家族選択がある場合は customer 情報を優先プリフィル
    let appliedFamily = false;
    try {
      const familyJson = localStorage.getItem(FAMILY_LIST_KEY);
      const selectedId = localStorage.getItem(SELECTED_CUSTOMER_KEY);
      if (familyJson && selectedId) {
        const list: LinkedCustomer[] = JSON.parse(familyJson);
        const member = list.find((c) => c.customer_id === selectedId);
        if (member) {
          setSelectedFamilyMember(member);
          setName(member.display_name ?? member.name);
          if (member.phone) setPhone(member.phone);
          setVisitType("return");
          appliedFamily = true;
        }
      }
    } catch {}

    if (!appliedFamily) {
      const savedName = localStorage.getItem("ballClinic_savedName");
      const savedPhone = localStorage.getItem("ballClinic_savedPhone");
      if (savedName) setName(savedName);
      if (savedPhone) setPhone(savedPhone);
      if (savedName && savedPhone) setVisitType("return");
    }
  }, [initialCourseId]);

  useEffect(() => {
    if (date) {
      const fetchAvailability = async () => {
        const dateStr = format(date, "yyyy-MM-dd");
        const times = await getDailyAvailability(dateStr);
        setBookedTimes(times);
      };
      fetchAvailability();
    } else {
      setBookedTimes([]);
    }
  }, [date]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("reserve-form-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        if (date) {
          const dateStr = format(date, "yyyy-MM-dd");
          getDailyAvailability(dateStr).then(setBookedTimes);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [date]);

  // アンケートが必要になったら、その案内まで自動でスクロールして気づいてもらう
  useEffect(() => {
    if (requiresQuestionnaire && questionnaireBoxRef.current) {
      questionnaireBoxRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [requiresQuestionnaire]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date || !time) return;

    if (!name.trim()) {
      toast.error("お名前を入力してください");
      return;
    }

    if (visitType === "new" && !phone) {
      toast.error("初診の場合は電話番号の入力が必要です");
      return;
    }

    const availableSlots = getTimeSlots(date, { slotMinutes, schedule });
    if (!availableSlots.includes(time)) {
      toast.error("選択された時間は予約できません。別の時間を選択してください");
      return;
    }

    // 再送信に備えて前回の警告表示はリセット
    setRequiresQuestionnaire(false);
    setDuplicateSameDay(false);
    setDuplicateOtherDay(null);

    setIsSubmitting(true);
    try {
      const formData = new FormData(e.currentTarget);
      formData.append("date", format(date, "yyyy-MM-dd"));
      formData.append("time", time);
      formData.append("visitType", visitType);
      formData.append("isWaitlistIntent", bookedTimes.includes(time).toString());
      formData.append("phone", phone || localStorage.getItem("ballClinic_savedPhone") || "");
      if (selectedCourseId) {
        const course = courses.find(c => c.id === selectedCourseId);
        if (course) {
          formData.append("courseId", course.id);
          formData.append("courseName", course.name);
          formData.append("courseDurationMinutes", course.duration_minutes.toString());
        }
      }
      if (selectedStaffId) {
        const staff = staffList.find(s => s.id === selectedStaffId);
        if (staff) {
          formData.append("staffId", staff.id);
          formData.append("staffName", staff.name);
        }
      }
      if (selectedRoomId) {
        const room = rooms.find(r => r.id === selectedRoomId);
        if (room) {
          formData.append("roomId", room.id);
          formData.append("roomName", room.name);
        }
      }
      if (selectedFamilyMember) {
        formData.append("customerId", selectedFamilyMember.customer_id);
      }

      await runReservation(formData);
    } catch (error) {
      toast.error("送信エラーが発生しました。しばらく経ってから再度お試しください");
    } finally {
      setIsSubmitting(false);
    }
  };

  // createReservation を実行し、結果に応じて成功 / アンケート / 重複警告を振り分ける
  const runReservation = async (formData: FormData) => {
    const result = await createReservation(formData);

    if (result.success) {
      localStorage.setItem("ballClinic_savedName", name);
      if (phone) localStorage.setItem("ballClinic_savedPhone", phone);
      setIsWaitingResult(result.isWaiting || false);
      setIsSuccess(true);
      // LINE未連携の人には、完了後に「下4桁を送って連携してください」ポップアップを出す
      const r2 = result as any;
      if (r2.lineLinked === false) {
        // 登録電話の下4桁（無ければ今回入力の下4桁でフォールバック）
        const digits = (phone || "").replace(/\D/g, "");
        setLineLinkPhone4(r2.phoneLast4 || (digits.length >= 4 ? digits.slice(-4) : null));
        setShowLineLinkPopup(true);
      }
      return;
    }

    const r = result as any;
    if (r.requiresQuestionnaire) {
      // 初めての方 → アンケートへ。選んだ日時・お名前・電話・コース等を退避して
      // アンケート完了後にそのまま仮予約を確定できるようにする（再度の日程選びを無くす）。
      try {
        const course = courses.find((c) => c.id === selectedCourseId);
        const staff = staffList.find((s) => s.id === selectedStaffId);
        const room = rooms.find((rm) => rm.id === selectedRoomId);
        const booking = {
          date: date ? format(date, "yyyy-MM-dd") : "",
          time,
          visitType,
          name,
          phone,
          isWaitlistIntent: bookedTimes.includes(time),
          courseId: course?.id ?? "",
          courseName: course?.name ?? "",
          courseDurationMinutes: course?.duration_minutes ?? null,
          staffId: staff?.id ?? "",
          staffName: staff?.name ?? "",
          roomId: room?.id ?? "",
          roomName: room?.name ?? "",
        };
        sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(booking));
      } catch {}
      setRequiresQuestionnaire(true);
    } else if (r.duplicate === "sameday") {
      // 同じ日の重複 → ブロックして LINE へ誘導
      setDuplicateSameDay(true);
    } else if (r.duplicate === "otherday") {
      // 別の日の重複 → 確認後に再送信できるよう FormData を退避
      pendingFormData.current = formData;
      setDuplicateOtherDay(r.existingInfo || "別の日");
    } else {
      toast.error(result.error || "エラーが発生しました");
    }
  };

  // 「院に確認済み」として別日重複の予約を続行する
  const handleConfirmOtherDay = async () => {
    const fd = pendingFormData.current;
    if (!fd) return;
    fd.set("confirmedExisting", "true");
    setDuplicateOtherDay(null);
    setIsSubmitting(true);
    try {
      await runReservation(fd);
    } catch {
      toast.error("送信エラーが発生しました。しばらく経ってから再度お試しください");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white/10 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-2xl border border-white/20 text-center">
          <div className="mb-6 flex flex-col items-center gap-4">
            <ClinicWordmark sizeClassName="w-40 h-16" />
            <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/40">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-extrabold text-white mb-2">
            {isWaitingResult ? "キャンセル待ち受付完了" : "仮予約を受け付けました"}
          </h1>
          <p className="text-blue-200 text-sm mb-6">院長がLINEにて内容を確認後、予約確定のご連絡をいたします。</p>
          <div className="h-1 w-20 bg-emerald-500 mx-auto mb-6 rounded-full" />
          <div className="bg-white/5 border border-white/10 p-6 rounded-3xl mb-6 text-left space-y-3">
            <p className="text-white font-bold text-center mb-4 flex items-center justify-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-400" />
              LINEで予約を完了する
            </p>
            <p className="text-blue-100/70 text-sm text-center">以下のボタンから{CLINIC_CONFIG.nameShort}のLINEを友だち追加して、予約内容をお伝えください。</p>
            <a
              href={LINE_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex w-full items-center justify-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-5 px-4 rounded-2xl transition-all shadow-xl shadow-[#06C755]/20 gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              LINEで予約を確定する
            </a>
          </div>
          <Link href="/" className="text-blue-300 hover:text-white transition-colors text-sm font-medium inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            トップページへ戻る
          </Link>
        </div>

        {/* LINE未連携の方へ：下4桁送信で紐付けをお願いするポップアップ */}
        {showLineLinkPopup && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowLineLinkPopup(false)}
          >
            <div
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowLineLinkPopup(false)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
                aria-label="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="w-14 h-14 bg-[#06C755] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#06C755]/30">
                <MessageCircle className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-lg font-extrabold text-slate-800 mb-2">
                LINE連携のお願い
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                LINEと連携すると、次回からアンケート不要で<br />
                かんたんに予約できます。<br />
                {CLINIC_CONFIG.nameShort}のLINEを友だち追加し、<br />
                トークで<strong>電話番号の下4桁</strong>を送ってください。
              </p>

              {lineLinkPhone4 ? (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 mb-4">
                  <p className="text-[11px] text-slate-500 mb-1">LINEに送る番号</p>
                  <p className="text-3xl font-mono font-black tracking-[0.3em] text-slate-800">{lineLinkPhone4}</p>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 mb-4">
                  <p className="text-xs text-slate-600">ご登録のお電話番号の<strong>下4桁</strong>をトークで送ってください。</p>
                </div>
              )}

              <a
                href={LINE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-4 px-4 rounded-2xl transition-all shadow-lg shadow-[#06C755]/20 gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                LINEを開いて下4桁を送る
              </a>
              <button
                onClick={() => setShowLineLinkPopup(false)}
                className="mt-3 text-xs text-slate-400 hover:text-slate-600"
              >
                あとで連携する
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!date || !time) {
    return <ReserveLandingPage />;
  }

  // ── 進捗ステップの計算（「今どこ／終わってる・終わってない」を見せる） ──
  const dateDone = !!date && !!time;
  const menuDone = !!selectedCourseId;
  const customerDone = !!visitType && !!name.trim() && (visitType !== "new" || !!phone);
  const steps = reserveFlow === "menu_first"
    ? [
        { label: "メニュー", done: menuDone },
        { label: "日時", done: dateDone },
        { label: "お客様情報", done: customerDone },
        { label: "申し込み", done: false },
      ]
    : [
        { label: "日時", done: dateDone },
        { label: "お客様情報", done: customerDone },
        { label: "申し込み", done: false },
      ];
  // 「今いるステップ」= 最初の未完了。すべて完了なら最後（申し込み）を指す。
  const currentStepIndex = (() => {
    const i = steps.findIndex((s) => !s.done);
    return i === -1 ? steps.length - 1 : i;
  })();

  // 申し込みボタンの「あと何が足りないか」（日時はこの画面では必ず選択済み）
  const missingFields: string[] = [];
  if (!visitType) missingFields.push("初診・再診の選択");
  if (!name.trim()) missingFields.push("お名前");
  if (visitType === "new" && !phone) missingFields.push("電話番号");
  const canSubmit = missingFields.length === 0;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200" data-dark-page>
      <div className="relative max-w-4xl mx-auto py-12 px-4 md:px-8">
        <div className="flex flex-col items-center mb-12">
          <ClinicWordmark sizeClassName="w-56 h-24 mb-4" textClassName="text-2xl font-extrabold text-white text-center leading-tight" />
          {/* ボールのタグライン。他院に出さない（混入防止） */}
          {CLINIC_CONFIG.isDefaultClinic && (
            <p className="text-blue-200/50 text-xs tracking-widest uppercase">Body ALL care.</p>
          )}
        </div>

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-6">
            {/* 進捗ステップ：いま何ステップ目か・どこまで終わっているかを見せる */}
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 px-4 py-5 shadow-xl">
              <p className="text-blue-100/60 text-[11px] font-bold uppercase tracking-widest mb-4 text-center">
                ご予約の進みぐあい
              </p>
              <ol className="flex items-start justify-between">
                {steps.map((s, i) => {
                  // 各ステップは「自分が完了していれば緑✓」。今やる所（最初の未完了）だけ青。
                  const isDone = s.done;
                  const isCurrent = !s.done && i === currentStepIndex;
                  return (
                    <li key={s.label} className="flex items-center flex-1 last:flex-none">
                      <div className="flex flex-col items-center gap-1.5 shrink-0 w-16">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black border-2 transition-all ${
                            isDone
                              ? "bg-emerald-500 border-emerald-400 text-white"
                              : isCurrent
                                ? "bg-blue-600 border-blue-400 text-white ring-4 ring-blue-500/30"
                                : "bg-white/5 border-white/15 text-blue-100/40"
                          }`}
                        >
                          {isDone ? <CheckCircle2 className="w-5 h-5" /> : i + 1}
                        </div>
                        <span
                          className={`text-[11px] font-bold text-center leading-tight ${
                            isCurrent ? "text-white" : isDone ? "text-emerald-300" : "text-blue-100/40"
                          }`}
                        >
                          {s.label}
                        </span>
                      </div>
                      {i < steps.length - 1 && (
                        <div
                          className={`h-0.5 flex-1 -mt-5 rounded-full ${
                            s.done ? "bg-emerald-500" : "bg-white/10"
                          }`}
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-8 md:p-10 shadow-2xl">
              <form onSubmit={handleSubmit} className="flex flex-col gap-10">

                {/* menu_first モード時の案内 */}
                {reserveFlow === "menu_first" && (
                  <div className="order-0 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 text-sm text-emerald-100">
                    <p className="font-bold mb-1">📋 ご予約の流れ</p>
                    <p className="text-emerald-200/80 text-xs leading-relaxed">
                      ① まず「施術コース」をお選びください ② 続いて「スタッフ指名」（任意） ③ そのコース時間で空いている日時をご選択ください
                    </p>
                  </div>
                )}

                {/* 予約日時 */}
                <section className={`space-y-6 ${reserveFlow === "menu_first" ? "order-3" : "order-1"}`}>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    {reserveFlow === "menu_first" ? "③ ご希望の日時" : "ご希望の日時"}
                  </h2>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-blue-100/85 font-bold text-xs uppercase">予約日</Label>
                      <Popover>
                        <PopoverTrigger className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-4 text-left text-white flex items-center gap-3">
                          <CalendarIcon className="w-5 h-5 text-blue-400" />
                          {date ? format(date, "yyyy年MM月d日 (E)", { locale: ja }) : "日付を選択"}
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-slate-900 border-white/10 rounded-2xl overflow-hidden" align="start">
                          <Calendar
                            mode="single"
                            selected={date}
                            onSelect={setDate}
                            locale={ja}
                            className="bg-slate-900 text-white"
                            disabled={(date) => {
                              const dateStr = format(date, "yyyy-MM-dd");
                              const isHoliday = clinicHolidays.some(h => h.date === dateStr);
                              const day = date.getDay();
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              return isHoliday || date < today || day === 0 || day === 3 || !isDateWithinAllowedRange(date);
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-blue-100/85 font-bold text-xs uppercase">来院時間</Label>
                      <Select value={time} onValueChange={(val) => setTime(val || "")}>
                        <SelectTrigger className="w-full h-14 bg-slate-900 border-white/10 rounded-2xl px-4 text-white">
                          <SelectValue placeholder="時間を選択" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/10 text-white">
                          {(date ? getTimeSlots(date, { slotMinutes, schedule }) : []).map((t) => (
                            <SelectItem key={t} value={t} className="bg-slate-900 text-white focus:bg-slate-800">{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </section>

                {/* コース・指名選択 */}
                {courses.length > 0 && (
                  <section className={`space-y-4 ${reserveFlow === "menu_first" ? "order-1" : "order-2"}`}>
                    <h2 className="text-xl font-bold text-white tracking-tight">
                      {reserveFlow === "menu_first" ? "① 施術コース" : "施術コース"}
                    </h2>
                    <div className="grid gap-3">
                      {courses.map(course => {
                        const isSelected = selectedCourseId === course.id;
                        return (
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => setSelectedCourseId(isSelected ? "" : course.id)}
                            className={`w-full text-left p-4 rounded-2xl border transition-all ${
                              isSelected
                                ? "bg-blue-600 border-blue-500 text-white"
                                : "bg-white/5 border-white/10 text-blue-100/80 hover:bg-white/10"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-bold text-sm">{course.name}</p>
                                {course.description && (
                                  <p className={`text-xs mt-0.5 ${isSelected ? "text-blue-100" : "text-blue-100/80"}`}>
                                    {course.description}
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0 ml-4">
                                <span className={`text-sm font-bold ${isSelected ? "text-white" : "text-blue-300"}`}>
                                  {course.duration_minutes}分
                                </span>
                                {course.price != null && (
                                  <p className={`text-xs ${isSelected ? "text-blue-100" : "text-blue-100/80"}`}>
                                    ¥{course.price.toLocaleString()}
                                  </p>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* 指名選択 */}
                {staffList.length > 0 && (
                  <section className={`space-y-4 ${reserveFlow === "menu_first" ? "order-2" : "order-3"}`}>
                    <h2 className="text-xl font-bold text-white tracking-tight">
                      {reserveFlow === "menu_first" ? "② スタッフ指名" : "スタッフ指名"}
                      <span className="text-sm font-normal text-blue-100/80">（任意）</span>
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedStaffId("")}
                        className={`px-4 py-2.5 rounded-xl font-semibold text-sm border transition-all ${
                          selectedStaffId === ""
                            ? "bg-blue-600 border-blue-500 text-white"
                            : "bg-white/5 border-white/10 text-blue-100/85 hover:bg-white/10"
                        }`}
                      >
                        指名なし
                      </button>
                      {staffList.map(staff => (
                        <button
                          key={staff.id}
                          type="button"
                          onClick={() => setSelectedStaffId(staff.id)}
                          className={`px-4 py-2.5 rounded-xl font-semibold text-sm border transition-all ${
                            selectedStaffId === staff.id
                              ? "bg-blue-600 border-blue-500 text-white"
                              : "bg-white/5 border-white/10 text-blue-100/85 hover:bg-white/10"
                          }`}
                        >
                          {staff.name}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* 個室選択 */}
                {rooms.length > 0 && (
                  <section className="order-4 space-y-4">
                    <h2 className="text-xl font-bold text-white tracking-tight">ご希望のお部屋 <span className="text-sm font-normal text-blue-100/80">（任意）</span></h2>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRoomId("")}
                        className={`px-4 py-2.5 rounded-xl font-semibold text-sm border transition-all ${
                          selectedRoomId === ""
                            ? "bg-blue-600 border-blue-500 text-white"
                            : "bg-white/5 border-white/10 text-blue-100/85 hover:bg-white/10"
                        }`}
                      >
                        希望なし
                      </button>
                      {rooms.map(room => (
                        <button
                          key={room.id}
                          type="button"
                          onClick={() => setSelectedRoomId(room.id)}
                          className={`px-4 py-2.5 rounded-xl font-semibold text-sm border transition-all ${
                            selectedRoomId === room.id
                              ? "bg-blue-600 border-blue-500 text-white"
                              : "bg-white/5 border-white/10 text-blue-100/85 hover:bg-white/10"
                          }`}
                        >
                          {room.name}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* お客様情報 */}
                <section className="order-5 space-y-6">
                  <h2 className="text-xl font-bold text-white tracking-tight">お客様情報</h2>

                  {selectedFamilyMember && (
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-sm text-emerald-200">
                      🏥 <span className="font-bold">{selectedFamilyMember.display_name ?? selectedFamilyMember.name}</span> さんでご予約します
                      <Link href="/reserve" className="ml-2 text-emerald-300 underline text-xs">
                        切替え
                      </Link>
                    </div>
                  )}

                  {/* 初診・再診 */}
                  <div className="space-y-2">
                    <Label className="text-blue-100/85 font-bold text-xs uppercase">来院区分</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setVisitType("new")}
                        className={`h-14 rounded-2xl font-bold text-sm transition-all border ${visitType === "new" ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 border-white/10 text-blue-100/85 hover:bg-white/10"}`}
                      >
                        🆕 初診（初めて）
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisitType("return")}
                        className={`h-14 rounded-2xl font-bold text-sm transition-all border ${visitType === "return" ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 border-white/10 text-blue-100/85 hover:bg-white/10"}`}
                      >
                        🔄 再診（2回目以降）
                      </button>
                    </div>
                  </div>

                    <div className="space-y-2">
                      <Label className="text-blue-100/85 font-bold text-xs uppercase" htmlFor="name">お名前</Label>
                      <Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="山田 太郎" className="h-14 bg-slate-900 border-white/10 rounded-2xl text-white placeholder:text-white/50" />
                    </div>

                    {/* 再診：電話番号（任意）。同姓同名が複数いる場合のご本人特定に使用 */}
                    {visitType === "return" && (
                      <div className="space-y-2">
                        <Label className="text-blue-100/85 font-bold text-xs uppercase" htmlFor="phone-return">
                          電話番号 <span className="text-blue-100/60 font-normal normal-case">（任意）</span>
                        </Label>
                        <Input
                          id="phone-return"
                          name="phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="090-0000-0000"
                          className="h-14 bg-slate-900 border-white/10 rounded-2xl text-white placeholder:text-white/50"
                        />
                        <p className="text-xs text-blue-100/60 leading-relaxed">
                          同じお名前の方が複数いらっしゃる場合、
                          <br className="sm:hidden" />
                          ご本人確認のため電話番号のご入力をお願いします。
                        </p>
                      </div>
                    )}

                    {/* 初診のみ：電話番号・LINE */}
                    {visitType === "new" && (
                      <div className="space-y-4 p-6 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                        <p className="text-blue-300 text-sm font-bold">📋 初診の方は以下もご入力ください</p>
                        <div className="space-y-2">
                          <Label className="text-blue-100/85 font-bold text-xs uppercase" htmlFor="phone">電話番号</Label>
                          <Input
                            id="phone"
                            name="phone"
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            required
                            placeholder="090-0000-0000"
                            className="h-14 bg-slate-900 border-white/10 rounded-2xl text-white placeholder:text-white/50"
                          />
                        </div>
                      <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                        <input
                          type="checkbox"
                          id="lineRegistered"
                          checked={lineRegistered}
                          onChange={(e) => setLineRegistered(e.target.checked)}
                          className="w-5 h-5 accent-green-500"
                        />
                        <label htmlFor="lineRegistered" className="text-sm text-green-200 cursor-pointer">
                          {CLINIC_CONFIG.nameShort}のLINE公式アカウントを友だち追加済み
                        </label>
                      </div>
                      {!lineRegistered && (
                        <a
                          href={LINE_URL}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex w-full items-center justify-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-3 px-4 rounded-xl transition-all gap-2 text-sm"
                        >
                          <MessageCircle className="w-4 h-4" />
                          LINEを友だち追加する
                        </a>
                      )}
                    </div>
                  )}
                </section>

                <div className="order-6 bg-white/5 border border-white/10 p-5 rounded-2xl text-sm text-blue-100/85 space-y-1">
                  <p className="font-bold text-white text-sm">⚠️ これは「仮予約」です</p>
                  <p>下のボタンで仮予約を申し込めます。院長がLINEで内容を確認したあと、
                  「予約確定」のご連絡をして完了になります。</p>
                </div>

                {/* あと何が足りないか／そろったかを、ボタンの直前で必ず知らせる */}
                <div className="order-7 space-y-3">
                  {canSubmit ? (
                    <p className="text-center text-emerald-300 text-sm font-bold">
                      ✅ 入力がそろいました。下のボタンで仮予約を申し込めます
                    </p>
                  ) : (
                    <p className="text-center text-amber-300 text-sm font-bold">
                      あと <span className="text-white">{missingFields.join("、")}</span> を入力すると申し込めます
                    </p>
                  )}
                  <Button
                    type="submit"
                    disabled={!canSubmit || isSubmitting}
                    className="w-full h-20 text-xl font-black rounded-3xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
                  >
                    {isSubmitting ? "送信中..." : "この内容で仮予約を申し込む"}
                  </Button>
                </div>

                {requiresQuestionnaire && (
                  <div
                    ref={questionnaireBoxRef}
                    className="order-8 p-6 bg-amber-500/15 border-2 border-amber-400/50 rounded-3xl space-y-4 scroll-mt-24"
                  >
                    <p className="text-amber-200 font-black text-base flex items-center gap-2">
                      ⏳ まだ仮予約は完了していません
                    </p>
                    <p className="text-amber-100/90 text-sm leading-relaxed">
                      初めてオンライン予約をされる方は、
                      <span className="font-bold text-white">最初の1回だけ</span>
                      かんたんなアンケート登録が必要です（次回からは不要です）。
                    </p>
                    <div className="bg-white/10 border border-white/15 rounded-2xl p-4 text-sm text-amber-50/90 leading-relaxed">
                      いま選んでいただいた
                      <span className="font-bold text-white">日時・お名前・お電話はそのまま引き継ぎます。</span>
                      <br />
                      下のボタンから1分ほどのアンケートに答えていただくと、
                      <span className="font-bold text-white">選び直しなしで、そのまま仮予約が完了</span>します。
                    </div>
                    <Link
                      href="/questionnaire"
                      className="inline-flex w-full items-center justify-center bg-amber-500 hover:bg-amber-400 text-amber-950 font-black py-5 px-4 rounded-2xl transition-all gap-2 text-base shadow-lg shadow-amber-500/30"
                    >
                      📋 アンケートに答えて仮予約を完了する →
                    </Link>
                  </div>
                )}

                {/* 同じ日の重複予約 → ブロックして LINE へ誘導 */}
                {duplicateSameDay && (
                  <div className="order-8 p-5 bg-amber-500/10 border border-amber-500/40 rounded-2xl space-y-3">
                    <p className="text-amber-200 font-bold text-sm">
                      ⚠️ 選択された日には、すでにご予約をいただいております
                    </p>
                    <p className="text-amber-100/85 text-xs leading-relaxed">
                      お時間の変更や追加のご相談は、
                      <br />
                      LINEのメッセージよりお問い合わせください。
                    </p>
                    <a
                      href={LINE_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-full items-center justify-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-4 px-4 rounded-2xl transition-all gap-2 text-sm"
                    >
                      <MessageCircle className="w-4 h-4" />
                      LINEでお問い合わせする
                    </a>
                  </div>
                )}

                {/* 別の日の重複予約 → 院に確認済みなら続行 */}
                {duplicateOtherDay && (
                  <div className="order-8 p-5 bg-amber-500/10 border border-amber-500/40 rounded-2xl space-y-3">
                    <p className="text-amber-200 font-bold text-sm">
                      ⚠️ すでに別の日にご予約があります
                    </p>
                    <p className="text-amber-100/85 text-xs leading-relaxed">
                      既存のご予約：<span className="font-bold text-white">{duplicateOtherDay}</span>
                      <br />
                      お間違いでなければ、院に確認の上でこのままお進みください。
                      <br />
                      変更・キャンセルのご相談はLINEからもお問い合わせいただけます。
                    </p>
                    <button
                      type="button"
                      onClick={handleConfirmOtherDay}
                      disabled={isSubmitting}
                      className="inline-flex w-full items-center justify-center bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-4 rounded-2xl transition-all gap-2 text-sm disabled:opacity-40"
                    >
                      {isSubmitting ? "送信中..." : "院に確認済み・このまま予約する"}
                    </button>
                    <a
                      href={LINE_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-full items-center justify-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-3 px-4 rounded-2xl transition-all gap-2 text-sm"
                    >
                      <MessageCircle className="w-4 h-4" />
                      LINEで相談する
                    </a>
                  </div>
                )}
              </form>
            </div>
          </div>

          {/* サイドバー */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-8 shadow-2xl space-y-8">
              <ClinicWordmark sizeClassName="w-full h-16" />
              <div>
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  アクセス / 営業日
                </h3>
                <div className="space-y-3 text-sm text-blue-100/85">
                  {/* 営業時間・休診日は院ごと（DB clinic_settings 由来。ハードコード禁止） */}
                  {hoursLines.map((line, i) => (
                    <p key={i} className="border-b border-white/5 pb-2">{line}</p>
                  ))}
                  {hoursClosed && (
                    <p className="flex justify-between border-b border-white/5 pb-2"><span>休診</span><span className="text-rose-400 font-bold">{hoursClosed}</span></p>
                  )}
                  <p className="flex justify-between"><span>{CLINIC_CONFIG.nameShort}</span><span className="text-white">{CLINIC_CONFIG.address}</span></p>
                </div>
              </div>
              <div className="pt-6 border-t border-white/5">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-blue-400" />
                  お電話でのご予約
                </h3>
                <p className="text-2xl font-black text-white tracking-widest mb-1">{CLINIC_CONFIG.phone}</p>
                <p className="text-[10px] text-blue-100/75 uppercase tracking-widest">お気軽にお電話ください</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReservePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">読み込み中...</div>}>
      <ReserveContent />
    </Suspense>
  );
}
