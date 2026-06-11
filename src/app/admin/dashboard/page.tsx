import { getMyRole } from "@/app/actions/auth";
import { getCurrentViewType, getCurrentAiSecretaryMode, getCurrentExpenseOwnerOnly } from "@/app/actions/clinic-slot";
import OwnerSecretaryWidget from "@/components/admin/OwnerSecretaryWidget";
import StaffSecretaryWidget from "@/components/admin/StaffSecretaryWidget";
import TodayTimelineWidget from "@/components/admin/TodayTimelineWidget";
import StaffTargetProgressWidget from "@/components/admin/StaffTargetProgressWidget";
import CancelReviewWidget from "@/components/admin/CancelReviewWidget";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const sp = await searchParams;
  const role = (await getMyRole()) ?? "owner";
  const viewType = await getCurrentViewType();
  const aiSecretaryMode = await getCurrentAiSecretaryMode();
  const hideAiSecretary = aiSecretaryMode === "admin_only" && role === "staff";
  const expenseOwnerOnly = await getCurrentExpenseOwnerOnly();
  const canSeeExpenses = !expenseOwnerOnly || role === "owner";

  return (
    <div className="space-y-6">
      {sp?.denied === "1" && (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-200 rounded-xl px-4 py-3 text-sm">
          ⚠️ そのページはオーナー専用です。アクセス権限がないためダッシュボードに戻されました。
        </div>
      )}

      {/* 予約タイムテーブル（clinic_settings.view_type='timeline' の院は最上位に配置） */}
      {viewType === "timeline" && <TodayTimelineWidget />}

      {/* 毎日のしめ作業：キャンセルの仕分け（無断 / 承諾済み / セット解除） */}
      <CancelReviewWidget />

      {/* スタッフごとの月間目標達成率（目標が1人以上設定されている場合のみ表示） */}
      {role === "owner" && <StaffTargetProgressWidget />}

      {/* Phase 3: AI 秘書（role 別 × ai_secretary_mode 判定） */}
      {!hideAiSecretary && (role === "owner" ? <OwnerSecretaryWidget /> : <StaffSecretaryWidget />)}

      <DashboardClient aiSecretaryEnabled={!hideAiSecretary} canSeeExpenses={canSeeExpenses} />
    </div>
  );
}
