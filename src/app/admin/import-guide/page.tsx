import Link from "next/link";
import { Bot, Sparkles, FileSpreadsheet, ArrowRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TemplateDownloadButtons from "./TemplateDownloadButtons";

export const metadata = {
  title: "インポート・エクスポート ガイド",
};

const AI_FORMAT_EXAMPLES = [
  {
    samples: "支払日、発生日、日付、date",
    mapped: "日付",
  },
  {
    samples: "勘定科目、費目、科目、category",
    mapped: "カテゴリ",
  },
  {
    samples: "摘要、品目、商品名、内容",
    mapped: "内容",
  },
  {
    samples: "金額、支払額、税込額、amount",
    mapped: "金額",
  },
  {
    samples: "振込日、入金日、payment_date",
    mapped: "入金日",
  },
  {
    samples: "保険者名、支払元、保険組合名",
    mapped: "保険機関名",
  },
  {
    samples: "入金額、振込金額、amount",
    mapped: "金額（保険）",
  },
];

export default function ImportGuidePage() {
  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          インポート・エクスポート ガイド
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Excel / CSV ファイルからデータを一括登録する方法
        </p>
      </div>

      {/* AI Guide Banner */}
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-5 flex gap-4">
        <div className="relative shrink-0">
          <Bot className="w-10 h-10 text-[#2563EB]" />
          <Sparkles className="w-4 h-4 text-amber-400 absolute -top-1 -right-1" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-[#1d4ed8]">AIが自動で列を認識します</p>
          <p className="text-sm text-slate-700">
            どんな形式のExcelでも大丈夫です。
          </p>
          <p className="text-sm text-slate-700">
            ヘッダー行（列名の行）があれば、AIが自動で読み取り項目を判断します。
          </p>
          <p className="text-sm text-slate-700">
            まずはアップロードしてみてください。
          </p>
        </div>
      </div>

      {/* Template Download Section */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          テンプレートダウンロード
        </h2>
        <p className="text-sm text-slate-500">
          推奨形式のテンプレートを使うと、AIが確実に列を認識します。
        </p>
        <TemplateDownloadButtons />
      </div>

      {/* AI-supported formats */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          AI対応フォーマット例 — こんなExcelでもOK
        </h2>
        <p className="text-sm text-slate-500">
          以下のような様々な列名をAIが自動で認識します。テンプレート以外のExcelでもそのままアップロードできます。
        </p>
        <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 bg-slate-50">
                <TableHead className="text-slate-600 text-sm">サンプル列名</TableHead>
                <TableHead className="text-slate-600 text-sm">読み取られる項目</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {AI_FORMAT_EXAMPLES.map((row, i) => (
                <TableRow key={i} className="border-slate-200">
                  <TableCell className="text-slate-700 text-sm font-mono">
                    {row.samples}
                  </TableCell>
                  <TableCell className="text-emerald-700 text-sm font-medium">
                    → {row.mapped}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-slate-500">
          ※ 英語・日本語・略語・混在表記に対応しています。信頼度が低い列は「要確認」として表示されます。
        </p>
      </div>

      {/* Start import buttons */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">インポートを開始する</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/expenses"
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition"
          >
            経費インポートへ
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/admin/insurance"
            className="flex items-center gap-2 px-4 py-2.5 bg-[#2563EB] hover:bg-[#1d4ed8] text-white rounded-lg text-sm font-medium transition"
          >
            保険入金インポートへ
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
