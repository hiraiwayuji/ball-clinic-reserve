import { getClinicSettings } from "@/app/actions/settings";
import SettingsEditor from "@/components/admin/SettingsEditor";

export default async function EditSettingsPage() {
  const settings = await getClinicSettings();
  
  return (
    <div className="container mx-auto py-10">
      <SettingsEditor initialSettings={settings} />
    </div>
  );
}
