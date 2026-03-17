"use client";

import { useState, useEffect, useTransition } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar as CalendarIcon, Plus, Trash2, Loader2, Coins, User } from "lucide-react";
import { addCashSale, getCashSales, deleteCashSale } from "@/app/actions/sales";
import { toast } from "sonner";

export default function SalesPage() {
  const [date, setDate] = useState<Date | null>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setDate(new Date());
  }, []);

  const fetchSales = async (d: Date) => {
    setLoading(true);
    const dateStr = format(d, "yyyy-MM-dd");
    const res = await getCashSales(dateStr);
    if (res.success) {
      setSales(res.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (date) {
      fetchSales(date);
    }
  }, [date]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date) return;
    const formData = new FormData(e.currentTarget);
    formData.set("sale_date", format(date, "yyyy-MM-dd"));

    startTransition(async () => {
      const res = await addCashSale(formData);
      if (res.success) {
        toast.success("登録しました");
        (e.target as HTMLFormElement).reset();
        fetchSales(date);
      } else {
        toast.error(res.error || "エラーが発生しました");
      }
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除してよろしいですか？") || !date) return;
    const res = await deleteCashSale(id);
    if (res.success) {
      toast.success("削除しました");
      fetchSales(date);
    } else {
      toast.error(res.error || "削除に失敗しました");
    }
  };

  const totalAmount = sales.reduce((sum, s) => sum + s.treatment_fee, 0);

  if (!date) {
    return <div className="p-8 text-center text-slate-500">読み込み中...</div>;
  }

  return (
    <div className="space-y-6 container mx-auto py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">売上登録（受付）</h1>
          <p className="text-slate-500">窓口での自費・物販等の売上を記録します</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-2 border rounded-lg shadow-sm">
          <CalendarIcon className="w-5 h-5 text-blue-600" />
          <input 
            type="date" 
            className="border-none focus:ring-0 text-sm font-medium" 
            value={format(date, "yyyy-MM-dd")} 
            onChange={(e) => setDate(new Date(e.target.value))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 入力フォーム */}
        <Card className="lg:col-span-1 shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              新規売上入力
            </CardTitle>
            <CardDescription>{format(date, "M月d日 (E)", { locale: ja })} の売上</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer_name">お名前</Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input id="customer_name" name="customer_name" placeholder="山田 太郎" className="pl-9" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="treatment_fee">金額（税込）</Label>
                <div className="relative">
                  <Coins className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input id="treatment_fee" name="treatment_fee" type="number" placeholder="5000" className="pl-9" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="memo">備考（オプション）</Label>
                <Input id="memo" name="memo" placeholder="自費施術, 物販等" />
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 h-10" disabled={isPending}>
                {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                登録する
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 売上リスト */}
        <Card className="lg:col-span-2 shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>本日（{format(date, "M/d")}）の売上一覧</CardTitle>
              <CardDescription>{sales.length} 件の記録があります</CardDescription>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 font-medium">本日合計</p>
              <p className="text-2xl font-bold text-blue-600">¥{totalAmount.toLocaleString()}</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-slate-100 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead>お名前</TableHead>
                    <TableHead>備考</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-48 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-300" />
                        <p className="text-sm text-slate-400 mt-2">読み込み中...</p>
                      </TableCell>
                    </TableRow>
                  ) : sales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <Coins className="w-12 h-12 mb-2 opacity-20" />
                          <p>売上データがありません</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sales.map((sale) => (
                      <TableRow key={sale.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="font-medium">{sale.customer_name}</TableCell>
                        <TableCell className="text-slate-500 text-sm">{sale.memo || "-"}</TableCell>
                        <TableCell className="text-right font-bold text-slate-700">¥{sale.treatment_fee.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-slate-100 group">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all rounded-full"
                            onClick={() => handleDelete(sale.id)}
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
