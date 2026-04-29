import { getMyRole } from "@/app/actions/auth";
import OwnerSecretaryWidget from "@/components/admin/OwnerSecretaryWidget";
import StaffSecretaryWidget from "@/components/admin/StaffSecretaryWidget";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const sp = await searchParams;
  const role = (await getMyRole()) ?? "owner";

  return (
    <div className="space-y-6">
      {sp?.denied === "1" && (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-200 rounded-xl px-4 py-3 text-sm">
          ⚠️ そのページはオーナー専用です。アクセス権限がないためダッシュボードに戻されました。
        </div>
      )}

      {/* Phase 3: AI 秘書（role 別） */}
      {role === "owner" ? <OwnerSecretaryWidget /> : <StaffSecretaryWidget />}

      <DashboardClient />
    </div>
  );
}
