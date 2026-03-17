"use client";

import { useState, useEffect, useTransition } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Receipt, Image as ImageIcon, Check, Ban, AlertCircle, Save } from "lucide-react";
import { getPendingExpenses, finalizePendingExpense, updatePendingExpense } from "@/app/actions/sales";
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

const STATUS_LABELS: Record<string, string> = {
  unprocessed: "未処理",
  confirmed: "確認済み",
  on_hold: "保留",
};

export default function ExpenseTriagePage() {
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const fetchItems = async () => {
    setLoading(true);
    const res = await getPendingExpenses();
    if (res.success) {
      setPendingItems(res.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const startEditing = (item: any) => {
    setEditingId(item.id);
    setEditForm({
      expense_date: item.expense_date || format(new Date(), "yyyy-MM-dd"),
      category: item.category || "",
      description: item.description || "",
      amount: item.amount || 0,
      memo: item.memo || "",
      status: item.status,
    });
  };

  const handleUpdate = async (id: string, updates: any) => {
    const res = await updatePendingExpense(id, updates);
    if (res.success) {
      toast.success("更新しました");
      fetchItems();
      setEditingId(null);
    } else {
      toast.error(res.error);
    }
  };

  const handleFinalize = async (id: string) => {
    if (!editForm.category || !editForm.amount) {
      toast.error("カテゴリと金額を入力してください");
      return;
    }

    startTransition(async () => {
      const res = await finalizePendingExpense(id, editForm);
      if (res.success) {
        toast.success("正式登録しました");
        fetchItems();
        setEditingId(null);
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="space-y-6 container mx-auto py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">保留経費の仕分け</h1>
          <p className="text-slate-500">一時保存されたレシートやメモを正式な経費として登録します</p>
        </div>
        <Link href="/admin/expenses">
          <Button variant="outline">経費一覧へ戻る</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle>保留リスト</CardTitle>
            <CardDescription>{pendingItems.length} 件のデータがあります</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-slate-100 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="w-[120px]">ステータス</TableHead>
                    <TableHead>内容 / 写真</TableHead>
                    <TableHead>金額 / カテゴリ</TableHead>
                    <TableHead>登録日 / 備考</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-48 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-300" />
                      </TableCell>
                    </TableRow>
                  ) : pendingItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-48 text-center text-slate-400">
                        保留中の経費はありません
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingItems.map((item) => (
                      <TableRow key={item.id} className={editingId === item.id ? "bg-emerald-50/30" : ""}>
                        <TableCell>
                          {editingId === item.id ? (
                            <select
                              className="text-xs border rounded p-1"
                              value={editForm.status}
                              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                            >
                              <option value="unprocessed">未処理</option>
                              <option value="on_hold">保留</option>
                              <option value="confirmed">登録待ち</option>
                            </select>
                          ) : (
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              item.status === 'unprocessed' ? 'bg-slate-100 text-slate-600' :
                              item.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {STATUS_LABELS[item.status]}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {editingId === item.id ? (
                            <div className="space-y-2">
                              <Input 
                                placeholder="内容" 
                                value={editForm.description}
                                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              />
                              {item.image_url && (
                                <div className="text-xs flex items-center gap-1 text-slate-500">
                                  <ImageIcon className="w-3 h-3" /> 画像あり
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <p className="font-medium">{item.description || "(内容未入力)"}</p>
                              {item.image_url && <ImageIcon className="w-4 h-4 text-emerald-500" />}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {editingId === item.id ? (
                            <div className="space-y-2">
                              <Input 
                                type="number" 
                                placeholder="金額" 
                                value={editForm.amount}
                                onChange={(e) => setEditForm({ ...editForm, amount: parseInt(e.target.value) || 0 })}
                              />
                              <select
                                className="w-full text-sm border rounded p-1"
                                value={editForm.category}
                                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                              >
                                <option value="">カテゴリ選択</option>
                                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <p className="font-bold">¥{(item.amount || 0).toLocaleString()}</p>
                              <p className="text-xs text-slate-500">{item.category || "カテゴリ未指定"}</p>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {editingId === item.id ? (
                            <div className="space-y-2">
                              <Input 
                                type="date" 
                                value={editForm.expense_date}
                                onChange={(e) => setEditForm({ ...editForm, expense_date: e.target.value })}
                              />
                              <Input 
                                placeholder="備考" 
                                value={editForm.memo}
                                onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                              />
                            </div>
                          ) : (
                            <div className="space-y-1 text-sm">
                              <p>{item.expense_date || format(new Date(item.created_at), "yyyy-MM-dd")}</p>
                              <p className="text-xs text-slate-500">{item.memo}</p>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editingId === item.id ? (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>キャンセル</Button>
                              <Button size="sm" className="bg-emerald-600" onClick={() => handleFinalize(item.id)} disabled={isPending}>
                                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                                正式登録
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => startEditing(item)}>編集・仕分け</Button>
                          )}
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
