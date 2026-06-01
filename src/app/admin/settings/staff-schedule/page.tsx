import { requireRole } from "@/app/actions/auth";
import { listActiveStaff, listOverrides, listWorkingHours, listTasks } from "@/app/actions/staff-schedule";
import { listShifts, listShiftLocations } from "@/app/actions/staff-shifts";
import StaffScheduleClient from "./StaffScheduleClient";

export const dynamic = "force-dynamic";

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 月曜始まりの週開始日 */
function getWeekStart(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

export default async function StaffSchedulePage() {
  // オーナーのみアクセス可
  await requireRole(["owner"]);

  // 既存タブ（スポット/タスク等）は今日〜28日後を範囲とする
  const today = new Date();
  const startDate = ymd(today);
  const endDate = ymd(new Date(today.getTime() + 28 * 24 * 60 * 60 * 1000));

  // シフト表は「今週」を初期表示
  const weekStart = getWeekStart(today);
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  const shiftStartDate = ymd(weekStart);
  const shiftEndDate = ymd(weekEnd);

  const [
    staffRes,
    overridesRes,
    workingHoursRes,
    tasksRes,
    shiftsRes,
    locationsRes,
  ] = await Promise.all([
    listActiveStaff(),
    listOverrides({ startDate, endDate }),
    listWorkingHours(),
    listTasks({ status: "all" }),
    listShifts({ startDate: shiftStartDate, endDate: shiftEndDate }),
    listShiftLocations(),
  ]);

  return (
    <div className="container mx-auto py-6 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">スタッフ予定・勤怠・タスク</h1>
        <p className="text-sm text-slate-600 mt-1">
          基本勤務時間・ミーティング等の単発予定・タスク管理を一画面でまとめて運用できます。
          全スタッフが不在になる時間帯は患者LP の予約スロットから自動的に消えます。
        </p>
      </header>

      <StaffScheduleClient
        initialStaff={staffRes.staff ?? []}
        initialOverrides={overridesRes.rows ?? []}
        initialWorkingHours={workingHoursRes.rows ?? []}
        initialTasks={tasksRes.rows ?? []}
        initialStartDate={startDate}
        initialEndDate={endDate}
        initialShifts={shiftsRes.rows ?? []}
        initialLocations={locationsRes.rows ?? []}
        initialShiftWeekStart={shiftStartDate}
      />
    </div>
  );
}
