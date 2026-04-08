# ボール接骨院 予約・経営管理システム 技術設計図（SYSTEM BLUEPRINT）

本ドキュメントは、**ボール接骨院**のデジタルトランスフォーメーション（DX）を支えるシステムの全貌、アーキテクチャ、およびデータベース設計をまとめた公式設計図です。

---

## 1. プロジェクト概要
- **ミッション**: 院長「ぼーるくん」の経営判断をAIがサポートし、患者様にはプレミアムな予約体験を提供する。
- **コアバリュー**:
    - **患者向け**: 24時間いつでも、迷わずスマートに予約・キャンセル待ちができる。
    - **院長向け**: 売上・予約状況のリアルタイム可視化と、AI（軍師）によるアクション提案。

## 2. システムアーキテクチャ
本システムはモダンなWebスタックを採用し、スピードと柔軟性を両立しています。

- **Frontend**: [Next.js](https://nextjs.org/) (App Router)
    - 言語: TypeScript
    - スタイリング: Tailwind CSS
    - UIコンポーネント: shadcn/uiベースの独自設計
    - デザインテーマ: 高級感のあるダークグラスモフィズム、洗練されたアニメーション
- **Backend / Infrastructure**: [Supabase](https://supabase.com/)
    - 認証: Supabase Auth
    - データベース: PostgreSQL
    - リアルタイム同期: Supabase Realtime (ダッシュボード通知に使用)
    - ストレージ: 領収書画像管理用バケット
- **AI Layers**: [Google Gemini Pro / Flash](https://ai.google.dev/)
    - 経営分析、ブログ下書き生成、SNSタスク提案、LINE配信案作成
- **Integrations**:
    - **LINE Messaging API**: 予約通知、マーケティング配信
    - **Resend**: 予約確定メール通知

---

## 3. データベース設計（主要テーブル）
マルチテナント対応（`clinic_id`）を前提とした、拡張性の高いスキーマ構成です。

| テーブル名 | 用途 | 主なカラム |
| :--- | :--- | :--- |
| `customers` | 顧客（患者）情報 | `id`, `name`, `phone`, `line_user_id`, `booking_suspended` |
| `appointments` | 予約データ | `id`, `customer_id`, `start_time`, `end_time`, `status`, `is_first_visit`, `memo` |
| `cash_sales` | 窓口自費売上 | `id`, `sale_date`, `customer_name`, `treatment_fee`, `memo` |
| `insurance_payments` | 保険入金記録 | `id`, `payment_month`, `insurance_name`, `amount` |
| `clinic_expenses` | 経費記録 | `id`, `expense_date`, `category`, `description`, `amount` |
| `clinic_targets` | 経営目標 | `month`, `target_income`, `target_sns_tasks` |
| `daily_tasks` | AI提案タスク | `task_date`, `title`, `description`, `status`, `type` |
| `clinic_holidays` | 休診日管理 | `date`, `name` |

---

## 4. 重点機能とロジック

### ① 予約システム（Patient Experience）
- **空き枠判定**: 30分単位の枠管理（初診60分、再診30分）。
- **予約制限**:
    - Web予約は**1ヶ月先**まで。
    - 直前**2時間以内**はWeb予約不可（電話誘導）。
    - 重複予約防止のバリデーション。
- **キャンセル待ち（Waitlist）**: 枠が埋まっている場合に、希望時間帯（例: 15:00-20:00）で登録可能。

### ② 経営管理ダッシュボード（Admin Experience）
- **リアルタイムメトリクス**: 当日の売上進捗（対目標）、来院数、SNSタスク達成率を表示。
- **AI軍師（経営参謀）**:
    - `getBusinessContext` アクションにより、全データを集計してGeminiへ送信。
    - 「あと何人で目標達成か」「バズりそうなブログテーマは何か」を具体的に提案。
- **経費トリアージ**: 領収書画像を一時保存し、後で正式な経費として登録する非同期フロー。

### ③ LINEマーケティング
- **プッシュ通知**: 予約受付時、自動で院長と患者へ通知（患者側は将来対応予定）。
- **セグメント配信案**: 経営分析に基づき、特定の層（久しぶりの患者など）へのメッセージ案をAIが生成。

---

## 5. セキュリティ
- **認証ガード**: `checkAdminAuth` ミドルウェア・サーバーアクションにより、管理者以外のアクセスを厳格に制限。
- **RLS (Row Level Security)**: データベースレベルで院ごとのデータ分離を徹底予定（現在は `clinic_id` によるフィルタリング）。

---

## 6. デザインシステム・美学
- **Colors**:
    - Primary: Slate-900 / Blue-600
    - Success: Emerald-500
    - Warning: Amber-500
- **Aesthetics**:
    - ガラス（Glassmorphism）効果を用いた、情報の透明性とレイヤー構造。
    - ページ遷移やモーダル開閉時の `framer-motion`（CSSアニメーション）による滑らかな体験。
    - デバイスサイズを問わない、完全レスポンシブなモバイルファースト設計。

---
> [!NOTE]
> この設計図はシステムの進化に合わせて随時更新されます。
> 最新の開発状況は `task.md` および `walkthrough.md` を参照してください。
