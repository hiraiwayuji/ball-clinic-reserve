"use client";

import { useEffect, useState } from "react";
import { getCurrentSchedule } from "@/app/actions/clinic-slot";
import { buildSchedule, type Schedule } from "@/lib/time-slots";

/**
 * 現在のクリニックの営業時間スケジュール（曜日別営業時間 + 休診曜日）を取得する hook。
 * 初回 render は DEFAULT（ボール接骨院互換: 平日 12-22:30, 土 10-17:30, 休 日水）。
 * useEffect 後に clinic_settings から取得した実値に切り替わる。
 */
export function useClinicSchedule(): Schedule {
  const [schedule, setSchedule] = useState<Schedule>(() => buildSchedule(null));
  useEffect(() => {
    getCurrentSchedule().then(setSchedule).catch(() => {
      // 取得失敗時は DEFAULT のまま（既存挙動を維持）
    });
  }, []);
  return schedule;
}
