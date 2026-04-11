"use client";

import { useState, useTransition, useMemo } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { SuspendToggle } from "./SuspendToggle";
import { LinkLineDialog } from "./LinkLineDialog";
import { updateCustomerInfo, mergeCustomers } from "@/app/actions/adminCustomers";
import { QuestionnaireDialog } from "./QuestionnaireDialog";
import {
  Search, Pencil, Check, X, Loader2, ClipboardList,
  AlertTriangle, ArrowUpDown, Hash, GitMerge, Calendar, Phone,
} from "lucide-react";
import { toast } from "sonner";

export type Customer = {
  id: string;
  name: string;
  phone: string;
  created_at: string;
  appointmentCount: number;
  cancelCount: number;
  lastVisit: string | null;
  booking_suspended: boolean;
  line_user_id: string | null;
  birth_month: number | null;
  gender: string | null;
  age_group: string | null;
  guardian_name: string | null;
  city_name: string | null;
  birth_date: string | null;
  referral_source: string | null;
  medical_record_number: string | null;
};

type SortKey = "name" | "appointmentCount" | "lastVisit" | "created_at" | "medical_record_number";
type SortDir = "asc" | "desc";

const GENDER_LABEL: Record<string, string> = { male: "男性", female: "女性", other: "その他" };

/** 重複判定: 同名 or 同カルテNO（電話番号は除外 — 仮番号が多いため） */
function buildDuplicateSet(customers: Customer[]): Set<string> {
  const dupIds = new Set<string>();

  // 名前のみで判定
  const nameMap = new Map<string, string[]>();
  for (const c of customers) {
    const key = c.name.trim();
    if (!key) continue;
    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key)!.push(c.id);
  }
  for (const ids of nameMap.values()) {
    if (ids.length > 1) ids.forEach(id => dupIds.add(id));
  }

  // 同カルテNO（空白は除外）
  const recordMap = new Map<string, string[]>();
  for (const c of customers) {
    if (!c.medical_record_number?.trim()) continue;
    const key = c.medical_record_number.trim();
    if (!recordMap.has(key)) recordMap.set(key, []);
    recordMap.get(key)!.push(c.id);
  }
  for (const ids of recordMap.values()) {
    if (ids.length > 1) ids.forEach(id => dupIds.add(id));
  }

  return dupIds;
}

/** 重複候補を探す（名前のみで判定 — 電話番号は除外） */
function findMergeCandidates(current: Customer, allCustomers: Customer[]): Customer[] {
  return allCustomers.filter(c => {
    if (c.id === current.id) return false;
    return c.name.trim() === current.name.trim();
  });
}

// ── 統合ダイアログ ────────────────────────────────────────────────

function MergeDialog({
  open,
  onOpenChange,
  targetCustomer,
  candidates,
  onMergeComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetCustomer: Customer;
  candidates: Customer[];
  onMergeComplete: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);

  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // 統合後プレビューの計算
  const selectedCandidates = candidates.filter(c => selected.has(c.id));
  const mergedPreview = {
    name: targetCustomer.name,
    phone: targetCustomer.phone || selectedCandidates.find(c => c.phone)?.phone || "—",
    medical_record_number: targetCustomer.medical_record_number || selectedCandidates.find(c => c.medical_record_number)?.medical_record_number || null,
    appointmentCount: targetCustomer.appointmentCount + selectedCandidates.reduce((s, c) => s + c.appointmentCount, 0),
    cancelCount: targetCustomer.cancelCount + selectedCandidates.reduce((s, c) => s + c.cancelCount, 0),
    lastVisit: [targetCustomer.lastVisit, ...selectedCandidates.map(c => c.lastVisit)]
      .filter(Boolean)
      .sort()
      .at(-1) ?? null,
    line_user_id: targetCustomer.line_user_id || selectedCandidates.find(c => c.line_user_id)?.line_user_id || null,
  };

  const handleMerge = async () => {
    if (selected.size === 0) { toast.error("統合する患者を選択してください"); return; }
    setMerging(true);
    let ok = 0;
    for (const sourceId of selected) {
      try {
        const res = await mergeCustomers(sourceId, targetCustomer.id);
        if (res.success) ok++;
        else toast.error("統合に失敗した患者があります");
      } catch {
        toast.error("統合エラーが発生しました");
      }
    }
    setMerging(false);
    if (ok > 0) {
      toast.success(`${ok}件の患者データを統合しました`);
      setSelected(new Set());
      onOpenChange(false);
      onMergeComplete();
    }
  };

  const CustomerCard = ({ c, isTarget }: { c: Customer; isTarget?: boolean }) => (
    <div className={`rounded-xl border p-4 space-y-2 ${isTarget ? "border-blue-400 bg-blue-50/50 dark:border-blue-600 dark:bg-blue-900/20" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"}`}>
      {isTarget && (
        <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">統合先（残るデータ）</p>
      )}
      <div className="flex items-center gap-2">
        <span className="font-bold text-slate-900 dark:text-slate-100">{c.name}</span>
        {c.medical_record_number && (
          <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">
            カルテ {c.medical_record_number}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone || "—"}</span>
        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />予約 {c.appointmentCount}回</span>
        {c.lastVisit && (
          <span>最終: {format(new Date(c.lastVisit), "yyyy/MM/dd", { locale: ja })}</span>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <GitMerge className="w-5 h-5" />
            重複候補の確認・統合
          </DialogTitle>
          <DialogDescription>
            同じ名前または電話番号の患者が見つかりました。統合すると予約履歴が統合先に移動し、選択した患者は削除されます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* 統合先 */}
          <CustomerCard c={targetCustomer} isTarget />

          {/* 候補リスト */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              重複候補（チェックしたものを統合先へ統合）
            </p>
            {candidates.map(c => {
              const checked = selected.has(c.id);
              const reasonSameName = c.name.trim() === targetCustomer.name.trim();
              const reasonSamePhone = c.phone.trim() !== "" && c.phone.trim() === targetCustomer.phone.trim();
              return (
                <label
                  key={c.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    checked
                      ? "border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-900/30"
                      : "border-slate-200 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelect(c.id)}
                    className="mt-1 w-4 h-4 accent-amber-500 shrink-0"
                  />
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-slate-100">{c.name}</span>
                      {c.medical_record_number && (
                        <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">
                          カルテ {c.medical_record_number}
                        </span>
                      )}
                      <div className="flex gap-1">
                        {reasonSameName && (
                          <span className="text-[10px] bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded font-bold">同名</span>
                        )}
                        {reasonSamePhone && (
                          <span className="text-[10px] bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded font-bold">同電話</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone || "—"}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />予約 {c.appointmentCount}回</span>
                      {c.lastVisit && (
                        <span>最終: {format(new Date(c.lastVisit), "yyyy/MM/dd", { locale: ja })}</span>
                      )}
                      <span>登録: {format(new Date(c.created_at), "yyyy/MM/dd", { locale: ja })}</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {selected.size > 0 && (
            <div className="space-y-3">
              {/* 統合後プレビュー */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest flex items-center gap-1">
                  <GitMerge className="w-3 h-3" /> 統合後のデータプレビュー
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {[
                    { label: "患者名", value: mergedPreview.name },
                    { label: "電話番号", value: mergedPreview.phone },
                    { label: "カルテNO", value: mergedPreview.medical_record_number || "—" },
                    { label: "LINE連携", value: mergedPreview.line_user_id ? "あり ✅" : "なし" },
                    { label: "予約回数（合算）", value: `${mergedPreview.appointmentCount}回` },
                    { label: "キャンセル（合算）", value: `${mergedPreview.cancelCount}回` },
                    { label: "最終来院日", value: mergedPreview.lastVisit ? format(new Date(mergedPreview.lastVisit), "yyyy/MM/dd", { locale: ja }) : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between gap-2 py-0.5 border-b border-blue-100 dark:border-blue-800 last:border-0">
                      <span className="text-slate-500 dark:text-slate-400">{label}</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100 text-right">{value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-blue-600 dark:text-blue-400">
                  ※ 選択した患者の予約履歴が統合先へ移動し、元のレコードは削除されます。
                </p>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
                <strong>{selected.size}件</strong>を「{targetCustomer.name}」に統合します。この操作は元に戻せません。
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleMerge}
              disabled={merging || selected.size === 0}
              className="bg-amber-500 hover:bg-amber-600 text-white flex-1"
            >
              {merging ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <GitMerge className="w-4 h-4 mr-2" />}
              {selected.size > 0 ? `${selected.size}件を統合する` : "統合する患者を選択してください"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={merging}>
              閉じる
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── 行コンポーネント ────────────────────────────────────────────────

function EditableRow({
  customer, index, isDuplicate, allRecordNumbers, allPhones, allCustomers,
}: {
  customer: Customer;
  index: number;
  isDuplicate: boolean;
  allRecordNumbers: Set<string>;
  allPhones: Set<string>;
  allCustomers: Customer[];
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);
  const [recordNo, setRecordNo] = useState(customer.medical_record_number ?? "");
  const [qOpen, setQOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 統合ダイアログ
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<Customer[]>([]);

  const warnRecordNo =
    recordNo.trim() !== "" &&
    recordNo.trim() !== (customer.medical_record_number ?? "").trim() &&
    allRecordNumbers.has(recordNo.trim());

  const warnPhone =
    phone.trim() !== customer.phone.trim() &&
    allPhones.has(phone.trim());

  // 現在の編集内容で重複候補を探す（保存前プレビュー用）
  const liveCustomer: Customer = { ...customer, name, phone };

  const handleSave = () => {
    if (!name.trim()) { toast.error("名前を入力してください"); return; }
    if (warnRecordNo) {
      toast.error("カルテNO「" + recordNo + "」は既に使用されています");
      return;
    }
    startTransition(async () => {
      try {
        await updateCustomerInfo(customer.id, name, phone, recordNo.trim() || null);
        toast.success("更新しました");
        setEditing(false);

        // 保存後に重複候補を検索
        const candidates = findMergeCandidates(liveCustomer, allCustomers);
        if (candidates.length > 0) {
          setMergeCandidates(candidates);
          setMergeOpen(true);
        }
      } catch {
        toast.error("更新に失敗しました");
      }
    });
  };

  const handleCancel = () => {
    setName(customer.name);
    setPhone(customer.phone);
    setRecordNo(customer.medical_record_number ?? "");
    setEditing(false);
  };

  return (
    <>
      <TableRow className={[
        "transition-colors",
        customer.booking_suspended ? "bg-red-50/40" : "hover:bg-slate-50/50",
        isDuplicate ? "ring-1 ring-inset ring-amber-300" : "",
      ].join(" ")}>

        <TableCell className="text-slate-400 text-xs font-mono text-center">{index + 1}</TableCell>

        {/* カルテNO */}
        <TableCell>
          {editing ? (
            <div className="space-y-1">
              <input
                value={recordNo}
                onChange={e => setRecordNo(e.target.value)}
                placeholder="例: 00123"
                className={[
                  "w-24 h-8 border rounded-lg px-2 text-sm font-mono focus:outline-none focus:ring-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100",
                  warnRecordNo ? "border-red-400 focus:ring-red-400" : "border-blue-300 focus:ring-blue-400",
                ].join(" ")}
              />
              {warnRecordNo && (
                <p className="text-[10px] text-red-500 flex items-center gap-0.5">
                  <AlertTriangle className="w-2.5 h-2.5" /> 重複しています
                </p>
              )}
            </div>
          ) : (
            <span className="font-mono text-sm">
              {customer.medical_record_number
                ? <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700">{customer.medical_record_number}</span>
                : <span className="text-slate-300">—</span>}
            </span>
          )}
        </TableCell>

        {/* 患者名 */}
        <TableCell>
          <div className="flex items-center gap-2">
            {editing
              ? <input value={name} onChange={e => setName(e.target.value)} autoFocus
                  className="w-full h-8 border border-blue-300 rounded-lg px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" />
              : <span className="font-semibold text-slate-900 dark:text-slate-100">{name}</span>
            }
            {isDuplicate && !editing && (
              <button
                type="button"
                onClick={() => {
                  const candidates = findMergeCandidates(customer, allCustomers);
                  if (candidates.length > 0) {
                    setMergeCandidates(candidates);
                    setMergeOpen(true);
                  }
                }}
                className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-300 rounded hover:bg-amber-200 transition-colors"
              >
                <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />重複
                <GitMerge className="w-2.5 h-2.5 ml-0.5" />
              </button>
            )}
          </div>
        </TableCell>

        {/* 電話番号 */}
        <TableCell>
          {editing ? (
            <div className="space-y-1">
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className={[
                  "w-36 h-8 border rounded-lg px-2 text-sm focus:outline-none focus:ring-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100",
                  warnPhone ? "border-amber-400 focus:ring-amber-400" : "border-blue-300 focus:ring-blue-400",
                ].join(" ")}
              />
              {warnPhone && (
                <p className="text-[10px] text-amber-600 flex items-center gap-0.5">
                  <AlertTriangle className="w-2.5 h-2.5" /> 同じ電話番号が存在します
                </p>
              )}
            </div>
          ) : <span className="text-sm text-slate-600 dark:text-slate-300">{phone}</span>}
        </TableCell>

        <TableCell className="text-center">
          <Badge variant="secondary" className="px-3">{customer.appointmentCount} 回</Badge>
        </TableCell>

        <TableCell className="text-center">
          {customer.cancelCount > 0
            ? <Badge variant="secondary" className={"px-3 " + (customer.cancelCount >= 3 ? "bg-orange-100 text-orange-700" : "")}>{customer.cancelCount} 回</Badge>
            : <span className="text-slate-400 text-sm">0 回</span>}
        </TableCell>

        <TableCell className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
          {customer.lastVisit
            ? format(new Date(customer.lastVisit), "yyyy/MM/dd (E)", { locale: ja })
            : <span className="text-slate-400 dark:text-slate-600">記録なし</span>}
        </TableCell>

        <TableCell className="text-sm text-slate-500 dark:text-slate-500 whitespace-nowrap">
          {format(new Date(customer.created_at), "yyyy/MM/dd", { locale: ja })}
        </TableCell>

        <TableCell className="text-center">
          <LinkLineDialog customerId={customer.id} customerName={name} lineUserId={customer.line_user_id} />
        </TableCell>

        <TableCell>
          <button type="button" onClick={() => setQOpen(true)}
            className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-1 rounded-lg transition-colors">
            <ClipboardList className="w-3 h-3" />
            {customer.city_name ? customer.city_name + " / " : ""}
            {customer.gender ? (GENDER_LABEL[customer.gender] ?? customer.gender) + " / " : ""}
            {customer.referral_source ?? "分析データ"}
          </button>
          <QuestionnaireDialog
            open={qOpen} onOpenChange={setQOpen}
            customerId={customer.id} customerName={name}
            initialData={{
              guardian_name: customer.guardian_name,
              birth_month: customer.birth_month,
              gender: customer.gender,
              age_group: customer.age_group,
              city_name: customer.city_name,
              birth_date: customer.birth_date,
              referral_source: customer.referral_source,
            }}
          />
        </TableCell>

        <TableCell>
          {editing ? (
            <div className="flex items-center gap-1">
              <button type="button" onClick={handleSave} disabled={isPending}
                className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button type="button" onClick={handleCancel} disabled={isPending}
                className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </TableCell>

        <TableCell>
          <SuspendToggle customerId={customer.id} suspended={customer.booking_suspended} />
        </TableCell>
      </TableRow>

      {/* 統合ダイアログ */}
      <MergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        targetCustomer={{ ...customer, name, phone }}
        candidates={mergeCandidates}
        onMergeComplete={() => window.location.reload()}
      />
    </>
  );
}

// ── テーブル本体 ────────────────────────────────────────────────────

export function CustomersTable({ customers }: { customers: Customer[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

  const duplicateIds = useMemo(() => buildDuplicateSet(customers), [customers]);

  const allRecordNumbers = useMemo(
    () => new Set(customers.map(c => c.medical_record_number?.trim()).filter((v): v is string => Boolean(v))),
    [customers]
  );
  const allPhones = useMemo(() => new Set(customers.map(c => c.phone.trim())), [customers]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => (
    <ArrowUpDown className={"w-3 h-3 ml-1 inline " + (sortKey === k ? "text-blue-500" : "text-slate-300")} />
  );

  const processed = useMemo(() => {
    const trimmed = query.trim();
    let result = trimmed
      ? customers.filter(c =>
          c.name.includes(trimmed) ||
          c.phone.includes(trimmed) ||
          (c.medical_record_number ?? "").includes(trimmed))
      : [...customers];

    if (showDuplicatesOnly) result = result.filter(c => duplicateIds.has(c.id));

    result.sort((a, b) => {
      let av: string | number | null = null;
      let bv: string | number | null = null;
      if (sortKey === "name")                      { av = a.name; bv = b.name; }
      else if (sortKey === "appointmentCount")     { av = a.appointmentCount; bv = b.appointmentCount; }
      else if (sortKey === "lastVisit")            { av = a.lastVisit; bv = b.lastVisit; }
      else if (sortKey === "created_at")           { av = a.created_at; bv = b.created_at; }
      else if (sortKey === "medical_record_number") { av = a.medical_record_number; bv = b.medical_record_number; }
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [customers, query, sortKey, sortDir, showDuplicatesOnly, duplicateIds]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="名前・電話番号・カルテNOで検索..."
            className="h-10 pl-9 pr-4 w-72 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" />
        </div>

        {duplicateIds.size > 0 && (
          <button type="button" onClick={() => setShowDuplicatesOnly(v => !v)}
            className={[
              "flex items-center gap-1.5 h-10 px-4 rounded-lg text-sm font-medium border transition-colors",
              showDuplicatesOnly
                ? "bg-amber-500 text-white border-amber-500"
                : "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100",
            ].join(" ")}>
            <AlertTriangle className="w-4 h-4" />
            重複のみ表示（{duplicateIds.size} 件）
          </button>
        )}

        <span className="text-sm text-slate-400 ml-auto">{processed.length} / {customers.length} 件</span>
      </div>

      <div className="bg-white dark:bg-slate-900/50 rounded-xl shadow-sm border border-slate-200 dark:border-white/10 overflow-x-auto">
        <Table className="min-w-[1100px]">
          <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
            <TableRow>
              <TableHead className="w-[40px] text-center">No.</TableHead>
              <TableHead className="cursor-pointer select-none w-[110px]" onClick={() => handleSort("medical_record_number")}>
                <Hash className="w-3 h-3 inline mr-0.5 text-slate-400" />カルテNO<SortIcon k="medical_record_number" />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("name")}>
                患者名<SortIcon k="name" />
              </TableHead>
              <TableHead>電話番号</TableHead>
              <TableHead className="text-center cursor-pointer select-none" onClick={() => handleSort("appointmentCount")}>
                予約回数<SortIcon k="appointmentCount" />
              </TableHead>
              <TableHead className="text-center">キャンセル</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("lastVisit")}>
                最終来院日<SortIcon k="lastVisit" />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("created_at")}>
                初回登録日<SortIcon k="created_at" />
              </TableHead>
              <TableHead className="text-center">LINE</TableHead>
              <TableHead>アンケート</TableHead>
              <TableHead className="w-[60px]">編集</TableHead>
              <TableHead>予約</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processed.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="h-32 text-center text-slate-500">
                  {query
                    ? "「" + query + "」に一致する患者が見つかりません"
                    : showDuplicatesOnly ? "重複データはありません"
                    : "顧客データがありません"}
                </TableCell>
              </TableRow>
            ) : (
              processed.map((customer, i) => (
                <EditableRow
                  key={customer.id}
                  customer={customer}
                  index={i}
                  isDuplicate={duplicateIds.has(customer.id)}
                  allRecordNumbers={allRecordNumbers}
                  allPhones={allPhones}
                  allCustomers={customers}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
