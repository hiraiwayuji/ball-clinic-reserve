import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronLeft } from "lucide-react";
import { checkAdminAuthLite } from "@/app/actions/auth";

/**
 * /admin の外にあるスタッフ用ページ（打刻・休み希望）に「ホームに戻る」を出す。
 *
 * これらのページは共用タブレットや LINE から開く前提で /admin の外に置いてあるため
 * 管理サイドバーが付かず、2026-08-29 に「勤怠から戻れない」と報告があった。
 *
 * ログインしていない人（タブレット・LINE から開いた人）には管理画面の入口を見せても
 * 迷わせるだけなので、ログイン済みのときだけ表示する。
 * checkAdminAuthLite は未ログインなら null を返すだけでリダイレクトしない。
 *
 * ただし打刻ページは元々「認証ゼロ」で開けるのが取り柄なので、Supabase の認証Cookieが
 * そもそも無いときは問い合わせ自体を行わない。Supabase が詰まっている時に共用タブレットの
 * 打刻画面が出てこない、という事故を持ち込まないため。
 */
export default async function StaffBackToAdmin() {
  const jar = await cookies();
  const hasAuthCookie = jar
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (!hasAuthCookie) return null;

  let loggedIn = false;
  try {
    loggedIn = !!(await checkAdminAuthLite());
  } catch {
    loggedIn = false;
  }
  if (!loggedIn) return null;

  return (
    <div className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-md mx-auto px-2 py-2">
        <Link
          href="/admin/dashboard"
          className="inline-flex items-center gap-1 h-10 px-3 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 shrink-0" />
          ホームに戻る
        </Link>
      </div>
    </div>
  );
}
