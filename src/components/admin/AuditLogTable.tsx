import type { AuditLogRow } from "@/app/actions/security";

const ROLE_BADGE: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  staff: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  unknown: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  system: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
};

const ACTION_LABEL: Record<string, string> = {
  "appointment.create": "予約作成",
  "appointment.update": "予約変更",
  "appointment.delete": "予約削除",
  "appointment.status": "ステータス変更",
  "appointment.no_show": "未来院扱い",
  "settings.update": "設定変更",
  "settings.request": "設定変更申請",
  "passcode.unlock": "設定解錠",
  "passcode.unlock_failed": "解錠失敗",
  "passcode.update": "パスコード変更",
  "pending_change.approve": "申請承認",
  "pending_change.reject": "申請却下",
};

export default function AuditLogTable({ rows }: { rows: AuditLogRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">監査ログはまだありません。</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-800/40 text-xs text-slate-600 dark:text-slate-400">
            <th className="text-left px-3 py-2 font-medium">日時</th>
            <th className="text-left px-3 py-2 font-medium">操作者</th>
            <th className="text-left px-3 py-2 font-medium">権限</th>
            <th className="text-left px-3 py-2 font-medium">操作</th>
            <th className="text-left px-3 py-2 font-medium">対象</th>
            <th className="text-left px-3 py-2 font-medium">差分</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const badge = ROLE_BADGE[r.actor_role] ?? ROLE_BADGE.unknown;
            const label = ACTION_LABEL[r.action_type] ?? r.action_type;
            const time = new Date(r.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
            return (
              <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">{time}</td>
                <td className="px-3 py-2 text-xs">{r.actor_email ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${badge}`}>{r.actor_role}</span>
                </td>
                <td className="px-3 py-2 text-xs font-medium">{label}</td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {r.target_table ?? ""}
                  {r.target_id ? <span className="ml-1 text-slate-400">#{r.target_id.slice(0, 8)}</span> : null}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500 max-w-[400px]">
                  {r.diff ? (
                    <details>
                      <summary className="cursor-pointer">差分を表示</summary>
                      <pre className="mt-1 text-[10px] bg-slate-50 dark:bg-slate-900 border rounded p-2 overflow-auto max-h-40">
                        {JSON.stringify(r.diff, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
