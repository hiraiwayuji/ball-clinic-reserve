import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * /admin/* 配下のリクエストでのみ動作。session cookie の refresh だけ行い、
 * auth リダイレクトは src/app/admin/layout.tsx の checkAdminAuth() に委譲。
 *
 * matcher を絞る理由:
 * - 顧客側ページ・LIFF・API・cron が middleware を経由しないことで、
 *   middleware の cold start ペナルティを admin 以外には及ぼさない。
 * - 将来 /staff/* 等の認証要ルートを追加する場合はここに追記する。
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/admin/:path*'],
}
