-- Phase 2: マルチテナント認証基盤
-- user_id → clinic_id マッピングテーブル
-- これによりServer Actionsが認証ユーザーから動的にclinic_idを取得できる

CREATE TABLE IF NOT EXISTS public.clinic_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinic_settings(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, clinic_id)
);

ALTER TABLE public.clinic_users ENABLE ROW LEVEL SECURITY;

-- 自分自身のレコードのみ参照可能
CREATE POLICY "Users can read own clinic membership" ON public.clinic_users
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 既存の認証済みユーザーを全員デフォルトクリニックに紐付け
INSERT INTO public.clinic_users (user_id, clinic_id, role)
SELECT id, '00000000-0000-0000-0000-000000000001', 'owner'
FROM auth.users
ON CONFLICT (user_id, clinic_id) DO NOTHING;
