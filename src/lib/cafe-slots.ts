// カフェ部門（席予約）の時間枠ロジック。
// サロン施術とは別営業時間（clinic_settings.cafe_business_hours）で動く。
// ランチ帯／ディナー帯を曜日で出し分け、滞在時間ぶん閉店前に余裕を持って締め切る。

import type { CafeBusinessHours, CafeBusinessHoursWindow } from "@/app/actions/publicSettings";

/** 1予約あたりの滞在時間（分）。席の占有判定・予約レコードの所要時間に使う。 */
export const CAFE_BOOKING_DURATION_MIN = 90;
/** 予約開始時刻のグリッド（分）。 */
export const CAFE_SLOT_GRID_MIN = 30;
/** 最終受付は「閉店 - この分数」まで（席を最低限ゆっくり使えるように）。 */
export const CAFE_LAST_SEATING_BUFFER_MIN = 60;

export type CafeBand = "lunch" | "dinner";

export type CafeSlot = {
  /** "HH:MM" */
  time: string;
  band: CafeBand;
};

function toMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function fromMin(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

function slotsForWindow(win: CafeBusinessHoursWindow, band: CafeBand): CafeSlot[] {
  const startMin = toMin(win.start);
  const endMin = toMin(win.end);
  const lastStart = endMin - CAFE_LAST_SEATING_BUFFER_MIN;
  const out: CafeSlot[] = [];
  for (let t = startMin; t <= lastStart; t += CAFE_SLOT_GRID_MIN) {
    out.push({ time: fromMin(t), band });
  }
  return out;
}

/**
 * 指定日に予約可能なカフェの開始スロット一覧を返す（時刻昇順）。
 * その曜日に営業帯が無ければ空配列。
 */
export function getCafeSlots(date: Date, hours: CafeBusinessHours | null): CafeSlot[] {
  if (!hours) return [];
  const day = date.getDay();
  const slots: CafeSlot[] = [];
  if (hours.lunch && hours.lunch.days.includes(day)) {
    slots.push(...slotsForWindow(hours.lunch, "lunch"));
  }
  if (hours.dinner && hours.dinner.days.includes(day)) {
    slots.push(...slotsForWindow(hours.dinner, "dinner"));
  }
  slots.sort((a, b) => toMin(a.time) - toMin(b.time));
  return slots;
}

/** その日にカフェ営業帯が1つでもあるか（カレンダーの選択可否に使う）。 */
export function isCafeOpenOn(date: Date, hours: CafeBusinessHours | null): boolean {
  if (!hours) return false;
  const day = date.getDay();
  return Boolean(
    (hours.lunch && hours.lunch.days.includes(day)) ||
    (hours.dinner && hours.dinner.days.includes(day)),
  );
}

/**
 * 指定の開始時刻が属する営業帯の終了時刻（分）を返す。見つからなければ null。
 * 予約の占有終了 = min(開始 + 滞在時間, 営業帯の終了) の算出に使う。
 */
export function cafeWindowEndMinFor(date: Date, time: string, hours: CafeBusinessHours | null): number | null {
  if (!hours) return null;
  const day = date.getDay();
  const startMin = toMin(time);
  const windows: CafeBusinessHoursWindow[] = [];
  if (hours.lunch && hours.lunch.days.includes(day)) windows.push(hours.lunch);
  if (hours.dinner && hours.dinner.days.includes(day)) windows.push(hours.dinner);
  for (const w of windows) {
    if (startMin >= toMin(w.start) && startMin <= toMin(w.end) - CAFE_LAST_SEATING_BUFFER_MIN) {
      return toMin(w.end);
    }
  }
  return null;
}

/**
 * 予約の占有区間 [開始, 終了) を分で返す。終了は滞在時間と営業帯終了の小さい方。
 * 不正な時刻（営業帯外）なら null。
 */
export function cafeOccupancyRange(date: Date, time: string, hours: CafeBusinessHours | null): { startMin: number; endMin: number } | null {
  const winEnd = cafeWindowEndMinFor(date, time, hours);
  if (winEnd == null) return null;
  const startMin = toMin(time);
  const endMin = Math.min(startMin + CAFE_BOOKING_DURATION_MIN, winEnd);
  if (endMin <= startMin) return null;
  return { startMin, endMin };
}
