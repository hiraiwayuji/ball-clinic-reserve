-- 1つのLINEアカウントに複数の患者(家族)を紐付けるための中間テーブル。
-- customers.line_user_id は互換性のため残し、is_primary=true のレコードと同期させる運用。

CREATE TABLE IF NOT EXISTS public.customer_line_links (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  line_user_id  TEXT        NOT NULL,
  clinic_id     UUID        NOT NULL REFERENCES public.clinic_settings(id) ON DELETE CASCADE
                            DEFAULT '00000000-0000-0000-0000-000000000001',
  is_primary    BOOLEAN     NOT NULL DEFAULT false,
  display_label TEXT,
  linked_via    TEXT,       -- 'phone4' | 'reservation_no' | 'admin_manual' | 'family_add' | 'backfill'
  linked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_line_links_unique UNIQUE (customer_id, line_user_id, clinic_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_line_links_primary_idx
  ON public.customer_line_links (line_user_id, clinic_id)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS customer_line_links_line_user_idx
  ON public.customer_line_links (line_user_id, clinic_id);

CREATE INDEX IF NOT EXISTS customer_line_links_customer_idx
  ON public.customer_line_links (customer_id);

ALTER TABLE public.customer_line_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read own clinic links" ON public.customer_line_links;
CREATE POLICY "Members can read own clinic links" ON public.customer_line_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid() AND cu.clinic_id = customer_line_links.clinic_id
    )
  );

DROP POLICY IF EXISTS "Service role can manage links" ON public.customer_line_links;
CREATE POLICY "Service role can manage links" ON public.customer_line_links
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 既存 customers.line_user_id を主紐付けとして移行。
-- 同じ (line_user_id, clinic_id) に複数 customer がある場合は created_at が古い 1 人のみ primary。
INSERT INTO public.customer_line_links (customer_id, line_user_id, clinic_id, is_primary, linked_via)
SELECT
  c.id,
  c.line_user_id,
  c.clinic_id,
  (ROW_NUMBER() OVER (PARTITION BY c.line_user_id, c.clinic_id ORDER BY c.created_at, c.id)) = 1,
  'backfill'
FROM public.customers c
WHERE c.line_user_id IS NOT NULL
ON CONFLICT (customer_id, line_user_id, clinic_id) DO NOTHING;

-- 子供向け敬称・愛称（"太郎くん" など）。NULL なら従来通り customers.name を使う。
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- LINE → /reserve への line_user_id 受け渡し用の短期トークン。
-- リッチメニューから「予約する」と送ると webhook がここに INSERT し、URL を返信する。
CREATE TABLE IF NOT EXISTS public.line_reserve_tokens (
  token        TEXT        PRIMARY KEY,
  line_user_id TEXT        NOT NULL,
  clinic_id    UUID        NOT NULL REFERENCES public.clinic_settings(id) ON DELETE CASCADE
                           DEFAULT '00000000-0000-0000-0000-000000000001',
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS line_reserve_tokens_expires_idx
  ON public.line_reserve_tokens (expires_at);

ALTER TABLE public.line_reserve_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage reserve tokens" ON public.line_reserve_tokens;
CREATE POLICY "Service role can manage reserve tokens" ON public.line_reserve_tokens
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
