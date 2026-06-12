"use client";

import { useEffect, useState } from "react";
import { getCurrentPatientCanPickStaff } from "@/app/actions/clinic-slot";

/**
 * 患者のWeb予約画面で「担当（スタッフ）を選ぶ」操作を許可するかの hook。
 * 初回 render は true（従来挙動＝担当タブ表示）。useEffect 後に
 * clinic_settings.patient_can_pick_staff の実値へ切り替わる。
 * からだ鍼灸整骨院など false の院では、患者は担当を選べず、
 * メニューの required_staff_id で担当が自動決定される。
 */
export function useClinicPatientCanPickStaff(): boolean {
  const [canPick, setCanPick] = useState(true);
  useEffect(() => {
    getCurrentPatientCanPickStaff().then(setCanPick).catch(() => {
      // 取得失敗時は true のまま（既存挙動を維持）
    });
  }, []);
  return canPick;
}
