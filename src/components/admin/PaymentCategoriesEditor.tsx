"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, AlertCircle, Receipt, Edit3, Lock } from "lucide-react";
import {
  listAllPaymentCategories,
  upsertPaymentCategory,
  deactivatePaymentCategory,
  type PaymentCategoryRow,
} from "@/app/actions/payment-categories";
import { toast } from "sonner";

/**
 * 支払区分マスタの管理 UI。SettingsEditor に組み込んで使う。
 * 標準カテゴリ（is_system=true）は label のみ編集可、削除不可。
 * 院独自カテゴリ（鍼灸・トレーニング等）は自由に追加・編集・削除可能。
 */
export default function PaymentCategoriesEditor() {
  const [rows, setRows] = useState<PaymentCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  async function reload() {
    setLoading(true);
    const r = await listAllPaymentCategories();
    if (r.success) setRows(r.rows ?? []);
    else toast.error(r.error ?? "取得失敗");
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleAdd() {
    const label = newLabel.trim();
    if (!label) return;
    startTransition(async () => {
      const r = await upsertPaymentCategory({ label, sort_order: 999, is_active: true });
      if (!r.success) {
        toast.error(r.error ?? "追加失敗");
        return;
      }
      toast.success("追加しました");
      setNewLabel("");
      await reload();
    });
  }

  async function handleStartEdit(row: PaymentCategoryRow) {
    setEditingId(row.id);
    setEditLabel(row.label);
  }

  async function handleSaveEdit(row: PaymentCategoryRow) {
    const label = editLabel.trim();
    if (!label) return;
    startTransition(async () => {
      const r = await upsertPaymentCategory({
        id: row.id,
        label,
        sort_order: row.sort_order,
        is_active: row.is_active,
      });
      if (!r.success) {
        toast.error(r.error ?? "更新失敗");
        return;
      }
      toast.success("更新しました");
      setEditingId(null);
      setEditLabel("");
      await reload();
    });
  }

  async function handleDeactivate(row: PaymentCategoryRow) {
    if (!confirm(`「${row.label}」を無効化しますか？\n（過去の売上データは残ります）`)) return;
    startTransition(async () => {
      const r = await deactivatePaymentCategory(row.id);
      if (!r.success) {
        toast.error(r.error ?? "削除失敗");
        return;
      }
      toast.success("無効化しました");
      await reload();
    });
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="bg-emerald-50 border-b">
        <CardTitle className="text-lg flex items-center gap-2 text-emerald-800">
          <Receipt className="w-5 h-5" /> 支払区分
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        <p className="text-xs text-slate-600 leading-relaxed">
          売上登録・一括登録画面で使う支払区分を管理します。<br />
          標準カテゴリ（自賠責・労災・はぐくみ医療・実費・その他）は表示名のみ変更可能。<br />
          院独自の項目（鍼灸・トレーニング・物販 等）は自由に追加できます。
        </p>

        {loading ? (
          <div className="text-sm text-slate-500 text-center py-4">読み込み中...</div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className={
                  row.is_active
                    ? "flex items-center gap-2 border border-slate-200 rounded-lg p-2"
                    : "flex items-center gap-2 border border-slate-200 rounded-lg p-2 opacity-50 bg-slate-50"
                }
              >
                {editingId === row.id ? (
                  <>
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      maxLength={30}
                      className="flex-1 h-9 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit(row);
                        if (e.key === "Escape") { setEditingId(null); setEditLabel(""); }
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={() => handleSaveEdit(row)}
                      disabled={pending || !editLabel.trim()}
                    >
                      保存
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setEditingId(null); setEditLabel(""); }}
                      disabled={pending}
                    >
                      キャンセル
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-slate-800">
                      {row.label}
                      {row.is_system && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-slate-500 font-normal">
                          <Lock className="w-3 h-3" />
                          標準
                        </span>
                      )}
                      {!row.is_active && (
                        <span className="ml-2 text-xs text-slate-500">(無効)</span>
                      )}
                    </span>
                    {row.is_active && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(row)}
                          disabled={pending}
                          className="p-1.5 text-slate-400 hover:text-indigo-600"
                          aria-label="編集"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {!row.is_system && (
                          <button
                            type="button"
                            onClick={() => handleDeactivate(row)}
                            disabled={pending}
                            className="p-1.5 text-slate-400 hover:text-rose-600"
                            aria-label="無効化"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-slate-200 pt-4">
          <Label className="text-xs font-bold text-slate-700 mb-1.5 block">新しい区分を追加</Label>
          <div className="flex gap-2">
            <Input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="例: 鍼灸、トレーニング、物販"
              maxLength={30}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              className="flex-1 h-9 text-sm"
            />
            <Button onClick={handleAdd} disabled={pending || !newLabel.trim()} size="sm">
              <Plus className="w-4 h-4 mr-1" />
              追加
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
