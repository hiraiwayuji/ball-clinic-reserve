-- ============================================================
-- appointments: 同一予約への 追加メニュー / 追加担当スタッフ 用 JSONB カラム
-- ============================================================
-- 「同じ患者に対して、1 回の予約の中で複数のメニューや複数の担当を割り当てたい」
-- というからだ鍼灸整骨院の運用に対応するため、メインの course_id/staff_id とは別に
-- 「追加項目」を JSONB 配列で保持する。
--
-- データ形式:
--   additional_courses: [{ "course_id": "<uuid>", "course_name": "<text>" }, ...]
--   additional_staff:   [{ "staff_id":  "<uuid>", "staff_name":  "<text>" }, ...]
--
-- 表示時はメイン (course_id/course_name, staff_id/staff_name) と結合して
-- 「メニュー: A, B, C」「担当: 田中, 鈴木」のように見せる。
-- ============================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS additional_courses JSONB,
  ADD COLUMN IF NOT EXISTS additional_staff   JSONB;

COMMENT ON COLUMN public.appointments.additional_courses IS
  '同一予約に紐付ける追加メニューの配列 [{course_id, course_name}, ...]。メイン course_id 以外。';
COMMENT ON COLUMN public.appointments.additional_staff IS
  '同一予約に紐付ける追加担当スタッフの配列 [{staff_id, staff_name}, ...]。メイン staff_id 以外。';
