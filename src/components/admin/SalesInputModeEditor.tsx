"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ClipboardList, Plus, Trash2, Loader2, Save, ArrowUp, ArrowDown, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
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
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    getTallyColumns()
      .then(setColumns)
      .finally(() => setLoading(false));
  }, []);

  const setLabel = (idx: number, label: string) =>
    setColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, label } : c)));

  // 種別はカンマ（,、 区切り）で編集。空なら variants を外す。
  const setVariants = (idx: number, raw: string) =>
    setColumns((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c;
        const variants = raw
          .split(/[,、]/)
          .map((v) => v.trim())
          .filter(Boolean);
        const next = { ...c } as TallyColumn;
        if (variants.length) next.variants = variants;
        else delete next.variants;
        return next;
      }),
    );

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
            {/* 使い方マニュアル */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowHelp((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-indigo-800">
                  <BookOpen className="w-4 h-4" /> 窓口日計表の使い方ガイド
                </span>
                {showHelp ? <ChevronUp className="w-4 h-4 text-indigo-500" /> : <ChevronDown className="w-4 h-4 text-indigo-500" />}
              </button>
              {showHelp && (
                <div className="px-4 pb-4 space-y-4 text-sm text-slate-700">
                  <div>
                    <p className="font-bold text-slate-800 mb-1">📋 日計表とは</p>
                    <p className="text-[13px] leading-relaxed text-slate-600">
                      紙の窓口日計表と同じように、1日の患者さんを一覧で並べて、<br />
                      施術の区分ごとに金額を入力していく記帳スタイルです。<br />
                      入力すると、区分ごとの小計と本日合計が自動で計算されます。
                    </p>
                  </div>

                  <div>
                    <p className="font-bold text-slate-800 mb-1">🗂 「カラム（列）」とは</p>
                    <p className="text-[13px] leading-relaxed text-slate-600">
                      日計表の<strong>金額を入力する縦の列</strong>のことです。<br />
                      たとえば「保険柔整」「鍼灸」「揉み」「物販」のように、<br />
                      院で分けて集計したい施術区分を列として設定します。<br />
                      ここで設定した列が、そのまま記帳画面と分析画面に反映されます。
                    </p>
                  </div>

                  <div>
                    <p className="font-bold text-slate-800 mb-1">✍️ 記帳のながれ（毎日の入力）</p>
                    <ol className="text-[13px] leading-relaxed text-slate-600 list-decimal pl-5 space-y-0.5">
                      <li>左メニューの「売上記帳」を開く（その日の予約・受付の患者さんが自動で並びます）</li>
                      <li>各患者さんの行で、施術区分の列に金額を入力</li>
                      <li>担当のスタッフをプルダウンで選択（任意）</li>
                      <li>飛び込みの患者さんは「行を追加」で増やせます</li>
                      <li>最後に「日計表を保存」を押して完了</li>
                    </ol>
                  </div>

                  <div>
                    <p className="font-bold text-slate-800 mb-1">🛠 列（カラム）の編集方法</p>
                    <ul className="text-[13px] leading-relaxed text-slate-600 list-disc pl-5 space-y-0.5">
                      <li><strong>名前を変える</strong>：欄に直接入力して書き換え</li>
                      <li><strong>並び順を変える</strong>：右の ▲▼ ボタンで上下に移動</li>
                      <li><strong>増やす</strong>：「追加」ボタンで新しい列を作成</li>
                      <li><strong>消す</strong>：ゴミ箱ボタンで列を削除</li>
                      <li>編集したら下の「<strong>カラムを保存</strong>」を押してください</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-bold text-slate-800 mb-1">📊 集計・分析</p>
                    <p className="text-[13px] leading-relaxed text-slate-600">
                      記帳画面の下に区分ごとの小計と本日合計、来院人数・新患数が出ます。<br />
                      記帳画面 右上の「データ分析」から、<br />
                      カテゴリ別の構成・日別/月別の売上推移・担当別の売上もグラフで見られます。
                    </p>
                  </div>

                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                    <p className="font-bold text-amber-800 text-[13px] mb-1">⚠️ 注意点</p>
                    <ul className="text-[12px] leading-relaxed text-amber-700 list-disc pl-4 space-y-0.5">
                      <li>「日計表を保存」すると、その日の内容は入力したもので上書きされます</li>
                      <li>金額が入っていない行は登録されません（空行はそのままでOK）</li>
                      <li>過去・未来の日付の記帳はオーナーのみ可能です（当日入力はスタッフも可）</li>
                      <li>列の設定を変えても、これまでに記帳したデータは消えません</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

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
              <div className="space-y-3">
                {columns.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-xl border border-slate-100 p-2">
                    <span className="w-6 text-center text-xs text-slate-400 pt-2.5">{i + 1}</span>
                    <div className="flex-1 space-y-1.5">
                      <Input value={c.label} placeholder="カラム名（例：鍼灸）"
                        onChange={(e) => setLabel(i, e.target.value)} />
                      <Input
                        value={(c.variants ?? []).join("、")}
                        placeholder="種別（任意・例：一般、学割、小児鍼）"
                        onChange={(e) => setVariants(i, e.target.value)}
                        className="text-xs"
                      />
                    </div>
                    <div className="flex items-center pt-1">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === columns.length - 1}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                      <button type="button" onClick={() => remove(i)}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-400 -mt-1">
              「種別」を入れると、記帳画面でその列に種別えらびのプルダウンが出ます（例：鍼灸＝一般／学割／小児鍼…）。カンマか読点で区切ってください。
            </p>
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
