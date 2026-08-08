import Link from "next/link";
import { Users } from "lucide-react";
import { getCustomers } from "@/app/actions/adminCustomers";
import { CustomersTable } from "./CustomersTable";

export const revalidate = 0;

export default async function AdminCustomersPage() {
  const customers = await getCustomers();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">顧客管理</h1>
          <p className="text-slate-500">登録されているすべての患者情報を確認できます。</p>
        </div>
        <Link
          href="/admin/customers/cleanup"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
        >
          <Users className="w-4 h-4" />
          お名前の整理・似た名前をさがす
        </Link>
      </div>

      <CustomersTable customers={customers} />
    </div>
  );
}
