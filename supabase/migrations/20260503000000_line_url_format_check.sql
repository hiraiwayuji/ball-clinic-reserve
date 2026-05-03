-- clinic_settings.line_official_account_url の形式バリデーション
-- 過去にメールアドレス（hiraiwayuji@gmail.com）や HP URL（muscle8144.com/）が誤入力されて
-- LP の LINE 問い合わせボタンを壊した実績があるため、DB 層で弾く。
-- 許可: NULL もしくは https?://line.me/ ... または https?://lin.ee/ ... の形式のみ。

-- 既存の不正値があれば一旦 NULL にして制約違反を回避（運用上の名残データ対応）
UPDATE public.clinic_settings
   SET line_official_account_url = NULL
 WHERE line_official_account_url IS NOT NULL
   AND line_official_account_url !~ '^https?://(line\.me|lin\.ee)/';

ALTER TABLE public.clinic_settings
  DROP CONSTRAINT IF EXISTS clinic_settings_line_url_format_check;

ALTER TABLE public.clinic_settings
  ADD CONSTRAINT clinic_settings_line_url_format_check
  CHECK (
    line_official_account_url IS NULL OR
    line_official_account_url ~ '^https?://(line\.me|lin\.ee)/'
  );

COMMENT ON CONSTRAINT clinic_settings_line_url_format_check ON public.clinic_settings IS
  'line_official_account_url は LINE 公式アカウント友だち追加 URL（line.me または lin.ee 始まり）のみ許可。HP URL やメールアドレスを誤入力できないようにする。';
