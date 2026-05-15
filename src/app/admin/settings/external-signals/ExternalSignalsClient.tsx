"use client";

import { useState, useTransition } from "react";
import {
  upsertManualSignal,
  deleteSignal,
  listSignalsForAdmin,
  type ExternalSignal,
} from "@/app/actions/external-signals";
import { Button } from "@/components/ui/button";
import { AlertCircle, Trash2, Plus, Cloud, Activity, Flower2, Sun, Edit3 } from "lucide-react";

const TYPE_META: Record<string, { label: string; icon: typeof Cloud; color: string }> = {
  weather_today:     { label: "今日の天気",   icon: Cloud,    color: "text-sky-600" },
  weather_forecast:  { label: "天気予報",     icon: Cloud,    color: "text-sky-600" },
  influenza_weekly:  { label: "インフル流行", icon: Activity, color: "text-rose-600" },
  pollen:            { label: "花粉",         icon: Flower2,  color: "text-amber-600" },
  heatstroke_alert:  { label: "熱中症警戒",   icon: Sun,      color: "text-orange-600" },
  manual:            { label: "手動メモ",     icon: Edit3,    color: "text-slate-600" },
};

type Props = {
  initialRows: ExternalSignal[];
  prefecture: string;
};

export default function ExternalSignalsClient({ initialRows, prefecture }: Props) {
  const [rows, setRows] = useState<ExternalSignal[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const today = new Date().toISOString().slice(0, 10);
  const [signalType, setSignalType] = useState<"influenza_weekly" | "pollen" | "manual">("influenza_weekly");
  const [observedFor, setObservedFor] = useState(today);
  const [summary, setSummary] = useState("");

  async function refresh() {
    const r = await listSignalsForAdmin();
    if (r.success) setRows(r.rows ?? []);
  }

  function handleAdd() {
    setError(null);
    if (!summary.trim()) {
      setError("サマリを入力してください");
      return;
    }
    startTransition(async () => {
      const r = await upsertManualSignal({
        signal_type: signalType,
        observed_for: observedFor,
        summary: summary.trim(),
      });
      if (!r.success) {
        setError(r.error ?? "登録に失敗しました");
        return;
      }
      setSummary("");
      await refresh();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("この情報を削除しますか？")) return;
    startTransition(async () => {
      const r = await deleteSignal(id);
      if (!r.success) {
        setError(r.error ?? "削除に失敗しました");
        return;
      }
      await refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-indigo-600" />
          手動入力（インフル・花粉など）
        </h2>

        {error && (
          <div className="mb-3 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">種別</label>
            <select
              value={signalType}
              onChange={(e) => setSignalType(e.target.value as any)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="influenza_weekly">インフル流行（週次）</option>
              <option value="pollen">花粉</option>
              <option value="manual">その他メモ</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">対象日</label>
            <input
              type="date"
              value={observedFor}
              onChange={(e) => setObservedFor(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              サマリ（AI 秘書が「今日のひと言」に織り込む文面）
            </label>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={`例: ${prefecture}県でインフル流行注意報（定点 12.5）`}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              maxLength={200}
            />
            <p className="text-xs text-slate-500 mt-1">短く、患者さんへのひと言の素材になるよう。例：「花粉ピーク（黄砂注意）」「インフル流行警報」「黄砂で空気質悪化」</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={handleAdd} disabled={pending}>
            {pending ? "登録中…" : "登録"}
          </Button>
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900 mb-3">登録済み ({prefecture})</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
            まだ登録されている情報はありません
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const meta = TYPE_META[r.signal_type] ?? TYPE_META.manual;
              const Icon = meta.icon;
              return (
                <li key={r.id} className="flex items-start justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                      <span className="text-xs font-bold text-slate-800">{meta.label}</span>
                      <span className="text-xs text-slate-500">{r.observed_for}</span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-400 ml-auto">{r.source}</span>
                    </div>
                    <p className="text-sm text-slate-700">{r.summary ?? "(サマリなし)"}</p>
                  </div>
                  {r.source === "manual" && (
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      disabled={pending}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                      aria-label="削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
