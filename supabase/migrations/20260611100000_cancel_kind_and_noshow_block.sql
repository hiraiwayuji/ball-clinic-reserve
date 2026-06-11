-- キャンセルの仕分け（無断 / 院承諾済み / セット解除）と
-- 無断キャンセルを繰り返す患者の期限付きオンライン予約停止。
--
-- cancel_kind:
--   'unexcused'   = 無断・未確認キャンセル（未来院カウント対象・自動停止の対象）
--   'approved'    = 連絡あり・院が承諾したキャンセル（未来院には数えない）
--   'set_removed' = 施術+水素などセット予約の片割れ削除（キャンセル・未来院どちらにも数えない）
--   NULL          = 未仕分け（毎日のしめ作業で仕分ける）

alter table public.appointments
  add column if not exists cancel_kind text
    check (cancel_kind in ('unexcused', 'approved', 'set_removed'));

-- 期限付きのオンライン予約停止（無断キャンセル制限による自動停止）。
-- 手動の booking_suspended（無期限）とは別管理で、期限が過ぎれば自動で解除扱い。
alter table public.customers
  add column if not exists booking_suspended_until timestamptz;

-- 院ごとの運用設定（使う院だけ ON にする）
alter table public.clinic_settings
  add column if not exists noshow_block_enabled boolean not null default false,
  add column if not exists noshow_block_threshold integer not null default 3,
  add column if not exists noshow_block_window_days integer not null default 90,
  add column if not exists noshow_block_days integer not null default 30;
