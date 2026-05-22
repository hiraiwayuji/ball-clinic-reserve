import { checkAdminAuth } from "@/app/actions/auth";
import { getCurrentAiSecretaryMode } from "@/app/actions/clinic-slot";
import AiChatPanel from "@/components/AiChatPanel";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminTopBar from "@/components/admin/AdminTopBar";
import RemindersWatcher from "@/components/admin/RemindersWatcher";
import ReminderQuickAdd from "@/components/admin/ReminderQuickAdd";
import { ThemeProvider } from "@/components/ThemeProvider";
import { isFamilyGift, isDemo } from "@/lib/app-mode";
import { FlaskConical } from "lucide-react";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // admin配下のページはすべてここで認証チェックを行う（/admin/login は除くためlayoutの配置に注意）
  const auth = await checkAdminAuth();
  const aiSecretaryMode = await getCurrentAiSecretaryMode();
  // admin_only モード × staff ロールでは AI秘書 (フローティングチャット) を非表示
  const hideAiSecretary = aiSecretaryMode === "admin_only" && auth.role === "staff";

  return (
    <ThemeProvider attribute="class" forcedTheme="light" enableSystem={false}>
      <div className="min-h-screen flex bg-[var(--background)] text-[var(--foreground)]">
        <AdminSidebar role={auth.role} />

        <div className="flex-1 flex flex-col min-w-0">
          <AdminTopBar role={auth.role} />

          {isDemo && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-amber-700 text-xs font-bold">
              <FlaskConical className="w-3.5 h-3.5" />
              DEMO MODE — テスト環境です。重要な設定変更は無効化されています。
            </div>
          )}

          <main className="flex-1 px-4 md:px-8 py-6 md:py-8 pb-32 md:pb-8">{children}</main>

          {/* 全管理画面にAIチャットを配置（CLINICモード × ai_secretary_mode 判定） */}
          {!isFamilyGift && !hideAiSecretary && <AiChatPanel />}

          {/* アドホック・リマインダー（緊急クエスト）— ポップアップ + 音 + クイック追加ボタン */}
          {!isFamilyGift && (
            <>
              <RemindersWatcher />
              <ReminderQuickAdd />
            </>
          )}
        </div>
      </div>
    </ThemeProvider>
  );
}
