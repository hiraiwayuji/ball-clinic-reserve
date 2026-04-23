# 新規クリニック導入ガイド（最終更新: 2026-04-23）

---

## 📊 現在の導入状況

| クリニック | Vercel | Supabase | 管理者アカウント | 配布資料 |
|---|---|---|---|---|
| からだ鍼灸整骨院 | ✅ https://karada-clinic.vercel.app | ✅ 作成済み | ✅ 設定済み (karada@gmail.com) | ✅ handover_karada.html |
| relaq 鍼灸マッサージ治療院 | ✅ https://relaq-clinic.vercel.app | ✅ 作成済み (clinic_id: 021efe2a-a768-4fa6-9de8-62cae9a79d47) | ⚠️ 要確認 | ✅ handover_relaq.html |
| マッスル整体 | ❌ 未作成 | ⚠️ 要実行 (muscle_setup.sql) | ❌ 未作成 | ✅ handover_muscle.html |

---

## ✅ マッスル整体 — 残り作業（優先順）

### STEP 1: Supabase に clinic_settings レコード作成
1. [Supabase SQL Editor](https://supabase.com/dashboard/project/uatmzcnoumafeuzprkdo/sql/new) を開く
2. `muscle_setup.sql` の STEP1 を実行
3. 表示された `id`（UUID）をメモ

### STEP 2: Vercel プロジェクト作成
1. [Vercel Dashboard](https://vercel.com) → **Add New Project**
2. リポジトリ: `hiraiwayuji/ball-clinic-reserve` を選択
3. Project Name: `muscle-clinic`
4. `muscle_vercel_env.txt` の内容を環境変数に入力（STEP1のUUIDを `NEXT_PUBLIC_CLINIC_ID` に設定）
5. **Deploy** → `https://muscle-clinic.vercel.app` で確認

### STEP 3: コース設定（任意・導入当日でも可）
`muscle_setup.sql` の STEP2（コメントアウト部分）を解除して実行

---

## ✅ relaq — 残り作業確認

- [ ] 管理者アカウントが作成済みか確認
- [ ] 未作成の場合: `https://relaq-clinic.vercel.app/register` でセットアップコード `relaq123` で登録
- [ ] LINE チャネル設定（任意・後から可）

---

## ✅ からだ鍼灸整骨院 — 完了事項

- ✅ Vercel デプロイ済み
- ✅ 管理者アカウント作成済み (karada@gmail.com)
- ✅ ロゴ設定済み (/images/karadalogo.png)
- [ ] LINE チャネル設定（任意・後から可）

---

## 配布資料一覧

| ファイル | 対象 | 内容 |
|---|---|---|
| `handover_karada.html` | からだ鍼灸整骨院 院長 | ログイン情報・初回設定手順（PDF印刷可） |
| `handover_relaq.html` | relaq 担当者 | 登録URL・セットアップコード・手順（PDF印刷可） |
| `handover_muscle.html` | マッスル整体 川上様 | 登録URL・セットアップコード・手順（PDF印刷可） |
| `manual_first_setup.html` | 全院共通 | 詳細な初回設定マニュアル（PDF印刷可） |
| `muscle_vercel_env.txt` | 開発者（自分） | マッスル整体Vercel環境変数（コピペ用） |
| `muscle_setup.sql` | 開発者（自分） | マッスル整体 Supabase SQL |
| `relaq_setup.sql` | 参照用 | relaq Supabase SQL（実行済み） |
| `karada_setup.sql` | 参照用 | karada Supabase SQL（実行済み） |

---

## 導入当日の手順（各院共通）

### 所要時間の目安: 20〜30分

**STEP A: アカウント登録（5分）**
- 事前に配布した `handover_xxx.html` の登録URLを開く
- メールアドレス・パスワード・セットアップコードを入力

**STEP B: 院情報の設定（5分）**
- `/admin/settings` で院名・電話番号・住所・営業時間を入力

**STEP C: コース・スタッフ設定（5分）**
- `/admin/settings` → 予約コース・スタッフ設定でメニューを追加

**STEP D: 動作確認（5分）**
- `/admin/dashboard` → ダッシュボード確認
- `/reserve` → 患者向け予約ページ確認

---

## よくある問題と対処法

| 問題 | 原因 | 対処 |
|------|------|------|
| ログインできない | clinic_usersに紐付けなし | Supabase → clinic_users テーブルを確認 |
| セットアップコードエラー | SETUP_PASSWORD環境変数と不一致 | Vercel → Environment Variablesを確認 |
| 予約データが見えない | clinic_idフィルタ | clinic_usersのclinic_idを確認 |
| LINE通知が来ない | 環境変数未設定 | Vercel → Environment Variablesを確認・再デプロイ |

---

## クリニック別メモ

| | relaq | karada | マッスル整体 |
|--|-------|--------|------------|
| clinic_id | 021efe2a-a768-4fa6-9de8-62cae9a79d47 | d3b55abc-46a6-4cbe-8198-21c0392d9a2e | ※STEP1実行後に記入 |
| Vercel URL | https://relaq-clinic.vercel.app | https://karada-clinic.vercel.app | https://muscle-clinic.vercel.app |
| SETUP_PASSWORD | relaq123 | karada2026 | muscle2026 |
| 担当者メール | | karada@gmail.com | 川上様メール |
| 導入日 | | | |
| 営業時間 | 火水木 9:00〜18:30 / 金土 10:00〜17:30（月・祝休診） | 月火木金土 10:00〜20:00（水・日・祝休診） | 月曜定休・要確認 |
| 住所 | 〒771-0212 徳島県板野郡松茂町中喜来字前原東一番越1-7 | | 〒761-8078 香川県高松市仏生山町甲1667-1 |
| 電話 | 088-678-7949 | | 087-888-8144 |
