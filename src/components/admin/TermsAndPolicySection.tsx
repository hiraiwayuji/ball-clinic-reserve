"use client";

import { useState } from "react";
import { ShieldCheck, AlertTriangle, Ban, ChevronDown, ChevronUp, Lock } from "lucide-react";

const Section = ({
  icon,
  title,
  color,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  color: string;
  children: React.ReactNode;
}) => {
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
        <div className="px-5 pb-5 text-sm leading-relaxed space-y-2 border-t">
          {children}
        </div>
      )}
    </div>
  );
};

export default function TermsAndPolicySection() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Lock className="w-5 h-5 text-slate-500" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">個人情報・利用規約</h2>
      </div>
      <p className="text-sm text-slate-500 mb-6">本システムの利用にあたって遵守いただく事項です。</p>

      <div className="space-y-3">

        {/* 個人情報の取り扱い */}
        <Section
          icon={<ShieldCheck className="w-4 h-4 text-blue-500" />}
          title="個人情報の取り扱いについて"
          color="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 text-slate-700 dark:text-slate-300"
        >
          <ul className="space-y-2 mt-3 list-none">
            {[
              "患者様の氏名・電話番号・予約情報などの個人情報は、院内での予約管理・ご連絡の目的にのみ使用します。",
              "取得した個人情報は、提携する第三者（LINE・Supabase 等のシステム事業者）を除き、外部に提供・販売・共有しません。",
              "個人情報はセキュリティが確保されたクラウド環境（Supabase / AWS）で暗号化して保管されます。",
              "患者様から個人情報の開示・訂正・削除のご要望があった場合は、速やかに対応してください。",
              "不要になった個人情報は、院の判断で速やかに削除してください。",
            ].map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* 使用上の注意事項 */}
        <Section
          icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
          title="使用上の注意事項"
          color="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 text-slate-700 dark:text-slate-300"
        >
          <ul className="space-y-2 mt-3 list-none">
            {[
              "ログイン用のメールアドレス・パスワードは院長ご本人のみが管理し、スタッフを含む第三者に共有しないでください。",
              "パスワードは推測されにくいものを設定し、定期的に変更することをお勧めします。",
              "公共の場所（カフェ・図書館など）や共有 PC からのログインはお控えください。",
              "使用後は必ずログアウトし、ブラウザの自動入力・パスワード保存機能の使用には十分ご注意ください。",
              "システムに不具合・不審な動作を発見した場合は、速やかに開発担当者へご連絡ください。",
              "データのバックアップは定期的にエクスポート機能を使用して保管することをお勧めします。",
            ].map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-300 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* 禁止事項 */}
        <Section
          icon={<Ban className="w-4 h-4 text-rose-500" />}
          title="禁止事項"
          color="border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/30 text-slate-700 dark:text-slate-300"
        >
          <ul className="space-y-2 mt-3 list-none">
            {[
              "患者様の個人情報を院外へ持ち出すこと、またはスクリーンショットや印刷によって第三者に共有すること。",
              "ログイン情報（メール・パスワード）をスタッフ・家族を含む第三者に提供・共有すること。",
              "本システムを院の予約・経営管理以外の目的で使用すること。",
              "患者様の同意を得ずに個人情報を収集・利用・販売すること。",
              "システムの改ざん・不正アクセス・リバースエンジニアリングを試みること。",
              "本システムを第三者に転売・貸与・サービス提供の手段として利用すること。",
            ].map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 mt-0.5 text-rose-500 font-black text-base leading-5">✕</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

      </div>

      <p className="text-xs text-slate-400 mt-5 text-center">
        本システムの利用を開始した時点で、上記の内容に同意したものとみなします。<br />
        ご不明な点は開発担当者（ボール接骨院）までお問い合わせください。
      </p>
    </div>
  );
}
