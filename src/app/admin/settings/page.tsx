import { getClinicSettings } from "@/app/actions/settings";
import { getCourses, getStaffList, getRooms } from "@/app/actions/courses";
import { getMyEmail, requireRole } from "@/app/actions/auth";
import SettingsForm from "@/components/admin/SettingsForm";
import CourseStaffSettings from "@/components/admin/CourseStaffSettings";
import AccountSettingsForm from "@/components/admin/AccountSettingsForm";
import TermsAndPolicySection from "@/components/admin/TermsAndPolicySection";
import ManualSection from "@/components/admin/ManualSection";
import SettingsPasscodeGate from "@/components/admin/SettingsPasscodeGate";
import SettingsLockBar from "@/components/admin/SettingsLockBar";
import SettingsPasscodeChangeForm from "@/components/admin/SettingsPasscodeChangeForm";
import SettingsAutoLockToggle from "@/components/admin/SettingsAutoLockToggle";
import NotificationTargetsManager from "@/components/admin/NotificationTargetsManager";
import { isSettingsUnlocked } from "@/lib/settings-lock";
import { PASSCODE_DEFAULT_HINT } from "@/lib/passcode";
import { listNotificationTargets, getAutoLockDisabled } from "@/app/actions/security";

export default async function SettingsPage() {
  // owner のみ設定画面アクセス可
  const auth = await requireRole(["owner"]);

  // パスコード未解錠ならゲート画面のみ表示
  const unlocked = await isSettingsUnlocked(auth.clinicId);
  if (!unlocked) {
    return <SettingsPasscodeGate defaultHint={PASSCODE_DEFAULT_HINT} />;
  }

  const [initialSettings, initialCourses, initialStaff, initialRooms, currentEmail, notifTargets, autoLockDisabled] = await Promise.all([
    getClinicSettings(),
    getCourses(),
    getStaffList(),
    getRooms(),
    getMyEmail(),
    listNotificationTargets(),
    getAutoLockDisabled(),
  ]);

  return (
    <div className="container mx-auto space-y-10">
      <SettingsLockBar autoLockDisabled={autoLockDisabled} />

      <ManualSection />

      <SettingsForm initialSettings={initialSettings} />

      <div className="bg-white dark:bg-slate-900 rounded-2xl border p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">予約コース・スタッフ設定</h2>
        <p className="text-sm text-slate-500 mb-6">患者さんがWeb予約時に選択できるコースと指名スタッフを管理します。</p>
        <CourseStaffSettings initialCourses={initialCourses} initialStaff={initialStaff} initialRooms={initialRooms} />
      </div>

      {/* アカウント設定 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">アカウント設定</h2>
        <p className="text-sm text-slate-500 mb-6">ログイン用のメールアドレスとパスワードを変更できます。</p>
        <AccountSettingsForm currentEmail={currentEmail} />
      </div>

      {/* 設定画面パスコード変更 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border p-6 shadow-sm space-y-8">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">セキュリティ・パスコード</h2>
          <p className="text-sm text-slate-500 mb-6">設定画面ロックの解錠用パスコード（数字 4〜6 桁）を変更します。</p>
          <SettingsPasscodeChangeForm />
        </div>
        <div className="border-t pt-6">
          <SettingsAutoLockToggle initialDisabled={autoLockDisabled} />
        </div>
      </div>

      {/* 通知先（複数オーナー対応） */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">スタッフ操作通知の送信先</h2>
        <p className="text-sm text-slate-500 mb-6">
          スタッフが予約変更・削除・設定変更を行ったとき、ここに登録された LINE / メールへ通知が送られます。
          複数登録すると全員に送られます。
        </p>
        <NotificationTargetsManager initial={notifTargets} />
      </div>

      {/* 個人情報・利用規約 */}
      <TermsAndPolicySection />
    </div>
  );
}
