"use client";

import { useEffect, useState } from "react";
import { getSpecialDays } from "@/app/actions/special-days";
import type { SpecialDay } from "@/lib/time-slots";

/**
 * 現在のクリニックの臨時営業日（clinic_special_days）を全件取得する hook。
 * 初回 render は空配列（＝通常営業）。useEffect 後に実値へ切り替わる。
 * 予約フォームで「その日の臨時営業時間・当日予約停止」を反映するために使う。
 */
export function useSpecialDays(): SpecialDay[] {
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>([]);
  useEffect(() => {
    getSpecialDays().then(setSpecialDays).catch(() => setSpecialDays([]));
  }, []);
  return specialDays;
}

/** SpecialDay 配列から指定日（"YYYY-MM-DD"）の1件を返す。無ければ null。 */
export function findSpecialDay(specialDays: SpecialDay[], dateStr: string): SpecialDay | null {
  return specialDays.find((s) => s.date === dateStr) ?? null;
}
