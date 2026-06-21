// 勤怠（残業理由・判定）の表示用定数。
// "use server" ファイル（attendance.ts）からは値（オブジェクト/配列）を export できない
// （本番ビルドで "A use server file can only export async functions" エラー）ため、
// 値だけをこの非サーバーファイルに分離する。型は import type で参照（実行時には消える）。

import type { OvertimeReasonType, AttendanceJudgment } from "@/app/actions/attendance";

export const OVERTIME_REASONS: { value: OvertimeReasonType; label: string }[] = [
  { value: "requested", label: "院長の依頼" },
  { value: "closing", label: "締め作業（1人で締め）" },
  { value: "valid", label: "正当な理由" },
  { value: "other", label: "その他" },
];

export const OVERTIME_REASON_LABEL: Record<OvertimeReasonType, string> = {
  requested: "院長の依頼",
  closing: "締め作業（1人で締め）",
  valid: "正当な理由",
  other: "その他",
};

export const JUDGMENT_LABEL: Record<AttendanceJudgment, string> = {
  requested: "院長の依頼",
  reservation: "予約の担当",
  closing: "締め作業",
  valid: "正当な理由",
  wasteful: "ムダな被り",
};
