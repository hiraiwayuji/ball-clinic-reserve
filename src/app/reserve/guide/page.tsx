import { Metadata } from "next";
import Link from "next/link";
import { CLINIC_CONFIG } from "@/lib/clinic-config";

// LINE 公式アカウントの友だち追加 / トーク URL（デプロイごとに env で切替）
const LINE_URL =
  process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL ??
  "https://line.me/R/ti/p/%40shc8761q";

export const metadata: Metadata = {
  title: `オンライン予約のやり方 | ${CLINIC_CONFIG.name}`,
  description: `${CLINIC_CONFIG.name}のオンライン予約のやり方と、LINEでメッセージを送る方法をご案内します。`,
};

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-base font-bold text-white">
      {n}
    </span>
  );
}

export default function ReserveGuidePage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-2xl px-5 py-10 md:py-14">
        {/* ヘッダー */}
        <div className="mb-10 text-center">
          <p className="text-xs font-bold tracking-widest text-blue-600">RESERVE GUIDE</p>
          <h1 className="mt-2 text-2xl font-bold md:text-3xl">
            オンライン予約のやり方
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            <span className="inline-block">{CLINIC_CONFIG.name}は、</span>
            <span className="inline-block">スマホ・パソコンから</span>
            <span className="inline-block">24時間いつでもご予約いただけます。</span>
          </p>
        </div>

        {/* ▼ オンライン予約のやり方 */}
        <section className="mb-12">
          <h2 className="mb-5 flex items-center gap-2 text-lg font-bold">
            <span className="text-blue-600">📅</span>
            ご予約の手順
          </h2>

          <ol className="space-y-4">
            <li className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <StepBadge n={1} />
              <div>
                <p className="font-bold">予約ページを開く</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  下の「予約ページを開く」ボタン、または
                  <br className="sm:hidden" />
                  ホームページ・LINEメニューの「WEB予約」から進みます。
                </p>
              </div>
            </li>

            <li className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <StepBadge n={2} />
              <div>
                <p className="font-bold">ご希望の日時を選ぶ</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  カレンダーから予約日を選び、
                  <br className="sm:hidden" />
                  空いている時間をタップします。
                  メニューやご担当の指名がある場合はあわせてお選びください。
                </p>
              </div>
            </li>

            <li className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <StepBadge n={3} />
              <div>
                <p className="font-bold">お名前・お電話番号を入力</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  初めての方は、かんたんなアンケート（1分ほど）に
                  <br className="sm:hidden" />
                  ご回答いただくとそのまま予約に進めます。
                </p>
              </div>
            </li>

            <li className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <StepBadge n={4} />
              <div>
                <p className="font-bold">「仮予約を申し込む」を押す</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  この時点では<span className="font-bold text-slate-800">仮予約</span>です。
                  内容を確認後、院から確定のご連絡をいたします。
                </p>
              </div>
            </li>

            <li className="flex gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <StepBadge n={5} />
              <div>
                <p className="font-bold">LINEで予約を確定する</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {CLINIC_CONFIG.nameShort}のLINE公式アカウントを友だち追加し、
                  <br className="sm:hidden" />
                  メッセージで予約内容をお伝えいただくと完了です。
                </p>
              </div>
            </li>
          </ol>

          <div className="mt-6 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm leading-relaxed text-amber-800">
            💡 同じ日にすでにご予約がある場合は、二重予約を防ぐため確認の表示が出ます。
            日時の変更・追加のご相談は、LINEからお気軽にお問い合わせください。
          </div>
        </section>

        {/* ▼ LINEでメッセージを送る方法 */}
        <section className="mb-12">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
            <span className="text-[#06C755]">💬</span>
            LINEでメッセージを送る方法
          </h2>
          <p className="mb-5 text-sm leading-relaxed text-slate-600">
            LINEのトーク画面で「メニュー（ボタンの一覧）」が表示されていると、
            文字を入力するキーボードが隠れて
            <br className="sm:hidden" />
            「メッセージが打てない」と感じることがあります。
            そんなときは次の手順で切り替えられます。
          </p>

          <ol className="space-y-4">
            <li className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <StepBadge n={1} />
              <div>
                <p className="font-bold">トーク画面の下を見る</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  画面の下半分に予約などのメニューボタンが出ている状態です。
                </p>
              </div>
            </li>

            <li className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <StepBadge n={2} />
              <div>
                <p className="font-bold">
                  左下の「キーボード」アイコンをタップ
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  入力欄の左にある
                  <span className="mx-1 inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-xs">
                    ⌨ キーボード
                  </span>
                  のマークを押すと、メニューが下がってキーボードが出てきます。
                </p>
              </div>
            </li>

            <li className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <StepBadge n={3} />
              <div>
                <p className="font-bold">メッセージを入力して送信</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  ご希望の日時やお名前を入力して、
                  <br className="sm:hidden" />
                  紙ヒコーキ（送信）ボタンで送ってください。
                </p>
              </div>
            </li>

            <li className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <StepBadge n={4} />
              <div>
                <p className="font-bold">メニューに戻したいとき</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  同じ場所にある
                  <span className="mx-1 inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-xs">
                    ≡ メニュー
                  </span>
                  のマークを押すと、もとのメニュー表示に戻ります。
                </p>
              </div>
            </li>
          </ol>
        </section>

        {/* CTA */}
        <div className="space-y-3">
          <Link
            href="/reserve"
            className="flex w-full items-center justify-center rounded-2xl bg-blue-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
          >
            予約ページを開く
          </Link>
          <a
            href={LINE_URL}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#06C755] px-6 py-4 text-base font-bold text-white shadow-lg shadow-green-200 transition hover:bg-[#05b34c]"
          >
            LINEで友だち追加・トークを開く
          </a>
          <a
            href={`tel:${CLINIC_CONFIG.phone}`}
            className="flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-6 py-4 text-base font-bold text-slate-700 transition hover:bg-slate-50"
          >
            電話で予約する（{CLINIC_CONFIG.phone}）
          </a>
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          {CLINIC_CONFIG.name}
        </p>
      </div>
    </div>
  );
}
