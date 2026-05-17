"use client";

import { Upload } from "lucide-react";

// Phase 4 (5/21) で実装予定
// - 勤務時間 CSV インポート (UI)
// - タスク CSV インポート (UI)
// - サンプル CSV ダウンロード
// - プレビュー + エラー行表示
// server action 自体は Phase 1 で実装済み (importWorkingHoursFromCsv / importTasksFromCsv)

export default function ImportTab() {
  return (
    <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-8 text-center">
      <Upload className="w-10 h-10 mx-auto mb-3 text-slate-400" />
      <h3 className="font-bold text-slate-700 mb-1">Excel/CSV インポート</h3>
      <p className="text-sm text-slate-500">
        Phase 4 で実装予定（5/21 公開予定）<br />
        勤務時間・タスクの一括取り込み UI を搭載予定。<br />
        当面は「基本勤務時間」「タスク管理」タブから手動入力でご利用ください。
      </p>
    </div>
  );
}
