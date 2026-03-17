import { getCustomers } from "@/app/actions/adminCustomers";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const revalidate = 0; // 常に最新データ

export default async function AdminCustomersPage() {
  const customers = await getCustomers();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">顧客管理</h1>
          <p className="text-slate-500">登録されているすべての患者情報を確認できます。</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-[80px]">ID</TableHead>
              <TableHead>患者名</TableHead>
              <TableHead>電話番号</TableHead>
              <TableHead>初回登録日</TableHead>
              <TableHead className="text-center">予約回数</TableHead>
              <TableHead>最終来院日</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                  顧客データがありません
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer, index) => (
                <TableRow key={customer.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium text-slate-500">
                    {index + 1}
                  </TableCell>
                  <TableCell className="font-semibold">{customer.name}</TableCell>
                  <TableCell>{customer.phone}</TableCell>
                  <TableCell>
                    {format(new Date(customer.created_at), "yyyy/MM/dd", { locale: ja })}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="px-3">
                      {customer.appointmentCount} 回
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {customer.lastVisit 
                      ? format(new Date(customer.lastVisit), "yyyy/MM/dd (E) HH:mm", { locale: ja })
                      : <span className="text-slate-400">記録なし</span>
                    }
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
