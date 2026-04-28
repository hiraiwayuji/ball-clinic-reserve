# 自動マイグレーション基盤 セットアップガイド

このプロジェクトは複数院に配布される構成のため、コードを `git push` するだけで
**各院の Supabase DBスキーマも自動的に最新になる**仕組みを導入しています。

## 仕組み

1. `git push origin main`
2. 各院の Vercel が自動デプロイを開始
3. ビルド時 `npm run build` の最初に `node scripts/migrate-on-build.mjs` が走る
4. スクリプトが `supabase/migrations/` の SQL ファイルを順に確認
5. **その院の Supabase でまだ未実行**のものだけを実行
6. 実行履歴は各院 Supabase の `public.__applied_migrations` テーブルに記録
7. 全成功 → `next build` が続行 → デプロイ完了
8. 失敗 → ビルド停止 → デプロイされず、旧版が動き続ける（安全停止）

> 💡 失敗時は「コードは新版・DBは旧版」の不整合状態にならないよう、
> Vercel ビルドが止まることで自動的に保護される設計です。

## 各院 Vercel に1度だけ追加する環境変数

各院の Vercel プロジェクトの **Settings → Environment Variables** で以下を追加：

```
Variable name: SUPABASE_DB_URL
Value:         （下記参照）
Environment:   Production, Preview, Development（全部チェック）
```

### 値（SUPABASE_DB_URL）の取り方

1. その院の Supabase ダッシュボードを開く
2. 左メニュー **Project Settings → Database**
3. **Connection string** セクションの **Session pooler** タブを選ぶ
4. URI 形式の文字列をコピー：
   ```
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
5. `[YOUR-PASSWORD]` を実際のDB パスワードに置き換える
6. Vercel に貼り付け、保存

> ⚠️ **Direct connection（5432番ポート以外で末尾に `pooler` が無いもの）は避ける**こと。
> Vercel のサーバーレス環境では Session pooler 経由が安定します。

### 4院分のチェックリスト

- [ ] ボール接骨院（本院）Vercel に SUPABASE_DB_URL 追加
- [ ] マッスル整体 Vercel に SUPABASE_DB_URL 追加（muscleseitai.vercel.app）
- [ ] からだ鍼灸整骨院 Vercel に SUPABASE_DB_URL 追加（karada-clinic.vercel.app）
- [ ] relaq 鍼灸マッサージ治療院 Vercel に SUPABASE_DB_URL 追加（relaq-clinic.vercel.app）

設定後、各院 Vercel ダッシュボードから **Redeploy** ボタンを押せば次回ビルドから自動マイグレーションが有効になります。

## 動作確認

設定後、Vercel のビルドログに以下のような出力が出ます：

```
[migrate] Connected to postgresql://postgres.xxxx:****@aws-0-xxxx.pooler.supabase.com:5432/postgres
[migrate] Found 32 migration file(s) in repo
[migrate] First run on this DB. Marking 31 pre-existing migration(s) as baseline (not re-executed):
           - 20260317000001_fix_ai_multitenancy.sql (baseline)
           - ...
[migrate] 1 pending migration(s) to apply:
           - 20260428010000_add_menu_lp_fields.sql
[migrate] Applying 20260428010000_add_menu_lp_fields.sql (1432 bytes)...
[migrate] ✓ 20260428010000_add_menu_lp_fields.sql
[migrate] ✓ Done. Applied 1 new migration(s).
```

2回目以降は `[migrate] ✓ All migrations are up to date` だけが出るようになります。

## 新しいマイグレーションを追加する手順（今後）

1. `supabase/migrations/YYYYMMDDHHMMSS_description.sql` を新規作成
2. **必ず冪等に書く**（`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / `ON CONFLICT DO NOTHING` など）
3. `git add` → `git commit` → `git push`
4. 各院 Vercel が自動デプロイ → 自動マイグレーション → 完了

**個別 Supabase の SQL Editor を開く必要は二度とありません。**

## ローカル開発時

`SUPABASE_DB_URL` がローカル環境変数に無い場合、スクリプトはスキップされます。
ローカル DB に migration を当てたい時だけ `.env.local` に `SUPABASE_DB_URL` を入れて
`npm run migrate` を実行できます。

## 緊急時：マイグレーションを止めたい

Vercel のビルドコマンドを **Settings → Build & Development Settings → Build Command** で
一時的に `npm run build:no-migrate` に切り替えれば、マイグレーションをスキップして
通常の `next build` だけ走らせられます（コードが旧スキーマで動く前提のとき）。

## トラブルシューティング

### ビルドが「failed to connect」で止まる
- `SUPABASE_DB_URL` のパスワードが間違っている
- Session pooler を使っていない（Direct connection だと一部 Vercel リージョンで失敗する）
- Supabase 側の IP制限（通常はオフ）

### 「relation public.__applied_migrations already exists but not visible」
- service_role 権限が無い → DB URL のユーザーが `postgres` ロールで接続されているか確認

### 「permission denied for schema public」
- Connection string が anon ユーザー → `postgres` ユーザーで接続するURL に修正

### 「migration file X failed」
- そのSQL ファイルに構文エラー、または別の前提（先行 migration）が抜けている
- ローカルで `SUPABASE_DB_URL` を設定して `npm run migrate` で再現確認
