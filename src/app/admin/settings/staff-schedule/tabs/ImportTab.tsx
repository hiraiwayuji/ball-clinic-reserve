"use client";

import { useRef, useState, useTransition } from "react";
import {
  importWorkingHoursFromCsv,
  importTasksFromCsv,
  type CsvImportResult,
} from "@/app/actions/staff-schedule";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Download, AlertCircle, CheckCircle2, X } from "lucide-react";

const WORKING_HOURS_SAMPLE = `staff_name,day_of_week,start_time,end_time,break_start,break_end
藤川雅之,1,10:00,20:00,12:00,13:00
藤川雅之,2,10:00,20:00,12:00,13:00
藤川雅之,4,10:00,20:00,12:00,13:00
藤川雅之,5,10:00,20:00,12:00,13:00
藤川雅之,6,10:00,17:00,,
森藤瑞穂香,1,10:00,18:00,13:00,14:00
森藤瑞穂香,2,10:00,18:00,13:00,14:00
森藤瑞穂香,4,10:00,18:00,13:00,14:00
森藤瑞穂香,5,10:00,18:00,13:00,14:00
森藤瑞穂香,6,10:00,17:00,,
`;

const TASKS_SAMPLE = `staff_name,title,due_date,priority,description
藤川雅之,5月度報告書提出,2026-05-31,high,経理へ提出
森藤瑞穂香,在庫棚卸し,2026-05-25,normal,物販棚のみ
,(未割当)月初ミーティング準備,2026-06-01,normal,9:00 集合
`;

export default function ImportTab() {
  return (
    <div className="space-y-5">
      <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-800">
        💡 ぼーるくんが藤川先生からの Excel を CSV に整形してアップロードする想定。<br />
        CSV は <strong>UTF-8</strong> または BOM 付き UTF-8 で。Excel から「名前を付けて保存」→ <strong>CSV UTF-8</strong> 形式選択。
      </div>

      <ImportSection
        title="基本勤務時間"
        description="staff_name, day_of_week (0=日〜6=土), start_time, end_time, break_start, break_end"
        sampleCsv={WORKING_HOURS_SAMPLE}
        sampleFileName="working_hours.csv"
        onImport={importWorkingHoursFromCsv}
      />

      <ImportSection
        title="タスク"
        description="staff_name, title, due_date (YYYY-MM-DD), priority (low/normal/high), description"
        sampleCsv={TASKS_SAMPLE}
        sampleFileName="tasks.csv"
        onImport={importTasksFromCsv}
      />
    </div>
  );
}

function ImportSection({
  title,
  description,
  sampleCsv,
  sampleFileName,
  onImport,
}: {
  title: string;
  description: string;
  sampleCsv: string;
  sampleFileName: string;
  onImport: (csv: string) => Promise<{ success: boolean; result?: CsvImportResult; error?: string }>;
}) {
  const [csvText, setCsvText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleFile(file: File) {
    setError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setCsvText(text);
    };
    reader.onerror = () => setError("ファイル読み込みに失敗しました");
    reader.readAsText(file, "utf-8");
  }

  function handleDownloadSample() {
    const blob = new Blob(["﻿" + sampleCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sampleFileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    if (!csvText.trim()) {
      setError("CSV が空です");
      return;
    }
    setError(null);
    setResult(null);
    startTransition(async () => {
      const r = await onImport(csvText);
      if (!r.success) {
        setError(r.error ?? "取り込みに失敗");
        return;
      }
      setResult(r.result ?? null);
    });
  }

  function handleClear() {
    setCsvText("");
    setError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // プレビュー: 行数
  const lineCount = csvText.split("\n").filter((l) => l.trim().length > 0).length;
  const dataRowCount = Math.max(0, lineCount - 1); // ヘッダ除く

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            {title}
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
        </div>
        <button
          type="button"
          onClick={handleDownloadSample}
          className="text-xs text-indigo-600 hover:underline flex items-center gap-1 shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          サンプル
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="block text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-semibold hover:file:bg-indigo-100"
          />
          {csvText && (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-slate-500 hover:text-rose-600 flex items-center gap-0.5"
            >
              <X className="w-3 h-3" />
              クリア
            </button>
          )}
        </div>

        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={5}
          placeholder="または、ここに CSV を直接貼り付け"
          className="w-full font-mono text-[11px] border border-slate-300 rounded-lg px-3 py-2 bg-slate-50"
        />

        {csvText && (
          <div className="text-xs text-slate-600">
            プレビュー: <span className="font-bold">{dataRowCount} 行</span>（ヘッダ除く）
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm">
            <div className="flex items-center gap-2 text-emerald-800 font-bold mb-2">
              <CheckCircle2 className="w-4 h-4" />
              取り込み結果
            </div>
            <ul className="text-xs space-y-0.5 text-slate-700">
              <li>✅ 取込成功: <span className="font-bold">{result.inserted}</span> 件</li>
              <li>↻ 更新: <span className="font-bold">{result.updated}</span> 件</li>
              <li>⏭ スキップ: <span className="font-bold">{result.skipped}</span> 件</li>
            </ul>
            {result.errors.length > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-rose-700 cursor-pointer font-bold">
                  エラー詳細 ({result.errors.length} 件)
                </summary>
                <ul className="mt-1 text-[11px] text-rose-700 space-y-0.5 pl-3">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>行 {e.row}: {e.reason}</li>
                  ))}
                  {result.errors.length > 20 && (
                    <li className="italic">…他 {result.errors.length - 20} 件</li>
                  )}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleImport} disabled={pending || !csvText.trim()}>
            <Upload className="w-4 h-4 mr-1" />
            {pending ? "取込中…" : `${dataRowCount} 件を取り込む`}
          </Button>
        </div>
      </div>
    </section>
  );
}
