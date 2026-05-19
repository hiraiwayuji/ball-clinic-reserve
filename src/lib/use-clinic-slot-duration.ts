"use client";

import { useEffect, useState } from "react";
import { getCurrentSlotDuration } from "@/app/actions/clinic-slot";
import type { SlotMinutes } from "@/lib/time-slots";

/**
 * 現在のクリニックの予約枠サイズ（slot_duration_minutes）を取得する hook。
 * 初回 render は 30（既存挙動）でフォールバック、useEffect 後に実値に切り替わる。
 */
export function useClinicSlotDuration(): SlotMinutes {
  const [slot, setSlot] = useState<SlotMinutes>(30);
  useEffect(() => {
    getCurrentSlotDuration().then(setSlot).catch(() => {
      // 取得失敗時は 30 のまま（既存挙動を維持）
    });
  }, []);
  return slot;
}
