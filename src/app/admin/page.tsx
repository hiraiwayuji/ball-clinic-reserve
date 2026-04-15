import { redirect } from "next/navigation";
import { isFamilyGift } from "@/lib/app-mode";

export default function AdminPage() {
  if (isFamilyGift) redirect("/calendar");
  redirect("/admin/dashboard");
}
