"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  MessageCircle,
  Users,
  Wallet,
  LineChart,
  Sparkles,
  Megaphone,
  ShieldCheck,
  Smartphone,
  Bot,
  ClipboardCheck,
  Database,
  Heart,
  ArrowRight,
  CheckCircle2,
  Trophy,
  Home,
  DoorOpen,
  Stethoscope,
  Hand,
} from "lucide-react";
import Link from "next/link";

type Slide = {
  badge?: string;
  title: string;
  subtitle?: string;
  body: React.ReactNode;
  bg?: string;
};

const SLIDES: Slide[] = [
  {
    title: "からだ鍼灸整骨院 藤川先生へ",
    subtitle: "予約・LINE・売上・AIをひとつに",
    bg: "from-blue-600 via-indigo-700 to-purple-800",
    body: (
      <div className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur px-4 py-2 rounded-full text-xs font-bold border border-white/20">
          <Sparkles className="w-3.5 h-3.5" />
          ボール接骨院の現場から生まれたDXツール
        </div>
        <p className="text-base leading-relaxed opacity-90 px-2">
          紙の台帳と電話対応に追われる毎日から、<br />
          スマホ1台で全部回せる毎日へ。
        </p>
        <div className="pt-2 text-[11px] opacity-70 leading-relaxed">
          鍼灸・整骨どちらの自費メニューにも対応します
        </div>
        <div className="pt-2 text-xs opacity-60">スワイプで次へ →</div>
      </div>
    ),
  },
  {
    badge: "Why",
    title: "こんな悩み、ありませんか？",
    bg: "from-rose-600 to-orange-600",
    body: (
      <div className="space-y-3 text-left">
        {[
          "予約電話が施術中に何度もかかってくる",
          "売上を月末にまとめて電卓で集計している",
          "LINEで来た予約を手作業で台帳に転記している",
          "リピーターへの声がけが気合と記憶頼り",
          "数字を見て「で、来月どう動く？」が分からない",
        ].map((t, i) => (
          <div key={i} className="bg-white/10 backdrop-blur rounded-xl px-4 py-3 border border-white/20 text-sm font-medium">
            <span className="opacity-60 mr-2">{i + 1}.</span>
            {t}
          </div>
        ))}
      </div>
    ),
  },
  {
    badge: "What",
    title: "1つで完結する経営の司令塔",
    bg: "from-indigo-600 to-blue-700",
    body: (
      <div className="space-y-4">
        <p className="text-sm opacity-90 text-center">
          バラバラだった業務を、1画面で。
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: <CalendarCheck className="w-5 h-5" />, label: "予約管理" },
            { icon: <Users className="w-5 h-5" />, label: "顧客カルテ" },
            { icon: <MessageCircle className="w-5 h-5" />, label: "LINE連携" },
            { icon: <Wallet className="w-5 h-5" />, label: "売上・経費" },
            { icon: <LineChart className="w-5 h-5" />, label: "経営KPI" },
            { icon: <Bot className="w-5 h-5" />, label: "AI秘書" },
          ].map((it, i) => (
            <div key={i} className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/20 flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
                {it.icon}
              </div>
              <div className="text-xs font-bold">{it.label}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    badge: "Feature 1",
    title: "Web予約 × 受付カウンター",
    subtitle: "電話を取る回数が劇的に減る",
    bg: "from-blue-600 to-cyan-600",
    body: (
      <div className="space-y-3 text-sm">
        <div className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/20">
          <div className="font-bold mb-1 flex items-center gap-2">
            <Smartphone className="w-4 h-4" /> 患者さん側
          </div>
          <p className="opacity-90 text-xs leading-relaxed">
            24時間いつでもスマホからWeb予約。混雑時間も一目で分かる。
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/20">
          <div className="font-bold mb-1 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" /> 受付カウンター
          </div>
          <p className="opacity-90 text-xs leading-relaxed">
            来院状況（待合中・施術中・完了）が一覧で見える。
            タップで状態を更新するだけ。
          </p>
        </div>
        <div className="bg-emerald-500/20 rounded-xl p-3 border border-emerald-300/30 text-xs font-bold text-center">
          ✓ 30分スロット制で自動的にダブルブッキング防止
        </div>
      </div>
    ),
  },
  {
    badge: "Feature 2",
    title: "LINEで個別フォロー自動化",
    subtitle: "公式LINEがそのまま予約秘書に",
    bg: "from-green-600 to-emerald-700",
    body: (
      <div className="space-y-3 text-sm">
        <div className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/20 space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="text-xs">電話番号下4桁で<b>自動的に顧客と紐づけ</b></span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="text-xs">前日リマインダーで<b>無断キャンセルを激減</b></span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="text-xs"><b>誕生月クーポン</b>を自動配信</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="text-xs">休診案内・キャンペーンを<b>セグメント一括配信</b></span>
          </div>
        </div>
        <div className="bg-white/10 rounded-lg p-3 text-[11px] opacity-80 leading-relaxed">
          管理画面の「未紐づけ」ボタンから、最近メッセージをくれた患者さんを1タップで紐づけ可能。
        </div>
      </div>
    ),
  },
  {
    badge: "Feature 3",
    title: "顧客カルテ・名寄せ",
    subtitle: "二度と同じ人を二人作らない",
    bg: "from-purple-600 to-fuchsia-700",
    body: (
      <div className="space-y-3 text-sm">
        <ul className="space-y-2">
          {[
            "名前・電話・カルテ番号で即時検索",
            "重複登録を統合（名寄せ）できる",
            "来院回数・最終来院日・キャンセル数を自動集計",
            "Web予約停止フラグでトラブル予防",
            "紹介元・年代・住所など分析用属性も保存",
          ].map((t, i) => (
            <li key={i} className="bg-white/10 backdrop-blur rounded-lg px-3 py-2 border border-white/20 text-xs flex items-start gap-2">
              <span className="opacity-60">●</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    badge: "Feature 4",
    title: "売上・経費の見える化",
    subtitle: "現金と保険を分けて自動集計",
    bg: "from-emerald-600 to-teal-700",
    body: (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20 text-center">
            <div className="text-[10px] opacity-70 mb-1">窓口</div>
            <div className="font-bold text-sm">現金売上</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20 text-center">
            <div className="text-[10px] opacity-70 mb-1">月次入金</div>
            <div className="font-bold text-sm">保険収入</div>
          </div>
        </div>
        <ul className="space-y-2 text-xs">
          <li className="bg-white/10 rounded-lg px-3 py-2">📥 領収書はカメラで撮ってそのまま添付</li>
          <li className="bg-white/10 rounded-lg px-3 py-2">📊 月別・カテゴリ別に自動集計</li>
          <li className="bg-white/10 rounded-lg px-3 py-2">📂 過去データはCSVで一括インポート</li>
          <li className="bg-white/10 rounded-lg px-3 py-2">📃 年間税務レポートをワンクリック出力</li>
        </ul>
      </div>
    ),
  },
  {
    badge: "Feature 5",
    title: "経営KPIレーダーチャート",
    subtitle: "今月の達成度がひと目で分かる",
    bg: "from-rose-600 to-pink-700",
    body: (
      <div className="space-y-3 text-sm">
        <p className="text-xs opacity-90 text-center">5つの軸で経営の健康診断。</p>
        <div className="grid grid-cols-1 gap-2">
          {[
            { k: "来院数", v: "目標と実績の達成率" },
            { k: "売上高", v: "デフォルト目標 ¥1,500,000/月" },
            { k: "新規患者数", v: "新規獲得の伸び" },
            { k: "リピート率", v: "戻ってきてくれた割合" },
            { k: "SNS投稿", v: "発信のリズム" },
          ].map((it, i) => (
            <div key={i} className="bg-white/10 backdrop-blur rounded-lg px-3 py-2 border border-white/20 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center text-[11px] font-bold">{i + 1}</div>
              <div className="flex-1">
                <div className="font-bold text-xs">{it.k}</div>
                <div className="text-[11px] opacity-70">{it.v}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    badge: "Feature 6",
    title: "AI戦略アドバイス",
    subtitle: "「で、何をすればいい？」に答える",
    bg: "from-violet-600 to-indigo-700",
    body: (
      <div className="space-y-3 text-sm">
        <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/20 text-xs leading-relaxed">
          <div className="flex items-center gap-2 font-bold mb-2">
            <Sparkles className="w-4 h-4" />
            実績データから今月の打ち手を自動生成
          </div>
          <p className="opacity-90">
            来院数・売上・リピート率・SNS投稿…ツール内のすべての数字を読み込んだAIが、
            「今月伸ばすならココ」を具体的に提案。
          </p>
        </div>
        <div className="bg-violet-500/20 border border-violet-300/30 rounded-xl p-3 text-xs">
          <div className="font-bold mb-1">例: AIの提案</div>
          <p className="opacity-90 leading-relaxed">
            「再来院が30日以上空いている10名にLINE一斉配信を。先月この層から○名が復帰しています」
          </p>
        </div>
      </div>
    ),
  },
  {
    badge: "Feature 7",
    title: "AI秘書ブリーフィング",
    subtitle: "毎朝、抜けと異常を先回り",
    bg: "from-blue-700 to-violet-700",
    body: (
      <div className="space-y-3 text-sm">
        <p className="text-xs opacity-90 text-center">
          複数テーブルを横断して、人間が気づきにくいことを毎朝サマリー。
        </p>
        <ul className="space-y-2 text-xs">
          {[
            "🎂 今日が誕生日の患者さん",
            "📞 長く来ていない常連さん",
            "⚠️ 売上ペースが目標を下回りそう",
            "📝 SNS投稿が空いている日数",
            "🔁 同じ患者の重複登録の疑い",
          ].map((t, i) => (
            <li key={i} className="bg-white/10 backdrop-blur rounded-lg px-3 py-2 border border-white/20">{t}</li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    badge: "Feature 8",
    title: "ダッシュボード",
    subtitle: "院長が朝1番に見る画面",
    bg: "from-cyan-600 to-blue-700",
    body: (
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20">
            <div className="text-[10px] opacity-70">本日の予約</div>
            <div className="text-2xl font-black mt-1">12</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20">
            <div className="text-[10px] opacity-70">本日の売上予測</div>
            <div className="text-2xl font-black mt-1">¥84,000</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20">
            <div className="text-[10px] opacity-70">月の達成率</div>
            <div className="text-2xl font-black mt-1">73%</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20">
            <div className="text-[10px] opacity-70">今日の誕生日</div>
            <div className="text-2xl font-black mt-1">2名</div>
          </div>
        </div>
        <p className="text-[11px] opacity-70 text-center">
          ※ 表示はイメージ。実データはツールに反映されます。
        </p>
      </div>
    ),
  },
  {
    badge: "Migration",
    title: "今のデータも全部移せる",
    bg: "from-slate-700 to-slate-900",
    body: (
      <div className="space-y-3 text-sm">
        <div className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/20 flex items-center gap-3">
          <Database className="w-6 h-6" />
          <div>
            <div className="font-bold text-sm">CSV一括インポート</div>
            <div className="text-[11px] opacity-70">顧客 / 売上 / 経費 / 保険入金</div>
          </div>
        </div>
        <p className="text-xs opacity-90 leading-relaxed">
          紙の台帳・Excel・他社ツールから移行できるよう、
          各種テンプレートを用意しています。<br />
          移行支援も承ります。
        </p>
      </div>
    ),
  },
  {
    badge: "Security",
    title: "院のデータを守る仕組み",
    bg: "from-slate-800 to-blue-900",
    body: (
      <div className="space-y-3 text-sm">
        <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-bold text-xs">Row Level Security</div>
            <div className="text-[11px] opacity-70">院ごとにデータを完全分離</div>
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20 flex items-start gap-3">
          <Database className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-bold text-xs">日次バックアップ</div>
            <div className="text-[11px] opacity-70">過去データの自動保管</div>
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20 flex items-start gap-3">
          <Smartphone className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-bold text-xs">スマホでもPCでも</div>
            <div className="text-[11px] opacity-70">どの端末からでも安全にアクセス</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    badge: "からだ鍼灸整骨院へ",
    title: "藤川先生の院ならこう活かせる",
    subtitle: "サイトを拝見して考えた7つのご提案",
    bg: "from-amber-600 to-orange-700",
    body: (
      <div className="space-y-3 text-sm">
        <p className="text-xs opacity-90 leading-relaxed text-center">
          鍼灸+整骨のW資格・スポーツ専門・訪問対応・<br />
          スタッフ4名体制という強みに合わせて。
        </p>
        <ul className="space-y-2 text-xs">
          {[
            { n: "①", t: "鍼灸 / からだ式整体 / マッサージを別メニュー登録" },
            { n: "②", t: "アスリート向け カルテ項目（種目・チーム・けが履歴）" },
            { n: "③", t: "島田先生の訪問治療を専用カレンダーで管理" },
            { n: "④", t: "「1ヶ月空くと初診扱い」をLINEで自動リマインド" },
            { n: "⑤", t: "電話優先制 → Web予約で河原さんを電話番から解放" },
            { n: "⑥", t: "個室 / 大部屋4ベッドの稼働率を見える化" },
            { n: "⑦", t: "院長 / 島田 / 大橋 各スタッフの予約を色分け表示" },
          ].map((it, i) => (
            <li key={i} className="bg-white/15 backdrop-blur rounded-lg px-3 py-2 border border-white/20 flex items-start gap-2">
              <span className="font-black opacity-90">{it.n}</span>
              <span>{it.t}</span>
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    badge: "提案 ①②",
    title: "鍼灸×整骨の両看板を活かす",
    subtitle: "メニューもカルテも、両方の自分らしさで",
    bg: "from-emerald-700 to-teal-700",
    body: (
      <div className="space-y-3 text-sm">
        <div className="bg-white/15 backdrop-blur rounded-xl p-4 border border-white/20">
          <div className="font-bold text-xs mb-2 flex items-center gap-2">
            <Stethoscope className="w-4 h-4" /> 自費メニューを別管理
          </div>
          <ul className="space-y-1 text-[11px] opacity-90">
            <li>● 鍼・灸（はり・きゅう）</li>
            <li>● からだ式整体</li>
            <li>● マッサージ / スパイラルテーピング</li>
            <li>● 冷え性改善 / 肩甲骨はがし / フットマッサージ</li>
          </ul>
          <p className="text-[10px] opacity-70 mt-2">
            メニュー別の単価・施術時間・回数券残数を自動集計
          </p>
        </div>
        <div className="bg-white/15 backdrop-blur rounded-xl p-4 border border-white/20">
          <div className="font-bold text-xs mb-2 flex items-center gap-2">
            <Trophy className="w-4 h-4" /> アスリート向けカルテ項目
          </div>
          <p className="text-[11px] opacity-90 leading-relaxed">
            ハノーファー96で培われた知見を活かすために、
            「種目 / チーム名 / ポジション / 過去のけが」を顧客カルテに追加。
            再発防止のリピート提案にも繋がります。
          </p>
        </div>
      </div>
    ),
  },
  {
    badge: "提案 ③",
    title: "島田先生の訪問治療を、もっとラクに",
    subtitle: "10:00〜16:00の動きを1画面で",
    bg: "from-purple-700 to-pink-700",
    body: (
      <div className="space-y-3 text-sm">
        <div className="bg-white/15 backdrop-blur rounded-xl p-4 border border-white/20 flex items-start gap-3">
          <Home className="w-6 h-6 flex-shrink-0" />
          <div className="space-y-1">
            <div className="font-bold text-xs">訪問専用カレンダー</div>
            <p className="text-[11px] opacity-90">
              通常診療と訪問治療を別レーンで表示。
              移動時間も含めてスケジュールが組める。
            </p>
          </div>
        </div>
        <ul className="space-y-2 text-[11px]">
          <li className="bg-white/10 rounded-lg px-3 py-2">📍 訪問先ごとに来院履歴・施術内容を蓄積</li>
          <li className="bg-white/10 rounded-lg px-3 py-2">📅 「次回はいつ」の予定を家族にもLINEで共有</li>
          <li className="bg-white/10 rounded-lg px-3 py-2">🚗 移動時間・車内メモを残せる</li>
          <li className="bg-white/10 rounded-lg px-3 py-2">📃 健康保険適用ぶんも自動集計</li>
        </ul>
      </div>
    ),
  },
  {
    badge: "提案 ④⑤",
    title: "電話番から、河原さんを解放する",
    subtitle: "受付の本来の仕事に時間を",
    bg: "from-rose-700 to-red-700",
    body: (
      <div className="space-y-3 text-sm">
        <div className="bg-white/15 backdrop-blur rounded-xl p-4 border border-white/20">
          <div className="font-bold text-xs mb-2 flex items-center gap-2">
            <DoorOpen className="w-4 h-4" /> Web予約で電話を半分に
          </div>
          <p className="text-[11px] opacity-90 leading-relaxed">
            予約優先制はそのままに、Web予約を入り口にすることで
            「世間話から相談まで受付てくれる」河原さんが
            <b>本来の患者対応</b>に時間を使えます。
          </p>
        </div>
        <div className="bg-white/15 backdrop-blur rounded-xl p-4 border border-white/20">
          <div className="font-bold text-xs mb-2 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-green-300" /> LINEで自動リマインド
          </div>
          <ul className="text-[11px] opacity-90 space-y-1">
            <li>● 月初は「レセプト手続き +200円」のお知らせ</li>
            <li>● 「最終来院から1ヶ月」が近い方に自動メッセージ</li>
            <li>● 「初診扱いになります」を未然に防ぐ案内</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    badge: "提案 ⑥⑦",
    title: "個室・大部屋・スタッフを見える化",
    subtitle: "稼働率を上げて、待ち時間を減らす",
    bg: "from-cyan-700 to-blue-800",
    body: (
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/15 backdrop-blur rounded-xl p-3 border border-white/20 text-center">
            <div className="text-[10px] opacity-70">大部屋</div>
            <div className="font-bold text-sm">4ベッド</div>
          </div>
          <div className="bg-white/15 backdrop-blur rounded-xl p-3 border border-white/20 text-center">
            <div className="text-[10px] opacity-70">個室</div>
            <div className="font-bold text-sm">女性も安心</div>
          </div>
        </div>
        <p className="text-[11px] opacity-90 leading-relaxed">
          各ベッド・個室の稼働状況がリアルタイムに分かるので、
          「あと1人入れる？」の判断がスムーズに。
        </p>
        <div className="bg-white/15 backdrop-blur rounded-xl p-3 border border-white/20">
          <div className="font-bold text-xs mb-1">スタッフ別カラーリング</div>
          <div className="flex gap-2 flex-wrap text-[10px]">
            <span className="px-2 py-1 rounded bg-blue-500/40">院長 藤川</span>
            <span className="px-2 py-1 rounded bg-emerald-500/40">島田</span>
            <span className="px-2 py-1 rounded bg-amber-500/40">大橋</span>
            <span className="px-2 py-1 rounded bg-pink-500/40">河原（受付）</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    badge: "Try It",
    title: "実際に触ってみてください",
    subtitle: "藤川先生の院でセットアップ済みの体験デモ",
    bg: "from-blue-600 to-cyan-600",
    body: (
      <div className="space-y-4 text-sm">
        <div className="bg-white/15 backdrop-blur rounded-xl p-4 border border-white/20 space-y-2">
          <div className="font-bold text-xs flex items-center gap-2">
            <Hand className="w-4 h-4" />
            体験できること
          </div>
          <ul className="text-[11px] space-y-1 opacity-95">
            <li>● スタッフ4名（藤川/島田/大橋/河原）の色分けカレンダー</li>
            <li>● 島田先生の訪問治療レーン（10:00〜16:00）</li>
            <li>● 個室・大部屋4ベッドの稼働状況</li>
            <li>● 鍼灸 / 整体 / マッサージ等のメニュー予約</li>
            <li>● アスリート患者のスポーツ情報表示</li>
          </ul>
        </div>

        <Link
          href="/presentation/karada-demo"
          className="block w-full text-center bg-white text-blue-700 font-black px-5 py-4 rounded-2xl shadow-2xl active:scale-95 transition"
        >
          デモ画面を開く →
        </Link>

        <p className="text-[10px] opacity-70 text-center leading-relaxed">
          画面上の「このまま本番スタート」ボタンから、<br />
          このセットアップをそのまま運用に引き継げます。
        </p>
      </div>
    ),
  },
  {
    badge: "Closing",
    title: "藤川先生と一緒に育てたい。",
    subtitle: "からだ鍼灸整骨院の毎日を、もっとシンプルに",
    bg: "from-blue-700 via-purple-700 to-pink-700",
    body: (
      <div className="space-y-5 text-center">
        <Heart className="w-12 h-12 mx-auto opacity-80" />
        <p className="text-sm leading-relaxed opacity-90">
          現場のリアルな悩みから1つずつ機能を作っています。<br />
          鍼灸・整骨どちらの運用にも合わせて<br />
          今後もアップデートで一緒に育てていきたいです。
        </p>
        <div className="pt-2 inline-flex items-center gap-2 bg-white/15 backdrop-blur px-5 py-3 rounded-full border border-white/20 text-sm font-bold">
          ご質問・ご要望なんでもお気軽に
          <ArrowRight className="w-4 h-4" />
        </div>
        <div className="pt-1 text-[11px] opacity-60">
          平岩 / ボール接骨院
        </div>
      </div>
    ),
  },
];

export default function ClinicToolPresentationPage() {
  const [current, setCurrent] = useState(0);
  const total = SLIDES.length;
  const slide = SLIDES[current];

  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const next = () => setCurrent((c) => Math.min(c + 1, total - 1));
  const prev = () => setCurrent((c) => Math.max(c - 1, 0));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "ArrowDown") next();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < -40) next();
      if (dx > 40) prev();
    } else {
      if (dy < -40) next();
      if (dy > 40) prev();
    }
    touchStart.current = null;
  };

  return (
    <div
      className={`fixed inset-0 bg-gradient-to-br ${slide.bg ?? "from-slate-800 to-slate-900"} text-white flex flex-col transition-colors duration-500 overflow-hidden`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* 進捗バー */}
      <div className="absolute top-0 left-0 right-0 flex gap-1 p-2 z-20 pointer-events-none">
        {SLIDES.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i < current ? "bg-white/80" : i === current ? "bg-white" : "bg-white/20"
            }`}
          />
        ))}
      </div>

      {/* ヘッダー */}
      <div className="pt-6 px-6 z-10 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">
          {slide.badge ?? "Ball Clinic"}
        </div>
        <div className="text-[10px] font-bold opacity-70">
          {current + 1} / {total}
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 flex flex-col justify-center px-6 pb-24 z-10 overflow-y-auto">
        <div className="max-w-md mx-auto w-full">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight mb-2">
            {slide.title}
          </h1>
          {slide.subtitle && (
            <p className="text-sm opacity-80 mb-6 font-medium">{slide.subtitle}</p>
          )}
          <div className="mt-4">{slide.body}</div>
        </div>
      </div>

      {/* ナビゲーション */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center justify-between z-20 bg-gradient-to-t from-black/30 to-transparent">
        <button
          onClick={prev}
          disabled={current === 0}
          className="w-12 h-12 rounded-full bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center disabled:opacity-30 active:scale-95 transition"
          aria-label="前へ"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-[10px] font-bold opacity-60 uppercase tracking-widest">
          スワイプで進む
        </div>
        <button
          onClick={next}
          disabled={current === total - 1}
          className="w-14 h-14 rounded-full bg-white text-slate-900 flex items-center justify-center disabled:opacity-30 active:scale-95 transition shadow-2xl"
          aria-label="次へ"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
