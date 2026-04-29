-- Phase 1: Security & Governance
-- 1) audit_log: スタッフ・管理者の重要操作の証跡
-- 2) pending_settings_changes: 機微設定の承認待ちキュー
-- 3) clinic_settings.settings_passcode_hash: 設定画面ロック用パスコード（bcrypt 互換ハッシュを保存）

-- =========================================
-- audit_log
-- =========================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID        NOT NULL REFERENCES public.clinic_settings(id) ON DELETE CASCADE,
  actor_user_id UUID,                       -- auth.users.id（service_role 経由なら NULL も許容）
  actor_email   TEXT,                       -- 当時のメール（あとから user 削除されても残す）
  actor_role    TEXT NOT NULL DEFAULT 'unknown' CHECK (actor_role IN ('owner','admin','staff','unknown','system')),
  action_type   TEXT NOT NULL,              -- 'appointment.create' / 'appointment.update' / 'appointment.delete' / 'appointment.status' / 'settings.update' / 'passcode.unlock' など
  target_table  TEXT,                       -- 'appointments' / 'clinic_settings' / 'clinic_targets' など
  target_id     TEXT,                       -- 対象レコード ID（複合キーは JSON 文字列でも可）
  before_data   JSONB,                      -- 変更前スナップショット
  after_data    JSONB,                      -- 変更後スナップショット
  diff          JSONB,                      -- 任意: 変更されたフィールドのみ
  ip            TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_clinic_id_created_at_idx
  ON public.audit_log (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_user_id_idx
  ON public.audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS audit_log_action_type_idx
  ON public.audit_log (action_type);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 同じクリニックのオーナー/admin だけが自院ログを参照可能
DROP POLICY IF EXISTS "Owner/Admin can read own clinic audit_log" ON public.audit_log;
CREATE POLICY "Owner/Admin can read own clinic audit_log" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.clinic_id = audit_log.clinic_id
        AND cu.role IN ('owner','admin')
    )
  );

-- 書き込みは service_role のみ（Server Action 経由で書く）
DROP POLICY IF EXISTS "Service role can write audit_log" ON public.audit_log;
CREATE POLICY "Service role can write audit_log" ON public.audit_log
  FOR INSERT TO service_role
  WITH CHECK (true);

-- =========================================
-- pending_settings_changes
-- =========================================
CREATE TABLE IF NOT EXISTS public.pending_settings_changes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID        NOT NULL REFERENCES public.clinic_settings(id) ON DELETE CASCADE,
  requested_by  UUID,                       -- auth.users.id
  requested_email TEXT,
  requested_role TEXT NOT NULL DEFAULT 'unknown',
  target_table  TEXT NOT NULL,              -- 'clinic_settings' / 'clinic_targets'
  payload       JSONB NOT NULL,             -- upsert する値そのもの
  reason        TEXT,                       -- 申請理由
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by   UUID,
  reviewed_at   TIMESTAMPTZ,
  reviewer_note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pending_settings_changes_clinic_status_idx
  ON public.pending_settings_changes (clinic_id, status, created_at DESC);

ALTER TABLE public.pending_settings_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic members can read pending changes" ON public.pending_settings_changes;
CREATE POLICY "Clinic members can read pending changes" ON public.pending_settings_changes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.clinic_id = pending_settings_changes.clinic_id
    )
  );

DROP POLICY IF EXISTS "Service role can manage pending changes" ON public.pending_settings_changes;
CREATE POLICY "Service role can manage pending changes" ON public.pending_settings_changes
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================================
-- clinic_settings.settings_passcode_hash
-- =========================================
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS settings_passcode_hash TEXT;

-- 既定値はオーナーが任意で設定。未設定なら "0000" として扱う（実装側で同等のハッシュを判定）。
COMMENT ON COLUMN public.clinic_settings.settings_passcode_hash IS
  'Phase 1: 設定画面ロックの 4-6 桁パスコード(SHA-256 hex)。NULL の場合は実装側で既定値 "0000" を許容する。';
