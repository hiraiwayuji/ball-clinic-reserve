import { redirect } from "next/navigation";
import { getMyRole } from "@/app/actions/auth";

export default async function PassbookLayout({ children }: { children: React.ReactNode }) {
  const role = (await getMyRole()) ?? "owner";
  if (role !== "owner") redirect("/admin/dashboard?denied=1");
  return <>{children}</>;
}
