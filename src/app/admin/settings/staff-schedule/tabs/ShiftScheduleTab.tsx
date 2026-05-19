"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  listShifts,
  createShift,
  updateShift,
  deleteShift,
  copyShifts,
  listShiftLocations,
  upsertShiftLocation,
  deactivateShiftLocation,
  updateStaffColor,
  type StaffShiftRow,
  type ShiftLocationRow,
  type ShiftTaskType,
  type ShiftStatus,
} from "@/app/actions/staff-shifts";
import { STAFF_COLOR_PRESETS, type StaffColorKey } from "@/lib/staff-colors";
import { type StaffOption } from "@/app/actions/staff-schedule";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  Palette,
  Copy,
  X,
  Trash2,
  AlertCircle,
  Plus,
  Calendar,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────
// 定数・ユーティリティ
// ─────────────────────────────────────────────────────────────────

// 時間軸: 9:00 〜 20:00、30分刻み (= 23 スロット)
const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 9; h <= 19; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  slots.push("20:00");
  return slots;
})();

const SLOT_COUNT = TIME_SLOTS.length; // 23

const TASK_SYMBOL: Record<NonNullable<ShiftTaskType>, string> = {
  hanamaru: "●",
  toko: "★",
  break: "▶",
};

const TASK_LABEL: Record<NonNullable<ShiftTaskType>, string> = {
  hanamaru: "（はなまる）",
  toko: "（とこ）",
  break: "（休憩）",
};

const DAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

/** 月曜始まりの週開始日に丸める */
function getWeekStart(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** "09:30" → スロットインデックス（9:00=0, 9:30=1, ...） */
function timeToSlotIndex(t: string): number {
  return TIME_SLOTS.indexOf(t);
}

/** "09:30" を 30 分単位に正規化（範囲外なら clamp） */
function snapTimeToSlot(t: string): string {
  if (TIME_SLOTS.includes(t)) return t;
  // "12:15" のような中途半端は 30 分単位に丸める
  const m = t.match(/^(\d{2}):(\d{2})$/);
  if (!m) return TIME_SLOTS[0];
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10) < 30 ? 0 : 30;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** 色キー → HEX（プリセット内なら HEX、そうでなければそのまま、null なら null） */
function resolveColor(c: string | null | undefined): string | null {
  if (!c) return null;
  if (c in STAFF_COLOR_PRESETS) {
    return STAFF_COLOR_PRESETS[c as StaffColorKey];
  }
  return c;
}

// ─────────────────────────────────────────────────────────────────
// Props / メインコンポーネント
// ─────────────────────────────────────────────────────────────────

type Props = {
  staff: StaffOption[];
  initialShifts: StaffShiftRow[];
  initialLocations: ShiftLocationRow[];
  initialWeekStart: string;        // YYYY-MM-DD
};

type EditModalState =
  | { mode: "create"; date: string; locationId: string; startTime: string; endTime: string }
  | { mode: "edit"; shift: StaffShiftRow }
  | null;

export default function ShiftScheduleTab({
  staff,
  initialShifts,
  initialLocations,
  initialWeekStart,
}: Props) {
  const [weekStart, setWeekStart] = useState<Date>(parseYmd(initialWeekStart));
  const [shifts, setShifts] = useState<StaffShiftRow[]>(initialShifts);
  const [locations, setLocations] = useState<ShiftLocationRow[]>(initialLocations);
  const [staffList, setStaffList] = useState<StaffOption[]>(staff);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editModal, setEditModal] = useState<EditModalState>(null);
  const [showLocationSettings, setShowLocationSettings] = useState(false);
  const [showColorSettings, setShowColorSettings] = useState(false);

  const activeLocations = useMemo(
    () => locations.filter((l) => l.is_active),
    [locations],
  );

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const startDateStr = ymd(weekStart);
  const endDateStr = ymd(addDays(weekStart, 6));

  // 週切替時にデータ取得
  async function refresh() {
    const r = await listShifts({ startDate: startDateStr, endDate: endDateStr });
    if (r.success) {
      setShifts(r.rows ?? []);
      setError(null);
    } else {
      setError(r.error ?? "シフトの取得に失敗しました");
    }
  }

  useEffect(() => {
    startTransition(() => {
      refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDateStr, endDateStr]);

  function handlePrevWeek() {
    setWeekStart((w) => addDays(w, -7));
  }
  function handleNextWeek() {
    setWeekStart((w) => addDays(w, 7));
  }
  function handleThisWeek() {
    setWeekStart(getWeekStart(new Date()));
  }

  async function handleCopyPrevWeek() {
    const prevStart = addDays(weekStart, -7);
    const prevEnd = addDays(weekStart, -1);
    if (!confirm(`先週 (${prevStart.getMonth() + 1}/${prevStart.getDate()}〜${prevEnd.getMonth() + 1}/${prevEnd.getDate()}) のシフトを今週にコピーします。よろしいですか？`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await copyShifts({
        sourceStartDate: ymd(prevStart),
        sourceEndDate: ymd(prevEnd),
        destStartDate: startDateStr,
      });
      if (!r.success) {
        setError(r.error ?? "コピーに失敗しました");
        return;
      }
      await refresh();
    });
  }

  // 日付 × 場所 でシフトをグループ化
  const shiftsByDayLocation = useMemo(() => {
    const map = new Map<string, StaffShiftRow[]>();
    for (const s of shifts) {
      const key = `${s.date}|${s.location_id}`;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return map;
  }, [shifts]);

  return (
    <div className="space-y-4">
      {/* ヘッダー: 週ナビ + 設定ボタン */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevWeek}
              className="p-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              aria-label="前週"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-sm font-bold text-slate-900 tabular-nums min-w-[140px] text-center">
              {weekStart.getFullYear()}/{weekStart.getMonth() + 1}/{weekStart.getDate()}
              {" 〜 "}
              {addDays(weekStart, 6).getMonth() + 1}/{addDays(weekStart, 6).getDate()}
            </div>
            <button
              type="button"
              onClick={handleNextWeek}
              className="p-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              aria-label="次週"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleThisWeek}
              className="ml-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              今週
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopyPrevWeek}
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              title="先週のシフトを今週にコピー"
            >
              <Copy className="w-3.5 h-3.5" />
              先週をコピー
            </button>
            <button
              type="button"
              onClick={() => setShowLocationSettings(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              <Settings className="w-3.5 h-3.5" />
              場所設定
            </button>
            <button
              type="button"
              onClick={() => setShowColorSettings(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              <Palette className="w-3.5 h-3.5" />
              スタッフ色
            </button>
          </div>
        </div>

      </section>

      {error && (
        <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 場所未登録の場合のオンボーディング */}
      {activeLocations.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
          <div className="font-bold mb-1">⚠ 場所マスタが未登録です</div>
          <div className="text-xs mb-2">
            シフト表を使うには、まず「鍼灸院」「はなまる」などの場所を登録してください。
          </div>
          <Button size="sm" onClick={() => setShowLocationSettings(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            場所を追加
          </Button>
        </div>
      )}

      {/* シフトグリッド */}
      {activeLocations.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
          <ShiftGrid
            weekDates={weekDates}
            locations={activeLocations}
            shiftsByDayLocation={shiftsByDayLocation}
            onShiftClick={(shift) => setEditModal({ mode: "edit", shift })}
            onEmptyClick={(date, locationId) =>
              setEditModal({
                mode: "create",
                date,
                locationId,
                startTime: "10:00",
                endTime: "13:00",
              })
            }
          />
        </section>
      )}

      {/* 編集モーダル */}
      {editModal && (
        <ShiftEditModal
          state={editModal}
          staff={staffList}
          locations={activeLocations}
          pending={pending}
          onClose={() => setEditModal(null)}
          onSave={async (input) => {
            setError(null);
            return new Promise<boolean>((resolve) => {
              startTransition(async () => {
                if (editModal.mode === "edit") {
                  const r = await updateShift(editModal.shift.id, input);
                  if (!r.success) {
                    setError(r.error ?? "更新に失敗");
                    resolve(false);
                    return;
                  }
                } else {
                  const r = await createShift({
                    staff_id: input.staff_id!,
                    location_id: input.location_id!,
                    date: input.date!,
                    start_time: input.start_time!,
                    end_time: input.end_time!,
                    task_type: input.task_type ?? null,
                    note: input.note ?? null,
                  });
                  if (!r.success) {
                    setError(r.error ?? "作成に失敗");
                    resolve(false);
                    return;
                  }
                }
                await refresh();
                resolve(true);
              });
            });
          }}
          onDelete={
            editModal.mode === "edit"
              ? async () => {
                  if (!confirm("このシフトを削除しますか？")) return false;
                  setError(null);
                  return new Promise<boolean>((resolve) => {
                    startTransition(async () => {
                      const r = await deleteShift(editModal.shift.id);
                      if (!r.success) {
                        setError(r.error ?? "削除に失敗");
                        resolve(false);
                        return;
                      }
                      await refresh();
                      resolve(true);
                    });
                  });
                }
              : undefined
          }
        />
      )}

      {/* 場所設定モーダル */}
      {showLocationSettings && (
        <LocationSettingsModal
          locations={locations}
          pending={pending}
          onClose={() => setShowLocationSettings(false)}
          onUpsert={async (input) => {
            setError(null);
            return new Promise<boolean>((resolve) => {
              startTransition(async () => {
                const r = await upsertShiftLocation(input);
                if (!r.success) {
                  setError(r.error ?? "保存に失敗");
                  resolve(false);
                  return;
                }
                const ll = await listShiftLocations();
                if (ll.success) setLocations(ll.rows ?? []);
                resolve(true);
              });
            });
          }}
          onDeactivate={async (id) => {
            if (!confirm("この場所を無効化しますか？\n（過去のシフトは残ります）")) return false;
            setError(null);
            return new Promise<boolean>((resolve) => {
              startTransition(async () => {
                const r = await deactivateShiftLocation(id);
                if (!r.success) {
                  setError(r.error ?? "無効化に失敗");
                  resolve(false);
                  return;
                }
                const ll = await listShiftLocations();
                if (ll.success) setLocations(ll.rows ?? []);
                resolve(true);
              });
            });
          }}
        />
      )}

      {/* スタッフ色設定モーダル */}
      {showColorSettings && (
        <StaffColorSettingsModal
          staff={staffList}
          pending={pending}
          onClose={() => setShowColorSettings(false)}
          onUpdate={async (staffId, color) => {
            setError(null);
            return new Promise<boolean>((resolve) => {
              startTransition(async () => {
                const r = await updateStaffColor(staffId, color);
                if (!r.success) {
                  setError(r.error ?? "更新に失敗");
                  resolve(false);
                  return;
                }
                // staff の color をクライアントでも更新
                setStaffList((ss) =>
                  ss.map((s) => (s.id === staffId ? { ...s, display_color: color } : s)),
                );
                await refresh();
                resolve(true);
              });
            });
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ShiftGrid: シフト本体のグリッド表示
// ─────────────────────────────────────────────────────────────────

function ShiftGrid({
  weekDates,
  locations,
  shiftsByDayLocation,
  onShiftClick,
  onEmptyClick,
}: {
  weekDates: Date[];
  locations: ShiftLocationRow[];
  shiftsByDayLocation: Map<string, StaffShiftRow[]>;
  onShiftClick: (shift: StaffShiftRow) => void;
  onEmptyClick: (date: string, locationId: string) => void;
}) {
  // 横軸の幅
  const SLOT_WIDTH = 36;    // 1スロット = 30分 = 36px
  const DATE_COL_WIDTH = 60;
  const LOC_COL_WIDTH = 80;
  const ROW_HEIGHT = 36;

  // total width
  const totalWidth = DATE_COL_WIDTH + LOC_COL_WIDTH + SLOT_WIDTH * SLOT_COUNT;

  return (
    <div style={{ minWidth: `${totalWidth}px` }}>
      {/* ヘッダー行: 時間軸 */}
      <div
        className="flex border-b-2 border-slate-300 bg-slate-50 sticky top-0 z-10"
        style={{ height: `${ROW_HEIGHT}px` }}
      >
        <div
          className="shrink-0 border-r border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600"
          style={{ width: `${DATE_COL_WIDTH}px` }}
        >
          日付
        </div>
        <div
          className="shrink-0 border-r border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600"
          style={{ width: `${LOC_COL_WIDTH}px` }}
        >
          場所
        </div>
        {TIME_SLOTS.map((t, i) => (
          <div
            key={t}
            className={
              i % 2 === 0
                ? "shrink-0 border-r border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700 tabular-nums"
                : "shrink-0 border-r border-slate-100 flex items-center justify-center text-[10px] text-slate-400 tabular-nums"
            }
            style={{ width: `${SLOT_WIDTH}px` }}
          >
            {i % 2 === 0 ? t : ""}
          </div>
        ))}
      </div>

      {/* データ行: 各日付 × 各場所 */}
      {weekDates.map((date, dayIdx) => {
        const dateStr = ymd(date);
        const dayOfWeek = date.getDay();
        const dayLabel = DAY_LABEL[dayOfWeek];
        const dayColor =
          dayOfWeek === 0 ? "text-rose-600" : dayOfWeek === 6 ? "text-sky-600" : "text-slate-800";

        return locations.map((loc, locIdx) => {
          const key = `${dateStr}|${loc.id}`;
          const shiftsHere = shiftsByDayLocation.get(key) ?? [];
          const isFirstLocation = locIdx === 0;
          const isLastLocation = locIdx === locations.length - 1;

          return (
            <div
              key={`${dateStr}-${loc.id}`}
              className={
                isLastLocation
                  ? "flex border-b-2 border-slate-200 relative"
                  : "flex border-b border-slate-100 relative"
              }
              style={{ height: `${ROW_HEIGHT}px` }}
            >
              {/* 日付列（最初の場所行にだけ表示、rowspan 的に） */}
              <div
                className={
                  isFirstLocation
                    ? `shrink-0 border-r border-slate-200 flex flex-col items-center justify-center text-xs font-bold ${dayColor} bg-slate-50/50`
                    : "shrink-0 border-r border-slate-200 bg-slate-50/30"
                }
                style={{ width: `${DATE_COL_WIDTH}px` }}
              >
                {isFirstLocation && (
                  <>
                    <span className="text-[10px] leading-none">{date.getMonth() + 1}/{date.getDate()}</span>
                    <span className="text-[11px] leading-tight">{dayLabel}</span>
                  </>
                )}
              </div>

              {/* 場所列 */}
              <div
                className="shrink-0 border-r border-slate-200 flex items-center justify-center text-[11px] text-slate-700 bg-slate-50/30 px-1 truncate"
                style={{ width: `${LOC_COL_WIDTH}px` }}
                title={loc.name}
              >
                {loc.name}
              </div>

              {/* タイムライン (空きセル + シフトブロック absolute) */}
              <div
                className="relative shrink-0"
                style={{ width: `${SLOT_WIDTH * SLOT_COUNT}px`, height: `${ROW_HEIGHT}px` }}
              >
                {/* 空きセル（クリック領域、グリッド線） */}
                <div className="absolute inset-0 flex">
                  {TIME_SLOTS.slice(0, -1).map((t, i) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onEmptyClick(dateStr, loc.id)}
                      className={
                        i % 2 === 0
                          ? "shrink-0 border-r border-slate-200 hover:bg-indigo-50/40 transition-colors"
                          : "shrink-0 border-r border-slate-100 hover:bg-indigo-50/40 transition-colors"
                      }
                      style={{ width: `${SLOT_WIDTH}px`, height: "100%" }}
                      aria-label={`${dateStr} ${loc.name} ${t} 新規追加`}
                    />
                  ))}
                </div>

                {/* シフトブロック */}
                {shiftsHere.map((s) => {
                  const startIdx = timeToSlotIndex(s.start_time);
                  const endIdx = timeToSlotIndex(s.end_time);
                  if (startIdx < 0) return null;

                  const slotSpan = Math.max(1, (endIdx >= 0 ? endIdx : SLOT_COUNT) - startIdx);
                  const left = startIdx * SLOT_WIDTH;
                  const width = slotSpan * SLOT_WIDTH;
                  const color = resolveColor(s.staff_color) ?? "#94A3B8"; // gray-400 fallback
                  const isDraft = s.status === "draft";

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShiftClick(s);
                      }}
                      className="absolute top-1 bottom-1 rounded text-white text-[10px] font-bold flex items-center px-1.5 shadow-sm hover:shadow-md hover:brightness-110 transition-all overflow-hidden"
                      style={{
                        left: `${left}px`,
                        width: `${width - 2}px`,
                        backgroundColor: color,
                        opacity: isDraft ? 0.65 : 1,
                        border: isDraft ? "1.5px dashed white" : "none",
                      }}
                      title={`${s.staff_name ?? "(?)"}${s.task_type ? TASK_LABEL[s.task_type] : ""} ${s.start_time}-${s.end_time}`}
                    >
                      <span className="truncate flex-1 text-left">
                        {s.staff_name ?? "?"}
                        {s.task_type && <span className="ml-0.5">{TASK_SYMBOL[s.task_type]}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        });
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ShiftEditModal: シフトの新規作成 / 編集
// ─────────────────────────────────────────────────────────────────

type ShiftEditPatch = {
  staff_id?: string;
  location_id?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  task_type?: ShiftTaskType;
  note?: string | null;
};

function ShiftEditModal({
  state,
  staff,
  locations,
  pending,
  onClose,
  onSave,
  onDelete,
}: {
  state: NonNullable<EditModalState>;
  staff: StaffOption[];
  locations: ShiftLocationRow[];
  pending: boolean;
  onClose: () => void;
  onSave: (patch: ShiftEditPatch) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
}) {
  const isCreate = state.mode === "create";

  const initial = useMemo(() => {
    if (state.mode === "create") {
      return {
        staff_id: staff[0]?.id ?? "",
        location_id: state.locationId,
        date: state.date,
        start_time: state.startTime,
        end_time: state.endTime,
        task_type: null as ShiftTaskType,
        note: "",
      };
    }
    return {
      staff_id: state.shift.staff_id,
      location_id: state.shift.location_id,
      date: state.shift.date,
      start_time: state.shift.start_time,
      end_time: state.shift.end_time,
      task_type: state.shift.task_type,
      note: state.shift.note ?? "",
    };
  }, [state, staff]);

  const [staffId, setStaffId] = useState(initial.staff_id);
  const [locationId, setLocationId] = useState(initial.location_id);
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.start_time);
  const [endTime, setEndTime] = useState(initial.end_time);
  const [taskType, setTaskType] = useState<ShiftTaskType>(initial.task_type);
  const [note, setNote] = useState(initial.note);

  async function handleSave() {
    const ok = await onSave({
      staff_id: staffId,
      location_id: locationId,
      date,
      start_time: snapTimeToSlot(startTime),
      end_time: snapTimeToSlot(endTime),
      task_type: taskType,
      note: note.trim() || null,
    });
    if (ok) onClose();
  }

  async function handleDelete() {
    if (!onDelete) return;
    const ok = await onDelete();
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            {isCreate ? "シフト追加" : "シフト編集"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">スタッフ</label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">場所</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">日付</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">開始時刻</label>
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white tabular-nums"
              >
                {TIME_SLOTS.slice(0, -1).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">終了時刻</label>
              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white tabular-nums"
              >
                {TIME_SLOTS.slice(1).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">業務（任意）</label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setTaskType(null)}
                className={
                  taskType === null
                    ? "px-2 py-1.5 text-xs rounded-md border-2 border-indigo-500 bg-indigo-50 text-indigo-700 font-bold"
                    : "px-2 py-1.5 text-xs rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
                }
              >
                通常
              </button>
              {(["hanamaru", "toko", "break"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTaskType(t)}
                  className={
                    taskType === t
                      ? "px-2 py-1.5 text-xs rounded-md border-2 border-indigo-500 bg-indigo-50 text-indigo-700 font-bold inline-flex items-center justify-center gap-1"
                      : "px-2 py-1.5 text-xs rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center gap-1"
                  }
                >
                  <span>{TASK_SYMBOL[t]}</span>
                  <span>{TASK_LABEL[t].replace(/[（）]/g, "")}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">メモ（任意）</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-between items-center gap-2">
          {onDelete && (
            <Button variant="outline" onClick={handleDelete} disabled={pending} className="text-rose-600 border-rose-300 hover:bg-rose-50">
              <Trash2 className="w-4 h-4 mr-1" />
              削除
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button onClick={onClose} variant="outline" disabled={pending}>キャンセル</Button>
            <Button onClick={handleSave} disabled={pending || !staffId || !locationId}>
              {pending ? "保存中…" : isCreate ? "追加" : "保存"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// LocationSettingsModal: 場所マスタ管理
// ─────────────────────────────────────────────────────────────────

function LocationSettingsModal({
  locations,
  pending,
  onClose,
  onUpsert,
  onDeactivate,
}: {
  locations: ShiftLocationRow[];
  pending: boolean;
  onClose: () => void;
  onUpsert: (input: { id?: string; name: string; sort_order?: number; is_active?: boolean }) => Promise<boolean>;
  onDeactivate: (id: string) => Promise<boolean>;
}) {
  const [newName, setNewName] = useState("");

  async function handleAdd() {
    if (!newName.trim()) return;
    const ok = await onUpsert({
      name: newName.trim(),
      sort_order: locations.length,
      is_active: true,
    });
    if (ok) setNewName("");
  }

  async function handleRename(id: string, currentName: string) {
    const newVal = prompt("新しい場所名を入力してください", currentName);
    if (!newVal || newVal.trim() === currentName) return;
    await onUpsert({ id, name: newVal.trim() });
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Settings className="w-4 h-4 text-indigo-600" />
            場所マスタ管理
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-3">
          シフト表で使う「鍼灸院」「はなまる」などの場所を登録します。
          無効化した場所の過去シフトは残りますが、新規追加できなくなります。
        </p>

        <div className="space-y-2 mb-4">
          {locations.length === 0 && (
            <div className="text-sm text-slate-500 text-center bg-slate-50 border border-slate-200 rounded-lg p-4">
              まだ場所が登録されていません
            </div>
          )}
          {locations.map((l) => (
            <div
              key={l.id}
              className={
                l.is_active
                  ? "flex items-center gap-2 border border-slate-200 rounded-lg p-2"
                  : "flex items-center gap-2 border border-slate-200 rounded-lg p-2 opacity-50 bg-slate-50"
              }
            >
              <span className="flex-1 text-sm font-medium text-slate-800">
                {l.name}
                {!l.is_active && <span className="ml-2 text-xs text-slate-500">(無効)</span>}
              </span>
              {l.is_active && (
                <>
                  <button
                    type="button"
                    onClick={() => handleRename(l.id, l.name)}
                    disabled={pending}
                    className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    名前変更
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeactivate(l.id)}
                    disabled={pending}
                    className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                    aria-label="無効化"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 pt-4">
          <label className="block text-xs font-bold text-slate-700 mb-1">新しい場所を追加</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例: 鍼灸院、はなまる"
              maxLength={50}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            />
            <Button onClick={handleAdd} disabled={pending || !newName.trim()} size="sm">
              <Plus className="w-4 h-4 mr-1" />
              追加
            </Button>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={onClose} variant="outline">閉じる</Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// StaffColorSettingsModal: スタッフ色設定
// ─────────────────────────────────────────────────────────────────

function StaffColorSettingsModal({
  staff,
  pending,
  onClose,
  onUpdate,
}: {
  staff: StaffOption[];
  pending: boolean;
  onClose: () => void;
  onUpdate: (staffId: string, color: string | null) => Promise<boolean>;
}) {
  const colorKeys = Object.keys(STAFF_COLOR_PRESETS) as StaffColorKey[];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Palette className="w-4 h-4 text-indigo-600" />
            スタッフ色設定
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-3">
          シフト表でのスタッフ表示色を設定します。色を選ぶと、その色のセルがそのスタッフの勤務として表示されます。
        </p>

        <div className="space-y-3">
          {staff.map((s) => (
            <div key={s.id} className="border border-slate-200 rounded-lg p-3">
              <div className="text-sm font-bold text-slate-800 mb-2">{s.name}</div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdate(s.id, null)}
                  disabled={pending}
                  className={
                    !s.display_color
                      ? "px-2 py-1 text-xs rounded-md border-2 border-indigo-500 bg-indigo-50 text-indigo-700 font-bold"
                      : "px-2 py-1 text-xs rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
                  }
                >
                  未設定
                </button>
                {colorKeys.map((key) => {
                  const hex = STAFF_COLOR_PRESETS[key];
                  const selected = s.display_color === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onUpdate(s.id, key)}
                      disabled={pending}
                      className={
                        selected
                          ? "w-7 h-7 rounded-md ring-2 ring-offset-1 ring-slate-700 transition-all"
                          : "w-7 h-7 rounded-md hover:scale-110 transition-transform"
                      }
                      style={{ backgroundColor: hex }}
                      title={key}
                      aria-label={key}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={onClose} variant="outline">閉じる</Button>
        </div>
      </div>
    </div>
  );
}
