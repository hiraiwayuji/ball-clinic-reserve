"use client";

import { useState, useEffect, useTransition } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar as CalendarIcon, Plus, Trash2, Loader2, Receipt, Tag, AlertCircle, Save } from "lucide-react";
import { addExpense, getExpenses, deleteExpense, addPendingExpense } from "@/app/actions/sales";
import { toast } from "sonner";
import Link from "next/link";

const EXPENSE_CATEGORIES = [
  "光熱費",
  "消耗品",
  "備品購入",
  "交通費",
  "通信費",
  "家賃",
  "広告費",
  "教育・研修",
  "リース料",
  "雑費",
  "その他",
];

export default function ExpensesPage() {
  const [date, setDate] = useState<Date | null>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isSavingPending, setIsSavingPending] = useState(false);

  useEffect(() => {
    setDate(new Date());
  }, []);

  const fetchExpenses = async (d: Date) => {
    setLoading(true);
    const dateStr = format(d, "yyyy-MM-dd");
    const res = await getExpenses(dateStr);
    if (res.success) {
      setExpenses(res.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (date) {
      fetchExpenses(date);
    }
  }, [date]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date) return;
    const formData = new FormData(e.currentTarget);
    formData.set("expense_date", format(date, "yyyy-MM-dd"));

    startTransition(async () => {
      const res = await addExpense(formData);
      if (res.success) {
        toast.success("経費を登録しました");
        (e.target as HTMLFormElement).reset();
        fetchExpenses(date);
      } else {
        toast.error(res.error || "エラーが発生しました");
      }
    });
  };

  const handleSavePending = async (e: React.MouseEvent) => {
    const form = (e.target as HTMLElement).closest('form');
    if (!form || !date) return;
    
    const formData = new FormData(form);
    const triageData = {
      expense_date: format(date, "yyyy-MM-dd"),
      category: formData.get("category"),
      description: formData.get("description"),
      amount: parseInt(formData.get("amount") as string) || 0,
      memo: formData.get("memo")
    };

    setIsSavingPending(true);
    const res = await addPendingExpense(null, triageData);
    setIsSavingPending(false);

    if (res.success) {
      toast.success("保留経費として保存しました");
      form.reset();
    } else {
      toast.error(res.error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除してよろしいですか？") || !date) return;
    const res = await deleteExpense(id);
    if (res.success) {
      toast.success("削除しました");
      fetchExpenses(date);
    } else {
      toast.error(res.error || "削除に失敗しました");
    }
  };

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  if (!date) {
    return <div className="p-8 text-center text-slate-500">読み込み中...</div>;
  }

  return (
    <div className="space-y-6 container mx-auto py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">経費入力</h1>
          <p className="text-slate-500">備品購入・光熱費などの経費を記録します</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/expenses/triage">
            <Button variant="outline" className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              仕分け待ちを確認
            </Button>
          </Link>
          <div className="flex items-center gap-2 bg-white p-2 border rounded-lg shadow-sm">
            <CalendarIcon className="w-5 h-5 text-emerald-600" />
            <input 
              type="date" 
              className="border-none focus:ring-0 text-sm font-medium" 
              value={format(date, "yyyy-MM-dd")} 
              onChange={(e) => setDate(new Date(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 入力フォーム */}
        <Card className="lg:col-span-1 shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-600" />
              新規経費入力
            </CardTitle>
            <CardDescription>{format(date, "M月d日 (E)", { locale: ja })} の経費</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category">カテゴリ</Label>
                <div className="relative">
                  <Tag className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <select
                    id="category"
                    name="category"
                    className="w-full border border-slate-200 rounded-md pl-9 pr-3 py-2 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="">（後で決める）</option>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">内容</Label>
                <Input id="description" name="description" placeholder="電気代（3月分）" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">金額</Label>
                <div className="relative">
                  <Receipt className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input id="amount" name="amount" type="number" placeholder="10000" className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="memo">備考（オプション）</Label>
                <Input id="memo" name="memo" placeholder="領収書あり" />
              </div>
              
              <div className="flex flex-col gap-2 pt-2">
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 h-10" disabled={isPending || isSavingPending}>
                  {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  正式に登録する
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full h-10 border-amber-200 text-amber-700 hover:bg-amber-50"
                  onClick={handleSavePending}
                  disabled={isPending || isSavingPending}
                >
                  {isSavingPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  とりあえず保存（仕分け待ちへ）
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 経費リスト */}
        <Card className="lg:col-span-2 shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>本日（{format(date, "M/d")}）の確定済み経費</CardTitle>
              <CardDescription>{expenses.length} 件の記録があります</CardDescription>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 font-medium">本日経費合計</p>
              <p className="text-2xl font-bold text-emerald-600">¥{totalAmount.toLocaleString()}</p>
            </div>
          </CardHeader>
          <CardContent>
            {/* ... (Table content remains similar) */}
            <div className="rounded-md border border-slate-100 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead>カテゴリ</TableHead>
                    <TableHead>内容</TableHead>
                    <TableHead>備考</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-48 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-300" />
                        <p className="text-sm text-slate-400 mt-2">読み込み中...</p>
                      </TableCell>
                    </TableRow>
                  ) : expenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <Receipt className="w-12 h-12 mb-2 opacity-20" />
                          <p>経費データがありません</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    expenses.map((expense) => (
                      <TableRow key={expense.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell>
                          <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full font-medium">
                            {expense.category}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">{expense.description || "-"}</TableCell>
                        <TableCell className="text-slate-500 text-sm">{expense.memo || "-"}</TableCell>
                        <TableCell className="text-right font-bold text-slate-700">¥{expense.amount.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all rounded-full"
                            onClick={() => handleDelete(expense.id)}
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
