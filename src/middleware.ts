import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // 認証チェックが必要なルートだけに限定。
  // 全パスに広げると middleware 内の Supabase Auth API 呼び出しが朝一の
  // cold start で詰まり MIDDLEWARE_INVOCATION_TIMEOUT(504) を起こす。
  // 将来 /staff/* など別の認証要ルートを追加する場合はここに追記する。
  matcher: ['/admin/:path*'],
}
