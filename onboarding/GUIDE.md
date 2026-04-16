# 新規クリニック導入ガイド

## 導入当日までにやること（あなた側の準備）

### 1. Supabase に事前レコード作成（15分）

[Supabase SQL Editor](https://supabase.com/dashboard/project/uatmzcnoumafeuzprkdo/sql/new) を開き、以下を実行：

```
relaq_setup.sql  → STEP1 だけ実行 → clinic_id をメモ
karada_setup.sql → STEP1 だけ実行 → clinic_id をメモ
```

### 2. Vercel プロジェクトを新規作成（各10分）

1. [Vercel Dashboard](https://vercel.com) → **Add New Project**
2. `hiraiwayuji/ball-clinic-reserve` リポジトリを選択
3. Project Name を設定（例: `relaq-clinic`, `karada-clinic`）
4. **Environment Variables** を `vercel_env_template.txt` に沿って入力
   - LINE 情報以外はすべて入力可能
   - `SETUP_PASSWORD` は各クリニック固有のコードを設定
5. **Deploy** → URLを確認

---

## 導入当日の手順（クリニック担当者と一緒に実施）

### 所要時間の目安: 30〜45分

---

### STEP A: アカウント作成（5分）

1. 事前に用意した Vercel URL を担当者に共有
   - relaq: `https://relaq-clinic.vercel.app/register`
   - karada: `https://karada-clinic.vercel.app/register`

2. 登録フォームに入力してもらう：
   - **クリニック名**: 正式名称
   - **メールアドレス**: 普段使いのもの
   - **パスワード**: 8文字以上
   - **セットアップコード**: 事前に設定した `SETUP_PASSWORD` を伝える

3. 登録完了 → 自動でダッシュボードへ

---

### STEP B: 院情報の設定（10分）

`/admin/settings` で以下を入力：

| 項目 | 内容 |
|------|------|
| クリニック名 | 正式名称 |
| 電話番号 | 代表番号 |
| 住所 | 所在地 |
| HP URL | 公式サイト |
| エリア名 | 例: 川内市、鹿児島市 |

---

### STEP C: LINE連携（10分）

**事前に必要なもの**: LINE Developers アカウント + Messaging API チャネル

1. [LINE Developers](https://developers.line.biz/) でチャネルを確認
2. `/admin/settings` → LINE設定タブ に入力：
   - Channel Access Token（長期）
   - Channel Secret
   - 公式アカウントURL
3. Vercel Dashboard の環境変数も更新して再デプロイ

---

### STEP D: コース・スタッフ設定（5分）

`/admin/settings` → コース設定・スタッフ設定 タブで追加

**relaq 参考コース:**
- 鍼灸治療 / 60分
- マッサージ（30分）
- 鍼灸＋マッサージ / 90分

**karada 参考コース:**
- 初回検査・施術 / 60分
- 再診施術 / 30分
- 鍼灸治療 / 45分

---

### STEP E: 動作確認（5分）

- `/admin/dashboard` — ダッシュボード表示
- `/admin/appointments` — 予約カレンダー（テスト予約追加）
- `/admin/counter` — 受付カウンター
- 予約ページ（公開側）: `https://【url】/reserve`

---

## よくある問題と対処法

| 問題 | 原因 | 対処 |
|------|------|------|
| ログインできない | clinic_users に紐付けなし | Supabase Dashboard → SQL Editor で `clinic_users` を確認 |
| 予約データが見えない | clinic_id フィルタ | clinic_users の clinic_id を確認 |
| LINE通知が来ない | 環境変数未設定 | Vercel → Environment Variables を確認・再デプロイ |
| デプロイエラー | 環境変数不足 | Vercel ビルドログを確認 |

---

## メモ欄

| | relaq | karada |
|--|-------|--------|
| clinic_id | 021efe2a-a768-4fa6-9de8-62cae9a79d47 | d3b55abc-46a6-4cbe-8198-21c0392d9a2e |
| Vercel URL | https://relaq-clinic.vercel.app | https://karada-clinic.vercel.app |
| SETUP_PASSWORD | relaq123 | karada2026 |
| 担当者メール | | |
| LINE Channel ID | | |
| 導入日 | | |
| 営業時間 | | 月火木金土 10:00〜20:00（水・日・祝休診） |
| 備考 | | ランチタイム営業・訪問治療あり[10:00〜16:00] |
