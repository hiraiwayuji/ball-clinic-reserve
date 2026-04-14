import { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー | 接骨院管理システム",
};

const LAST_UPDATED = "2026年4月14日";
const SERVICE_NAME = "接骨院管理システム";
const OPERATOR     = "【運営者名・屋号】";  // ← あなたの名前・屋号に変更
const EMAIL        = "【メールアドレス】";   // ← 連絡先メールに変更

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-6 py-12">

        {/* ヘッダー */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">{SERVICE_NAME}</h1>
          <h2 className="text-xl font-bold text-slate-700 mb-1">プライバシーポリシー</h2>
          <p className="text-sm text-slate-500">最終更新日：{LAST_UPDATED}</p>
        </div>

        <div className="space-y-8 text-slate-700 leading-relaxed">

          <Section title="はじめに">
            <p>
              {OPERATOR}（以下「運営者」）は、「{SERVICE_NAME}」（以下「本サービス」）における
              個人情報の取り扱いについて、以下のとおりプライバシーポリシーを定めます。
              本ポリシーは、個人情報の保護に関する法律（個人情報保護法）に基づいています。
            </p>
          </Section>

          <Section title="第1条（取得する情報）">
            <p className="mb-2">本サービスでは、以下の情報を取得します。</p>

            <div className="space-y-4">
              <div>
                <p className="font-semibold text-slate-700 mb-1">① ご利用者（接骨院・クリニック様）の情報</p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>院名・屋号</li>
                  <li>メールアドレス</li>
                  <li>ログイン認証情報（パスワードは暗号化して保存）</li>
                  <li>サービス利用履歴</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-slate-700 mb-1">② ご利用者が登録する患者・顧客情報</p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>氏名・ふりがな</li>
                  <li>電話番号・連絡先</li>
                  <li>予約日時・施術履歴</li>
                  <li>売上・会計データ</li>
                  <li>その他、ご利用者が任意で登録した情報</li>
                </ul>
                <p className="text-xs text-slate-500 mt-1">
                  ※ 患者・顧客情報の管理責任はご利用者（接骨院様）にあります。
                </p>
              </div>

              <div>
                <p className="font-semibold text-slate-700 mb-1">③ システムが自動取得する情報</p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>IPアドレス・アクセスログ</li>
                  <li>ブラウザの種類・OSの情報</li>
                  <li>Cookieおよびセッション情報</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section title="第2条（利用目的）">
            <p className="mb-2">取得した情報は以下の目的で利用します。</p>
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li>本サービスの提供・運営・改善</li>
              <li>ユーザー認証・アカウント管理</li>
              <li>利用料金の請求・決済処理</li>
              <li>お問い合わせ・サポート対応</li>
              <li>障害対応・セキュリティ監視</li>
              <li>サービスに関する重要なご案内の送付</li>
            </ul>
          </Section>

          <Section title="第3条（第三者への提供）">
            <p className="mb-2">
              運営者は、以下の場合を除き、ユーザーの個人情報を第三者に提供しません。
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li>ご本人の同意がある場合</li>
              <li>法令に基づく開示要請がある場合（裁判所・警察等）</li>
              <li>人の生命・身体・財産の保護のために必要な場合</li>
            </ul>
          </Section>

          <Section title="第4条（業務委託・外部サービスの利用）">
            <p className="mb-2">
              本サービスは以下の外部サービスを利用しています。
              これらのサービスの利用により、一部のデータが当該サービスのサーバーに保存されます。
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="text-left p-3 border border-slate-200 font-semibold">サービス名</th>
                    <th className="text-left p-3 border border-slate-200 font-semibold">用途</th>
                    <th className="text-left p-3 border border-slate-200 font-semibold">所在地</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-3 border border-slate-200">Supabase</td>
                    <td className="p-3 border border-slate-200">データベース・認証</td>
                    <td className="p-3 border border-slate-200">日本（東京リージョン）</td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td className="p-3 border border-slate-200">Vercel</td>
                    <td className="p-3 border border-slate-200">ウェブサーバー・配信</td>
                    <td className="p-3 border border-slate-200">米国（CDN経由）</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              ※ 各サービスは独自のプライバシーポリシーおよびセキュリティ基準に従っています。
            </p>
          </Section>

          <Section title="第5条（データの保存・管理）">
            <ol className="list-decimal pl-5 space-y-2 text-sm">
              <li>
                登録データは、Supabase の日本（東京）リージョンのサーバーに保存されます。
                通信はすべてTLS（HTTPS）で暗号化されています。
              </li>
              <li>
                パスワードは bcrypt により暗号化して保存します。
                平文パスワードは保存しません。
              </li>
              <li>
                定期的な自動バックアップを実施しています。
              </li>
              <li>
                解約後30日以内にデータのエクスポートをご依頼いただけます。
                30日経過後はすべてのデータを削除します。
              </li>
            </ol>
          </Section>

          <Section title="第6条（Cookieの使用）">
            <p>
              本サービスでは、ログインセッションの維持のためにCookieを使用しています。
              ブラウザの設定でCookieを無効にすることもできますが、
              その場合、本サービスへのログインができなくなります。
            </p>
          </Section>

          <Section title="第7条（個人情報の開示・訂正・削除）">
            <p className="mb-2">
              ユーザーご本人は、ご自身の個人情報の開示・訂正・削除を請求することができます。
              ご希望の場合は、下記お問い合わせ先までご連絡ください。
              本人確認のうえ、合理的な期間内に対応します。
            </p>
          </Section>

          <Section title="第8条（未成年の利用）">
            <p>
              本サービスは、事業者（接骨院・クリニック）を対象としたサービスです。
              18歳未満の方は利用できません。
            </p>
          </Section>

          <Section title="第9条（ポリシーの変更）">
            <p>
              運営者は必要に応じて本ポリシーを変更することがあります。
              重要な変更については、メールまたはサービス内通知にてお知らせします。
              変更後も本サービスを継続して利用した場合、
              変更後のポリシーに同意したものとみなします。
            </p>
          </Section>

          <Section title="お問い合わせ">
            <div className="bg-slate-100 rounded-xl p-4 text-sm">
              <p className="font-semibold text-slate-800 mb-1">個人情報取扱責任者</p>
              <p>{OPERATOR}</p>
              <p>メール：{EMAIL}</p>
              <p className="text-slate-500 mt-2 text-xs">
                ※ お問い合わせには、通常3営業日以内にご返答します。
              </p>
            </div>
          </Section>

        </div>

        <div className="mt-12 pt-6 border-t border-slate-200 text-center">
          <a href="/register" className="text-blue-600 hover:underline text-sm mr-6">
            新規登録に戻る
          </a>
          <a href="/terms" className="text-blue-600 hover:underline text-sm">
            利用規約
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
