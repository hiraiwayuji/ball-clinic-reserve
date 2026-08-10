"use client";

import { useEffect, useState } from "react";
import { getCurrentPatientCanPickStaff } from "@/app/actions/clinic-slot";

/**
 * 患者のWeb予約画面で「担当（スタッフ）を選ぶ」操作を許可するかの hook。
 * clinic_settings.patient_can_pick_staff を見る。
 *
 * 初期値は false（＝担当まわりを出さない）。
 * 以前は true 始まりだったため、からだ鍼灸整骨院のように「担当は院が決める」院でも
 * 設定を取りにいく数秒のあいだ「◯◯先生の出勤日のみ予約できます」が見えていた
 * （2026-08-10 藤川先生の指摘）。内部事情は一瞬でも患者に見せない側に倒す。
 *
 * 結果はモジュール内にキャッシュして共有する。メニュー一覧のように
 * カード1枚ごとにこの hook を呼ぶ画面で、同じサーバーアクションを
 * 何十回も叩いて表示が遅れるのを防ぐため。
 */
let cachedCanPick: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export function useClinicPatientCanPickStaff(): boolean {
  const [canPick, setCanPick] = useState<boolean>(cachedCanPick ?? false);

  useEffect(() => {
    if (cachedCanPick !== null) {
      setCanPick(cachedCanPick);
      return;
    }
    let alive = true;
    inflight ??= getCurrentPatientCanPickStaff();
    inflight
      .then((v) => {
        cachedCanPick = v;
        if (alive) setCanPick(v);
      })
      .catch(() => {
        // 取得失敗時は false のまま（＝担当情報を出さない）
        inflight = null;
      });
    return () => {
      alive = false;
    };
  }, []);

  return canPick;
}
