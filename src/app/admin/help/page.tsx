import { checkAdminAuth } from "@/app/actions/auth";
import { getSalesInputMode } from "@/app/actions/tally";
import ManualSection from "@/components/admin/ManualSection";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
import { LifeBuoy, Phone, RefreshCw, KeyRound } from "lucide-react";

/**
 * 使い方・困ったとき（全 role が開ける）
 * 以前は操作マニュアルが「設定」（院長専用・パスコードの奥）にしかなく、受付の人が迷っても
 * 画面内に手がかりがゼロだった。ここに移し、連絡先も添える。
 */
export default async function HelpPage() {
  const auth = await checkAdminAuth();
  const salesInputMode = await getSalesInputMode().catch(() => "per_patient" as const);
  const isOwner = auth.role === "owner";

  return (
    <div className="container mx-auto space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <LifeBuoy className="w-6 h-6 text-blue-600" />
          使い方・困ったとき
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isOwner
            ? "操作の手順と、困ったときの連絡先です。"
            : "受付でよく使う操作の手順と、困ったときの連絡先です。ここに無いことは院長先生に聞いてください。"}
        </p>
      </div>

      {/* まず試すこと（受付が一番よく当たる3つ） */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border p-4">
          <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
            <RefreshCw className="w-4 h-4 text-blue-600" /> 画面がおかしい・通信エラー
          </div>
          <p className="text-xs text-slate-600 mt-2 leading-relaxed">
            画面上部に「システムが新しくなりました」の帯が出ていたら、その帯を押して開き直します。
            出ていなければブラウザの再読み込み（F5）をしてください。
          </p>
        </div>
        <div className="bg-white rounded-2xl border p-4">
          <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
            <KeyRound className="w-4 h-4 text-blue-600" /> ログインできない
          </div>
          <p className="text-xs text-slate-600 mt-2 leading-relaxed">
            ログイン画面の「パスワードをお忘れの方はこちら」から再設定メールを送れます。
            共用アカウントのパスワードは院長先生が管理しています。
          </p>
        </div>
        <div className="bg-white rounded-2xl border p-4">
          <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
            <Phone className="w-4 h-4 text-blue-600" /> それでも直らないとき
          </div>
          <p className="text-xs text-slate-600 mt-2 leading-relaxed">
            {CLINIC_CONFIG.isDefaultClinic
              ? "設定の「AI秘書」または開発担当へ、画面の写真を添えて連絡してください。"
              : "まず院長先生へ。システムの不具合は、院長先生からボール接骨院・平岩（システム担当）へ画面の写真つきで連絡してもらってください。"}
          </p>
        </div>
      </div>

      <ManualSection role={auth.role} salesInputMode={salesInputMode} />
    </div>
  );
}
