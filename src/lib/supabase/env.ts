/**
 * Supabase の公開設定（URL・公開キー）を「前後の空白・改行を落として」返す。
 *
 * 背景（2026-09-10 ボール接骨院）:
 *   Vercel の NEXT_PUBLIC_SUPABASE_ANON_KEY の末尾に改行（CRLF）が付いていて、
 *   Realtime の WebSocket URL が `...apikey=sb_publishable_...%0D%0A` になり、
 *   予約サイトのリアルタイム更新が全部つながらなかった。
 *   HTTP ヘッダーは fetch が自動で trim するので通常の通信は動いてしまい、気づきにくい。
 *   env の貼り付け事故は過去にも起きている（runbook_vercel_env_trailing_whitespace）ので、
 *   値を使う側で必ず trim する。
 *
 * ⚠ NEXT_PUBLIC_ はビルド時に文字列として埋め込まれるため、
 *   process.env.NEXT_PUBLIC_XXX をそのまま書く必要がある（動的なキー名は不可）。
 */
export function supabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
}

export function supabaseAnonKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
}
