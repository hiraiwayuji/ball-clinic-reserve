"use client";

import React, { useState, useMemo } from "react";
import {
  CalendarDays,
  Home,
  Users,
  DoorOpen,
  Bed,
  Trophy,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Rocket,
  X,
  CheckCircle2,
  MapPin,
  Clock,
  Phone,
  MessageCircle,
} from "lucide-react";
import {
  KARADA_CLINIC,
  KARADA_STAFF,
  KARADA_COURSES,
  KARADA_ROOMS,
  KARADA_DEMO_APPOINTMENTS,
  KARADA_TIME_SLOTS,
  KARADA_VISIT_SLOTS,
  formatMin,
  type DemoAppointment,
  type Staff,
} from "@/lib/karada-demo-data";

type ViewMode = "schedule" | "visit" | "rooms";

export default function KaradaDemoPage() {
  const [view, setView] = useState<ViewMode>("schedule");
  const [selectedAppointment, setSelectedAppointment] = useState<DemoAppointment | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);

  const courseById = useMemo(() => {
    const map = new Map<string, (typeof KARADA_COURSES)[number]>();
    KARADA_COURSES.forEach((c) => map.set(c.id, c));
    return map;
  }, []);

  const staffById = useMemo(() => {
    const map = new Map<string, Staff>();
    KARADA_STAFF.forEach((s) => map.set(s.id, s));
    return map;
  }, []);

  const clinicAppointments = KARADA_DEMO_APPOINTMENTS.filter((a) => a.type === "clinic");
  const visitAppointments = KARADA_DEMO_APPOINTMENTS.filter((a) => a.type === "visit");

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Header onStartClick={() => setShowStartModal(true)} />

      <ViewTabs view={view} setView={setView} />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 pb-24">
        {view === "schedule" && (
          <ScheduleView
            appointments={clinicAppointments}
            staffById={staffById}
            courseById={courseById}
            onSelect={setSelectedAppointment}
          />
        )}
        {view === "visit" && (
          <VisitView
            appointments={visitAppointments}
            staffById={staffById}
            courseById={courseById}
            onSelect={setSelectedAppointment}
          />
        )}
        {view === "rooms" && <RoomsView appointments={clinicAppointments} courseById={courseById} staffById={staffById} />}
      </div>

      {selectedAppointment && (
        <AppointmentDialog
          appointment={selectedAppointment}
          staffById={staffById}
          courseById={courseById}
          onClose={() => setSelectedAppointment(null)}
        />
      )}

      {showStartModal && <StartLiveModal onClose={() => setShowStartModal(false)} />}
    </div>
  );
}

function Header({ onStartClick }: { onStartClick: () => void }) {
  return (
    <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 backdrop-blur-md bg-white/90 dark:bg-slate-900/90">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 text-[10px] font-bold border border-amber-200 dark:border-amber-900">
              DEMO
            </span>
            <h1 className="text-sm sm:text-base font-bold truncate">{KARADA_CLINIC.name}</h1>
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {KARADA_CLINIC.address} ／ {KARADA_CLINIC.phone}
          </div>
        </div>
        <button
          onClick={onStartClick}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold shadow-sm active:scale-95 transition"
        >
          <Rocket className="w-3.5 h-3.5" />
          このまま本番スタート
        </button>
      </div>
    </div>
  );
}

function ViewTabs({ view, setView }: { view: ViewMode; setView: (v: ViewMode) => void }) {
  const tabs: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: "schedule", label: "スタッフ別 1日カレンダー", icon: <CalendarDays className="w-3.5 h-3.5" /> },
    { key: "visit", label: "訪問治療カレンダー", icon: <Home className="w-3.5 h-3.5" /> },
    { key: "rooms", label: "個室・大部屋ベッド稼働", icon: <Bed className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 flex gap-1 overflow-x-auto scrollbar-hide">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={
              "flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-3 text-xs sm:text-sm font-medium border-b-2 transition " +
              (view === t.key
                ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")
            }
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StaffLegend({ staffById }: { staffById: Map<string, Staff> }) {
  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {KARADA_STAFF.map((s) => (
        <div
          key={s.id}
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${s.bgColor} ${s.borderColor}`}
        >
          <span className={`w-2 h-2 rounded-full ${s.borderColor.replace("border-", "bg-")}`} />
          <span className={`text-[11px] font-bold ${s.color}`}>{s.name}</span>
          <span className="text-[10px] text-slate-500">／ {s.title.split(" / ")[0]}</span>
        </div>
      ))}
    </div>
  );
}

function ScheduleView({
  appointments,
  staffById,
  courseById,
  onSelect,
}: {
  appointments: DemoAppointment[];
  staffById: Map<string, Staff>;
  courseById: Map<string, (typeof KARADA_COURSES)[number]>;
  onSelect: (a: DemoAppointment) => void;
}) {
  const clinicStaff = KARADA_STAFF.filter((s) => s.role !== "visit");

  return (
    <div>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-3">
        <h2 className="text-base font-bold mb-1 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-blue-600" />
          本日のスケジュール
        </h2>
        <p className="text-[11px] text-slate-500">
          スタッフごとに色分け表示。タップで予約詳細が見られます。
        </p>
        <div className="mt-3">
          <StaffLegend staffById={staffById} />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="grid" style={{ gridTemplateColumns: `60px repeat(${clinicStaff.length}, minmax(140px, 1fr))`, minWidth: 60 + clinicStaff.length * 140 }}>
            <div className="bg-slate-50 dark:bg-slate-900/80 border-b border-r border-slate-200 dark:border-slate-800 p-2 text-[10px] font-bold text-slate-500 sticky left-0 z-10">
              時間
            </div>
            {clinicStaff.map((s) => (
              <div
                key={s.id}
                className={`border-b border-l border-slate-200 dark:border-slate-800 p-2 text-center ${s.bgColor}`}
              >
                <div className={`text-xs font-bold ${s.color}`}>{s.name}</div>
                <div className="text-[10px] text-slate-500">{s.title.split(" / ")[0]}</div>
              </div>
            ))}

            {KARADA_TIME_SLOTS.map((slot) => (
              <React.Fragment key={slot}>
                <div className="bg-slate-50 dark:bg-slate-900/80 border-b border-r border-slate-200 dark:border-slate-800 p-2 text-[10px] font-mono text-slate-500 sticky left-0 z-10">
                  {formatMin(slot)}
                </div>
                {clinicStaff.map((s) => {
                  const appt = appointments.find(
                    (a) => a.staffId === s.id && a.startMin === slot
                  );
                  const isSpanned = appointments.some(
                    (a) => a.staffId === s.id && a.startMin < slot && a.startMin + a.durationMin > slot
                  );

                  return (
                    <div
                      key={`${slot}-${s.id}`}
                      className={`border-b border-l border-slate-200 dark:border-slate-800 p-1 min-h-[44px] relative ${
                        isSpanned ? "bg-slate-100/50 dark:bg-slate-900/40" : ""
                      }`}
                    >
                      {appt && (
                        <button
                          onClick={() => onSelect(appt)}
                          className={`w-full text-left rounded-md border-l-4 ${s.borderColor} ${s.bgColor} p-1.5 hover:shadow-md active:scale-[0.98] transition`}
                          style={{
                            minHeight: (appt.durationMin / 30) * 44 - 4,
                          }}
                        >
                          <div className={`text-[11px] font-bold truncate ${s.color}`}>
                            {appt.customerName}
                            {appt.isFirstVisit && (
                              <span className="ml-1 text-[9px] bg-rose-500 text-white px-1 rounded">初</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-600 dark:text-slate-300 truncate">
                            {courseById.get(appt.courseId)?.name}
                          </div>
                          {appt.athlete && (
                            <div className="text-[9px] text-amber-700 dark:text-amber-300 flex items-center gap-0.5">
                              <Trophy className="w-2.5 h-2.5" />
                              {appt.athlete.sport}
                            </div>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {clinicStaff.map((s) => {
          const count = appointments.filter((a) => a.staffId === s.id).length;
          return (
            <div key={s.id} className={`rounded-lg p-3 border ${s.bgColor} ${s.borderColor}`}>
              <div className={`text-[10px] font-bold ${s.color}`}>{s.name}</div>
              <div className="text-2xl font-black mt-1">{count}</div>
              <div className="text-[10px] text-slate-500">本日の予約件数</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VisitView({
  appointments,
  staffById,
  courseById,
  onSelect,
}: {
  appointments: DemoAppointment[];
  staffById: Map<string, Staff>;
  courseById: Map<string, (typeof KARADA_COURSES)[number]>;
  onSelect: (a: DemoAppointment) => void;
}) {
  const shimada = staffById.get("shimada")!;

  return (
    <div>
      <div className={`rounded-xl border ${shimada.borderColor} ${shimada.bgColor} p-4 mb-3`}>
        <h2 className={`text-base font-bold mb-1 flex items-center gap-2 ${shimada.color}`}>
          <Home className="w-4 h-4" />
          訪問治療スケジュール
        </h2>
        <p className="text-[11px] text-slate-700 dark:text-slate-300">
          {shimada.name}（{shimada.title}）の訪問専用カレンダー（10:00〜16:00）
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          {shimada.qualifications.map((q) => (
            <span key={q} className="px-1.5 py-0.5 rounded bg-white/60 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700">
              {q}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="grid" style={{ gridTemplateColumns: "70px 1fr" }}>
          <div className="bg-slate-50 dark:bg-slate-900/80 border-b border-r border-slate-200 dark:border-slate-800 p-2 text-[10px] font-bold text-slate-500">
            時間
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border-b border-l border-slate-200 dark:border-slate-800 p-2 text-center">
            <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">訪問治療レーン</div>
          </div>

          {KARADA_VISIT_SLOTS.map((slot) => {
            const appt = appointments.find((a) => a.startMin === slot);
            const isSpanned = appointments.some(
              (a) => a.startMin < slot && a.startMin + a.durationMin > slot
            );

            return (
              <React.Fragment key={slot}>
                <div className="bg-slate-50 dark:bg-slate-900/80 border-b border-r border-slate-200 dark:border-slate-800 p-2 text-[10px] font-mono text-slate-500">
                  {formatMin(slot)}
                </div>
                <div
                  className={`border-b border-l border-slate-200 dark:border-slate-800 p-1 min-h-[60px] relative ${
                    isSpanned ? "bg-emerald-50/40 dark:bg-emerald-950/10" : ""
                  }`}
                >
                  {appt && (
                    <button
                      onClick={() => onSelect(appt)}
                      className={`w-full text-left rounded-lg border-l-4 ${shimada.borderColor} ${shimada.bgColor} p-2 hover:shadow-md active:scale-[0.98] transition`}
                      style={{ minHeight: (appt.durationMin / 30) * 60 - 4 }}
                    >
                      <div className={`text-sm font-bold flex items-center gap-1 ${shimada.color}`}>
                        <Home className="w-3.5 h-3.5" />
                        {appt.customerName}
                      </div>
                      <div className="text-[11px] text-slate-700 dark:text-slate-300 mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {appt.visitAddress}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {courseById.get(appt.courseId)?.name}（{appt.durationMin}分）
                      </div>
                    </button>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="mt-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-900 p-4">
        <div className="text-xs font-bold text-blue-900 dark:text-blue-200 mb-2 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" />
          このカレンダーでできること
        </div>
        <ul className="space-y-1 text-[11px] text-blue-800 dark:text-blue-300">
          <li>● 通常診療と訪問を別レーンで管理（移動時間の事故予約を防止）</li>
          <li>● 訪問先住所・施術内容を履歴で蓄積</li>
          <li>● 「次回いつ伺います」をご家族のLINEへ自動配信</li>
          <li>● 健康保険適用ぶんを自動集計</li>
        </ul>
      </div>
    </div>
  );
}

function RoomsView({
  appointments,
  courseById,
  staffById,
}: {
  appointments: DemoAppointment[];
  courseById: Map<string, (typeof KARADA_COURSES)[number]>;
  staffById: Map<string, Staff>;
}) {
  const totalSlots = KARADA_TIME_SLOTS.length;

  return (
    <div>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-3">
        <h2 className="text-base font-bold mb-1 flex items-center gap-2">
          <Bed className="w-4 h-4 text-cyan-600" />
          個室・大部屋ベッド稼働状況
        </h2>
        <p className="text-[11px] text-slate-500">
          個室1室と大部屋4ベッドの本日稼働状況
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        {KARADA_ROOMS.map((room) => {
          const used = appointments.filter((a) => a.roomId === room.id).length;
          const usagePct = Math.round((used / totalSlots) * 100);
          const Icon = room.type === "private" ? DoorOpen : Bed;
          const tone =
            room.type === "private"
              ? "bg-violet-100 dark:bg-violet-950/40 border-violet-300 dark:border-violet-900 text-violet-800 dark:text-violet-200"
              : "bg-cyan-100 dark:bg-cyan-950/40 border-cyan-300 dark:border-cyan-900 text-cyan-800 dark:text-cyan-200";

          return (
            <div key={room.id} className={`rounded-xl border p-4 ${tone}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  <div className="font-bold text-sm">{room.name}</div>
                </div>
                <div className="text-xs font-mono">{usagePct}%</div>
              </div>
              <div className="h-2 bg-white/60 dark:bg-slate-900/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-current opacity-80 rounded-full transition-all"
                  style={{ width: `${usagePct}%` }}
                />
              </div>
              <div className="mt-2 text-[10px] opacity-80">
                {used} / {totalSlots} スロット使用中
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
        <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
          <Users className="w-4 h-4" />
          ベッド別タイムライン
        </h3>
        <div className="space-y-2">
          {KARADA_ROOMS.map((room) => {
            const list = appointments
              .filter((a) => a.roomId === room.id)
              .sort((a, b) => a.startMin - b.startMin);
            return (
              <div key={room.id} className="border border-slate-200 dark:border-slate-800 rounded-lg p-2">
                <div className="text-xs font-bold mb-1.5">{room.name}</div>
                {list.length === 0 ? (
                  <div className="text-[11px] text-slate-400">本日予約なし</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((a) => {
                      const staff = staffById.get(a.staffId)!;
                      return (
                        <span
                          key={a.id}
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${staff.bgColor} ${staff.borderColor} ${staff.color}`}
                        >
                          {formatMin(a.startMin)} {a.customerName} ／ {courseById.get(a.courseId)?.name}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AppointmentDialog({
  appointment,
  staffById,
  courseById,
  onClose,
}: {
  appointment: DemoAppointment;
  staffById: Map<string, Staff>;
  courseById: Map<string, (typeof KARADA_COURSES)[number]>;
  onClose: () => void;
}) {
  const staff = staffById.get(appointment.staffId)!;
  const course = courseById.get(appointment.courseId)!;
  const room = KARADA_ROOMS.find((r) => r.id === appointment.roomId);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] text-slate-500">{formatMin(appointment.startMin)} 〜 {formatMin(appointment.startMin + appointment.durationMin)}（{appointment.durationMin}分）</div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              {appointment.customerName}
              {appointment.isFirstVisit && (
                <span className="text-[10px] bg-rose-500 text-white px-1.5 py-0.5 rounded-full">初診</span>
              )}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <Row label="施術">{course.name}（{course.category}）</Row>
          <Row label="担当">
            <span className={`px-2 py-0.5 rounded ${staff.bgColor} ${staff.color} text-xs font-bold border ${staff.borderColor}`}>
              {staff.name}
            </span>
            <span className="text-[11px] text-slate-500 ml-2">{staff.title}</span>
          </Row>
          {room && <Row label="場所">{room.name}</Row>}
          {appointment.visitAddress && (
            <Row label="訪問先">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {appointment.visitAddress}
              </span>
            </Row>
          )}
          {appointment.athlete && (
            <Row label="競技">
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                <Trophy className="w-3 h-3" />
                {appointment.athlete.sport}
                {appointment.athlete.team && ` ／ ${appointment.athlete.team}`}
              </span>
            </Row>
          )}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex gap-2">
          <button className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-bold transition">
            <MessageCircle className="w-3.5 h-3.5" />
            LINEで連絡
          </button>
          <button className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold transition">
            <Phone className="w-3.5 h-3.5" />
            電話
          </button>
        </div>
        <p className="text-[10px] text-center text-slate-400">
          ※ デモ画面のため、ボタンは実際には送信されません
        </p>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-[11px] font-bold text-slate-500 w-14 flex-shrink-0 pt-0.5">{label}</div>
      <div className="flex-1 text-sm">{children}</div>
    </div>
  );
}

function StartLiveModal({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<"intro" | "ready">("intro");

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-base">このまま本番スタート</h3>
              <p className="text-[11px] text-slate-500">体験用の設定をそのまま運用に</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {stage === "intro" && (
          <>
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-xs leading-relaxed text-blue-900 dark:text-blue-200">
              この体験画面で見ていただいた構成（スタッフ4名・施術コース・個室+ベッド4台・訪問治療レーン）を、
              そのまま <b>{KARADA_CLINIC.name}</b> の本番運用設定として書き出すことができます。
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-bold text-slate-700 dark:text-slate-300">セットアップ済みの内容</div>
              <ul className="space-y-1">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>院情報（{KARADA_CLINIC.name} / {KARADA_CLINIC.phone}）</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>スタッフ {KARADA_STAFF.length}名（藤川先生・島田先生・大橋先生・河原さん）</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>施術コース {KARADA_COURSES.length}種類（鍼灸・整体・マッサージ・テーピング・訪問治療など）</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>場所設定 {KARADA_ROOMS.length}つ（個室1・大部屋ベッド4）</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>営業時間 {KARADA_CLINIC.hoursWeekday}・休診日 {KARADA_CLINIC.closedDays.join("/")}</span>
                </li>
              </ul>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-bold"
              >
                体験に戻る
              </button>
              <button
                onClick={() => setStage("ready")}
                className="flex-1 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5"
              >
                <Rocket className="w-3.5 h-3.5" />
                本番スタートへ
              </button>
            </div>
          </>
        )}

        {stage === "ready" && (
          <>
            <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-4 text-sm leading-relaxed text-emerald-900 dark:text-emerald-200 space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                準備が整いました
              </div>
              <p className="text-xs">
                体験用に作った設定は、{KARADA_CLINIC.name} 専用の Supabase / Vercel 環境を立ち上げる際に
                <b>初期データとしてそのまま読み込まれます</b>。
                電話番号・LINEアカウント・領収書テンプレなどの院固有情報を最後にご記入いただくだけで、
                本日のご予約から運用開始できます。
              </p>
            </div>

            <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
              <div className="font-bold">本番化の流れ（最短2時間）</div>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Supabase アカウントの作成（5分）</li>
                <li>LINE 公式アカウントの作成 or 既存連携（20分）</li>
                <li>Vercel デプロイ＆ドメイン設定（30分）</li>
                <li>本デモのスタッフ・コースをそのままインポート（自動）</li>
                <li>過去の顧客データを CSV インポート（任意）</li>
              </ol>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-[11px] text-slate-600 dark:text-slate-300">
              この体験画面でセットアップ済みの設定は、自動的に保存されています。
              本格稼働が決まりましたらボール接骨院 平岩までご一報ください。
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStage("intro")}
                className="flex-1 px-3 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-bold inline-flex items-center justify-center gap-1.5"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                戻る
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-3 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold"
              >
                了解しました
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
