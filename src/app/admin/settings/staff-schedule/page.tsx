import { requireRole } from "@/app/actions/auth";
import { listActiveStaff, listOverrides, listWorkingHours } from "@/app/actions/staff-schedule";
import StaffScheduleClient from "./StaffScheduleClient";

export const dynamic = "force-dynamic";

export default async function StaffSchedulePage() {
  // owner/admin のみアクセス可
  await requireRole(["owner", "admin"]);

  // 今日から28日後までを初期表示
  const today = new Date();
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const startDate = ymd(today);
  const endDate = ymd(new Date(today.getTime() + 28 * 24 * 60 * 60 * 1000));

  const [staffRes, overridesRes, workingHoursRes] = await Promise.all([
    listActiveStaff(),
    listOverrides({ startDate, endDate }),
    listWorkingHours(),
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
        initialStartDate={startDate}
        initialEndDate={endDate}
      />
    </div>
  );
}
