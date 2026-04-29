import { requireRole } from "@/app/actions/auth";
import { listPendingChanges, listAuditLogs } from "@/app/actions/security";
import ApprovalsList from "@/components/admin/ApprovalsList";
import AuditLogTable from "@/components/admin/AuditLogTable";

export default async function ApprovalsPage() {
  await requireRole(["owner"]);
  const [pending, logs] = await Promise.all([
    listPendingChanges(),
    listAuditLogs(50),
  ]);

  return (
    <div className="container mx-auto space-y-10">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">承認・監査</h1>
        <p className="text-sm text-slate-500 mt-1">
          スタッフからの設定変更申請の承認と、最近の操作履歴（監査ログ）を確認できます。
        </p>
      </header>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border p-6 shadow-sm">
        <h2 className="text-lg font-bold mb-1">承認待ちの変更申請</h2>
        <p className="text-sm text-slate-500 mb-6">
          {pending.length === 0
            ? "現在、承認待ちの申請はありません。"
            : `${pending.length} 件の申請があります。内容を確認のうえ、承認または却下してください。`}
        </p>
        <ApprovalsList items={pending} />
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border p-6 shadow-sm">
        <h2 className="text-lg font-bold mb-1">監査ログ（直近 50 件）</h2>
        <p className="text-sm text-slate-500 mb-6">
          スタッフ・管理者の重要操作の記録です。予約の変更／削除、設定変更、パスコード解錠などが対象です。
        </p>
        <AuditLogTable rows={logs} />
      </section>
    </div>
  );
}
