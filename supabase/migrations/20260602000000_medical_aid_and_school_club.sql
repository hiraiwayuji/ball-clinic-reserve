-- 子ども医療費助成（窓口0円/月600円の色分け）と、アンケートの学校/クラブ収集に向けた追加。
--
-- 1) customers.school_club : 初診アンケートで聞く「学校名 or 所属クラブ名」（任意）。
--    分析（どの学校・クラブの子が来ているか）とスポーツ障害の傾向把握に使う。
-- 2) clinic_settings.medical_aid_rules : 市町村×学年ステージ別の窓口自己負担(0/600)を
--    院ごとに編集できる JSONB。未設定なら lib/medical-aid.ts の徳島デフォルトを使う。
-- 3) clinic_settings.medical_aid_reviewed_at : 最終見直し日。年度替わり(4月)に AI秘書が
--    「制度変更ないですか？」と促し、確認したらこの日付を更新する。

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS school_club TEXT;

COMMENT ON COLUMN public.customers.school_club IS '学校名または所属クラブ名（初診アンケート・任意）';

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS medical_aid_rules JSONB,
  ADD COLUMN IF NOT EXISTS medical_aid_reviewed_at DATE;

COMMENT ON COLUMN public.clinic_settings.medical_aid_rules IS
  '子ども医療費助成の市町村×学年ステージ別 窓口自己負担(0/600円)。NULLなら徳島デフォルト';
COMMENT ON COLUMN public.clinic_settings.medical_aid_reviewed_at IS
  '医療費助成ルールの最終見直し日（年度替わりリマインド用）';
