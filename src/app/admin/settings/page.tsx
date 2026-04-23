import { getClinicSettings } from "@/app/actions/settings";
import { getCourses, getStaffList, getRooms } from "@/app/actions/courses";
import { getMyEmail } from "@/app/actions/auth";
import SettingsForm from "@/components/admin/SettingsForm";
import CourseStaffSettings from "@/components/admin/CourseStaffSettings";
import AccountSettingsForm from "@/components/admin/AccountSettingsForm";

export default async function SettingsPage() {
  const [initialSettings, initialCourses, initialStaff, initialRooms, currentEmail] = await Promise.all([
    getClinicSettings(),
    getCourses(),
    getStaffList(),
    getRooms(),
    getMyEmail(),
  ]);

  return (
    <div className="container mx-auto space-y-10">
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
    </div>
  );
}
