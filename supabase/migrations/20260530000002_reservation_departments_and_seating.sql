-- 予約の「部門」（サロン/カフェ）＋カフェの席予約（人数制）の基盤。全院共通・後方互換の列追加のみ。
-- 既存の予約は department=NULL / capacity_type='service'（施術1対1）として従来通り動く。

-- メニュー（コース）: どの部門のメニューか / 席予約用パラメータ
ALTER TABLE reservation_courses
  ADD COLUMN IF NOT EXISTS department TEXT;                                   -- 'サロン' | 'カフェ' 等。NULL=部門なし院
ALTER TABLE reservation_courses
  ADD COLUMN IF NOT EXISTS capacity_type TEXT NOT NULL DEFAULT 'service';     -- 'service'=施術(1対1) / 'seating'=席(人数制)
ALTER TABLE reservation_courses
  ADD COLUMN IF NOT EXISTS max_party_size INT;                                -- 席予約: 1予約あたり最大人数（NULL=制限なし）

-- 予約: 集計・部門タブ用の部門、カフェの人数
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS department TEXT;                                   -- 予約がどの部門か（メニューから決まる）
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS party_size INT;                                    -- 席予約の人数（施術予約は NULL/1）

-- 院設定: カフェの同時受入席数（席予約の上限。ある時間帯の party_size 合計がこれを超えない）
ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS cafe_seat_capacity INT;                           -- NULL=未設定（席数は問い合わせ待ち）

-- 部門×日時の空き計算を高速化
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_department_time
  ON appointments (clinic_id, department, start_time);
