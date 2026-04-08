"use client";

import { useState, useTransition } from "react";
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
import { Button } from "@/components/ui/button";
import { SuspendToggle } from "./SuspendToggle";
import { LinkLineDialog } from "./LinkLineDialog";
import { updateCustomerInfo } from "@/app/actions/adminCustomers";
import { QuestionnaireDialog } from "./QuestionnaireDialog";
import { Search, Pencil, Check, X, Loader2, ClipboardList } from "lucide-react";
import { toast } from "sonner";

type Customer = {
  id: string;
  name: string;
  phone: string;
  created_at: string;
  appointmentCount: number;
  cancelCount: number;
  lastVisit: string | null;
  booking_suspended: boolean;
  line_user_id: string | null;
  birth_month: number | null;
  gender: string | null;
  age_group: string | null;
  guardian_name: string | null;
  city_name: string | null;
  birth_date: string | null;
  referral_source: string | null;
};

const GENDER_LABEL: Record<string, string> = { male: "男性", female: "女性", other: "その他" };

function EditableRow({ customer }: { customer: Customer }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);
  const [qOpen, setQOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    if (!name.trim()) { toast.error("名前を入力してください"); return; }
    startTransition(async () => {
      try {
        await updateCustomerInfo(customer.id, name, phone);
        toast.success("更新しました");
        setEditing(false);
      } catch {
        toast.error("更新に失敗しました");
      }
    });
  };

  const handleCancel = () => {
    setName(customer.name);
    setPhone(customer.phone);
    setEditing(false);
  };

  return (
    <TableRow className={`hover:bg-slate-50/50 ${customer.booking_suspended ? "bg-red-50/40" : ""}`}>
      <TableCell className="font-medium text-slate-500 text-sm" />

      {/* 名前 */}
      <TableCell>
        {editing ? (
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full h-8 border border-blue-300 rounded-lg px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            autoFocus
          />
        ) : (
          <span className="font-semibold">{name}</span>
        )}
      </TableCell>

      {/* 電話番号 */}
      <TableCell>
        {editing ? (
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="w-full h-8 border border-blue-300 rounded-lg px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        ) : (
          <span>{phone}</span>
        )}
      </TableCell>

      <TableCell className="text-center">
        <Badge variant="secondary" className="px-3">{customer.appointmentCount} 回</Badge>
      </TableCell>

      <TableCell className="text-center">
        {customer.cancelCount > 0 ? (
          <Badge variant="secondary" className={`px-3 ${customer.cancelCount >= 3 ? "bg-orange-100 text-orange-700" : ""}`}>
            {customer.cancelCount} 回
          </Badge>
        ) : (
          <span className="text-slate-400 text-sm">0 回</span>
        )}
      </TableCell>

      <TableCell>
        {customer.lastVisit
          ? format(new Date(customer.lastVisit), "yyyy/MM/dd (E) HH:mm", { locale: ja })
          : <span className="text-slate-400">記録なし</span>
        }
      </TableCell>

      <TableCell>
        {format(new Date(customer.created_at), "yyyy/MM/dd", { locale: ja })}
      </TableCell>

      <TableCell className="text-center">
        <LinkLineDialog
          customerId={customer.id}
          customerName={name}
          lineUserId={customer.line_user_id}
        />
      </TableCell>

      {/* アンケート列 */}
      <TableCell>
        <button
          type="button"
          onClick={() => setQOpen(true)}
          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors"
        >
          <ClipboardList className="w-3 h-3" />
          {customer.city_name ? `${customer.city_name} / ` : ""}
          {customer.gender ? `${GENDER_LABEL[customer.gender] ?? customer.gender} / ` : ""}
          {customer.referral_source ? `${customer.referral_source}` : "分析データ"}
        </button>
        <QuestionnaireDialog
          open={qOpen}
          onOpenChange={setQOpen}
          customerId={customer.id}
          customerName={name}
          initialData={{
            guardian_name: customer.guardian_name,
            birth_month: customer.birth_month,
            gender: customer.gender,
            age_group: customer.age_group,
            city_name: customer.city_name,
            birth_date: customer.birth_date,
            referral_source: customer.referral_source,
          }}
        />
      </TableCell>

      {/* 編集ボタン列 */}
      <TableCell>
        {editing ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </TableCell>

      <TableCell>
        <SuspendToggle customerId={customer.id} suspended={customer.booking_suspended} />
      </TableCell>
    </TableRow>
  );
}

export function CustomersTable({ customers }: { customers: Customer[] }) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? customers.filter(c =>
        c.name.includes(query.trim()) || c.phone.includes(query.trim())
      )
    : customers;

  return (
    <div className="space-y-4">
      {/* 検索バー */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="名前・電話番号で検索..."
          className="w-full h-10 pl-9 pr-4 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-[40px]">No.</TableHead>
              <TableHead>患者名</TableHead>
              <TableHead>電話番号</TableHead>
              <TableHead className="text-center">予約回数</TableHead>
              <TableHead className="text-center">キャンセル回数</TableHead>
              <TableHead>最終来院日</TableHead>
              <TableHead>初回登録日</TableHead>
              <TableHead className="text-center">LINE</TableHead>
              <TableHead>アンケート</TableHead>
              <TableHead className="w-[60px]">編集</TableHead>
              <TableHead>予約</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="h-32 text-center text-slate-500">
                  {query ? `「${query}」に一致する患者が見つかりません` : "顧客データがありません"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((customer) => (
                <EditableRow key={customer.id} customer={customer} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {query && (
        <p className="text-xs text-slate-400">
          {filtered.length} 件 / 全 {customers.length} 件
        </p>
      )}
    </div>
  );
}
