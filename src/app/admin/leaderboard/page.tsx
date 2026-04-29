import { checkAdminAuth } from "@/app/actions/auth";
import { getLeaderboard } from "@/app/actions/security";
import { Trophy, Medal, Award, Sparkles } from "lucide-react";

export default async function LeaderboardPage() {
  const auth = await checkAdminAuth();
  const rows = await getLeaderboard();

  return (
    <div className="container mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <Trophy className="w-7 h-7 text-amber-500" />
          スタッフリーダーボード
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          予約対応・売上記帳・経費登録などの活動でポイントが貯まります。今週の MVP は誰だ？
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border p-10 text-center text-slate-500">
          <Sparkles className="w-10 h-10 mx-auto text-slate-300 mb-3" />
          まだポイントが記録されていません。<br />
          予約作成や売上記帳などのアクションで自動的に加算されます。
        </div>
      ) : (
        <ol className="space-y-2">
          {rows.map((r) => {
            const isMe = r.user_id === auth.userId;
            const podium = r.rank === 1 ? "from-amber-100 to-yellow-50 border-amber-300" : r.rank === 2 ? "from-slate-100 to-slate-50 border-slate-300" : r.rank === 3 ? "from-orange-100 to-amber-50 border-orange-300" : "from-white to-white border-slate-200";
            return (
              <li
                key={r.user_id}
                className={`bg-gradient-to-r dark:from-slate-800 dark:to-slate-900 dark:border-slate-700 ${podium} border rounded-xl p-4 flex items-center gap-4 ${isMe ? "ring-2 ring-emerald-400" : ""}`}
              >
                <div className="w-12 text-center">
                  {r.rank === 1 && <Trophy className="w-6 h-6 text-amber-500 mx-auto" />}
                  {r.rank === 2 && <Medal className="w-6 h-6 text-slate-500 mx-auto" />}
                  {r.rank === 3 && <Award className="w-6 h-6 text-orange-500 mx-auto" />}
                  {r.rank > 3 && <span className="font-bold text-slate-500">#{r.rank}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                    {r.user_email ?? "(匿名)"}
                    {isMe && <span className="ml-2 text-xs text-emerald-600 font-normal">あなた</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {r.entry_count} アクション
                    {r.last_earned_at && ` · 最終獲得 ${new Date(r.last_earned_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{r.total_points.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">pt</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <section className="bg-slate-50 dark:bg-slate-800/30 border rounded-xl p-4 text-xs text-slate-500 space-y-1">
        <div className="font-bold text-slate-600 dark:text-slate-300">獲得ルール</div>
        <ul className="list-disc list-inside space-y-0.5">
          <li>予約作成 +5pt</li>
          <li>来院完了 +10pt</li>
          <li>売上記帳 +8pt</li>
          <li>経費登録 +4pt</li>
          <li>NoShow 扱い -2pt / キャンセル -3pt</li>
        </ul>
      </section>
    </div>
  );
}
