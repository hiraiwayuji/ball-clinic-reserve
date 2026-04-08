import { getCustomers } from "@/app/actions/adminCustomers";
import { CustomersTable } from "./CustomersTable";

export const revalidate = 0;

export default async function AdminCustomersPage() {
  const customers = await getCustomers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">顧客管理</h1>
        <p className="text-slate-500">登録されているすべての患者情報を確認できます。</p>
      </div>

      <CustomersTable customers={customers} />
    </div>
  );
}
