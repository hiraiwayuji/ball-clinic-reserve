"use client";

import { createContext, useContext, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  CalendarCheck,
  Users,
  Wallet,
  LineChart,
  Megaphone,
  Sparkles,
  HelpCircle,
  Tag,
  Smartphone,
  Network,
  ScrollText,
  Clock,
} from "lucide-react";

const MANUAL_VERSION = "v1.5";
const MANUAL_UPDATED_AT = "2026-09-02";

type ManualRole = "owner" | "admin" | "staff";
type ManualCtxValue = { role: ManualRole; salesInputMode: "per_patient" | "tally" };
/** 誰向けのマニュアルかを Section に伝える（受付には院長専用の章を出さない） */
const ManualCtx = createContext<ManualCtxValue>({ role: "owner", salesInputMode: "per_patient" });

type Item = {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
};

const Section = ({ icon, title, color, children, ownerOnly, salesMode }: {
  icon: React.ReactNode;
  title: React.ReactNode;
  color: string;
  children: React.ReactNode;
  /** 院長（owner）だけに見せる章 */
  ownerOnly?: boolean;
  /** 記帳方式が一致する院だけに見せる章 */
  salesMode?: "per_patient" | "tally";
}) => {
  const [open, setOpen] = useState(false);
  const ctx = useContext(ManualCtx);
  if (ownerOnly && ctx.role !== "owner") return null;
  if (salesMode && ctx.salesInputMode !== salesMode) return null;
  return (
    <div className={`border rounded-xl overflow-hidden ${color}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-black/5 transition"
      >
        <div className="flex items-center gap-2 font-bold text-sm">
          {icon}
          {title}
        </div>
        {open ? <ChevronUp className="w-4 h-4 opacity-50" /> : <ChevronDown className="w-4 h-4 opacity-50" />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t bg-white dark:bg-slate-900 text-sm leading-relaxed text-slate-700 dark:text-slate-200 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
};

const Step = ({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) => (
  <div className="flex gap-3">
    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
      {n}
    </div>
    <div className="flex-1 pt-0.5">
      <div className="font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      {children && <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{children}</div>}
    </div>
  </div>
);

const Tip = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 text-xs text-amber-900 dark:text-amber-200">
    💡 {children}
  </div>
);

export default function ManualSection({
  role = "owner",
  salesInputMode = "per_patient",
}: {
  role?: ManualRole;
  salesInputMode?: "per_patient" | "tally";
} = {}) {
  return (
    <ManualCtx.Provider value={{ role, salesInputMode }}>
    <div className="bg-white dark:bg-slate-900 rounded-2xl border p-6 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            操作マニュアル
          </h2>
          <p className="text-sm text-slate-500">
            {role === "owner"
              ? "ツールの使い方をまとめています。章の見出しを押すと開きます。"
              : "受付でよく使う操作をまとめています。章の見出しを押すと開きます。"}
          </p>
        </div>
        <div className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
          {MANUAL_VERSION} / {MANUAL_UPDATED_AT}
        </div>
      </div>

      <div className="space-y-3">
        <Section
          icon={<ScrollText className="w-4 h-4 text-rose-600" />}
          ownerOnly
          title={
            <span className="flex items-center gap-2">
              療養費改定（令和8年7月〜）
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-600 text-white">NEW</span>
            </span>
          }
          color="border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/30"
        >
          <p>
            <b>令和8年（2026年）7月1日 施行</b>／改定率 <b>+0.60%</b>（本体+0.14%＋物価対応+0.46%）。
            7月分の請求からもう新ルールが動いています。大事なのは次の3つです。
          </p>

          {/* 3つの大きな変更 */}
          <div className="space-y-2">
            <div className="rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3">
              <div className="font-semibold text-rose-900 dark:text-rose-200">① 2部位目から減額（今回の目玉）</div>
              <p className="text-xs mt-1 text-slate-700 dark:text-slate-300">
                打撲・捻挫の2回目以降の後療などで、<b>2部位目は80%・3部位目以上は60%</b>に逓減。
                3部位以上が多い患者さんは要注意です。
              </p>
            </div>
            <div className="rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-3">
              <div className="font-semibold text-blue-900 dark:text-blue-200">② 明細書は毎回・無料で交付が義務</div>
              <p className="text-xs mt-1 text-slate-700 dark:text-slate-300">
                レセコン設置院は<b>1人院でも対象</b>。会計ごとに無償で渡し、そのつど<b>明細書発行加算10円</b>
                （名称・回数が変更）。毎回不要な人は所定の様式で同意すればまとめ交付もOK。
              </p>
            </div>
            <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3">
              <div className="font-semibold text-slate-800 dark:text-slate-200">③ オンライン請求は延期＝今はスルーでOK</div>
              <p className="text-xs mt-1 text-slate-700 dark:text-slate-300">
                当初の令和8年目標は<b>延期</b>。今回は義務化されません。新規登録・機器購入は<b>不要</b>です。
              </p>
            </div>
          </div>

          {/* 主な料金 新旧 */}
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">主な料金（旧 → 新）</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-1.5 pr-2 font-medium">項目</th>
                    <th className="text-right py-1.5 px-2 font-medium">旧</th>
                    <th className="text-right py-1.5 px-2 font-medium">新</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums text-slate-700 dark:text-slate-300">
                  <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-1.5 pr-2">初検料</td><td className="text-right px-2">1,550</td><td className="text-right px-2 font-semibold">1,560</td></tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-1.5 pr-2">再検料</td><td className="text-right px-2">410</td><td className="text-right px-2 font-semibold">420</td></tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-1.5 pr-2">施療料（打撲・捻挫）</td><td className="text-right px-2">760</td><td className="text-right px-2 font-semibold">770</td></tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-1.5 pr-2">後療料（打撲・捻挫）</td><td className="text-right px-2">505</td><td className="text-right px-2 font-semibold">550</td></tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-1.5 pr-2">温罨法料</td><td className="text-right px-2">75</td><td className="text-right px-2 font-semibold">80</td></tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-1.5 pr-2">冷罨法料</td><td className="text-right px-2">85</td><td className="text-right px-2 font-semibold">80</td></tr>
                  <tr><td className="py-1.5 pr-2">電療料</td><td className="text-right px-2">33</td><td className="text-right px-2 font-semibold">46</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              ※ 骨折・脱臼系（整復料・後療料・金属副子加算など）は今回は据置。初検時相談支援料・往療料も据置。
            </p>
          </div>

          <Tip>
            <b>逓減の対象</b>は「打撲・捻挫の後療料／温罨法／冷罨法／電療料」。
            初検日の施療料と<b>骨折・脱臼の後療は2部位目80%の対象外</b>（骨折・脱臼は3部位以上60%のみ）。
          </Tip>

          {/* 償還払い */}
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">2027年1月〜：償還払いの新基準</div>
            <p className="text-xs text-slate-700 dark:text-slate-300">
              直近1年間で <b>通算8か月以上かつ通算9部位以上</b> の患者さんは、患者ごと償還払いの重点審査対象に。
              あわせて自己施術・自家施術は療養費の支給対象外であることが明確化されました。
            </p>
          </div>

          {/* やること */}
          <div className="font-semibold text-slate-900 dark:text-slate-100">院として、やること</div>
          <div className="space-y-3">
            <Step n={1} title="レセコン／請求ソフトを7月版に更新">
              新単価・2部位逓減・明細書発行加算（毎回）が反映されるか請求団体に確認。
              6月・7月をまたぐ請求は単価が混ざるので注意。
            </Step>
            <Step n={2} title="明細書を毎回・無料で渡す会計フローに">
              受付オペに組み込む。まとめ交付を希望する人だけ様式で同意を取り、カルテに記録。
            </Step>
            <Step n={3} title="患者さんへの説明トークをそろえる">
              「制度改定で2部位目以降の料金基準が下がりました」と一言で言えるように。窓口負担が変わる人には事前案内。
            </Step>
            <Step n={4} title="3部位以上が多い患者さんを見直し">
              減収に直結します。施術部位の妥当性と記録を再点検（1〜2部位中心なら単価アップで微増）。
            </Step>
          </div>

          <p className="text-[11px] text-slate-400">
            ※ 単価・算定の最終確認は、厚生労働省の正式告示・所属の請求団体の通知・レセコンの更新内容でお願いします。
            骨折・脱臼・金属副子等は傷病や範囲で金額に幅があります。
          </p>
        </Section>

        <Section
          icon={<MessageCircle className="w-4 h-4 text-green-600" />}
          title="LINEを患者さんと個別に紐づける"
          color="border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/30"
        >
          <p>
            LINE紐づけは <b>「患者さんがLINEに何かメッセージを1回送る」→「管理画面で紐づける」</b> の流れです。
            紐づけ後はリマインダー・誕生日クーポン・一括配信が個別に届くようになります。
          </p>

          <div className="space-y-3">
            <Step n={1} title="患者さんに公式LINEを友だち追加してもらう">
              受付で QR を読んでもらうのが一番早いです。
            </Step>
            <Step n={2} title="患者さんから何かメッセージを1通送ってもらう">
              「こんにちは」でも、電話番号下4桁でもOK。これが届かないと紐づけられません。
              <br />
              <span className="text-xs text-slate-500">
                ※下4桁を送ってもらった場合、登録済み顧客であれば自動で紐づきます。
              </span>
            </Step>
            <Step n={3} title="管理画面の「患者さん」を開く">
              対象の患者さんの行で <b>「未紐づけ」</b> ボタンをタップ。
            </Step>
            <Step n={4} title="紐づけダイアログで方法を選ぶ">
              <ul className="list-disc list-inside space-y-1">
                <li><b>最近のメッセージから選ぶ</b>：直近に送信のあったLINEユーザーから1タップで選択</li>
                <li><b>LINE User IDを直接入力</b>：上級者向け（line-setup画面で確認できます）</li>
              </ul>
            </Step>
            <Step n={5} title="「紐づける」をタップして完了">
              一覧に <b>「紐づけ済」</b> と表示されればOK。
            </Step>
          </div>

          <Tip>
            患者さんがメッセージを送っていないと「最近のメッセージ」リストに出てきません。
            まずはLINEで何か1通送ってもらってください。
          </Tip>
          <Tip>
            既に別のLINEに紐づいている場合は、新しい方で上書きされます。
            機種変更時もこの手順で再紐づけできます。
          </Tip>
        </Section>

        <Section
          icon={<CalendarCheck className="w-4 h-4 text-blue-600" />}
          title="予約の追加・変更・キャンセル"
          color="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30"
        >
          <Step n={1} title="予約タイムテーブルの空いているマス、または予約カレンダーから新規追加">
            「+ 予約を追加」ボタンで日時・コース・患者さんを選んで保存。
          </Step>
          <Step n={2} title="編集はカードをタップ">
            時間変更・コース変更・メモ追加が可能。
          </Step>
          <Step n={3} title="キャンセルは予約を押して「この予約をキャンセルにする」">
            キャンセル理由を入れておくと統計に反映されます。
          </Step>
          <Tip>受付画面では本日の予約一覧と来院状況（待合中・施術中・完了）が一目で見えます。</Tip>
        </Section>

        <Section
          icon={<Tag className="w-4 h-4 text-amber-600" />}
          ownerOnly
          title="コース・クーポンメニューを編集する（スマホでもOK）"
          color="border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30"
        >
          <p>
            患者さんの予約画面に出る <b>施術コース</b> と <b>クーポン</b> は、
            「設定」→ <b>「施術コース設定」</b> からいつでも編集できます。
            パソコンでもスマホでも、同じ手順・同じURLで操作できます。
          </p>

          <div className="rounded-md bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 p-3 text-xs text-sky-900 dark:text-sky-200 flex items-start gap-2">
            <Smartphone className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <b>スマホからの開き方</b>：いつものログインURLをスマホのブラウザで開いてログイン →
              画面 <b>左上の「☰」</b> でメニューを開く → 一番下の <b>「設定」</b> →
              パスコードを入力（パソコンと同じ番号）→ 下へスクロールして
              <b>「施術コース設定」</b> へ。
            </span>
          </div>

          <div className="space-y-3">
            <Step n={1} title="コースは題名だけが一覧で並びます">
              スマホでも見やすいよう、各コースは<b>題名のみ</b>のコンパクト表示です。
              クーポンには 🏷 マーク、休止中は「無効」マークが付きます。
            </Step>
            <Step n={2} title="編集したいコースをタップして開く">
              タップすると、カテゴリ・所要時間・料金・各種バッジ・説明と、
              <b>「有効/無効」「編集」「削除」</b> ボタンが開きます。
            </Step>
            <Step n={3} title="「編集」から内容を変更して保存">
              コース名・所要時間・料金（割引前の通常価格も）・写真・バッジ・説明を
              まとめて変更できます。最後に <b>「保存」</b> をタップ。
            </Step>
            <Step n={4} title="並び順は左の ▲▼ ボタンで入れ替え">
              上下の間にある <b>番号を書き換えて Enter</b> すると、その順番へ一気に移動できます。
              ここで並べた順が、そのまま患者さんのメニュー画面（コースタブ・クーポンタブ）に反映されます。
            </Step>
            <Step n={5} title="クーポンに出すには「クーポンとして公開する」にチェック">
              編集画面の <b>「クーポンとして公開する」</b> をONにすると、
              メニュー画面の <b>クーポンタブ</b> に表示されます。並び順もこの上下ボタン通りです。
            </Step>
          </div>

          <Tip>
            「無効」にすると患者さんの画面から一時的に隠せます（削除せず残せるので、季節メニューの停止などに便利）。
            完全に消すときは「削除」を使ってください。
          </Tip>
          <Tip>
            <b>新規限定 / 再来限定</b> を使うと、そのクーポンを「初めての方だけ」「2回目以降の方だけ」に絞って出せます。
          </Tip>
        </Section>

        <Section
          icon={<Users className="w-4 h-4 text-purple-600" />}
          title="顧客管理（カルテ・紐づけ・統合）"
          color="border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-950/30"
        >
          <p>「顧客管理」タブで全患者さんの一覧と詳細を管理します。</p>
          <ul className="list-disc list-inside space-y-1">
            <li><b>検索</b>：名前・電話番号・カルテ番号で即時検索</li>
            <li><b>編集</b>：行をタップしてカルテ番号・住所・紹介元・年代などを更新</li>
            <li><b>LINE紐づけ</b>：「未紐づけ」ボタンから手動紐づけ</li>
            <li><b>名寄せ・統合</b>：同一人物が二重登録されている場合は統合可能</li>
            <li><b>予約停止</b>：トラブル防止のため特定患者さんのWeb予約を停止できます</li>
          </ul>
        </Section>

        <Section
          icon={<Network className="w-4 h-4 text-indigo-600" />}
          title="顧客情報の統一（1人＝1カルテにまとまる）"
          color="border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/30"
        >
          <p>
            このツールでは、1人の患者さんの情報が <b>1つのカルテ（顧客情報）</b> にまとまります。
            <b>Web予約・LINE・受付・売上記帳・経営評価（来院数）</b> が、すべて同じカルテにつながるので、
            どの画面で見ても同じ人として扱われ、二重に管理する必要がありません。
          </p>

          <div className="rounded-md bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 p-3 text-xs text-indigo-900 dark:text-indigo-200">
            <div className="font-semibold mb-1">1つのカルテにつながっているもの</div>
            <ul className="list-disc list-inside space-y-0.5">
              <li>予約履歴（Web予約・受付・次回予約）</li>
              <li>LINE紐づけ（リマインダー・クーポン・一括配信）</li>
              <li>カルテ番号・電話番号・住所・アンケート</li>
              <li>売上・来院数（保険／自費の人数もこのカルテ単位で集計）</li>
            </ul>
          </div>

          <div className="space-y-3">
            <Step n={1} title="本人の見分け方（自動）">
              予約時はお名前で照合し、<b>カルテ番号・電話番号・LINE</b> で本人を特定します。
              一度登録された方は、次回以降は同じカルテに自動でつながります。
            </Step>
            <Step n={2} title="二重登録になってしまったら（名寄せ・統合）">
              姓名の間のスペース・旧姓・ひらがな／カナ違いなどで、同じ人が2件に分かれることがあります。
              その時は <b>「顧客管理」</b> で2件を選んで <b>「統合」</b> すると、1つのカルテにまとまります。
            </Step>
            <Step n={3} title="統合すると引き継がれるもの">
              カルテ番号・電話番号・LINE・住所などの空欄は、もう片方の情報で自動的に埋まり、
              <b>予約履歴もすべて1つにまとまります</b>。お名前は「統合先（残す方）」を正として残します。
            </Step>
          </div>

          <Tip>
            来院数や「保険・自費の人数」も、このカルテ単位で数えています。
            二重登録を統合しておくと、<b>実来院数がより正確</b>になります。
          </Tip>
          <Tip>
            操作する場所は <b>「顧客管理」タブ</b> です。検索 → 2件を選択 → 統合、の流れです。
            統合は元に戻せないので、別人でないかだけ確認してから行ってください。
          </Tip>
        </Section>

        <Section
          icon={<Wallet className="w-4 h-4 text-emerald-600" />}
          ownerOnly
          salesMode="per_patient"
          title="売上・経費の入力"
          color="border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30"
        >
          <p>収入は「現金売上」と「保険収入」の2種類で別々に管理します。</p>
          <Step n={1} title="日々の現金売上を入力">
            <b>「売上記帳」</b> タブから1日分まとめて入力。施術完了時に受付画面から記帳もできます。
          </Step>
          <Step n={2} title="月次の保険入金を入力">
            保険組合からの入金があったら同じく「売上記帳」から登録。
          </Step>
          <Step n={3} title="経費は「経費」から">
            領収書の写真添付も可能。月別・カテゴリ別に集計されます。
          </Step>
          <Tip>
            CSVで一括インポートも可能（売上・経費・顧客どれも対応）。
            旧システムからの引っ越し時に使えます。
          </Tip>
        </Section>

        <Section
          icon={<Wallet className="w-4 h-4 text-emerald-600" />}
          salesMode="tally"
          title="日計表（その日の金額をまとめて記帳）"
          color="border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30"
        >
          <p>この院は、患者さん1人ずつではなく<b>「日計表」で1日分をまとめて記帳</b>します。</p>
          <Step n={1} title="左メニューの「日計表」を開く">
            その日の予約（キャンセル除く）が自動で行に並びます。予約のない方は「行を追加」で足します。
          </Step>
          <Step n={2} title="お名前の行に金額を入れる">
            数字は半角で入れてください（全角で打っても自動で直ります）。窓口0円の方は「0」を入れます。
          </Step>
          <Step n={3} title="「保存」を押す">
            保存するまで金額は記録されません。画面下の保存バーに「未保存」と出ている間は必ず保存を。
          </Step>
          <Step n={4} title="会計済チェック">
            チェックはその場で受付画面に反映されます（保存ボタンは不要）。
          </Step>
          <Tip>受付画面の「日計表で会計」を押すと、その方の行に自動で移動します。</Tip>
        </Section>

        <Section
          icon={<LineChart className="w-4 h-4 text-rose-600" />}
          ownerOnly
          title="経営評価とKPIダッシュボード"
          color="border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/30"
        >
          <p>
            <b>「経営評価」</b> タブで毎月の実績と目標達成率を可視化します。
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>来院数 / 売上 / 新規患者数 / リピート率 / SNS投稿数 の5軸レーダー</li>
            <li>月次目標は「設定」から編集可能</li>
            <li>AI戦略アドバイス：実績データから今月の改善提案を自動生成</li>
            <li>年間税務レポート / 月次レポートを CSV / PDF で出力</li>
          </ul>
        </Section>

        <Section
          icon={<Megaphone className="w-4 h-4 text-orange-600" />}
          ownerOnly
          title="LINE一括配信・販促"
          color="border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/30"
        >
          <Step n={1} title="「SNS・LINE等」または「LINEでお知らせ」を開く">
            紐づけ済み患者さんの一覧が出ます。
          </Step>
          <Step n={2} title="配信メッセージを作成">
            キャンペーン告知・休診案内・誕生月クーポンなど。
          </Step>
          <Step n={3} title="送信対象を絞る（任意）">
            年代・最終来院日・コース履歴などでセグメント可能。
          </Step>
          <Step n={4} title="送信ボタンで一括配信">
            送信実績は履歴に残ります。
          </Step>
          <Tip>誕生月クーポンは自動配信設定が可能です。</Tip>
        </Section>

        <Section
          icon={<Sparkles className="w-4 h-4 text-violet-600" />}
          ownerOnly
          title="AI秘書ブリーフィング"
          color="border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/30"
        >
          <p>
            ダッシュボードに表示される <b>AI秘書</b> は、複数のテーブルを横断して
            「人間が気づきにくい抜け・異常」を毎朝先回りでお知らせします。
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>本日の来院予定と注意点</li>
            <li>誕生日の患者さん（声がけタイミング）</li>
            <li>長く来ていない患者さんのリストアップ</li>
            <li>売上の異常検知・ペース不足アラート</li>
            <li>SNS投稿のリマインド</li>
          </ul>
        </Section>

        <Section
          icon={<Clock className="w-4 h-4 text-cyan-600" />}
          title="勤怠（出退勤の打刻）"
          color="border-cyan-200 dark:border-cyan-900 bg-cyan-50/50 dark:bg-cyan-950/30"
        >
          <p>
            スタッフは <b>/attendance</b> の打刻画面、院長は <b>「勤怠」</b> タブで一覧を見ます。
            金額（時給・残業代）と全員の一覧は<b>院長だけ</b>が見られます。
          </p>

          <div className="font-semibold text-slate-900 dark:text-slate-100 pt-1">スタッフの使い方（2ステップ）</div>
          <Step n={1} title="お名前を押す">
            打刻画面には大きな名前ボタンが並んでいます。自分の名前を押してください。
          </Step>
          <Step n={2} title="「出勤」または「退勤」を押す">
            今やることが1つだけ大きく出ます。出勤前なら「出勤」、出勤後なら「退勤」だけが出ます。
            退勤するには、その日の業務すべてに「できた／できなかった」を付ける必要があります（100%でなくて大丈夫です）。
          </Step>

          <div className="font-semibold text-slate-900 dark:text-slate-100 pt-1">自分の記録の確認・打刻の押し忘れ</div>
          <p>
            打刻画面の <b>「自分の出退勤を確認する」</b> で、自分の直近45日ぶんを見られます（自分のぶんだけ）。
            出勤か退勤のどちらかを押し忘れた日があると、次に画面を開いたとき
            <b>「打刻が抜けている日が◯日あります」</b> と上に出ます。押すとその場で時刻を入れて直せます。
          </p>
          <Tip>
            スタッフが自分で直せるのは「片方が抜けている日」だけです。
            出勤・退勤の両方が入っている日を直したいときは、院長が「勤怠」タブの一覧から修正します。
          </Tip>

          <div className="font-semibold text-slate-900 dark:text-slate-100 pt-1">院のパソコンでだけ打刻できるようにする</div>
          <p>
            「勤怠」タブの <b>「打刻できるパソコンを限定する」</b> でパスワードを決めてオンにすると、
            院のパソコンでそのパスワードを1回入れた端末だけが打刻できるようになります。
            スタッフ個人のスマホからは打刻できません。パスワードはスタッフに教えないでください。
          </p>
          <Tip>
            <b>パスワードが分からなくなったときは、新しいパスワードを入れて保存し直すだけで大丈夫です。</b>
            元のパスワードは表示できませんが、すでに登録ずみのパソコンは、パスワードを変えても
            そのまま打刻を続けられます（打刻できなくなる心配はありません）。
          </Tip>

          <div className="font-semibold text-slate-900 dark:text-slate-100 pt-1">月末の勤怠管理表（Excel）</div>
          <p>
            「勤怠」タブの <b>「勤怠管理表を作る」</b> を押すと、その月の勤怠管理表がExcelでダウンロードされます。
            スタッフ1人につき1シートで、出勤・休憩・退勤・総稼働・残業まで入った状態で出ます。
            合計は数式で入っているので、あとから時刻を直せば自動で計算し直されます。
          </p>
          <Tip>
            打刻の押し忘れや時刻の間違いは、先に「勤怠」タブの一覧で直してから作ってください。
            ツールの記録がそのままExcelになります。
          </Tip>
        </Section>

        <Section
          icon={<HelpCircle className="w-4 h-4 text-slate-600" />}
          title="困ったときは（よくある質問）"
          color="border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40"
        >
          <div>
            <div className="font-semibold mb-1">Q. LINEのリマインダーが届きません</div>
            <p>
              A. その患者さんがLINE紐づけ済か「顧客管理」で確認してください。
              「未紐づけ」になっていればリマインダーは送れません。
            </p>
          </div>
          <div>
            <div className="font-semibold mb-1">Q. 打刻用のパスワードが分からなくなりました</div>
            <p>
              A.「勤怠」タブの「打刻できるパソコンを限定する」で、新しいパスワードを入れて保存し直してください。
              元のパスワードは表示できませんが、すでに登録ずみのパソコンは、パスワードを変えても
              そのまま打刻できます。打刻できなくなることはありません。
            </p>
          </div>
          <div>
            <div className="font-semibold mb-1">Q. 出勤（または退勤）を押し忘れました</div>
            <p>
              A. 次に打刻画面を開くと上に「打刻が抜けている日が◯日あります」と出ます。
              押すとその日の時刻をその場で入力できます。
              出勤・退勤の両方が入っている日を直したいときは院長にお伝えください（「勤怠」タブから直せます）。
            </p>
          </div>
          <div>
            <div className="font-semibold mb-1">Q. 予約画面が真っ白になる</div>
            <p>
              A. ブラウザを再読み込み（プルダウン更新）してください。
              画面上部に「システムが新しくなりました」と出ているときは、その帯を押して開き直してください。
              それでも直らなければ、このページ下の連絡先へ。
            </p>
          </div>
          <div>
            <div className="font-semibold mb-1">Q. 過去のデータをまとめて入れたい</div>
            <p>
              A.「売上記帳」「患者さん」「経費」それぞれに CSV インポート機能があります（院長のみ）。
              テンプレートもダウンロードできます。
            </p>
          </div>
          <div>
            <div className="font-semibold mb-1">Q. パスワードを変更したい</div>
            <p>A. 院長は「設定」の「アカウント設定」から変更できます。受付の方はログイン画面の「パスワードをお忘れの方はこちら」から再設定メールを送るか、院長にお伝えください。</p>
          </div>
        </Section>
      </div>
    </div>
    </ManualCtx.Provider>
  );
}
