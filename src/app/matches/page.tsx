import { createClient } from "@supabase/supabase-js";

// 試合専用の公開エンドポイント（サーバー側で「試合」固定。URL改ざんでも私的予定は出ない）
const ICAL_URL = "https://ball-clinic-reserve.vercel.app/api/ical/redold";
const WEBCAL_URL = "webcal://ball-clinic-reserve.vercel.app/api/ical/redold";
const GOOGLE_URL = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(WEBCAL_URL)}`;

// DB を単一の真実とするため毎回最新を取得（対戦相手が決まれば即反映）
export const dynamic = "force-dynamic";

const WD = ["日", "月", "火", "水", "木", "金", "土"];

type Match = { date: string; time: string; title: string; kubun: "知事杯" | "リーグ戦"; venue: string };

// DB 取得に失敗してもページが壊れないようにするフォールバック（全16試合）
const FALLBACK: Match[] = [
  { date: "4月5日（日）",   time: "15:10", title: "🔴 vs 徳島SFC50",                kubun: "リーグ戦", venue: "" },
  { date: "5月10日（日）",  time: "15:20", title: "🔴 vs Z団",                      kubun: "リーグ戦", venue: "TSV人工" },
  { date: "5月17日（日）",  time: "11:10", title: "🔴 vs 鳴門クラブ",               kubun: "リーグ戦", venue: "山川総合" },
  { date: "5月24日（日）",  time: "13:30", title: "🔴 vs 応神・鴨島FC",             kubun: "リーグ戦", venue: "南岸第3" },
  { date: "5月31日（日）",  time: "10:20", title: "知事杯 1回戦 vs 鳴門リゾート",    kubun: "知事杯",   venue: "上桜" },
  { date: "6月7日（日）",   time: "17:10", title: "🔴 vs T-C-O-SC",                 kubun: "リーグ戦", venue: "上桜" },
  { date: "6月28日（日）",  time: "15:50", title: "🔴 vs 吉野倶楽部",               kubun: "リーグ戦", venue: "山川総合" },
  { date: "7月26日（日）",  time: "11:40", title: "知事杯 準々決勝",                kubun: "知事杯",   venue: "鳴門球技場" },
  { date: "9月27日（日）",  time: "11:10", title: "🔴 vs REBORN",                   kubun: "リーグ戦", venue: "山川総合" },
  { date: "10月11日（日）", time: "17:30", title: "知事杯 準決勝",                  kubun: "知事杯",   venue: "上桜" },
  { date: "10月25日（日）", time: "9:30",  title: "知事杯 決勝",                    kubun: "知事杯",   venue: "鳴門球技場" },
  { date: "11月1日（日）",  time: "14:40", title: "🔴 vs 阿南シニアフットボールクラブ", kubun: "リーグ戦", venue: "あわぎん" },
  { date: "11月29日（日）", time: "14:40", title: "🔴 vs SCRATCH+",                 kubun: "リーグ戦", venue: "山川総合" },
  { date: "12月20日（日）", time: "14:40", title: "🔴 vs RE BORN",                  kubun: "リーグ戦", venue: "山川総合" },
  { date: "1月10日（日）",  time: "11:30", title: "🔴 vs 徳島市シニアサッカークラブ",   kubun: "リーグ戦", venue: "TSV人工" },
  { date: "1月17日（日）",  time: "12:20", title: "🔴 vs 鳴門 Rizort",              kubun: "リーグ戦", venue: "山川総合" },
];

async function getMatches(): Promise<Match[]> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase
      .from("calendar_events")
      .select("title,description,start_time")
      .eq("calendar_id", "76p83beb")
      .eq("member_name", "試合")
      .order("start_time", { ascending: true });
    if (error || !data || data.length === 0) return FALLBACK;
    return data.map((e) => {
      // UTC を +9h して UTC フィールドを読むと JST の壁時計になる
      const jst = new Date(new Date(e.start_time).getTime() + 9 * 3600 * 1000);
      const date = `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日（${WD[jst.getUTCDay()]}）`;
      const time = `${jst.getUTCHours()}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
      const m = (e.description || "").match(/会場[：:]\s*([^\n]+)/);
      const venue = m ? m[1].trim() : "";
      const kubun: Match["kubun"] = (e.title || "").startsWith("知事杯") ? "知事杯" : "リーグ戦";
      return { date, time, title: e.title as string, kubun, venue };
    });
  } catch {
    return FALLBACK;
  }
}

export default async function MatchesPage() {
  const matches = await getMatches();
  const kuniCount = matches.filter((m) => m.kubun === "知事杯").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-950 to-slate-900 flex flex-col items-center justify-start py-10 px-4">
      <div className="w-full max-w-md space-y-6">

        {/* ヘッダー */}
        <div className="text-center space-y-1">
          <div className="text-4xl font-black text-white tracking-tight">⚽ レッドオールド</div>
          <div className="text-red-300 font-bold text-lg">2026 試合日程</div>
          <div className="text-white/50 text-xs">
            全{matches.length}試合（リーグ戦 {matches.length - kuniCount} ／ 知事杯 {kuniCount}）
          </div>
        </div>

        {/* 試合一覧 */}
        <div className="space-y-3">
          {matches.map((m, i) => (
            <div key={`${m.date}-${i}`} className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-bold text-white px-2 py-0.5 rounded-full ${
                    m.kubun === "知事杯" ? "bg-red-600" : "bg-blue-600"
                  }`}
                >
                  {m.kubun}
                </span>
                <span className="text-white/60 text-xs">{m.date}</span>
              </div>
              <div className="text-white font-bold text-base mt-1">{m.title}</div>
              <div className="flex items-center gap-3 text-sm text-white/70 mt-1">
                <span>⏰ {m.time}</span>
                {m.venue && <span>📍 {m.venue}</span>}
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
