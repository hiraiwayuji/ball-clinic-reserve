import { requireRole } from "@/app/actions/auth";
import { listSignalsForAdmin } from "@/app/actions/external-signals";
import ExternalSignalsClient from "./ExternalSignalsClient";

export const dynamic = "force-dynamic";

export default async function ExternalSignalsPage() {
  await requireRole(["owner", "admin"]);
  const res = await listSignalsForAdmin();

  return (
    <div className="container mx-auto py-6 max-w-3xl">
      <header className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">時事ネタ・地域情報</h1>
        <p className="text-sm text-slate-600 mt-1">
          地域 ({res.prefecture ?? "—"}) のインフル流行や花粉飛散など、AI 秘書が患者さんへのひと言に織り込む情報を管理します。
          天気は気象庁から毎日自動更新されます。
        </p>
      </header>

      <ExternalSignalsClient initialRows={res.rows ?? []} prefecture={res.prefecture ?? "徳島"} />
    </div>
  );
}
