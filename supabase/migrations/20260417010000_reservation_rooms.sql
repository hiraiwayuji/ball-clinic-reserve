-- 個室（リソース）管理テーブルの追加
-- 背景: スタッフ指名と同様に「個室」を予約可能なリソースとして管理する
-- relaq等の個室サロン・整骨院向けに、部屋ごとの予約重複を防ぐ

-- ============================================================
-- 1. reservation_rooms テーブル作成
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reservation_rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES public.clinic_settings(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,                    -- 例: 「個室A」「施術室1」
  description   TEXT,                             -- 部屋の説明・設備メモ
  capacity      INT NOT NULL DEFAULT 1,           -- 同時収容人数（通常1）
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX idx_reservation_rooms_clinic_id
  ON public.reservation_rooms(clinic_id);

-- RLS 有効化
ALTER TABLE public.reservation_rooms ENABLE ROW LEVEL SECURITY;

-- 認証済みクリニックメンバーのみ管理可能
CREATE POLICY "Clinic members can manage reservation_rooms"
  ON public.reservation_rooms FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id  = auth.uid()
        AND clinic_users.clinic_id = reservation_rooms.clinic_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id  = auth.uid()
        AND clinic_users.clinic_id = reservation_rooms.clinic_id
    )
  );

-- 患者側（アノン）は is_active=true の部屋一覧のみ参照可（空き確認のため）
CREATE POLICY "Public can view active rooms"
  ON public.reservation_rooms FOR SELECT TO anon
  USING (is_active = true);

-- ============================================================
-- 2. appointments テーブルに room_id / room_name を追加
-- ============================================================
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS room_id   UUID REFERENCES public.reservation_rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_name TEXT;  -- 削除後も表示できるよう非正規化コピー

-- インデックス（部屋 × 時間帯の重複チェッククエリ用）
CREATE INDEX IF NOT EXISTS idx_appointments_room_time
  ON public.appointments(room_id, start_time, end_time)
  WHERE room_id IS NOT NULL AND status != 'cancelled';

-- ============================================================
-- 注意事項
-- ============================================================
-- アプリ層での重複チェック条件（reserve.ts に実装）:
--   room_id IS NOT NULL かつ status != 'cancelled' かつ
--   existing.start_time < new.end_time AND existing.end_time > new.start_time
--
-- staff_id の重複チェックも同様のロジックで追加予定
