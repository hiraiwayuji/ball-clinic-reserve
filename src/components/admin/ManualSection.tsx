"use client";

import { useState } from "react";
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
} from "lucide-react";

const MANUAL_VERSION = "v1.1";
const MANUAL_UPDATED_AT = "2026-06-02";

type Item = {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
};

const Section = ({ icon, title, color, children }: { icon: React.ReactNode; title: string; color: string; children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
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

export default function ManualSection() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border p-6 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            操作マニュアル
          </h2>
          <p className="text-sm text-slate-500">
            ツールの使い方をまとめています。アップデートに合わせて自動的に最新版に更新されます。
          </p>
        </div>
        <div className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
          {MANUAL_VERSION} / {MANUAL_UPDATED_AT}
        </div>
      </div>

      <div className="space-y-3">
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
            <Step n={3} title="管理画面の「顧客管理」を開く">
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
          <Step n={1} title="予約一覧 or 受付画面から新規追加">
            「+ 予約を追加」ボタンで日時・コース・患者さんを選んで保存。
          </Step>
          <Step n={2} title="編集はカードをタップ">
            時間変更・コース変更・メモ追加が可能。
          </Step>
          <Step n={3} title="キャンセルは編集画面の「キャンセル」ボタン">
            キャンセル理由を入れておくと統計に反映されます。
          </Step>
          <Tip>受付画面では本日の予約一覧と来院状況（待合中・施術中・完了）が一目で見えます。</Tip>
        </Section>

        <Section
          icon={<Tag className="w-4 h-4 text-amber-600" />}
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
          icon={<Wallet className="w-4 h-4 text-emerald-600" />}
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
          icon={<LineChart className="w-4 h-4 text-rose-600" />}
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
          title="LINE一括配信・販促"
          color="border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/30"
        >
          <Step n={1} title="LINE・販促タブを開く">
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
            <div className="font-semibold mb-1">Q. 予約画面が真っ白になる</div>
            <p>
              A. ブラウザを再読み込み（プルダウン更新）してください。
              改善しない場合はキャッシュクリア。それでも直らなければ管理者へ連絡を。
            </p>
          </div>
          <div>
            <div className="font-semibold mb-1">Q. 過去のデータをまとめて入れたい</div>
            <p>
              A.「売上記帳」「顧客管理」「経費」それぞれに CSV インポート機能があります。
              テンプレートもダウンロードできます。
            </p>
          </div>
          <div>
            <div className="font-semibold mb-1">Q. パスワードを変更したい</div>
            <p>A. 設定タブの「アカウント設定」からいつでも変更できます。</p>
          </div>
        </Section>
      </div>
    </div>
  );
}
