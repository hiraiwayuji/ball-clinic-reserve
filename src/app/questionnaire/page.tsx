"use client";

import { useEffect, useMemo, useState } from "react";
import ClinicWordmark from "@/components/ClinicWordmark";
import Link from "next/link";
import { CheckCircle2, MessageCircle, ArrowLeft, ChevronRight } from "lucide-react";
import { submitQuestionnaire } from "@/app/actions/questionnaire";
import { createReservation } from "@/app/actions/reserve";
import { getPublicClinicSettings } from "@/app/actions/publicSettings";
import { toast } from "sonner";
import { CLINIC_CONFIG } from "@/lib/clinic-config";

// 予約ページから引き継ぐ「選んだ日時・お名前・電話」（reserve/page.tsx と同じキー）
const PENDING_BOOKING_KEY = "ballClinic_pendingBooking";

type PendingBooking = {
  date: string;
  time: string;
  visitType: string;
  name: string;
  phone: string;
  isWaitlistIntent?: boolean;
  courseId?: string;
  courseName?: string;
  courseDurationMinutes?: number | null;
  staffId?: string;
  staffName?: string;
  roomId?: string;
  roomName?: string;
};

// "2026-06-10" → "6月10日（火）" のような表示にする（引き継ぎ確認の見出し用）。
function formatPendingDate(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const wd = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${Number(m[2])}月${Number(m[3])}日（${wd}）`;
}

// LINE 公式アカウント URL のフォールバック（env も DB も無いときのみ）
const LINE_URL_FALLBACK =
  process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL ?? "https://line.me/R/ti/p/%40shc8761q";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const AGE_GROUPS = ["19歳以下", "20代", "30代", "40代", "50代", "60代以上"];

// 47都道府県（「他県も選択できるように」）
const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県",
  "埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県",
  "岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県",
  "鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県",
  "佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

// 県ごとの近隣市町村クイック選択（子ども医療費助成の判定・エリア分析に使う）。
// 該当が無ければ「その他」で自由入力。院の住所から県を判定して切り替える。
const CITIES_BY_PREFECTURE: Record<string, string[]> = {
  徳島県: ["藍住町", "北島町", "板野町", "松茂町", "上板町", "徳島市", "鳴門市", "石井町", "吉野川市", "阿波市"],
  香川県: ["高松市", "丸亀市", "坂出市", "さぬき市", "三木町", "綾川町", "宇多津町", "善通寺市", "観音寺市", "東かがわ市"],
};

/** 院の住所文字列から都道府県を推定（"〒... 香川県高松市..." → "香川県"）。無ければ徳島県。 */
function detectPrefecture(address: string | null | undefined): string {
  const a = address ?? "";
  const hit = PREFECTURES.find((p) => a.includes(p));
  return hit ?? "徳島県";
}

export default function QuestionnairePage() {
  const [step, setStep] = useState<"form" | "done" | "booked">("form");
  const [submitting, setSubmitting] = useState(false);
  const [normalizedPhone, setNormalizedPhone] = useState("");
  // 予約ページから引き継いだ仮予約の内容（あればアンケート後にそのまま確定する）
  const [pendingBooking, setPendingBooking] = useState<PendingBooking | null>(null);
  const [bookedIsWaiting, setBookedIsWaiting] = useState(false);

  // 院の公開設定（LINE URL・住所＝県判定）。マウント時に取得。
  const [lineUrl, setLineUrl] = useState<string>(LINE_URL_FALLBACK);
  const [homePrefecture, setHomePrefecture] = useState<string>("徳島県");
  const [prefectureTouched, setPrefectureTouched] = useState(false);

  const [name, setName] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthMonth, setBirthMonth] = useState<number | null>(null);
  const [gender, setGender] = useState<"male" | "female" | "other" | null>(null);
  const [ageGroup, setAgeGroup] = useState<string | null>(null);
  const [prefecture, setPrefecture] = useState<string>("徳島県"); // 選択中の都道府県
  const [city, setCity] = useState<string>("");        // 選択中の市町村（"__other__" で自由入力）
  const [cityOther, setCityOther] = useState<string>(""); // 「その他」自由入力
  const [schoolClub, setSchoolClub] = useState<string>("");
  const [birthDate, setBirthDate] = useState<string>("");

  // 院の公開設定を取得 → LINE URL（DB優先）と、住所から県のデフォルトを決める
  useEffect(() => {
    getPublicClinicSettings()
      .then((s) => {
        if (s?.line_official_account_url) setLineUrl(s.line_official_account_url);
        const pref = detectPrefecture(s?.address);
        setHomePrefecture(pref);
        if (!prefectureTouched) setPrefecture(pref); // ユーザー未操作なら院の県をデフォルトに
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 予約ページから引き継いだ仮予約内容を読み込み、お名前・電話をプリフィルする。
  // （無ければ従来どおり、単体のアンケートとして動作する）
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_BOOKING_KEY);
      if (!raw) return;
      const b = JSON.parse(raw) as PendingBooking;
      if (b && b.date && b.time) {
        setPendingBooking(b);
        if (b.name) setName(b.name);
        if (b.phone) setPhone(b.phone);
      }
    } catch {}
  }, []);

  // 選択中の県のクイック市町村ボタン
  const cityChoices = useMemo(() => CITIES_BY_PREFECTURE[prefecture] ?? [], [prefecture]);

  // アンケート完了後、引き継いだ内容でそのまま仮予約を確定する。
  // 照合に使う電話は「いまアンケートで登録した番号(registeredPhone)」を最優先にする。
  // 予約フォームの電話(b.phone)は桁不足・別番号に直された等で顧客と食い違うことがあり、
  // それを優先すると「顧客が見つからない＝初めての方」に逆戻りして仮予約が確定しない事故になる。
  const completePendingBooking = async (b: PendingBooking, registeredPhone: string) => {
    const fd = new FormData();
    fd.append("date", b.date);
    fd.append("time", b.time);
    fd.append("name", b.name);
    fd.append("phone", registeredPhone || b.phone);
    fd.append("visitType", b.visitType || "new");
    fd.append("isWaitlistIntent", String(!!b.isWaitlistIntent));
    if (b.courseId) {
      fd.append("courseId", b.courseId);
      if (b.courseName) fd.append("courseName", b.courseName);
      if (b.courseDurationMinutes) fd.append("courseDurationMinutes", String(b.courseDurationMinutes));
    }
    if (b.staffId) {
      fd.append("staffId", b.staffId);
      if (b.staffName) fd.append("staffName", b.staffName);
    }
    if (b.roomId) {
      fd.append("roomId", b.roomId);
      if (b.roomName) fd.append("roomName", b.roomName);
    }
    return await createReservation(fd);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error("お名前と電話番号を入力してください");
      return;
    }

    const normalizedPhone = phone.trim().replace(/-/g, "");
    if (!/^\d{10,11}$/.test(normalizedPhone)) {
      toast.error("電話番号は10〜11桁の数字で入力してください（ハイフン不要）");
      return;
    }

    const cityValue = (city === "__other__" || cityChoices.length === 0) ? cityOther.trim() : city;
    // 院の県と違う県を選んだ場合は「都道府県＋市町村」で保存（県内なら市町村だけ＝医療費助成の照合用）
    const resolvedCity = cityValue
      ? (prefecture !== homePrefecture ? `${prefecture}${cityValue}` : cityValue)
      : (prefecture !== homePrefecture ? prefecture : null);

    setSubmitting(true);
    try {
      const result = await submitQuestionnaire({
        name: name.trim(),
        guardian_name: guardianName.trim() || null,
        phone: normalizedPhone,
        birth_month: birthMonth,
        gender,
        age_group: ageGroup,
        city_name: resolvedCity,
        school_club: schoolClub.trim() || null,
        birth_date: birthDate || null,
      });

      if (result.success) {
        setNormalizedPhone(normalizedPhone);
        // 予約ページから引き継いだ内容があれば、そのまま仮予約を確定する。
        if (pendingBooking) {
          const res: any = await completePendingBooking(pendingBooking, normalizedPhone);
          try { sessionStorage.removeItem(PENDING_BOOKING_KEY); } catch {}
          if (res?.success) {
            try {
              localStorage.setItem("ballClinic_savedName", pendingBooking.name || name.trim());
              localStorage.setItem("ballClinic_savedPhone", normalizedPhone);
            } catch {}
            setBookedIsWaiting(!!res.isWaiting);
            setStep("booked");
            return;
          }
          // 仮予約の確定に失敗 → 通常の完了画面に切り替え、カレンダーから進んでもらう
          toast.error(res?.error || "仮予約の確定に失敗しました。お手数ですが予約カレンダーからお進みください。");
        }
        setStep("done");
      } else {
        toast.error(result.error || "送信に失敗しました");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 引き継いだ内容でそのまま仮予約が完了したときの画面（「さきほどの仮予約をさせていただきました」）
  if (step === "booked") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full space-y-4">
          {/* ヘッダー */}
          <div className="text-center space-y-3">
            <div className="mx-auto w-fit">
              <ClinicWordmark sizeClassName="w-40 h-14" />
            </div>
            <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/40">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white">
                {bookedIsWaiting ? "キャンセル待ちを受け付けました" : "さきほどの仮予約をお取りしました"}
              </h1>
              {pendingBooking && (
                <p className="text-blue-100 text-base font-bold mt-2">
                  {formatPendingDate(pendingBooking.date)} {pendingBooking.time}
                </p>
              )}
              <p className="text-blue-200/70 text-sm mt-1">
                院長がLINEにて内容を確認後、予約確定のご連絡をいたします。
              </p>
            </div>
          </div>

          {/* STEP 1: LINE紐づけ（確定連絡を受け取るため） */}
          <div className="bg-[#06C755]/20 border-2 border-[#06C755]/60 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="bg-[#06C755] text-white text-xs font-black px-2.5 py-1 rounded-full">STEP 1</span>
              <p className="text-white font-bold text-sm">LINEを友だち追加する</p>
            </div>
            <p className="text-blue-100/70 text-xs">確定のご連絡をLINEでお届けするため、友だち追加をお願いします。</p>
            <a
              href={lineUrl}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-4 px-4 rounded-xl transition-all gap-2 text-base shadow-lg"
            >
              <MessageCircle className="w-5 h-5" />
              友だち追加する（タップ）
            </a>
          </div>

          {/* STEP 2: 4桁送信 */}
          <div className="bg-white/10 border border-white/20 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="bg-blue-500 text-white text-xs font-black px-2.5 py-1 rounded-full">STEP 2</span>
              <p className="text-white font-bold text-sm">LINEでこの番号を送信する</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4 text-center space-y-1">
              <p className="text-blue-200/70 text-xs">友だち追加後、LINEのトーク画面でこの数字を送ってください</p>
              <p className="text-white font-black text-5xl tracking-[0.3em] mt-2">{normalizedPhone.slice(-4)}</p>
              <p className="text-blue-200/50 text-xs mt-1">（電話番号の下4桁）</p>
            </div>
            <p className="text-blue-200/60 text-xs text-center">
              送信すると自動で紐づけ完了のメッセージが届きます
            </p>
          </div>

          <Link href="/" className="text-blue-300/60 hover:text-white text-xs inline-flex items-center justify-center gap-1 w-full transition-colors py-2">
            <ArrowLeft className="w-3 h-3" />
            トップページへ
          </Link>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full space-y-4">

          {/* ヘッダー */}
          <div className="text-center space-y-3">
            <div className="mx-auto w-fit">
              <ClinicWordmark sizeClassName="w-40 h-14" />
            </div>
            <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/40">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white">ご登録が完了しました！</h1>
              <p className="text-amber-200/90 text-sm mt-2 font-bold">
                ※ まだ予約は取れていません
              </p>
              <p className="text-blue-200/70 text-xs mt-1">
                続けて日時を選んでご予約ください（下の STEP 3）
              </p>
            </div>
          </div>

          {/* STEP 1: LINE紐づけ（最優先） */}
          <div className="bg-[#06C755]/20 border-2 border-[#06C755]/60 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="bg-[#06C755] text-white text-xs font-black px-2.5 py-1 rounded-full">STEP 1</span>
              <p className="text-white font-bold text-sm">LINEを友だち追加する</p>
            </div>
            <a
              href={lineUrl}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-4 px-4 rounded-xl transition-all gap-2 text-base shadow-lg"
            >
              <MessageCircle className="w-5 h-5" />
              友だち追加する（タップ）
            </a>
          </div>

          {/* STEP 2: 4桁送信 */}
          <div className="bg-white/10 border border-white/20 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="bg-blue-500 text-white text-xs font-black px-2.5 py-1 rounded-full">STEP 2</span>
              <p className="text-white font-bold text-sm">LINEでこの番号を送信する</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4 text-center space-y-1">
              <p className="text-blue-200/70 text-xs">友だち追加後、LINEのトーク画面でこの数字を送ってください</p>
              <p className="text-white font-black text-5xl tracking-[0.3em] mt-2">{normalizedPhone.slice(-4)}</p>
              <p className="text-blue-200/50 text-xs mt-1">（電話番号の下4桁）</p>
            </div>
            <p className="text-blue-200/60 text-xs text-center">
              送信すると自動で紐づけ完了のメッセージが届きます
            </p>
          </div>

          {/* STEP 3: 予約へ */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="bg-slate-500 text-white text-xs font-black px-2.5 py-1 rounded-full">STEP 3</span>
              <p className="text-white font-bold text-sm">オンライン予約に進む</p>
            </div>
            <Link
              href="/reserve/calendar"
              className="flex w-full items-center justify-center bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-4 rounded-xl transition-all gap-2 text-base shadow-lg shadow-blue-600/30"
            >
              📅 予約カレンダーを開く
            </Link>
            <p className="text-blue-200/40 text-[10px] text-center">
              ※LINEの紐づけが先でも後でも予約は可能です
            </p>
          </div>

          <Link href="/" className="text-blue-300/60 hover:text-white text-xs inline-flex items-center justify-center gap-1 w-full transition-colors py-2">
            <ArrowLeft className="w-3 h-3" />
            トップページへ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200" data-dark-page>
      <div className="max-w-lg mx-auto py-12 px-4">
        {/* ロゴ */}
        <div className="flex flex-col items-center mb-10">
          <ClinicWordmark sizeClassName="w-48 h-16 mb-3" textClassName="text-2xl font-extrabold text-white text-center leading-tight" />
          {/* ボールのタグライン。他院に出さない（混入防止） */}
          {CLINIC_CONFIG.isDefaultClinic && (
            <p className="text-blue-200/50 text-xs tracking-widest uppercase">Body ALL care.</p>
          )}
        </div>

        <div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-8 shadow-2xl">
          {/* ヘッダー */}
          <div className="mb-8 text-center space-y-2">
            <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-bold px-4 py-1.5 rounded-full mb-2">
              初めてオンライン予約をご希望の方
            </div>
            <h1 className="text-2xl font-extrabold text-white">アンケートにご協力ください</h1>
            <p className="text-blue-100/80 text-sm">
              いただいた情報は、誕生月クーポンや特別なご案内にのみ使用します。
            </p>
          </div>

          {/* 予約ページからの引き継ぎ案内（選んだ日時のままアンケート後に仮予約が完了する） */}
          {pendingBooking && (
            <div className="mb-6 bg-emerald-500/15 border-2 border-emerald-400/50 rounded-2xl p-4 text-center space-y-1">
              <p className="text-emerald-200 text-xs font-bold">
                あと少しで仮予約完了です（最後のステップ）
              </p>
              <p className="text-emerald-100/70 text-[11px]">選んでいただいた日時を引き継いでいます</p>
              <p className="text-white font-extrabold text-lg mt-1">
                {formatPendingDate(pendingBooking.date)} {pendingBooking.time}
              </p>
              <p className="text-emerald-100/80 text-xs mt-1">
                このまま回答いただくと、
                <br className="sm:hidden" />
                日程を選び直すことなく仮予約が完了します。
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* お名前 */}
            <div className="space-y-2">
              <label className="text-blue-100/85 font-bold text-xs uppercase tracking-wide">
                治療を受けられる患者様のお名前 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="山田 太郎"
                className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-4 text-white placeholder:text-white/50 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
              />
            </div>

            {/* 保護者名 */}
            <div className="space-y-2">
              <label className="text-blue-100/85 font-bold text-xs uppercase tracking-wide">
                保護者のお名前 <span className="text-blue-400/50 font-normal normal-case text-[11px]">（任意・未成年の方のみ）</span>
              </label>
              <input
                type="text"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                placeholder="山田 花子"
                className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-4 text-white placeholder:text-white/50 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
              />
            </div>

            {/* 電話番号 */}
            <div className="space-y-2">
              <label className="text-blue-100/85 font-bold text-xs uppercase tracking-wide">
                電話番号 <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="09012345678"
                inputMode="numeric"
                className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-4 text-white placeholder:text-white/50 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
              />
            </div>

            {/* 誕生月 */}
            <div className="space-y-2">
              <label className="text-blue-100/85 font-bold text-xs uppercase tracking-wide">
                誕生月 <span className="text-blue-400/50 font-normal text-[10px]">（誕生月クーポンに使用します）</span>
              </label>
              <div className="grid grid-cols-6 gap-2">
                {MONTHS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setBirthMonth(birthMonth === m ? null : m)}
                    className={`h-10 rounded-xl font-bold text-sm transition-all ${
                      birthMonth === m
                        ? "bg-blue-600 text-white border border-blue-500"
                        : "bg-white/5 border border-white/10 text-blue-100/85 hover:bg-white/10"
                    }`}
                  >
                    {m}月
                  </button>
                ))}
              </div>
            </div>

            {/* 性別 */}
            <div className="space-y-2">
              <label className="text-blue-100/85 font-bold text-xs uppercase tracking-wide">性別</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: "male", label: "男性" },
                  { key: "female", label: "女性" },
                  { key: "other", label: "その他" },
                ].map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setGender(gender === g.key as any ? null : g.key as any)}
                    className={`h-12 rounded-2xl font-bold text-sm transition-all border ${
                      gender === g.key
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-white/5 border-white/10 text-blue-100/85 hover:bg-white/10"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 年代 */}
            <div className="space-y-2">
              <label className="text-blue-100/85 font-bold text-xs uppercase tracking-wide">年代</label>
              <div className="grid grid-cols-3 gap-2">
                {AGE_GROUPS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAgeGroup(ageGroup === a ? null : a)}
                    className={`h-12 rounded-2xl font-bold text-sm transition-all border ${
                      ageGroup === a
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-white/5 border-white/10 text-blue-100/85 hover:bg-white/10"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* お住まい（都道府県＋市町村） */}
            <div className="space-y-2">
              <label className="text-blue-100/85 font-bold text-xs uppercase tracking-wide">
                お住まい <span className="text-blue-400/50 font-normal normal-case text-[11px]">（任意・都道府県＋市町村）</span>
              </label>
              {/* 都道府県（院の県をデフォルト・他県も選択可） */}
              <select
                value={prefecture}
                onChange={(e) => {
                  const newPref = e.target.value;
                  setPrefectureTouched(true);
                  setPrefecture(newPref);
                  const hasChoices = (CITIES_BY_PREFECTURE[newPref] ?? []).length > 0;
                  setCity(hasChoices ? "" : "__other__");
                  setCityOther("");
                }}
                className="w-full h-12 bg-white/5 border border-white/10 rounded-2xl px-4 text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all [color-scheme:dark]"
              >
                {PREFECTURES.map((p) => (
                  <option key={p} value={p} className="bg-slate-800 text-white">{p}</option>
                ))}
              </select>

              {/* 市町村クイック選択（県に候補があるときだけボタン表示） */}
              {cityChoices.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {cityChoices.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { setCity(city === c ? "" : c); }}
                      className={`h-11 rounded-2xl font-bold text-sm transition-all border ${
                        city === c
                          ? "bg-blue-600 border-blue-500 text-white"
                          : "bg-white/5 border-white/10 text-blue-100/85 hover:bg-white/10"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCity(city === "__other__" ? "" : "__other__")}
                    className={`h-11 rounded-2xl font-bold text-sm transition-all border ${
                      city === "__other__"
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-white/5 border-white/10 text-blue-100/85 hover:bg-white/10"
                    }`}
                  >
                    その他
                  </button>
                </div>
              )}

              {/* 市区町村の自由入力（候補なしの県、または「その他」選択時） */}
              {(cityChoices.length === 0 || city === "__other__") && (
                <input
                  type="text"
                  value={cityOther}
                  onChange={(e) => setCityOther(e.target.value)}
                  placeholder="市区町村を入力（例：高松市〇〇、徳島市〇〇）"
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-2xl px-4 text-white placeholder:text-white/50 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
                />
              )}
            </div>

            {/* 学校名・クラブ名 */}
            <div className="space-y-2">
              <label className="text-blue-100/85 font-bold text-xs uppercase tracking-wide">
                学校名・所属クラブ <span className="text-blue-400/50 font-normal normal-case text-[11px]">（任意・お子様・学生の方）</span>
              </label>
              <input
                type="text"
                value={schoolClub}
                onChange={(e) => setSchoolClub(e.target.value)}
                placeholder="例：藍住中学校／〇〇サッカークラブ"
                className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-4 text-white placeholder:text-white/50 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
              />
            </div>

            {/* 生年月日（任意・医療費助成の方） */}
            <div className="space-y-2">
              <label className="text-blue-100/85 font-bold text-xs uppercase tracking-wide">
                生年月日 <span className="text-blue-400/50 font-normal normal-case text-[11px]">（任意・子ども医療費助成をご利用の方はご記入ください）</span>
              </label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-4 text-white placeholder:text-white/50 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all [color-scheme:dark]"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting || !name.trim() || !phone.trim()}
                className="w-full h-16 text-lg font-black rounded-3xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-all flex items-center justify-center gap-2"
              >
                {submitting ? "送信中..." : (
                  <>
                    {pendingBooking ? "アンケートに答えて仮予約を完了する" : "アンケートを送信する"}
                    <ChevronRight className="w-5 h-5" />
                  </>
                )}
              </button>
              <p className="text-center text-blue-100/30 text-xs mt-3">
                ※ 個人情報は院内のみで使用し、第三者に提供しません
              </p>
            </div>
          </form>
        </div>

        <div className="mt-6 text-center">
          <Link href="/reserve" className="text-blue-300 hover:text-white text-sm inline-flex items-center gap-1 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            予約ページへ戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
