"use client";

import { useState } from "react";
import {
  type StaffOption,
  type StaffOverrideRow,
  type WorkingHourRow,
  type StaffTaskRow,
} from "@/app/actions/staff-schedule";
import SpotScheduleTab from "./tabs/SpotScheduleTab";
import WorkingHoursTab from "./tabs/WorkingHoursTab";
import TasksTab from "./tabs/TasksTab";
import ImportTab from "./tabs/ImportTab";
import { CalendarClock, Clock, ListTodo, Upload } from "lucide-react";

type TabKey = "spot" | "working-hours" | "tasks" | "import";

const TABS: { key: TabKey; label: string; icon: typeof CalendarClock }[] = [
  { key: "spot", label: "スポット予定", icon: CalendarClock },
  { key: "working-hours", label: "基本勤務時間", icon: Clock },
  { key: "tasks", label: "タスク管理", icon: ListTodo },
  { key: "import", label: "インポート", icon: Upload },
];

type Props = {
  initialStaff: StaffOption[];
  initialOverrides: StaffOverrideRow[];
  initialWorkingHours: WorkingHourRow[];
  initialTasks: StaffTaskRow[];
  initialStartDate: string;
  initialEndDate: string;
};

export default function StaffScheduleClient({
  initialStaff,
  initialOverrides,
  initialWorkingHours,
  initialTasks,
  initialStartDate,
  initialEndDate,
}: Props) {
  const [tab, setTab] = useState<TabKey>("spot");

  return (
    <div className="space-y-5">
      {/* タブナビゲーション */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                active
                  ? "shrink-0 flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-indigo-700 border-b-2 border-indigo-600 -mb-px"
                  : "shrink-0 flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-800 border-b-2 border-transparent -mb-px"
              }
              aria-current={active ? "page" : undefined}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* タブ中身 */}
      {tab === "spot" && (
        <SpotScheduleTab
          staff={initialStaff}
          initialOverrides={initialOverrides}
          startDate={initialStartDate}
          endDate={initialEndDate}
        />
      )}
      {tab === "working-hours" && (
        <WorkingHoursTab staff={initialStaff} initialRows={initialWorkingHours} />
      )}
      {tab === "tasks" && <TasksTab staff={initialStaff} initialRows={initialTasks} />}
      {tab === "import" && <ImportTab />}
    </div>
  );
}
