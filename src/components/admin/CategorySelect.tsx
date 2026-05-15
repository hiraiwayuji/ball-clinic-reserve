"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Loader2, X, Tag, Check } from "lucide-react";
import { addCustomExpenseCategory } from "@/app/actions/settings";
import { BASE_EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { toast } from "sonner";

type Props = {
  value: string;
  onChange: (v: string) => void;
  customCategories: string[];
  onCustomCategoriesChange: (cats: string[]) => void;
  placeholder?: string;
  size?: "default" | "compact";
  withIcon?: boolean;
  selectId?: string;
};

export function CategorySelect({
  value,
  onChange,
  customCategories,
  onCustomCategoriesChange,
  placeholder = "（後で決める）",
  size = "default",
  withIcon = false,
  selectId,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const allCategories = [...BASE_EXPENSE_CATEGORIES, ...customCategories];

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const res = await addCustomExpenseCategory(name);
    if (res.success) {
      onCustomCategoriesChange([...customCategories, name]);
      onChange(name);
      setNewName("");
      setAdding(false);
      toast.success(`「${name}」を追加しました`);
    } else {
      toast.error(res.error || "追加に失敗しました");
    }
    setSaving(false);
  };

  const handleCancel = () => {
    setAdding(false);
    setNewName("");
  };

  const isCompact = size === "compact";

  const selectBase = isCompact
    ? "w-full border border-emerald-300 rounded px-1.5 py-1 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
    : `w-full border border-slate-200 dark:border-slate-800 rounded-md ${withIcon ? "pl-9" : "pl-3"} pr-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none`;

  const plusBtnClass = isCompact
    ? "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded border border-emerald-300 bg-white text-emerald-600 hover:bg-emerald-50"
    : "shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md border border-emerald-300 bg-white dark:bg-slate-950 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30";

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5 items-stretch">
        <div className="relative flex-1">
          {withIcon && !isCompact && (
            <Tag className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
          )}
          <select
            id={selectId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={selectBase}
          >
            <option value="">{placeholder}</option>
            {allCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className={plusBtnClass}
          aria-label="新しいカテゴリを追加"
          title="新しいカテゴリを追加"
        >
          <Plus className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
        </button>
      </div>

      {adding && (
        <div
          className={`flex gap-1.5 items-stretch rounded-md ${
            isCompact ? "p-1.5" : "p-2"
          } bg-emerald-50/60 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800`}
        >
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              } else if (e.key === "Escape") {
                e.preventDefault();
                handleCancel();
              }
            }}
            placeholder="新しいカテゴリ名"
            className={
              isCompact
                ? "flex-1 border border-emerald-300 rounded px-1.5 py-1 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                : "flex-1 border border-emerald-300 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            }
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || !newName.trim()}
            className={
              isCompact
                ? "shrink-0 inline-flex items-center justify-center px-2 py-1 rounded text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed gap-1"
                : "shrink-0 inline-flex items-center justify-center px-3 py-2 rounded-md text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed gap-1"
            }
          >
            {saving ? (
              <Loader2 className={isCompact ? "w-3 h-3 animate-spin" : "w-4 h-4 animate-spin"} />
            ) : (
              <Check className={isCompact ? "w-3 h-3" : "w-4 h-4"} />
            )}
            追加
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className={
              isCompact
                ? "shrink-0 inline-flex items-center justify-center w-6 rounded text-slate-500 hover:bg-slate-200/60"
                : "shrink-0 inline-flex items-center justify-center w-9 rounded-md text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800"
            }
            aria-label="キャンセル"
          >
            <X className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
          </button>
        </div>
      )}
    </div>
  );
}
