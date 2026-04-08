import Link from "next/link";

const ICAL_URL = "https://ball-clinic-reserve.vercel.app/api/ical/76p83beb?member=%E8%A9%A6%E5%90%88";
const WEBCAL_URL = "webcal://ball-clinic-reserve.vercel.app/api/ical/76p83beb?member=%E8%A9%A6%E5%90%88";
const GOOGLE_URL = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(WEBCAL_URL)}`;

const matches = [
  { date: "5月31日（日）", round: "1回戦", venue: "上桜", kickoff: "10:20", opponent: "鳴門リゾート" },
  { date: "7月26日（日）", round: "準々決勝", venue: "鳴門球技場", kickoff: "11:40", opponent: "未定" },
  { date: "10月11日（日）", round: "準決勝", venue: "上桜", kickoff: "17:30", opponent: "未定" },
  { date: "10月25日（日）", round: "決勝", venue: "鳴門球技場", kickoff: "9:30", opponent: "未定" },
];

export default function MatchesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-950 to-slate-900 flex flex-col items-center justify-start py-10 px-4">
      <div className="w-full max-w-md space-y-6">

        {/* ヘッダー */}
        <div className="text-center space-y-1">
          <div className="text-4xl font-black text-white tracking-tight">⚽ レッドオールド</div>
          <div className="text-red-300 font-bold text-lg">知事杯 2026 日程</div>
        </div>

        {/* 試合一覧 */}
        <div className="space-y-3">
          {matches.map((m) => (
            <div key={m.date} className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">{m.round}</span>
                <span className="text-white/60 text-xs">{m.date}</span>
              </div>
              <div className="text-white font-bold text-base mt-1">
                キックオフ {m.kickoff}
              </div>
              <div className="flex items-center gap-3 text-sm text-white/70 mt-1">
                <span>📍 {m.venue}</span>
                <span>vs {m.opponent}</span>
              </div>
            </div>
          ))}
        </div>

        {/* カレンダー追加ボタン */}
        <div className="space-y-3 pt-2">
          <p className="text-white/60 text-xs text-center">カレンダーに追加して日程を管理しよう</p>

          {/* Google カレンダー */}
          <a
            href={GOOGLE_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-3 w-full bg-white text-slate-800 font-bold py-4 rounded-2xl shadow-lg text-sm hover:bg-slate-100 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Googleカレンダーに追加
          </a>

          {/* iPhone カレンダー */}
          <a
            href={WEBCAL_URL}
            className="flex items-center justify-center gap-3 w-full bg-white/10 border border-white/30 text-white font-bold py-4 rounded-2xl text-sm hover:bg-white/20 transition-colors"
          >
            <span className="text-xl">📅</span>
            iPhoneカレンダーに追加
          </a>

          {/* .ics ダウンロード */}
          <a
            href={ICAL_URL}
            className="flex items-center justify-center w-full text-white/40 text-xs py-2 hover:text-white/60 transition-colors"
          >
            .icsファイルをダウンロード（その他のカレンダー用）
          </a>
        </div>

        <p className="text-white/30 text-[10px] text-center pb-4">
          対戦相手が決まり次第、カレンダーに自動反映されます
        </p>
      </div>
    </div>
  );
}
