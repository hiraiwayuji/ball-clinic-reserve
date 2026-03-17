-- 予約データの参照を公開（カレンダーの空き状況確認のため）
-- すでにAuthenticated向けのポリシーがありますが、未ログインユーザーも空き枠を確認できるようにします。
CREATE POLICY "Anyone can select appointments for availability" ON public.appointments
    FOR SELECT
    USING (true);

-- 顧客情報は引き続き管理者のみ
-- (既存の Authenticated users can select customers ポリシーが効いているため、一般ユーザーからは名前等は見えません)
