/**
 * 公開予約ページ用のデフォルト clinic_id
 * 環境変数 NEXT_PUBLIC_CLINIC_ID が設定されていればそれを使用。
 * 未設定の場合は ボール接骨院（開発環境・ボール接骨院本番）のIDにフォールバック。
 */
export const PUBLIC_CLINIC_ID =
  process.env.NEXT_PUBLIC_CLINIC_ID ?? "00000000-0000-0000-0000-000000000001";
