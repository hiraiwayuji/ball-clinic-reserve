-- 院都合キャンセル（clinic_reason）を cancel_kind に追加。
--   'clinic_reason' = 院側の都合でやむなくキャンセル処理したもの。
--                     本人はキャンセルしていないため、キャンセル回数にも未来院にも数えない。
-- 例: 水素など、こちらの都合で当日できず受付がキャンセル扱いで処理したケース。
--
-- 冪等。既存の制約を張り直すだけ。本番には MCP で先行適用済み。

alter table public.appointments
  drop constraint if exists appointments_cancel_kind_check;

alter table public.appointments
  add constraint appointments_cancel_kind_check
    check (cancel_kind in ('unexcused', 'approved', 'set_removed', 'clinic_reason'));
