import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * /admin/* 配下のリクエストで Supabase の session cookie を refresh する。
 *
 * Supabase SSR (@supabase/ssr) は middleware で session を維持するのが
 * 標準パターン。これを省くと、Server Component / Server Action で
 * cookie を set できない制約と相まって、ログイン直後にセッションが
 * 失効判定されてループする問題が起きる。
 *
 * - auth.getSession() は cookie ローカル読み取りのみで外部 API を叩かず、
 *   かつ必要なら token refresh を試みる（refresh は内部で軽量に処理）。
 * - 認証チェック・リダイレクトは src/app/admin/layout.tsx の
 *   checkAdminAuth() に集約しているので middleware 側では行わない。
 *   これにより middleware の処理が常に軽量で、cold start でも timeout
 *   する余地がない。
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // cookie からの session 読み取り + 必要なら token refresh のみ。
  // 外部 Auth API への getUser は呼ばない（cold start で詰まる原因）。
  await supabase.auth.getSession()

  return supabaseResponse
}
