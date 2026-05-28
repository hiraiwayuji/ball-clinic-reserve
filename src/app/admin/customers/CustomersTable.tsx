"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { format, differenceInDays } from "date-fns";
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
import { updateCustomerInfo, mergeCustomers, sendDormantLinePush, getMonthlyVisitStats, type MonthlyVisitStat } from "@/app/actions/adminCustomers";
import { QuestionnaireDialog } from "./QuestionnaireDialog";
import {
  Search, Pencil, Check, X, Loader2, ClipboardList,
  AlertTriangle, ArrowUpDown, Hash, GitMerge, Calendar, Phone, Upload,
  BellRing, MessageCircle, Send, Users, TrendingUp, TrendingDown, BarChart3, Star, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import CustomerImportDialog from "@/components/admin/CustomerImportDialog";
import { useRouter } from "next/navigation";

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
  address: string | null;
  medical_record_number: string | null;
};

type SortKey = "name" | "appointmentCount" | "lastVisit" | "created_at" | "medical_record_number";
type SortDir = "asc" | "desc";

const GENDER_LABEL: Record<string, string> = { male: "男性", female: "女性", other: "その他" };

/**
 * 名前の正規化キー：表記ゆれを吸収して同名判定に使う
 * - 半角/全角スペースをすべて除去（「松浦拓登」と「松浦 拓登」を同一視）
 * - ひらがなをカタカナに統一（「まつうら たくと」と「マツウラ タクト」を同一視）
 * - 大文字小文字を統一（英字混在ケース対策）
 *   ※ 漢字 ↔ ふりがな の同一視は対象外（読みデータが必要なため）
 */
function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    // ひらがな(U+3041..U+3096) → カタカナ(U+30A1..U+30F6) へオフセット
    .replace(/[ぁ-ゖ]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) + 0x60),
    )
    // 半角空白 + 全角空白 をすべて除去
    .replace(/[\s　]+/g, "")
    .toLowerCase();
}

/** 重複判定: 同名（正規化後） or 同カルテNO（電話番号は除外 — 仮番号が多いため） */
function buildDuplicateSet(customers: Customer[]): Set<string> {
  const dupIds = new Set<string>();

  // 名前で判定（スペース・ひらがな/カタカナ揺れを吸収）
  const nameMap = new Map<string, string[]>();
  for (const c of customers) {
    const key = normalizeName(c.name);
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

/** 重複候補を探す（名前のみで判定・正規化後 — 電話番号は除外） */
function findMergeCandidates(current: Customer, allCustomers: Customer[]): Customer[] {
  const currentKey = normalizeName(current.name);
  if (!currentKey) return [];
  return allCustomers.filter(c => {
    if (c.id === current.id) return false;
    return normalizeName(c.name) === currentKey;
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
              address: customer.address,
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

// ── リピート率・失客率分析タブ ─────────────────────────────────────

function KpiCard({
  label, value, sub, color, icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border-2 p-5 ${color}`}>
      <div className="flex items-center gap-2 text-sm font-bold opacity-70 mb-2">{icon}{label}</div>
      <div className="text-4xl font-black leading-none">{value}</div>
      {sub && <div className="text-xs mt-1.5 opacity-60">{sub}</div>}
    </div>
  );
}

function MiniBarChart({ stats }: { stats: MonthlyVisitStat[] }) {
  const maxTotal = Math.max(...stats.map(s => s.total), 1);
  return (
    <div className="flex items-end gap-1.5 h-28">
      {stats.map(s => {
        const pct = (s.total / maxTotal) * 100;
        const newPct = s.total > 0 ? (s.newPatients / s.total) * 100 : 0;
        return (
          <div key={s.month} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full relative flex flex-col justify-end" style={{ height: "80px" }}>
              {s.total > 0 && (
                <div
                  className="w-full rounded-t-md overflow-hidden"
                  style={{ height: `${pct}%` }}
                >
                  {/* 新患（上部）*/}
                  <div className="w-full bg-rose-400" style={{ height: `${newPct}%` }} />
                  {/* 再来院（下部）*/}
                  <div className="w-full bg-blue-400 flex-1" style={{ height: `${100 - newPct}%` }} />
                </div>
              )}
              {s.total === 0 && (
                <div className="w-full h-1 bg-slate-200 rounded-t-md" />
              )}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">{s.label}</span>
            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{s.total}</span>
          </div>
        );
      })}
    </div>
  );
}

function RetentionAnalyticsTab({ customers }: { customers: Customer[] }) {
  const [monthlyStats, setMonthlyStats] = useState<MonthlyVisitStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    getMonthlyVisitStats(6).then(data => {
      setMonthlyStats(data);
      setLoadingStats(false);
    });
  }, []);

  // クライアントサイドで計算できる指標
  const stats = useMemo(() => {
    const total = customers.length;
    if (total === 0) return null;

    const repeaters   = customers.filter(c => c.appointmentCount >= 2).length;
    const oneTime     = customers.filter(c => c.appointmentCount === 1).length;
    const neverVisit  = customers.filter(c => c.appointmentCount === 0).length;
    const churn90     = customers.filter(c => {
      if (!c.lastVisit) return true;
      return differenceInDays(today, new Date(c.lastVisit)) > 90;
    }).length;
    const avgVisits   = (customers.reduce((s, c) => s + c.appointmentCount, 0) / total);
    const lineLinked  = customers.filter(c => c.line_user_id).length;
    const repeatRate  = total > 0 ? Math.round((repeaters / total) * 100) : 0;
    const churnRate   = total > 0 ? Math.round((churn90 / total) * 100) : 0;

    // 来院回数分布
    const dist = [
      { label: "0回", count: neverVisit, color: "bg-slate-300" },
      { label: "1回", count: oneTime,    color: "bg-amber-400" },
      { label: "2〜5回", count: customers.filter(c => c.appointmentCount >= 2 && c.appointmentCount <= 5).length, color: "bg-blue-400" },
      { label: "6〜10回", count: customers.filter(c => c.appointmentCount >= 6 && c.appointmentCount <= 10).length, color: "bg-emerald-400" },
      { label: "11回以上", count: customers.filter(c => c.appointmentCount >= 11).length, color: "bg-violet-500" },
    ];

    // リピーター上位10名
    const topRepeaters = [...customers]
      .filter(c => c.appointmentCount > 0)
      .sort((a, b) => b.appointmentCount - a.appointmentCount)
      .slice(0, 10);

    return { total, repeaters, oneTime, churn90, avgVisits, lineLinked, repeatRate, churnRate, dist, topRepeaters };
  }, [customers, today]);

  if (!stats) return (
    <div className="text-center py-16 text-slate-400">顧客データがありません</div>
  );

  const distMax = Math.max(...stats.dist.map(d => d.count), 1);

  return (
    <div className="space-y-6">

      {/* KPIカード */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="リピート率"
          value={`${stats.repeatRate}%`}
          sub={`${stats.repeaters}名 / ${stats.total}名`}
          color="bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200"
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <KpiCard
          label="失客率（90日超）"
          value={`${stats.churnRate}%`}
          sub={`${stats.churn90}名 未来院`}
          color="bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-700 text-rose-800 dark:text-rose-200"
          icon={<TrendingDown className="w-4 h-4" />}
        />
        <KpiCard
          label="平均来院回数"
          value={`${stats.avgVisits.toFixed(1)}回`}
          sub={`1回のみ: ${stats.oneTime}名`}
          color="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <KpiCard
          label="LINE連携率"
          value={`${stats.total > 0 ? Math.round((stats.lineLinked / stats.total) * 100) : 0}%`}
          sub={`${stats.lineLinked}名 連携済み`}
          color="bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-800 dark:text-green-200"
          icon={<Users className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* 来院回数分布 */}
        <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/10 p-5">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-500" />
            来院回数分布
          </h3>
          <div className="space-y-2.5">
            {stats.dist.map(d => (
              <div key={d.label} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 dark:text-slate-400 w-16 shrink-0 text-right">{d.label}</span>
                <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${d.color} transition-all duration-700`}
                    style={{ width: `${(d.count / distMax) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-10 shrink-0">
                  {d.count}<span className="font-normal text-slate-400 ml-0.5">名</span>
                </span>
                <span className="text-[10px] text-slate-400 w-8 shrink-0">
                  {stats.total > 0 ? Math.round((d.count / stats.total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 月別来院推移 */}
        <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/10 p-5">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            月別来院推移（自費）
            {loadingStats && <RefreshCw className="w-3 h-3 animate-spin text-slate-400 ml-1" />}
          </h3>
          <div className="flex items-center gap-3 mb-4 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" />新患</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400 inline-block" />再来院</span>
          </div>
          {loadingStats ? (
            <div className="h-28 flex items-center justify-center text-slate-400 text-sm">読み込み中...</div>
          ) : monthlyStats.length > 0 ? (
            <>
              <MiniBarChart stats={monthlyStats} />
              <div className="mt-3 grid grid-cols-3 gap-2">
                {monthlyStats.slice(-3).map(s => (
                  <div key={s.month} className="text-center bg-slate-50 dark:bg-slate-800 rounded-lg p-2">
                    <div className="text-[10px] text-slate-400">{s.label}</div>
                    <div className="font-black text-slate-800 dark:text-slate-100">{s.total}</div>
                    <div className="text-[9px] text-slate-400">
                      新{s.newPatients} / 再{s.returnPatients}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-28 flex items-center justify-center text-slate-400 text-sm">データなし</div>
          )}
        </div>
      </div>

      {/* リピーター上位 */}
      <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/10 p-5">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          来院回数TOP10
        </h3>
        <div className="space-y-2">
          {stats.topRepeaters.map((c, i) => (
            <div key={c.id} className="flex items-center gap-3">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                i === 0 ? "bg-amber-400 text-white" :
                i === 1 ? "bg-slate-300 text-slate-700" :
                i === 2 ? "bg-amber-700/70 text-white" :
                "bg-slate-100 dark:bg-slate-800 text-slate-500"
              }`}>{i + 1}</span>
              <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{c.name}</span>
              {c.lastVisit && (
                <span className="text-xs text-slate-400 shrink-0">
                  最終: {format(new Date(c.lastVisit), "yyyy/MM/dd", { locale: ja })}
                </span>
              )}
              <span className="text-sm font-black text-blue-600 dark:text-blue-400 shrink-0 w-14 text-right">
                {c.appointmentCount}回
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 休眠患者アラートタブ ────────────────────────────────────────────

const LINE_TEMPLATES = [
  {
    label: "ご無沙汰のご連絡",
    text: (name: string) =>
      `${name}様\n\nいつもありがとうございます。\nしばらくご来院されていないご様子で、お体の具合はいかがでしょうか？\n\nお身体に気になることがございましたら、お気軽にご来院・ご連絡ください。\nスタッフ一同、お待ちしております。`,
  },
  {
    label: "キャンペーンのご案内",
    text: (name: string) =>
      `${name}様\n\nこんにちは！いつもありがとうございます。\nこの度、久しぶりにご来院のお客様向けに特別キャンペーンを実施しております。\n\nぜひこの機会にご来院ください。ご予約はいつでも受け付けております。\nお待ちしております。`,
  },
  {
    label: "体調確認メッセージ",
    text: (name: string) =>
      `${name}様\n\nお元気ですか？最近ご来院がないためご連絡差し上げました。\n\nお身体の不調や気になる症状があれば、いつでもご相談ください。\n引き続きよろしくお願いいたします。`,
  },
];

type DormantThreshold = 30 | 60 | 90;

function DormantAlertsTab({ customers }: { customers: Customer[] }) {
  const [threshold, setThreshold] = useState<DormantThreshold>(30);
  const [lineModalCustomer, setLineModalCustomer] = useState<Customer | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [customMessage, setCustomMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [batchSending, setBatchSending] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const today = useMemo(() => new Date(), []);

  const dormantPatients = useMemo(() => {
    return customers
      .filter(c => {
        if (!c.lastVisit) return false;
        const days = differenceInDays(today, new Date(c.lastVisit));
        return days >= threshold;
      })
      .map(c => ({
        ...c,
        daysSince: differenceInDays(today, new Date(c.lastVisit!)),
      }))
      .sort((a, b) => b.daysSince - a.daysSince);
  }, [customers, threshold, today]);

  const withLine = dormantPatients.filter(c => c.line_user_id);
  const withoutLine = dormantPatients.filter(c => !c.line_user_id);

  const getDaysColor = (days: number) => {
    if (days >= 180) return "text-red-600 bg-red-50 border-red-200";
    if (days >= 90) return "text-orange-600 bg-orange-50 border-orange-200";
    if (days >= 60) return "text-amber-600 bg-amber-50 border-amber-200";
    return "text-yellow-700 bg-yellow-50 border-yellow-200";
  };

  const openLineModal = (customer: Customer) => {
    setLineModalCustomer(customer);
    setSelectedTemplate(0);
    setCustomMessage(LINE_TEMPLATES[0].text(customer.name));
  };

  const handleTemplateSelect = (idx: number, name: string) => {
    setSelectedTemplate(idx);
    setCustomMessage(LINE_TEMPLATES[idx].text(name));
  };

  const handleSend = async () => {
    if (!lineModalCustomer?.line_user_id || !customMessage.trim()) return;
    setIsSending(true);
    const res = await sendDormantLinePush(
      lineModalCustomer.line_user_id,
      lineModalCustomer.name,
      customMessage.trim(),
    );
    setIsSending(false);
    if (res.success) {
      toast.success(`${lineModalCustomer.name}様にLINEを送信しました`);
      setSentIds(prev => new Set(prev).add(lineModalCustomer.id));
      setLineModalCustomer(null);
    } else {
      toast.error(res.error ?? "送信に失敗しました");
    }
  };

  const handleBatchSend = async () => {
    const targets = withLine.filter(c => !sentIds.has(c.id));
    if (targets.length === 0) { toast.info("送信対象がありません"); return; }
    setBatchSending(true);
    let ok = 0;
    for (const c of targets) {
      if (!c.line_user_id) continue;
      const msg = LINE_TEMPLATES[0].text(c.name);
      const res = await sendDormantLinePush(c.line_user_id, c.name, msg);
      if (res.success) {
        ok++;
        setSentIds(prev => new Set(prev).add(c.id));
      }
    }
    setBatchSending(false);
    toast.success(`${ok}名にLINEを送信しました`);
  };

  return (
    <div className="space-y-5">
      {/* フィルター */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">未来院期間：</span>
        {([30, 60, 90] as DormantThreshold[]).map(d => (
          <button
            key={d}
            onClick={() => setThreshold(d)}
            className={[
              "px-4 py-1.5 rounded-full text-sm font-medium border transition-colors",
              threshold === d
                ? "bg-rose-500 text-white border-rose-500"
                : "bg-white text-slate-600 border-slate-300 hover:bg-rose-50 hover:border-rose-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-600",
            ].join(" ")}
          >
            {d}日以上
          </button>
        ))}
        <span className="ml-auto text-sm text-slate-400">
          {dormantPatients.length}名（LINE連携: {withLine.length}名）
        </span>
        {withLine.length > 0 && (
          <Button
            size="sm"
            onClick={handleBatchSend}
            disabled={batchSending || withLine.filter(c => !sentIds.has(c.id)).length === 0}
            className="bg-green-600 hover:bg-green-700 text-white text-xs"
          >
            {batchSending
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Send className="w-3.5 h-3.5 mr-1.5" />}
            LINE一括送信（{withLine.filter(c => !sentIds.has(c.id)).length}名）
          </Button>
        )}
      </div>

      {dormantPatients.length === 0 ? (
        <div className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-white/10 p-12 text-center text-slate-400">
          <BellRing className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>{threshold}日以上来院がない患者はいません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {withLine.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-green-500" />
                LINE連携あり — {withLine.length}名
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {withLine.map(c => (
                  <div
                    key={c.id}
                    className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-white/10 p-4 flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">{c.name}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getDaysColor(c.daysSince)}`}>
                          {c.daysSince}日経過
                        </span>
                        {sentIds.has(c.id) && (
                          <span className="text-xs text-green-600 flex items-center gap-0.5">
                            <Check className="w-3 h-3" />送信済
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          最終: {c.lastVisit ? format(new Date(c.lastVisit), "yyyy/MM/dd", { locale: ja }) : "—"}
                        </span>
                        <span>{c.appointmentCount}回来院</span>
                        {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openLineModal(c)}
                      disabled={sentIds.has(c.id)}
                      className={[
                        "shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
                        sentIds.has(c.id)
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                          : "bg-green-500 hover:bg-green-600 text-white",
                      ].join(" ")}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      LINE
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {withoutLine.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                LINE未連携 — {withoutLine.length}名
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {withoutLine.map(c => (
                  <div
                    key={c.id}
                    className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-white/10 p-4"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">{c.name}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getDaysColor(c.daysSince)}`}>
                        {c.daysSince}日経過
                      </span>
                    </div>
                    <div className="mt-1 flex gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        最終: {c.lastVisit ? format(new Date(c.lastVisit), "yyyy/MM/dd", { locale: ja }) : "—"}
                      </span>
                      <span>{c.appointmentCount}回来院</span>
                      {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LINE送信モーダル */}
      <Dialog open={!!lineModalCustomer} onOpenChange={v => { if (!v) setLineModalCustomer(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <MessageCircle className="w-5 h-5" />
              LINE追客メッセージ送信
            </DialogTitle>
            <DialogDescription>
              {lineModalCustomer?.name}様へ送信するメッセージを選択・編集してください
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* テンプレート選択 */}
            <div className="flex gap-2 flex-wrap">
              {LINE_TEMPLATES.map((t, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleTemplateSelect(idx, lineModalCustomer?.name ?? "")}
                  className={[
                    "text-xs px-3 py-1.5 rounded-full border transition-colors",
                    selectedTemplate === idx
                      ? "bg-green-500 text-white border-green-500"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-green-50",
                  ].join(" ")}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {/* メッセージ編集 */}
            <textarea
              value={customMessage}
              onChange={e => setCustomMessage(e.target.value)}
              rows={8}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 resize-none"
            />
            <p className="text-xs text-slate-400">{customMessage.length} 文字</p>
            <div className="flex gap-2">
              <Button
                onClick={handleSend}
                disabled={isSending || !customMessage.trim()}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                送信する
              </Button>
              <Button variant="outline" onClick={() => setLineModalCustomer(null)} disabled={isSending}>
                キャンセル
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── テーブル本体 ────────────────────────────────────────────────────

type TabType = "all" | "dormant" | "retention";

export function CustomersTable({ customers }: { customers: Customer[] }) {
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const router = useRouter();

  // 休眠患者数（30日以上）をバッジ用に計算
  const dormantCount = useMemo(() => {
    const today = new Date();
    return customers.filter(c => {
      if (!c.lastVisit) return false;
      return differenceInDays(today, new Date(c.lastVisit)) >= 30;
    }).length;
  }, [customers]);

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
      {/* タブ切り替え */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={[
            "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            activeTab === "all"
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
          ].join(" ")}
        >
          <Users className="w-4 h-4" />
          全患者
          <span className="text-xs text-slate-400 font-normal">({customers.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("dormant")}
          className={[
            "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            activeTab === "dormant"
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
          ].join(" ")}
        >
          <BellRing className="w-4 h-4" />
          休眠患者アラート
          {dormantCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 bg-rose-500 text-white rounded-full font-bold">
              {dormantCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("retention")}
          className={[
            "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            activeTab === "retention"
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
          ].join(" ")}
        >
          <TrendingUp className="w-4 h-4" />
          リピート・失客分析
        </button>
      </div>

      {activeTab === "retention" ? (
        <RetentionAnalyticsTab customers={customers} />
      ) : activeTab === "dormant" ? (
        <DormantAlertsTab customers={customers} />
      ) : (
        <>
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

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImport(true)}
              className="border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 font-bold"
            >
              <Upload className="w-4 h-4 mr-1.5" />
              CSVインポート
            </Button>
          </div>

          <CustomerImportDialog
            open={showImport}
            onClose={() => setShowImport(false)}
            onImported={() => router.refresh()}
          />

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
        </>
      )}
    </div>
  );
}
