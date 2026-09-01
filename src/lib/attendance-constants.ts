// 勤怠（残業理由・判定）の表示用定数。
// "use server" ファイル（attendance.ts）からは値（オブジェクト/配列）を export できない
// （本番ビルドで "A use server file can only export async functions" エラー）ため、
// 値だけをこの非サーバーファイルに分離する。型は import type で参照（実行時には消える）。

import type { OvertimeReasonType, AttendanceJudgment } from "@/lib/attendance-judgment";

/**
 * 打刻画面で選べる残業理由（2026-09-01 からだ・藤川先生の指定で入れ替え）。
 * 旧: 院長の依頼 / 締め作業 / 正当な理由 / その他
 * 新: 予約が入っていた / 患者さん対応 / 片付け / その他
 * ※旧タイプ（requested/closing/valid）は過去の記録の表示用に残す（選択肢からは外す）。
 */
export const OVERTIME_REASONS: { value: OvertimeReasonType; label: string }[] = [
  { value: "reservation", label: "予約が入っていた" },
  { value: "patient", label: "患者さん対応" },
  { value: "cleanup", label: "片付け" },
  { value: "other", label: "その他" },
];

export const OVERTIME_REASON_LABEL: Record<OvertimeReasonType, string> = {
  // 現行の選択肢
  reservation: "予約が入っていた",
  patient: "患者さん対応",
  cleanup: "片付け",
  other: "その他",
  // 旧タイプ（過去の記録の表示用）
  requested: "院長の依頼",
  closing: "締め作業（1人で締め）",
  valid: "正当な理由",
};

export const JUDGMENT_LABEL: Record<AttendanceJudgment, string> = {
  requested: "院長の依頼",
  reservation: "予約の担当",
  closing: "締め作業",
  valid: "正当な理由",
  wasteful: "ムダな被り",
};
