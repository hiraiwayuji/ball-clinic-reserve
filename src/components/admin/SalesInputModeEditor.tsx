"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ClipboardList, Plus, Trash2, Loader2, Save, ArrowUp, ArrowDown } from "lucide-react";
import {
  getTallyColumns,
  updateTallyColumns,
  type ClinicSettings,
} from "@/app/actions/settings";
import type { TallyColumn } from "@/lib/tally-columns";

// 売上記帳タイプ（個別入力 / 窓口日計表）の選択と、日計表のカラム編集。
// mode は親の settings 保存に乗る。カラムは専用 setter で即保存（owner専用）。
export default function SalesInputModeEditor({
  settings,
  updateField,
}: {
  settings: ClinicSettings | null;
  updateField: (field: keyof ClinicSettings, value: any) => void;
}) {
  const mode = settings?.sales_input_mode === "tally" ? "tally" : "per_patient";
  const [columns, setColumns] = useState<TallyColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getTallyColumns()
      .then(setColumns)
      .finally(() => setLoading(false));
  }, []);

  const setLabel = (idx: number, label: string) =>
    setColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, label } : c)));

  const move = (idx: number, dir: -1 | 1) => {
    setColumns((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((c, i) => ({ ...c, sort_order: i + 1 }));
    });
  };

  const remove = (idx: number) =>
    setColumns((prev) => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, sort_order: i + 1 })));

  const add = () =>
    setColumns((prev) => [...prev, { key: "", label: "", sort_order: prev.length + 1 }]);

  const save = async () => {
    const cleaned = columns.filter((c) => c.label.trim());
    if (cleaned.length === 0) {
      toast.error("カラムを1つ以上入力してください");
      return;
    }
    setSaving(true);
    const res = await updateTallyColumns(cleaned);
    setSaving(false);
    if (res.success) {
      toast.success("日計表のカラムを保存しました");
      getTallyColumns().then(setColumns);
    } else {
      toast.error(res.error ?? "保存に失敗しました");
    }
  };

  return (
    <Card className="border-indigo-100 shadow-sm">
      <CardHeader className="bg-indigo-50 border-b">
        <CardTitle className="text-lg flex items-center gap-2 text-indigo-800">
          <ClipboardList className="w-5 h-5" /> 売上記帳のタイプ
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-5">
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            院の記帳スタイルを選べます。「窓口日計表」は紙の日計表のように、<br />
            1日の患者を一覧で施術区分ごとに入力し、列ごとの小計・本日合計を出します。
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className={[
              "flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition-colors",
              mode === "per_patient" ? "border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-200" : "border-slate-200 hover:bg-slate-50",
            ].join(" ")}>
              <input type="radio" name="sales_input_mode" checked={mode === "per_patient"}
                onChange={() => updateField("sales_input_mode", "per_patient")} className="mt-1 accent-indigo-600" />
              <span>
                <span className="block text-sm font-bold text-slate-800">個別入力（標準）</span>
                <span className="block text-xs text-slate-500">患者ごとに金額・支払区分を1件ずつ入力</span>
              </span>
            </label>
            <label className={[
              "flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition-colors",
              mode === "tally" ? "border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-200" : "border-slate-200 hover:bg-slate-50",
            ].join(" ")}>
              <input type="radio" name="sales_input_mode" checked={mode === "tally"}
                onChange={() => updateField("sales_input_mode", "tally")} className="mt-1 accent-indigo-600" />
              <span>
                <span className="block text-sm font-bold text-slate-800">窓口日計表</span>
                <span className="block text-xs text-slate-500">一覧グリッドで施術区分ごとに入力・集計</span>
              </span>
            </label>
          </div>
          <p className="text-[11px] text-amber-600">
            ※ タイプの切替は画面上部の「保存」ボタンで確定します。
          </p>
        </div>

        {mode === "tally" && (
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-bold text-slate-700">日計表の金額カラム</Label>
              <Button type="button" size="sm" variant="outline" onClick={add} className="gap-1">
                <Plus className="w-4 h-4" /> 追加
              </Button>
            </div>
            <p className="text-xs text-slate-500 -mt-1">
              施術区分ごとの金額入力欄です（例：保険柔整・鍼灸・揉み・物販）。
            </p>
            {loading ? (
              <div className="py-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline-block" /></div>
            ) : (
              <div className="space-y-2">
                {columns.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 text-center text-xs text-slate-400">{i + 1}</span>
                    <Input value={c.label} placeholder="カラム名（例：保険柔整(J)）"
                      onChange={(e) => setLabel(i, e.target.value)} className="flex-1" />
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === columns.length - 1}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                    <button type="button" onClick={() => remove(i)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button type="button" onClick={save} disabled={saving} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                カラムを保存
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">
              ※ カラムの保存はこのボタンで即時反映されます（オーナー専用）。既存の記帳データには影響しません。
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
