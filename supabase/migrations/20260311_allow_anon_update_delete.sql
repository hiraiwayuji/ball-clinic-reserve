-- プロトタイプ用：匿名ユーザー（Anon）でも予約データの更新・削除ができるようにするセキュリティポリシー設定

-- 1. 行単位のセキュリティ（RLS）が有効になっていない場合は有効にする
ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;

-- 2. 予約テーブルに対して「UPDATE (更新)」を全員に許可する
CREATE POLICY "Enable update for anon users" ON "public"."appointments" 
AS PERMISSIVE FOR UPDATE 
TO public 
USING (true) 
WITH CHECK (true);

-- 3. 予約テーブルに対して「DELETE (削除)」を全員に許可する
CREATE POLICY "Enable delete for anon users" ON "public"."appointments" 
AS PERMISSIVE FOR DELETE 
TO public 
USING (true);
