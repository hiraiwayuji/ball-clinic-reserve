"use client";

import { useState, useEffect, useTransition } from "react";
import { format, startOfMonth } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Plus, Trash2, Loader2, Landmark, Calendar as CalendarIcon } from "lucide-react";
import { addInsurancePayment, getInsurancePayments, deleteInsurancePayment } from "@/app/actions/sales";
import { toast } from "sonner";

export default function InsurancePage() {
  const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCurrentMonth(startOfMonth(new Date()));
  }, []);

  const fetchPayments = async (m: Date) => {
    setLoading(true);
    const monthStr = format(m, "yyyy-MM-01");
    const res = await getInsurancePayments(monthStr);
    if (res.success) {
      setPayments(res.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (currentMonth) {
      fetchPayments(currentMonth);
    }
  }, [currentMonth]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentMonth) return;
    const formData = new FormData(e.currentTarget);
    formData.set("payment_month", format(currentMonth, "yyyy-MM-01"));

    startTransition(async () => {
      const res = await addInsurancePayment(formData);
      if (res.success) {
        toast.success("登録しました");
        (e.target as HTMLFormElement).reset();
        fetchPayments(currentMonth!);
      } else {
        toast.error(res.error || "エラーが発生しました");
      }
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除してよろしいですか？")) return;
    const res = await deleteInsurancePayment(id);
    if (res.success) {
      toast.success("削除しました");
      if (currentMonth) fetchPayments(currentMonth);
    } else {
      toast.error(res.error || "削除に失敗しました");
    }
  };

  if (!currentMonth) {
    return <div className="p-8 text-center text-slate-500">読み込み中...</div>;
  }

  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6 container mx-auto py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">保険入金管理</h1>
          <p className="text-slate-500">振込通知等に基づき、各保険の入金額を記録します</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-2 border rounded-lg shadow-sm">
          <CalendarIcon className="w-5 h-5 text-blue-600" />
          <input 
            type="month" 
            className="border-none focus:ring-0 text-sm font-medium" 
            value={format(currentMonth!, "yyyy-MM")} 
            onChange={(e) => setCurrentMonth(startOfMonth(new Date(e.target.value + "-01")))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 入力フォーム */}
        <Card className="lg:col-span-1 shadow-sm border-slate-200 h-fit">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              入金データ入力
            </CardTitle>
            <CardDescription>{format(currentMonth!, "yyyy年M月", { locale: ja })}分の入金</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="insurance_name">保険種別・保険名</Label>
                <div className="relative">
                  <Landmark className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input 
                    id="insurance_name" 
                    name="insurance_name" 
                    placeholder="協会けんぽ, 国保, 共済等" 
                    className="pl-9" 
                    required 
                    list="insurance-types"
                  />
                  <datalist id="insurance-types">
                    <option value="協会けんぽ" />
                    <option value="国民健康保険" />
                    <option value="後期高齢者" />
                    <option value="共済組合" />
                    <option value="自賠責" />
                    <option value="労災" />
                  </datalist>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">振込金額（税込）</Label>
                <div className="relative">
                  <p className="absolute left-3 top-2 text-slate-400 font-bold text-lg">¥</p>
                  <Input id="amount" name="amount" type="number" placeholder="50000" className="pl-9" required />
                </div>
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 h-10" disabled={isPending}>
                {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                保存する
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 入金リスト */}
        <Card className="lg:col-span-2 shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{format(currentMonth!, "yyyy年M月")} 入金内訳</CardTitle>
              <CardDescription>{payments.length} 件の登録済みデータ</CardDescription>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 font-medium">保険入金合計</p>
              <p className="text-2xl font-bold text-emerald-600">¥{totalAmount.toLocaleString()}</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-slate-100 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead>保険種別・名称</TableHead>
                    <TableHead className="text-right">振込金額</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-48 text-center text-slate-400 text-sm animate-pulse">
                        データを読み込み中...
                      </TableCell>
                    </TableRow>
                  ) : payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <Landmark className="w-12 h-12 mb-2 opacity-20" />
                          <p>この期間のデータはありません</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    payments.map((p) => (
                      <TableRow key={p.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="font-medium text-slate-700">{p.insurance_name}</TableCell>
                        <TableCell className="text-right font-bold text-slate-800">¥{p.amount.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full h-8 w-8"
                            onClick={() => handleDelete(p.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
