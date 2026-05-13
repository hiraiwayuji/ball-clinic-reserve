"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { exportToExcel } from "@/lib/excel";
import type { ExcelColumn } from "@/lib/excel";

// ─── Column definitions ───────────────────────────────────────────────────────

type ColDef = {
  key: string;
  label: string;
  defaultSelected: boolean;
};

const EXPENSE_COLS: ColDef[] = [
  { key: "expense_date", label: "日付",     defaultSelected: true },
  { key: "category",     label: "カテゴリ", defaultSelected: true },
  { key: "description",  label: "内容",     defaultSelected: true },
  { key: "amount",       label: "金額",     defaultSelected: true },
  { key: "memo",         label: "備考",     defaultSelected: true },
  { key: "created_at",   label: "登録日時", defaultSelected: false },
];

const INSURANCE_COLS: ColDef[] = [
  { key: "payment_date",    label: "入金日",     defaultSelected: true },
  { key: "insurance_name",  label: "保険機関名", defaultSelected: true },
  { key: "amount",          label: "金額",       defaultSelected: true },
  { key: "notes",           label: "備考",       defaultSelected: true },
  { key: "passbook_checked", label: "通帳確認",  defaultSelected: false },
  { key: "created_at",      label: "登録日時",   defaultSelected: false },
];

// ─── Preset definitions ───────────────────────────────────────────────────────

type PresetId = "standard" | "yayoi" | "freee" | "custom";

const PRESETS: { id: PresetId; label: string }[] = [
  { id: "standard", label: "標準（全項目）" },
  { id: "yayoi",    label: "弥生会計用" },
  { id: "freee",    label: "freee用" },
  { id: "custom",   label: "カスタム" },
];

// 弥生用列順 (expense only)
const YAYOI_LABELS = ["日付", "金額", "内容", "カテゴリ", "備考"];
// freee用列順 (expense only)
const FREEE_LABELS = ["日付", "内容", "金額", "備考"];

function applyPreset(preset: PresetId, cols: ColDef[]): Set<string> {
  const allKeys = new Set(cols.map((c) => c.key));
  if (preset === "standard") return allKeys;
  if (preset === "custom") return new Set(cols.filter((c) => c.defaultSelected).map((c) => c.key));

  const targetLabels = preset === "yayoi" ? YAYOI_LABELS : FREEE_LABELS;
  const selectedKeys = new Set<string>();
  for (const label of targetLabels) {
    const col = cols.find((c) => c.label === label);
    if (col) selectedKeys.add(col.key);
  }
  return selectedKeys;
}

function orderByPreset(preset: PresetId, selectedKeys: Set<string>, cols: ColDef[]): ExcelColumn[] {
  if (preset === "yayoi") {
    return YAYOI_LABELS.flatMap((label) => {
      const col = cols.find((c) => c.label === label && selectedKeys.has(c.key));
      return col ? [{ key: col.key, label: col.label }] : [];
    });
  }
  if (preset === "freee") {
    return FREEE_LABELS.flatMap((label) => {
      const col = cols.find((c) => c.label === label && selectedKeys.has(c.key));
      return col ? [{ key: col.key, label: col.label }] : [];
    });
  }
  // standard / custom: use definition order
  return cols
    .filter((c) => selectedKeys.has(c.key))
    .map((c) => ({ key: c.key, label: c.label }));
}

// ─── Local storage ────────────────────────────────────────────────────────────

const LS_KEY = "customExportPreset";

function loadPreset(): PresetId {
  if (typeof window === "undefined") return "standard";
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v && ["standard", "yayoi", "freee", "custom"].includes(v)) return v as PresetId;
  } catch {
    // ignore
  }
  return "standard";
}

function savePreset(preset: PresetId) {
  try {
    localStorage.setItem(LS_KEY, preset);
  } catch {
    // ignore
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  data: Record<string, unknown>[];
  targetSchema: "expenses" | "insurance";
  defaultFilename: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomExportDialog({
  open,
  onClose,
  data,
  targetSchema,
  defaultFilename,
}: Props) {
  const cols = targetSchema === "expenses" ? EXPENSE_COLS : INSURANCE_COLS;

  const [preset, setPreset] = useState<PresetId>("standard");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    new Set(cols.filter((c) => c.defaultSelected).map((c) => c.key))
  );

  // Load saved preset on open
  useEffect(() => {
    if (open) {
      const saved = loadPreset();
      setPreset(saved);
      setSelectedKeys(applyPreset(saved, cols));
    }
  }, [open, cols]);

  const handlePresetClick = (p: PresetId) => {
    setPreset(p);
    savePreset(p);
    if (p !== "custom") {
      setSelectedKeys(applyPreset(p, cols));
    }
  };

  const toggleKey = (key: string) => {
    setPreset("custom");
    savePreset("custom");
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleExport = () => {
    const columns = orderByPreset(preset, selectedKeys, cols);
    if (columns.length === 0) {
      alert("エクスポートする列を1つ以上選択してください");
      return;
    }
    exportToExcel(data, columns, defaultFilename);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md bg-white border-slate-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            エクスポート設定
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            出力する列と形式を選択してください
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Preset buttons */}
          <div className="space-y-2">
            <p className="text-xs text-slate-500 font-medium">プリセット</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handlePresetClick(p.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium border transition",
                    preset === p.id
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Column checklist */}
          <div className="space-y-2">
            <p className="text-xs text-slate-500 font-medium">出力列</p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              {cols.map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={selectedKeys.has(col.key)}
                    onChange={() => toggleKey(col.key)}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span className={cn(
                    "text-sm transition",
                    selectedKeys.has(col.key) ? "text-slate-800" : "text-slate-400"
                  )}>
                    {col.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Export button */}
          <Button
            onClick={handleExport}
            disabled={selectedKeys.size === 0}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
          >
            <Download className="w-4 h-4 mr-2" />
            エクスポート（{selectedKeys.size}列）
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
