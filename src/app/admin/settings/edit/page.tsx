import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getClinicSettings } from "@/app/actions/settings";
import SettingsEditor from "@/components/admin/SettingsEditor";

export default async function EditSettingsPage() {
  const settings = await getClinicSettings();
  
  return (
    <div className="container mx-auto py-10">
      <Link href="/admin/settings" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ChevronLeft className="w-4 h-4" /> 設定へ戻る
      </Link>
      <SettingsEditor initialSettings={settings} />
    </div>
  );
}
