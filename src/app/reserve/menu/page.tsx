import { getActiveCourses } from "@/app/actions/courses";
import { getPublicClinicSettings } from "@/app/actions/publicSettings";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
import MenuLPClient from "./MenuLPClient";

export const metadata = {
  title: `メニュー・クーポン一覧 | ${CLINIC_CONFIG.name}`,
  description: `${CLINIC_CONFIG.name}のクーポン・施術メニュー一覧。気になるメニューから直接ご予約いただけます。`,
};

export const dynamic = "force-dynamic";

export default async function ReserveMenuPage() {
  const [courses, settings] = await Promise.all([
    getActiveCourses(),
    getPublicClinicSettings(),
  ]);
  return <MenuLPClient initialCourses={courses} settings={settings} />;
}
