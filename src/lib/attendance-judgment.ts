// 勤怠：残業理由の型と「その残業は正当か」の判定。
//
// ここに置く理由:
//   - "use server"（actions/attendance.ts）は値を export できないので、判定を
//     サーバーアクションの中に書くと単体で動かして確かめられない。
//   - 判定は打刻・勤怠一覧の両方から使う「1本しかあってはいけない」ロジックなので、
//     計算式をこのファイル以外に書かないこと。
// 外部 import を持たないので、tsc で単体コンパイルしてテストできる。

/**
 * 残業理由の種類。
 * 現行の選択肢: reservation / patient / cleanup / other
 *   （2026-09-01 からだ・藤川先生の指定で入れ替え。ラベルは attendance-constants.ts）
 * 旧タイプ: requested / closing / valid ＝ 過去の記録に入っている値。
 *   打刻画面の選択肢からは外したが、表示・集計のために型としては残す。
 */
export type OvertimeReasonType =
  | "reservation" | "patient" | "cleanup" | "other"
  | "requested" | "closing" | "valid";

/**
 * 残業の正当性判定。
 * - requested  : 院長の依頼（旧理由＝requested）
 * - reservation: 理由＝予約が入っていた、または予約表と突合して遅い時間の担当だった
 * - closing    : 理由＝片付け（旧: 締め担当が締め許容時刻内に締め作業）
 * - valid      : 理由＝患者さん対応（旧: 正当な理由の自己申告）
 * - wasteful   : 上記いずれでもない＝「その他」＝ムダな残業（折半の対象候補）
 */
export type AttendanceJudgment = "requested" | "reservation" | "closing" | "valid" | "wasteful";

export type JudgeInput = {
  reasonType: OvertimeReasonType | null;
  /** その日その人の予約が、シフト終わりより後まで入っていたか */
  hasLateReservation: boolean;
  /** 締め担当に指名されている本人か（旧 closing 理由の判定用） */
  isClosingStaff: boolean;
  /** 締め許容時刻までに退社したか（旧 closing 理由の判定用） */
  withinClosingAllowance: boolean;
};

/** 残業1件の判定。ムダ（wasteful）になるのは「その他」と理由なしだけ。 */
export function judgeOvertime(input: JudgeInput): AttendanceJudgment {
  const { reasonType, hasLateReservation, isClosingStaff, withinClosingAllowance } = input;
  if (reasonType === "requested") return "requested";
  if (reasonType === "reservation" || hasLateReservation) return "reservation";
  if (reasonType === "cleanup") return "closing";
  if (reasonType === "closing" && isClosingStaff && withinClosingAllowance) return "closing";
  if (reasonType === "patient" || reasonType === "valid") return "valid";
  return "wasteful";
}
