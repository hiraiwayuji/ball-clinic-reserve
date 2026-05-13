"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadExcelTemplate } from "@/lib/excel";

const EXPENSE_COLS = [
  { key: "expense_date", label: "日付(YYYY/MM/DD)" },
  { key: "category",     label: "カテゴリ" },
  { key: "description",  label: "内容" },
  { key: "amount",       label: "金額" },
  { key: "memo",         label: "備考" },
];

const EXPENSE_SAMPLE = {
  "日付(YYYY/MM/DD)": "2026/04/15",
  カテゴリ: "消耗品",
  内容: "ハンドソープ",
  金額: 980,
  備考: "",
};

const INSURANCE_COLS = [
  { key: "payment_date",   label: "振込日(YYYY/MM/DD)" },
  { key: "insurance_name", label: "保険種別" },
  { key: "amount",         label: "振込金額" },
  { key: "notes",          label: "メモ" },
];

const INSURANCE_SAMPLE = {
  "振込日(YYYY/MM/DD)": "2026/04/20",
  保険種別: "協会けんぽ",
  振込金額: 58400,
  メモ: "4月分療養費",
};

export default function TemplateDownloadButtons() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="outline"
        onClick={() =>
          downloadExcelTemplate(EXPENSE_COLS, EXPENSE_SAMPLE, "経費入力テンプレート.xlsx")
        }
        className="border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 bg-white"
      >
        <Download className="w-4 h-4 mr-2 text-emerald-600" />
        経費テンプレート（推奨形式）
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          downloadExcelTemplate(INSURANCE_COLS, INSURANCE_SAMPLE, "保険入金テンプレート.xlsx")
        }
        className="border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 bg-white"
      >
        <Download className="w-4 h-4 mr-2 text-[#2563EB]" />
        保険入金テンプレート（推奨形式）
      </Button>
    </div>
  );
}
