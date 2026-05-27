import { redirect } from "next/navigation";
import { getMyRole } from "@/app/actions/auth";
import { getCurrentExpenseOwnerOnly } from "@/app/actions/clinic-slot";

export default async function ExpensesLayout({ children }: { children: React.ReactNode }) {
  const role = (await getMyRole()) ?? "owner";
  const expenseOwnerOnly = await getCurrentExpenseOwnerOnly();
  if (expenseOwnerOnly && role !== "owner") {
    redirect("/admin/dashboard?denied=1");
  }
  return <>{children}</>;
}
