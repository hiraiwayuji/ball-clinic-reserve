# 接骨院予約・経営管理システム セットアップマニュアル

> **このマニュアルについて**
> このシステムを新しく導入する先生向けのセットアップ手順書です。
> システムの開発・アップデートは平岩先生が管理しており、先生方はこのマニュアル通りに作業するだけでご自身の院専用システムが完成します。
> 患者さんの個人情報はすべて先生ご自身のクラウドアカウント内にのみ保存されます。平岩先生を含む第三者がアクセスすることは一切できません。

---

## 目次

1. 全体の流れ（所要時間の目安）
2. 必要なサービスと費用
3. STEP 1：Googleアカウントの準備
4. STEP 2：GitHubアカウントの作成
5. STEP 3：Supabaseのセットアップ（データベース）
6. STEP 4：LINEチャネルの作成
7. STEP 5：Google AI Studio（AIアシスタント用）
8. STEP 6：Vercelへのデプロイ（システム公開）
9. STEP 7：環境変数の設定
10. STEP 8：管理者アカウントの初期設定
11. STEP 9：院の基本情報を設定する
12. アップデートの受け取り方
13. よくあるトラブルと対処法

---

## 1. 全体の流れ（所要時間の目安）

| ステップ | 内容 | 目安時間 |
|---------|------|---------|
| STEP 1 | Googleアカウント準備 | 5分 |
| STEP 2 | GitHubアカウント作成 | 10分 |
| STEP 3 | Supabaseセットアップ | 30分 |
| STEP 4 | LINEチャネル作成 | 20分 |
| STEP 5 | Google AI Studio | 5分 |
| STEP 6 | Vercelデプロイ | 20分 |
| STEP 7 | 環境変数設定 | 20分 |
| STEP 8 | 管理者アカウント設定 | 10分 |
| STEP 9 | 院の基本情報設定 | 10分 |
| **合計** | | **約2時間** |

---

## 2. 必要なサービスと費用

すべて無料枠の範囲内で運用できます（月100万円以上の売上がある大規模院は有料プランが必要な場合があります）。

| サービス | 用途 | 費用 |
|---------|------|------|
| **Googleアカウント** | Googleカレンダー連携、AI Studioログイン | **無料** |
| **GitHub** | システムのコード管理 | **無料** |
| **Supabase** | 患者・予約データの保存（データベース） | **無料**（月500MB・50,000件まで） |
| **Vercel** | システムのインターネット公開 | **無料**（月100GBまで） |
| **LINE Developers** | LINE公式アカウント連携 | **無料** |
| **Google AI Studio** | AIアシスタント機能 | **無料**（1日1,500リクエストまで） |

> **重要：** 上記はすべて**先生ご自身のアカウント**で作成してください。平岩先生のアカウントは使いません。

---

## STEP 1：Googleアカウントの準備

### 1-1. 使用するGoogleアカウントを決める

院の業務用Googleアカウントがあればそれを使用してください。
個人用アカウントでも構いませんが、**仕事専用のアカウントを推奨**します。

- Gmailアドレス例：`your-clinic-name@gmail.com`
- このアカウントでGoogleカレンダーを管理することになります

### 1-2. Googleカレンダーの準備（任意）

予約とGoogleカレンダーを連携させる場合：
1. [Google Calendar](https://calendar.google.com) を開く
2. 左メニュー「他のカレンダー」横の「＋」をクリック
3. 「新しいカレンダーを作成」を選択
4. 名前に「○○接骨院 予約」など入力して作成
5. 作成したカレンダーの「設定と共有」を開く
6. 「カレンダーの統合」の「カレンダーID」をメモ（後で使用）

---

## STEP 2：GitHubアカウントの作成

GitHubはシステムのコードを管理・受け取るためのサービスです。

### 2-1. GitHubアカウントを作成する

1. [GitHub](https://github.com) にアクセス
2. 「Sign up」をクリック
3. メールアドレス（Googleアカウントのメールを推奨）、パスワード、ユーザー名を入力して作成
4. メール認証を完了する

### 2-2. 平岩先生からリポジトリへの招待を受ける

GitHubアカウントを作成したら、**GitHubのユーザー名を平岩先生に伝えてください**。
招待メールが届いたら「Accept invitation」をクリックして承認します。

---

## STEP 3：Supabaseのセットアップ（データベース）

Supabaseは患者情報・予約データを保存するデータベースサービスです。

### 3-1. Supabaseアカウントを作成する

1. [Supabase](https://supabase.com) にアクセス
2. 「Start your project」をクリック
3. 「Continue with GitHub」を選択（STEP 2で作成したGitHubアカウントでログイン）

### 3-2. 新しいプロジェクトを作成する

1. 「New Project」をクリック
2. 以下を入力：
   - **Organization**: デフォルトのまま
   - **Project name**: `your-clinic-reserve`（院名を英語で）
   - **Database Password**: 安全なパスワードを設定して**必ずメモ**する
   - **Region**: `Northeast Asia (Tokyo)` を選択
3. 「Create new project」をクリック（プロジェクト作成に1〜2分かかります）

### 3-3. 接続情報をメモする

プロジェクトが作成されたら：

1. 左メニューの「Project Settings」（歯車アイコン）をクリック
2. 「Data API」タブを選択
3. 以下をメモ：
   - **Project URL**：`https://xxxxxxxxxxxx.supabase.co` の形式
   - **anon public**キー：`eyJhbGc...` で始まる長い文字列
4. 「Service Role」タブを選択（または「API Keys」から）
5. **service_role**キーをメモ（⚠️ 絶対に他人に見せないこと）

### 3-4. データベースのテーブルを作成する（SQL実行）

**平岩先生から「setup.sql」というファイルを受け取ってください。**

ファイルを受け取ったら：

1. Supabaseの左メニュー「SQL Editor」をクリック
2. 「New query」をクリック
3. 受け取ったSQLファイルの中身を全部コピーして貼り付ける
4. 「Run」ボタン（▶）をクリック
5. 「Success. No rows returned」と表示されれば完了

### 3-5. メールテンプレートの設定（パスワード再設定用）

1. 左メニュー「Authentication」→「Email Templates」
2. 「Confirm signup」テンプレートを開く
3. 設定はデフォルトのままでOK

---

## STEP 4：LINEチャネルの作成

患者さんへの予約リマインダーやLINE連携に使用します。

### 4-1. LINE公式アカウントを作成する

1. [LINE Official Account Manager](https://manager.line.biz) にアクセス
2. 「作成する」をクリック
3. LINEアプリでログイン（個人LINEアカウントでOK）
4. 以下を入力：
   - **アカウント名**：「○○接骨院」
   - **メールアドレス**：院のメールアドレス
   - **業種**：「医療・ヘルスケア」→「接骨院・整体院」
5. 作成完了

### 4-2. LINE Developersでチャネルを設定する

1. [LINE Developers](https://developers.line.biz) にアクセス
2. 同じLINEアカウントでログイン
3. 「プロバイダー」を作成（院名で作成）
4. 「新規チャネル作成」→「Messaging API」を選択
5. 以下を入力：
   - **チャネル名**：「○○接骨院」
   - **チャネル説明**：「○○接骨院の公式アカウントです」
   - **大業種**：「医療」
   - **小業種**：「病院・クリニック（その他）」
6. 「作成」をクリック

### 4-3. チャネルのシークレットとトークンをメモする

チャネル設定ページで：

1. 「Basic settings」タブ
   - **Channel secret**をメモ
2. 「Messaging API」タブ
   - 「Channel access token」の「Issue」ボタンをクリック
   - 表示されたトークンをメモ

### 4-4. 友だち追加URLをメモする

1. LINE Official Account Managerに戻る
2. 「アカウントページ」→「友だち追加ガイド」
3. 「URLをコピー」で `https://lin.ee/xxxxxxx` 形式のURLをメモ

---

## STEP 5：Google AI Studio（AIアシスタント用）

経営分析・ブログ提案などのAI機能に使用します。

### 5-1. APIキーを取得する

1. [Google AI Studio](https://aistudio.google.com) にアクセス
2. Googleアカウントでログイン
3. 左メニュー「Get API key」をクリック
4. 「Create API key」をクリック
5. 「Create API key in new project」を選択
6. 表示されたAPIキー（`AIzaSy...`で始まる）をメモ

> **注意：** APIキーは絶対に他人に見せないでください。

---

## STEP 6：Vercelへのデプロイ（システム公開）

Vercelはシステムをインターネットに公開するサービスです。

### 6-1. Vercelアカウントを作成する

1. [Vercel](https://vercel.com) にアクセス
2. 「Sign Up」をクリック
3. 「Continue with GitHub」を選択してGitHubアカウントでログイン

### 6-2. 新しいプロジェクトを作成する

1. Vercelダッシュボードで「Add New...」→「Project」をクリック
2. 「Import Git Repository」で平岩先生から招待されたリポジトリを選択
3. リポジトリが表示されない場合は「Adjust GitHub App Permissions」をクリックして権限を追加
4. リポジトリを選択して「Import」をクリック
5. 設定画面では**今は何も変更せずに**「Deploy」をクリック
   - ⚠️ この時点ではエラーになります（環境変数がまだ設定されていないため）→ 次のSTEPで設定します

---

## STEP 7：環境変数の設定

システムが動くために必要な接続情報（環境変数）を設定します。

### 7-1. Vercelの環境変数設定画面を開く

1. Vercelのプロジェクトページを開く
2. 上部タブの「Settings」をクリック
3. 左メニュー「Environment Variables」をクリック

### 7-2. 以下の変数を1つずつ追加する

「Add New」ボタンで追加。「Environment」はすべて「Production, Preview, Development」にチェックを入れる。

| 変数名 | 値 | 取得元 |
|-------|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | STEP 3-3でメモしたProject URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGc...` | STEP 3-3でメモしたanon公開キー |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGc...` | STEP 3-3でメモしたservice_roleキー |
| `LINE_CHANNEL_SECRET` | `abc123...` | STEP 4-3でメモしたChannel secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | `xxxx...` | STEP 4-3でメモしたChannel access token |
| `NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL` | `https://lin.ee/xxx` | STEP 4-4でメモした友だち追加URL |
| `GEMINI_API_KEY` | `AIzaSy...` | STEP 5-1でメモしたAPIキー |
| `OWNER_LINE_USER_ID` | （後で設定） | 管理者のLINE User ID（後述） |

### 7-3. 再デプロイする

1. 上部タブ「Deployments」をクリック
2. 最新のデプロイの右側「…」をクリック
3. 「Redeploy」を選択
4. 「Redeploy」ボタンをクリック
5. 2〜3分後、ステータスが「Ready」になれば完了

### 7-4. 公開URLを確認する

デプロイ完了後、プロジェクトページに表示される `https://your-project.vercel.app` がシステムのURLです。

---

## STEP 8：管理者アカウントの初期設定

### 8-1. Supabaseでメール認証を一時的に無効化する

（最初のアカウント作成を簡単にするため）

1. Supabase左メニュー「Authentication」→「Providers」
2. 「Email」の設定を開く
3. 「Confirm email」を**オフ**にして保存

### 8-2. 管理者アカウントを作成する

1. Supabase左メニュー「Authentication」→「Users」
2. 「Add user」→「Create new user」をクリック
3. 以下を入力：
   - **Email**：管理者のメールアドレス（普段使うアドレス）
   - **Password**：安全なパスワード（必ずメモ）
4. 「Create user」をクリック

### 8-3. clinic_usersテーブルにユーザーを登録する

1. Supabase「SQL Editor」を開く
2. 以下のSQLを実行（作成したユーザーのIDはAuthentication→Usersページで確認できます）：

```sql
-- 作成したユーザーのIDを確認
SELECT id, email FROM auth.users;

-- clinic_usersに登録（上で確認したidを使用）
INSERT INTO public.clinic_users (user_id, clinic_id, role)
VALUES (
  '（ここに上で確認したUUIDを入力）',
  '00000000-0000-0000-0000-000000000001',
  'owner'
);
```

### 8-4. 管理画面にログインする

1. ブラウザで `https://your-project.vercel.app/admin` を開く
2. STEP 8-2で設定したメール・パスワードでログイン
3. 管理画面ダッシュボードが表示されれば成功

### 8-5. メール認証を元に戻す（セキュリティのため）

1. Supabase「Authentication」→「Providers」→「Email」
2. 「Confirm email」を**オン**に戻して保存

---

## STEP 9：院の基本情報を設定する

### 9-1. 管理画面の設定ページを開く

1. 管理画面にログイン
2. 左メニュー「設定」をクリック

### 9-2. 院の基本情報を入力する

以下を設定してください：

- **院名**：表示される院の名前
- **住所**：院の住所
- **電話番号**：院の電話番号
- **診療時間**：平日・土曜などの診療時間
- **定休日**：休診日
- **予約枠の間隔**：15分・20分・30分など

### 9-3. LINEのWebhook URLを設定する

1. Vercelのプロジェクトページで公開URLを確認（例：`https://your-project.vercel.app`）
2. [LINE Developers](https://developers.line.biz) のチャネル設定を開く
3. 「Messaging API」タブ
4. 「Webhook URL」に以下を入力：
   ```
   https://your-project.vercel.app/api/line/webhook
   ```
5. 「Update」をクリック
6. 「Verify」をクリックして「Success」と表示されれば完了
7. 「Use webhook」をオンにする

### 9-4. OWNER_LINE_USER_IDを設定する（管理者通知用）

予約通知をLINEで受け取るために必要です。

1. LINEアプリで公式アカウントを友だち追加する
2. 「テスト」と送信する
3. Supabase「Table Editor」→「line_debug_logs」テーブルを開く
4. 送信したメッセージの「user_id」をコピー（`Uxxxxxxxxxx`の形式）
5. Vercel「Settings」→「Environment Variables」で `OWNER_LINE_USER_ID` を追加
6. 再デプロイする

---

## STEP 10：患者さんのLINE紐づけ

患者さんの予約リマインダーや誕生月クーポンをLINEで送るには、患者さんのLINEアカウントと院内の患者情報を「紐づけ」する必要があります。

### 紐づけの方法は3つあります

---

### 方法A：患者さん自身がスマホで操作する（最も簡単）

患者さんが自分でスマホを操作できる場合。

1. 患者さんにLINEで公式アカウントを友だち追加してもらう
2. 友だち追加後、LINEに **電話番号の下4桁** を送信してもらう
   - 例：電話番号が `090-1234-5678` の場合は `5678` と送る
3. 自動で紐づけ完了のメッセージが返信される

---

### 方法B：アンケートページを使う（初来院時に便利）

初診の患者さんが予約時にアンケートを記入した場合。

1. アンケート完了画面に「電話番号の下4桁」が大きく表示される
2. その画面を見ながら患者さんにLINEへ送信してもらう
3. 自動で紐づけ完了

---

### 方法C：スタッフが管理画面から手動で紐づける（高齢の患者さん向け）

スマホ操作が難しい患者さんにはスタッフが代わりに操作します。

**手順：**

1. 患者さんにLINEのボットへ **何でもいいのでメッセージを1件** 送ってもらう（「こんにちは」など）
2. 管理画面 → 左メニュー「**顧客管理**」を開く
3. 該当の患者さんの行にある **「未紐づけ」ボタン** をクリック
4. ダイアログ下部に「最近LINEにメッセージを送ってきた方」のリストが表示される
5. 患者さんが送ったメッセージが一覧に表示されているので「**登録**」ボタンをクリック
6. 「紐づけました」と表示されれば完了

> **ポイント：** メッセージの内容で本人確認できます。例えば「こんにちは」「よろしく」など患者さんに送ってもらった内容と一致しているか確認してから登録してください。

---

### LINE User IDを直接入力して登録する方法

Supabaseのログから直接USER IDを調べて入力することもできます。

1. [Supabase](https://supabase.com) → プロジェクトを開く
2. 左メニュー「**Table Editor**」→「**line_debug_logs**」テーブルを開く
3. `created_at` 列で降順ソートして最新メッセージを確認
4. `message` 列でメッセージ内容を確認し、患者さんを特定する
5. その行の `user_id`（`Uxxxxxxxxxx...` の形式）をコピー
6. 顧客管理 → 「未紐づけ」ボタン → **「LINE User IDを直接入力して登録」** 欄に貼り付けて「登録」をクリック

---

### 紐づけの解除

誤って紐づけした場合や患者さんがスマホを変えた場合：

1. 顧客管理で該当患者の「**紐づけ済**」ボタン（緑色）をクリック
2. 「紐づけを解除する」ボタンをクリック
3. その後、正しいアカウントで再紐づけする

---

## アップデートの受け取り方

平岩先生がシステムを改善・更新した場合、自動的にVercelが検知して再デプロイが始まります。

**通常は何も操作は不要です。**

Vercelのプロジェクトページで「Deployments」タブを確認すると、いつ更新があったか確認できます。

---

## よくあるトラブルと対処法

### Q. 管理画面にログインできない

- Supabaseでユーザーが正しく作成されているか確認
- `clinic_users`テーブルにユーザーが登録されているか確認
- パスワードを間違えていないか確認
- それでも解決しない場合は平岩先生に連絡

### Q. 予約ページが白い画面で表示される

- Vercelの環境変数が正しく設定されているか確認
- 特に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を再確認
- 再デプロイを試みる

### Q. LINEのWebhook接続で「Verify」が失敗する

- Vercelのデプロイが「Ready」状態か確認
- Webhook URLが正しいか確認（末尾に `/api/line/webhook` が付いているか）
- LINE Developers で「Use webhook」がオンになっているか確認

### Q. AIアシスタントが動かない

- `GEMINI_API_KEY` が正しく設定されているか確認
- Google AI Studioで該当のAPIキーが有効か確認

### Q. SQLを実行するとエラーが出る

- エラーメッセージをスクリーンショットで撮り、平岩先生に連絡

---

## 連絡先

システムに関するご質問・トラブルは平岩先生にご連絡ください。

---

*このマニュアルは2026年4月時点の情報です。サービスのUI変更等により手順が変わる場合があります。*
