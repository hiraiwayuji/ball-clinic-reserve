import { requireRole } from "@/app/actions/auth";
import { listActiveStaff, listOverrides } from "@/app/actions/staff-schedule";
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

  const [staffRes, overridesRes] = await Promise.all([
    listActiveStaff(),
    listOverrides({ startDate, endDate }),
  ]);

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      <header className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">スタッフ予定・予約ブロック</h1>
        <p className="text-sm text-slate-600 mt-1">
          ミーティング・研修・私用などで予約を取れないようにしたい時間帯を登録します。
          全スタッフが不在になる時間帯は患者LP の予約スロットから自動的に消えます。
        </p>
      </header>

      <StaffScheduleClient
        initialStaff={staffRes.staff ?? []}
        initialOverrides={overridesRes.rows ?? []}
        initialStartDate={startDate}
        initialEndDate={endDate}
      />
    </div>
  );
}
