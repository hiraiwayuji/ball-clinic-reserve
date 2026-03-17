import { getClinicSettings } from "@/app/actions/settings";
import SettingsForm from "@/components/admin/SettingsForm";

/**
 * Settings Page (Server Component)
 * Data is fetched on the server and passed to the Client Component (SettingsForm).
 */
export default async function SettingsPage() {
  const initialSettings = await getClinicSettings();
  
  return (
    <div className="container mx-auto">
      <SettingsForm initialSettings={initialSettings} />
    </div>
  );
}
