-- ============================================================
-- 残業理由の選択肢を入れ替える（からだ鍼灸整骨院・藤川先生 2026-09-01）
-- ============================================================
-- 旧: requested(院長の依頼) / closing(締め作業) / valid(正当な理由) / other
-- 新: reservation(予約が入っていた) / patient(患者さん対応) / cleanup(片付け) / other
--
-- 旧タイプは過去の記録に入っているので CHECK からは外さない（消すと過去行が壊れる）。
-- 打刻画面の選択肢からだけ外す（src/lib/attendance-constants.ts）。
-- ============================================================

ALTER TABLE public.staff_attendance
  DROP CONSTRAINT IF EXISTS staff_attendance_reason_check;

ALTER TABLE public.staff_attendance
  ADD CONSTRAINT staff_attendance_reason_check
  CHECK (overtime_reason_type IS NULL
         OR overtime_reason_type IN (
           -- 現行の選択肢
           'reservation', 'patient', 'cleanup', 'other',
           -- 旧選択肢（過去の記録用。新規では選べない）
           'requested', 'closing', 'valid'
         ));

COMMENT ON COLUMN public.staff_attendance.overtime_reason_type IS
  '現行: reservation=予約が入っていた / patient=患者さん対応 / cleanup=片付け / other=その他。'
  '旧(過去記録): requested=院長の依頼 / closing=締め作業 / valid=正当な理由';
