"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { format, parseISO, isToday } from "date-fns";
import { ja } from "date-fns/locale";
import {
  completeAllActiveAppointments,
  getAppointmentsByDate,
  markAppointmentNoShow,
  updateCheckinStatus,
  toggleInsuranceChanged,
  type CheckinStatus,
  type IntakeChecklist,
} from "@/app/actions/adminReserve";
import { IntakeChecklistPanel } from "@/components/admin/IntakeChecklistPanel";
import { getMyStaffName } from "@/app/actions/auth";
import { getSalesPrediction, type SalesPrediction } from "@/app/actions/sales";
import { createClient } from "@/lib/supabase/client";
import { getMyClinicId } from "@/app/actions/auth";
import {
  Clock, User, RefreshCw, Loader2, CheckCircle2,
  Stethoscope, CreditCard, CalendarPlus, ArrowRight,
  Phone, MessageCircleMore, ChevronRight, Bot, ChevronDown, ChevronLeft,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { recordAction, COUNTER_DONE_KEY, SALES_PAGE_KEY } from "@/lib/next-action";
import { realtimeGuard } from "@/lib/realtime-guard";
import DailyCompletionCelebration from "@/components/admin/DailyCompletionCelebration";
import { AddAppointmentDialog } from "@/components/admin/AddAppointmentDialog";

type Appointment = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  checkin_status: CheckinStatus;
  is_first_visit: boolean;
  insurance_changed: boolean;
  intake_checklist: import("@/app/actions/adminReserve").IntakeChecklist | null;
  last_visit_days: number | null; // UI側で計算して付与
  memo: string | null;
  course_id: string | null;
  course_name: string | null;
  staff_id: string | null;
  staff_name: string | null;
  room_name: string | null;
  customers: { id: string; name: string; phone: string; line_user_id: string | null; medical_record_number: string | null; birth_date: string | null; city_name: string | null } | null;
};

// ステータス定義
const CHECKIN_STEPS: {
  value: CheckinStatus;
  label: string;
  shortLabel: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
}[] = [
  {
    value: null,
    label: "未来院",
    shortLabel: "未来院",
    color: "text-slate-500",
    bg: "bg-slate-50 dark:bg-slate-800/50",
    border: "border-slate-200 dark:border-slate-700",
    icon: <Clock className="w-4 h-4" />,
  },
  {
    value: "arrived",
    label: "来院済（待合）",
    shortLabel: "待合中",
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-900/30",
    border: "border-blue-300 dark:border-blue-700",
    icon: <User className="w-4 h-4" />,
  },
  {
    value: "in_treatment",
    label: "施術中",
    shortLabel: "施術中",
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    border: "border-emerald-300 dark:border-emerald-700",
    icon: <Stethoscope className="w-4 h-4" />,
  },
  {
    value: "done",
    label: "会計完了",
    shortLabel: "完了",
    color: "text-slate-500",
    bg: "bg-slate-50/50 dark:bg-slate-800/20",
    border: "border-slate-200 dark:border-slate-800",
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
];

// 予約日が患者の誕生日なら true（受付での声かけ用 🎂 バッジ）
function isBirthdayToday(apt: Appointment): boolean {
  const birthDate = apt.customers?.birth_date;
  if (!birthDate) return false;
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return false;
  const d = parseISO(apt.start_time);
  return b.getMonth() === d.getMonth() && b.getDate() === d.getDate();
}

function getStep(status: CheckinStatus) {
  return CHECKIN_STEPS.find(s => s.value === status) ?? CHECKIN_STEPS[0];
}

function nextStatus(current: CheckinStatus): CheckinStatus {
  const idx = CHECKIN_STEPS.findIndex(s => s.value === current);
  if (idx < 0 || idx >= CHECKIN_STEPS.length - 1) return null;
  return CHECKIN_STEPS[idx + 1].value;
}

// ── カードコンポーネント ────────────────────────────────────────────

function AppointmentCard({
  apt,
  onStatusChange,
  onRemove,
  staffName,
  onIntakeUpdate,
  onRefresh,
}: {
  apt: Appointment;
  onStatusChange: (id: string, status: CheckinStatus) => void;
  onRemove: (id: string) => void;
  staffName: string;
  onIntakeUpdate: (id: string, checklist: IntakeChecklist) => void;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [justDone, setJustDone] = useState(false);
  const [showSecretaryTip, setShowSecretaryTip] = useState(false);
  const [prediction, setPrediction] = useState<SalesPrediction | null>(null);
  // 「次回予約」ボタンで AddAppointmentDialog を開くための state
  const [nextReserveOpen, setNextReserveOpen] = useState(false);
  const step = getStep(apt.checkin_status);
  const next = nextStatus(apt.checkin_status);
  const nextStep = next !== null ? getStep(next) : null;

  const buildSalesUrl = useCallback(() => {
    const params = new URLSearchParams();
    params.set("name", apt.customers?.name ?? "");
    params.set("first_visit", String(apt.is_first_visit));
    params.set("apt_id", apt.id);
    if (apt.customers?.id) params.set("customer_id", apt.customers.id);
    if (apt.course_id) params.set("course_id", apt.course_id);
    if (apt.staff_id) params.set("staff_id", apt.staff_id);
    if (apt.staff_name) params.set("staff_name", apt.staff_name);
    if (apt.course_name) params.set("course", apt.course_name);
    try {
      const t = new Date(apt.start_time);
      const hh = t.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", hour12: false }).padStart(2, "0");
      const mm = t.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", minute: "2-digit" }).padStart(2, "0");
      params.set("next_time", `${hh}:${mm}`);
    } catch {}
    if (prediction) {
      params.set("predicted_amount", String(prediction.predictedAmount));
      params.set("predicted_memo", prediction.predictedMemo);
      params.set("ai_message", prediction.aiMessage);
      params.set("confidence", String(prediction.confidence));
    }
    return `/admin/sales?${params.toString()}`;
  }, [apt, prediction]);

  // 「未来院」状態から一発で会計画面（売上記帳ページ）まで進めるショートカット
  const handleQuickToCheckout = () => {
    startTransition(async () => {
      const res = await updateCheckinStatus(apt.id, "done");
      if (!res.success) {
        toast.error(res.error ?? "更新に失敗しました");
        return;
      }
      onStatusChange(apt.id, "done");
      recordAction(COUNTER_DONE_KEY, SALES_PAGE_KEY);
      toast.success(`${apt.customers?.name ?? "患者"}様を会計へ進めました`);
      router.push(buildSalesUrl());
    });
  };

  const time = format(parseISO(apt.start_time), "HH:mm");
  const endTime = format(parseISO(apt.end_time), "HH:mm");
  const isDone = apt.checkin_status === "done";

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (justDone) {
      // 予測を非同期で取得
      const name = apt.customers?.name ?? "";
      if (name && !apt.is_first_visit) {
        getSalesPrediction(name).then(setPrediction);
      }
      timer = setTimeout(() => {
        setShowSecretaryTip(true);
      }, 2500);
    }
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justDone]);

  const handleAdvance = () => {
    if (!nextStep) return;
    startTransition(async () => {
      const res = await updateCheckinStatus(apt.id, next);
      if (res.success) {
        onStatusChange(apt.id, next);
        toast.success(`${apt.customers?.name ?? "患者"}様を「${nextStep.label}」に更新しました`);
        if (next === "done") {
          recordAction(COUNTER_DONE_KEY, SALES_PAGE_KEY);
          setJustDone(true);
        }
      } else {
        toast.error(res.error ?? "更新に失敗しました");
      }
    });
  };

  const handleStatusChange = (targetStatus: CheckinStatus) => {
    startTransition(async () => {
      const res = await updateCheckinStatus(apt.id, targetStatus);
      if (res.success) {
        onStatusChange(apt.id, targetStatus);
        toast.success(`ステータスを「${getStep(targetStatus).label}」に変更しました`);
        if (targetStatus === "done" && apt.checkin_status !== "done") {
          recordAction(COUNTER_DONE_KEY, SALES_PAGE_KEY);
          setJustDone(true);
        }
      } else {
        toast.error(res.error ?? "更新に失敗しました");
      }
    });
  };

  const handleNoShow = () => {
    const patientName = apt.customers?.name ?? "この患者";
    if (!confirm(`${patientName}様を「来院なし」として受付一覧から外しますか？`)) return;

    startTransition(async () => {
      const res = await markAppointmentNoShow(apt.id);
      if (res.success) {
        onRemove(apt.id);
        toast.success(`${patientName}様を来院なしとして受付から外しました`);
      } else {
        toast.error(res.error ?? "更新に失敗しました");
      }
    });
  };

  return (
    <div
      className={[
        "rounded-2xl border-2 p-4 transition-all duration-200",
        step.bg,
        step.border,
        isDone && !justDone ? "opacity-60" : "",
      ].join(" ")}
    >
      {/* 上段：時間・患者名・ステータス */}
      <div className="flex items-start gap-3">
        {/* 時間 */}
        <div className="shrink-0 text-center min-w-[52px]">
          <div className="text-xl font-black text-slate-900 dark:text-slate-100 leading-none">{time}</div>
          <div className="text-xs text-slate-500 mt-0.5">〜{endTime}</div>
        </div>

        {/* 患者情報 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
              {apt.customers?.name ?? "—"}
            </span>
            {apt.customers?.medical_record_number && (
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-600 tabular-nums">
                No.{apt.customers.medical_record_number}
              </span>
            )}
            {apt.is_first_visit && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500 text-white uppercase tracking-wide">初診</span>
            )}
            {isBirthdayToday(apt) && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-pink-500 text-white">🎂 誕生日</span>
            )}
            {apt.course_name && (
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-700/50">
                {apt.course_name}
              </span>
            )}
            {apt.staff_name && (
              <span className="text-xs text-slate-500 dark:text-slate-400">担当: {apt.staff_name}</span>
            )}
            {apt.room_name && (
              <span className="text-xs text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-700/50">
                {apt.room_name}
              </span>
            )}
          </div>
          {apt.customers?.phone && (
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              <Phone className="w-3 h-3" />{apt.customers.phone}
            </div>
          )}
          {apt.memo && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{apt.memo}</p>
          )}
        </div>

        {/* 現在ステータスバッジ */}
        <div className={`shrink-0 flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${step.color}`}>
          {step.icon}
          <span className="hidden sm:inline">{step.shortLabel}</span>
        </div>
      </div>

      {/* 初診・保険証変更・長期未来院チェックリスト */}
      {(() => {
        const isLongAbsence = (apt.last_visit_days ?? 0) > 90 && !apt.is_first_visit;
        const trigger =
          apt.is_first_visit       ? "first_visit" as const :
          apt.insurance_changed    ? "insurance_changed" as const :
          isLongAbsence            ? "long_absence" as const : null;

        const showInsuranceBtn = !apt.is_first_visit && !isLongAbsence;

        return (
          <div className="mt-2 space-y-1">
            {/* 保険証変更ボタン（初診・長期未来院以外に表示） */}
            {showInsuranceBtn && (
              <button
                type="button"
                onClick={async () => {
                  const next = !apt.insurance_changed;
                  const res = await toggleInsuranceChanged(apt.id, next);
                  if (res.success) {
                    onRefresh();
                  } else {
                    toast.error(res.error ?? "更新に失敗しました");
                  }
                }}
                className={[
                  "flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all",
                  apt.insurance_changed
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-white text-amber-600 border-amber-300 hover:bg-amber-50",
                ].join(" ")}
              >
                🪪 {apt.insurance_changed ? "保険証変更あり（解除）" : "保険証変更あり"}
              </button>
            )}

            {/* チェックリストパネル */}
            {trigger && (
              <IntakeChecklistPanel
                appointmentId={apt.id}
                initialChecklist={apt.intake_checklist}
                staffName={staffName}
                trigger={trigger}
              />
            )}
          </div>
        );
      })()}

      {/* 下段：アクションボタン */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {/* ステータス変更ドロップダウン */}
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : step.icon}
            <span className="hidden sm:inline">{step.label}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {CHECKIN_STEPS.map((s) => (
              <DropdownMenuItem
                key={s.value === null ? "null" : s.value}
                disabled={isPending || s.value === apt.checkin_status}
                onClick={() => handleStatusChange(s.value)}
                className={`gap-2 cursor-pointer ${s.value === apt.checkin_status ? "bg-slate-100 dark:bg-slate-800" : ""}`}
              >
                <div className={`flex items-center gap-2 ${s.color}`}>
                  {s.icon}
                  <span className="font-medium">{s.label}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 「会計完了へ」ボタンは削除し、会計フロー（売上保存）に統合。
            arrived/in_treatment の遷移はそのまま nextStep ボタンで進める。 */}
        {nextStep && nextStep.value !== "done" && (
          <button
            type="button"
            onClick={handleAdvance}
            disabled={isPending}
            className={[
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95",
              nextStep.value === "arrived" ? "bg-blue-600 hover:bg-blue-700 text-white" :
              nextStep.value === "in_treatment" ? "bg-emerald-600 hover:bg-emerald-700 text-white" :
              "bg-slate-200 hover:bg-slate-300 text-slate-700",
              isPending ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
          >
            {isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : nextStep.icon}
            {nextStep.label}へ
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}

        {!isDone && (
          <button
            type="button"
            onClick={handleNoShow}
            disabled={isPending}
            className="ml-auto px-3 py-2 rounded-xl text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "来院なし"}
          </button>
        )}

        {/* 未来院から会計まで一発ジャンプ（checkin_status を done に更新しつつ /admin/sales へ） */}
        {apt.checkin_status === null && (
          <button
            type="button"
            onClick={handleQuickToCheckout}
            disabled={isPending}
            title="来院から会計まで一発で進めます（待合・施術中をスキップ）"
            className={[
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white",
              "bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600",
              "shadow-md active:scale-95 transition-all",
              isPending ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            <span>⭐ 受付→会計</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}

        {/* 会計登録へリンク（名前・初診フラグ・予測データをクエリパラメータで渡す） */}
        {(apt.checkin_status === "in_treatment" || apt.checkin_status === "arrived" || apt.checkin_status === "done") && (
          <div className="relative">
            <Link
              href={buildSalesUrl()}
              onClick={() => recordAction(COUNTER_DONE_KEY, SALES_PAGE_KEY)}
              className={[
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all",
                justDone
                  ? "bg-indigo-600 text-white font-bold shadow-lg animate-glow-pulse"
                  : "text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700",
              ].join(" ")}
            >
              <CreditCard className={["w-3.5 h-3.5", justDone ? "animate-bounce" : ""].join(" ")} />
              {justDone ? "売上入力へ ✨" : "会計"}
            </Link>

            {/* AI秘書ツールチップ（予測あり／なしで内容を切り替え） */}
            {showSecretaryTip && (
              <div
                className="absolute bottom-full left-0 mb-2 w-64 z-20 [animation:var(--animate-secretary-pop)]"
                onMouseEnter={() => setShowSecretaryTip(true)}
              >
                <div className="absolute -bottom-1.5 left-4 w-3 h-3 bg-indigo-950 rotate-45 border-b border-r border-indigo-700" />
                <div className="bg-indigo-950 border border-indigo-700 rounded-xl px-3 py-2.5 shadow-xl">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 bg-violet-500 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-violet-400 uppercase tracking-wider leading-none mb-1">AI秘書</p>
                      {prediction ? (
                        <>
                          <p className="text-xs text-indigo-100 leading-snug font-medium mb-2">
                            {prediction.aiMessage}
                          </p>
                          <div className="bg-indigo-900/60 rounded-lg px-2.5 py-1.5 mb-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-indigo-300">予測金額</span>
                              <span className="text-xs font-black text-white">¥{prediction.predictedAmount.toLocaleString()}</span>
                            </div>
                            {prediction.predictedMemo && (
                              <div className="flex items-center justify-between mt-0.5">
                                <span className="text-[10px] text-indigo-300">備考</span>
                                <span className="text-[10px] text-indigo-200 truncate max-w-[100px]">{prediction.predictedMemo}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-[10px] text-indigo-300">確度</span>
                              <span className="text-[10px] text-emerald-400 font-bold">{prediction.confidence}%</span>
                            </div>
                          </div>
                          {prediction.warning && (
                            <p className="text-[10px] text-amber-400 leading-snug">⚠ {prediction.warning}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-indigo-100 leading-snug font-medium">
                          売上入力はお済みですか？<br />
                          <span className="text-indigo-300">{apt.customers?.name ?? "この方"}様の履歴から金額を自動入力できます。</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSecretaryTip(false)}
                    className="mt-2 w-full text-[10px] text-indigo-400 hover:text-indigo-200 text-right"
                  >
                    ✕ 閉じる
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 次回予約ボタン — どのステータスでも常に押せる（会計の有無に関係なく） */}
        <button
          type="button"
          onClick={() => setNextReserveOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-indigo-600 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
          title="次回予約を入れる（同じコース・担当でプリセット）"
        >
          <CalendarPlus className="w-3.5 h-3.5" />
          次回予約
        </button>

      </div>

      {/* 次回予約ダイアログ — その予約の course_id/staff_id/時刻をプリセット */}
      {nextReserveOpen && (
        <AddAppointmentDialog
          open={nextReserveOpen}
          onOpenChange={setNextReserveOpen}
          defaultName={apt.customers?.name ?? undefined}
          defaultCourseId={apt.course_id ?? undefined}
          defaultStaffId={apt.staff_id ?? undefined}
          defaultTime={(() => {
            try {
              const t = new Date(apt.start_time);
              const hh = t.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", hour12: false }).padStart(2, "0");
              const mm = t.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", minute: "2-digit" }).padStart(2, "0");
              return `${hh}:${mm}`;
            } catch { return undefined; }
          })()}
          hideTrigger
          onSuccess={() => {
            toast.success("次回予約を登録しました");
            setNextReserveOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── メインページ ────────────────────────────────────────────────────

export default function CounterPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [targetDate, setTargetDate] = useState<Date>(new Date());
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [staffName, setStaffName] = useState<string>("スタッフ");
  const [isClosingDay, startClosingDayTransition] = useTransition();

  const isViewingToday = isToday(targetDate);

  // 統計（同一患者の複数メニューは1人としてカウント）
  const STATUS_ORDER: (CheckinStatus | null)[] = [null, "arrived", "in_treatment", "done"];
  const patientGroups = new Map<string, typeof appointments>();
  for (const apt of appointments) {
    const key = apt.customers?.id ?? `name:${apt.customers?.name ?? apt.id}`;
    if (!patientGroups.has(key)) patientGroups.set(key, []);
    patientGroups.get(key)!.push(apt);
  }
  const stats = { total: patientGroups.size, waiting: 0, arrived: 0, inTreatment: 0, done: 0 };
  for (const apts of patientGroups.values()) {
    // 全施術が完了して初めて「完了」扱い。1つでも前のステータスがあればそちらを優先
    const minStatus = apts.reduce<CheckinStatus | null>((worst, a) => {
      const wi = STATUS_ORDER.indexOf(worst);
      const ai = STATUS_ORDER.indexOf(a.checkin_status);
      return ai < wi ? a.checkin_status : worst;
    }, "done");
    if (minStatus === null) stats.waiting++;
    else if (minStatus === "arrived") stats.arrived++;
    else if (minStatus === "in_treatment") stats.inTreatment++;
    else stats.done++;
  }

  const allDone = stats.total > 0 && stats.done === stats.total;
  const [celebrationShown, setCelebrationShown] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    if (allDone && !celebrationShown) {
      const timer = setTimeout(() => {
        setShowCelebration(true);
        setCelebrationShown(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [allDone, celebrationShown]);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    const dateStr = format(targetDate, "yyyy-MM-dd");
    const res = await getAppointmentsByDate(dateStr);
    if (res.success) setAppointments(res.data as unknown as Appointment[]);
    setLoading(false);
  }, [targetDate]);

  useEffect(() => {
    setCurrentTime(new Date());
    getMyClinicId().then(setClinicId);
    getMyStaffName().then(setStaffName);
    fetchAppointments();

    // 時計更新
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, [fetchAppointments]);

  // Supabase Realtime でリアルタイム更新
  useEffect(() => {
    if (!clinicId) return;
    const supabase = createClient();
    const channel = supabase
      .channel("counter-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        realtimeGuard(fetchAppointments),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clinicId, fetchAppointments]);

  // ローカルステータス更新（楽観的UI）
  const handleStatusChange = useCallback((id: string, status: CheckinStatus) => {
    setAppointments(prev =>
      prev.map(a => a.id === id ? { ...a, checkin_status: status } : a)
    );
  }, []);

  const handleRemoveAppointment = useCallback((id: string) => {
    setAppointments(prev => prev.filter(a => a.id !== id));
  }, []);

  // セクション分け：未完了 / 完了
  const activeApts = appointments.filter(a => a.checkin_status !== "done");
  const doneApts = appointments.filter(a => a.checkin_status === "done");
  const hasActiveAppointments = activeApts.length > 0;
  const canSuggestClosing = hasActiveAppointments && doneApts.length > 0;

  const handleCloseDay = () => {
    if (!hasActiveAppointments) return;
    const targetIds = activeApts.map(a => a.id);
    if (!confirm(`残り${targetIds.length}名を会計完了にして、一括入力へ進みますか？`)) return;

    startClosingDayTransition(async () => {
      const res = await completeAllActiveAppointments(targetIds);
      if (res.success) {
        setAppointments(prev =>
          prev.map(a => targetIds.includes(a.id) ? { ...a, checkin_status: "done" } : a)
        );
        toast.success(`残り${res.updatedCount ?? targetIds.length}名を会計完了にしました`);
        router.push(`/admin/sales/bulk?date=${format(targetDate, "yyyy-MM-dd")}`);
      } else {
        toast.error(res.error ?? "一括更新に失敗しました");
      }
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">
            受付カウンター
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setTargetDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1))}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </button>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300 min-w-[130px] text-center">
              {format(targetDate, "yyyy年M月d日（E）", { locale: ja })}
            </p>
            <button
              onClick={() => setTargetDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1))}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </button>
            <button
              onClick={() => setTargetDate(new Date())}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 transition-colors ml-1"
            >
              今日
            </button>
            {currentTime && (
              <span className="ml-3 font-mono text-sm font-bold text-slate-500 dark:text-slate-400">
                {format(currentTime, "HH:mm:ss")}
              </span>
            )}
          </div>
        </div>

        {/* クイックアクション */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/admin/appointments"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            <CalendarPlus className="w-4 h-4" />
            予約追加
          </Link>
          <Link
            href="/admin/sales"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
          >
            <CreditCard className="w-4 h-4" />
            売上記帳
          </Link>
          <Link
            href={`/admin/sales/bulk?date=${format(targetDate, "yyyy-MM-dd")}`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors shadow-sm"
          >
            <MessageCircleMore className="w-4 h-4" />
            一括入力
          </Link>
          {hasActiveAppointments && (
            <Button
              type="button"
              onClick={handleCloseDay}
              disabled={isClosingDay}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm"
            >
              {isClosingDay ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              本日の施術はすべて終了
            </Button>
          )}
          <button
            type="button"
            onClick={fetchAppointments}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 統計バー */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: isViewingToday ? "本日合計" : `${format(targetDate, "M/d", { locale: ja })} の予約`, value: stats.total, color: "text-slate-700 dark:text-slate-200", bg: "bg-white dark:bg-slate-800" },
          { label: "待合中", value: stats.arrived, color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-900/30" },
          { label: "施術中", value: stats.inTreatment, color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
          { label: "完了", value: stats.done, color: "text-slate-500 dark:text-slate-400", bg: "bg-slate-50 dark:bg-slate-800/50" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl border border-slate-200 dark:border-white/10 p-4 text-center shadow-sm`}>
            <div className={`text-3xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {canSuggestClosing && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/80 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                一日の終わりなら、残りの患者様をまとめて会計完了にできます
              </p>
              <p className="text-sm text-indigo-600/90 dark:text-indigo-200/80 mt-1">
                残り{activeApts.length}名を会計完了にして、そのまま一括売上入力へ進めます。来院されなかった方は先に「来院なし」で外してください。
              </p>
            </div>
            <Button
              type="button"
              onClick={handleCloseDay}
              disabled={isClosingDay}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {isClosingDay ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              全員を会計完了にして一括入力
            </Button>
          </div>
        </div>
      )}

      {/* 予約リスト */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          読み込み中...
        </div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-16 text-slate-500 bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/10">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">予約はありません</p>
          <Link href="/admin/appointments" className="mt-3 inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600">
            予約を追加する <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* アクティブな予約 */}
          {activeApts.length > 0 && (
            <div className="space-y-3">
              {activeApts.map(apt => (
                <AppointmentCard
                  key={apt.id}
                  apt={apt}
                  onStatusChange={handleStatusChange}
                  onRemove={handleRemoveAppointment}
                  staffName={staffName}
                  onIntakeUpdate={(id, cl) => setAppointments(prev => prev.map(a => a.id === id ? { ...a, intake_checklist: cl } : a))}
                  onRefresh={fetchAppointments}
                />
              ))}
            </div>
          )}

          {/* 完了済み */}
          {doneApts.length > 0 && (
            <details className="group" open={doneApts.length > 0 && activeApts.length === 0}>
              <summary className="cursor-pointer flex items-center gap-2 text-sm font-bold text-slate-500 select-none list-none py-2">
                <CheckCircle2 className="w-4 h-4 text-slate-500" />
                会計完了（{doneApts.length}名）
                <span className="text-xs font-normal text-slate-500 ml-1 group-open:hidden">▶ 展開</span>
                <span className="text-xs font-normal text-slate-500 ml-1 hidden group-open:inline">▼ 折りたたむ</span>
              </summary>
              <div className="mt-2 space-y-2">
                {doneApts.map(apt => (
                  <AppointmentCard
                    key={apt.id}
                    apt={apt}
                    onStatusChange={handleStatusChange}
                    onRemove={handleRemoveAppointment}
                    staffName={staffName}
                    onIntakeUpdate={(id, cl) => setAppointments(prev => prev.map(a => a.id === id ? { ...a, intake_checklist: cl } : a))}
                    onRefresh={fetchAppointments}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ステータスフロー説明 */}
      <div className="bg-white/50 dark:bg-slate-900/30 rounded-xl border border-slate-100 dark:border-white/5 p-4">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">ステータスフロー</p>
        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 dark:text-slate-400">
          {CHECKIN_STEPS.map((s, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />}
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${s.bg} ${s.color} border ${s.border}`}>
                {s.icon}{s.label}
              </span>
            </span>
          ))}
        </div>
      </div>

      {showCelebration && (
        <DailyCompletionCelebration
          totalCount={stats.total}
          onClose={() => setShowCelebration(false)}
        />
      )}
    </div>
  );
}
