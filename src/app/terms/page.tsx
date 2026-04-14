import { Metadata } from "next";

export const metadata: Metadata = {
  title: "利用規約 | 接骨院管理システム",
};

const LAST_UPDATED = "2026年4月14日";
const SERVICE_NAME = "接骨院管理システム";
const OPERATOR     = "【運営者名・屋号】";      // ← あなたの名前・屋号に変更
const EMAIL        = "【メールアドレス】";       // ← 連絡先メールに変更
const PRICE        = "月額【●,000】円（税込）"; // ← 実際の料金に変更

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-6 py-12">

        {/* ヘッダー */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">{SERVICE_NAME}</h1>
          <h2 className="text-xl font-bold text-slate-700 mb-1">利用規約</h2>
          <p className="text-sm text-slate-500">最終更新日：{LAST_UPDATED}</p>
        </div>

        <div className="space-y-8 text-slate-700 leading-relaxed">

          <Section title="第1条（総則）">
            <p>
              本利用規約（以下「本規約」）は、{OPERATOR}（以下「運営者」）が提供する
              「{SERVICE_NAME}」（以下「本サービス」）の利用条件を定めるものです。
              利用者（以下「ユーザー」）は、本規約に同意したうえで本サービスをご利用ください。
            </p>
          </Section>

          <Section title="第2条（利用登録）">
            <ol className="list-decimal pl-5 space-y-2">
              <li>本サービスの利用を希望する方は、運営者が定める方法により利用登録を申請します。</li>
              <li>運営者が申請を承認した時点で、利用契約が成立します。</li>
              <li>
                次のいずれかに該当する場合、運営者は申請を承認しないことがあります。
                <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
                  <li>申請内容に虚偽が含まれる場合</li>
                  <li>過去に本規約違反があった場合</li>
                  <li>その他、運営者が不適切と判断した場合</li>
                </ul>
              </li>
            </ol>
          </Section>

          <Section title="第3条（利用料金・支払い）">
            <ol className="list-decimal pl-5 space-y-2">
              <li>本サービスの利用料金は{PRICE}です。</li>
              <li>
                利用料金は、運営者が指定する方法（銀行振込・クレジットカード等）により、
                毎月末日までに翌月分をお支払いください。
              </li>
              <li>一度支払われた利用料金は、原則として返金しません。</li>
              <li>14日間の無料トライアル期間を提供します（運営者が別途案内した場合に限る）。</li>
            </ol>
          </Section>

          <Section title="第4条（ユーザーの義務）">
            <ol className="list-decimal pl-5 space-y-2">
              <li>ユーザーは、アカウントおよびパスワードを自己の責任において管理してください。</li>
              <li>
                ユーザーは本サービスを通じて取り扱う患者・顧客の個人情報について、
                個人情報の保護に関する法律（個人情報保護法）を遵守する責任を負います。
              </li>
              <li>
                ユーザーは本サービスで管理するデータについて、
                関係法令（医療法・個人情報保護法等）を遵守する責任を負います。
              </li>
            </ol>
          </Section>

          <Section title="第5条（禁止事項）">
            <p className="mb-2">ユーザーは以下の行為を行ってはなりません。</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>第三者へのアカウントの譲渡・貸与・転売</li>
              <li>本サービスを利用した第三者への転売・再販</li>
              <li>運営者または第三者の著作権・知的財産権を侵害する行為</li>
              <li>本サービスのシステムへの不正アクセス・改ざん</li>
              <li>法令または公序良俗に反する行為</li>
              <li>その他、運営者が不適切と判断する行為</li>
            </ul>
          </Section>

          <Section title="第6条（データの取り扱い）">
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                ユーザーが本サービスに登録したデータ（以下「ユーザーデータ」）は
                ユーザー自身に帰属します。
              </li>
              <li>
                運営者は、サービス提供・品質改善・障害対応に必要な範囲でユーザーデータに
                アクセスすることがありますが、第三者への提供は行いません。
              </li>
              <li>
                解約後30日以内であれば、ユーザーデータのエクスポートをご依頼いただけます。
                30日経過後はデータを削除します。
              </li>
            </ol>
          </Section>

          <Section title="第7条（サービスの変更・停止・終了）">
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                運営者は、事前に通知のうえ、本サービスの内容を変更または終了することができます。
                ただし、緊急の場合は事後通知とする場合があります。
              </li>
              <li>
                システムメンテナンス・障害等によりサービスが一時停止する場合があります。
                この場合、運営者は可能な限り事前にお知らせします。
              </li>
              <li>
                サービス停止・終了によってユーザーに生じた損害について、
                運営者は責任を負いません（故意または重大な過失の場合を除く）。
              </li>
            </ol>
          </Section>

          <Section title="第8条（免責事項）">
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                本サービスは現状有姿で提供します。
                特定目的への適合性・完全性・正確性を保証するものではありません。
              </li>
              <li>
                通信障害・天災地変・第三者の行為等、運営者の合理的な管理範囲外の事由による
                損害について、運営者は責任を負いません。
              </li>
              <li>
                運営者が損害賠償責任を負う場合でも、その総額は直近1ヶ月の利用料金を
                上限とします。
              </li>
            </ol>
          </Section>

          <Section title="第9条（解約）">
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                ユーザーはいつでも解約することができます。
                解約を希望される場合は、月末日の7日前までに運営者へご連絡ください。
              </li>
              <li>解約月の利用料金は日割り計算せず、1ヶ月分となります。</li>
              <li>
                ユーザーが本規約に違反した場合、運営者は予告なくアカウントを停止・削除
                することがあります。この場合、利用料金の返金は行いません。
              </li>
            </ol>
          </Section>

          <Section title="第10条（規約の変更）">
            <p>
              運営者は必要に応じて本規約を変更することがあります。
              変更後も本サービスを継続して利用した場合、変更後の規約に同意したものとみなします。
              重要な変更については、メールまたはサービス内通知にてお知らせします。
            </p>
          </Section>

          <Section title="第11条（準拠法・管轄）">
            <p>
              本規約は日本法に準拠します。
              本サービスに関して紛争が生じた場合、運営者の所在地を管轄する裁判所を
              第一審の専属的合意管轄裁判所とします。
            </p>
          </Section>

          <Section title="お問い合わせ">
            <p>
              本規約に関するお問い合わせは下記までお願いします。<br />
              <strong>{OPERATOR}</strong><br />
              メール：{EMAIL}
            </p>
          </Section>

        </div>

        <div className="mt-12 pt-6 border-t border-slate-200 text-center">
          <a href="/register" className="text-blue-600 hover:underline text-sm mr-6">
            新規登録に戻る
          </a>
          <a href="/privacy" className="text-blue-600 hover:underline text-sm">
            プライバシーポリシー
          </a>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-base font-bold text-slate-800 mb-3 pb-2 border-b border-slate-200">
        {title}
      </h3>
      <div className="text-sm space-y-2">{children}</div>
    </section>
  );
}
