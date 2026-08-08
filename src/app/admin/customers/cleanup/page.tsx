"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, Search, Loader2, Users, Pencil, Trash2, Merge, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getNameCleanupList,
  searchSimilarCustomers,
  deleteCustomerRecord,
  updateCustomerInfo,
  mergeCustomers,
  type SimilarCandidate,
  type NameCleanupRow,
} from "@/app/actions/adminCustomers";

type CleanupRow = NameCleanupRow & { similar: SimilarCandidate[] };

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "2026-06-23" → "6/23(火)"。曜日があると「あの火曜日の人か」と思い出しやすい */
function formatVisitDate(date: string): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  if (isNaN(d.getTime())) return date;
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

function VisitSummary({ c }: { c: { visitDays: number; salesRows: number; lastVisit: string | null } }) {
  if (c.visitDays === 0 && c.salesRows === 0) {
    return <span className="text-xs text-slate-400">来院なし・売上なし</span>;
  }
  return (
    <span className="text-xs text-slate-500 dark:text-slate-400">
      来院{c.visitDays}日・売上{c.salesRows}件
      {c.lastVisit ? `・最終 ${c.lastVisit}` : ""}
    </span>
  );
}

export default function CustomerNameCleanupPage() {
  const [rows, setRows] = useState<CleanupRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SimilarCandidate[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [busy, startBusy] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNameCleanupList();
      setRows(res.rows as CleanupRow[]);
      setTotal(res.totalCustomers);
    } catch {
      toast.error("読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSearch = () => {
    if (!query.trim()) { setHits(null); return; }
    startSearch(async () => {
      try {
        setHits(await searchSimilarCustomers(query));
      } catch {
        toast.error("検索に失敗しました");
      }
    });
  };

  const handleRename = (id: string) => {
    const nm = nameDraft.trim();
    if (!nm) { toast.error("お名前を入力してください"); return; }
    const row = rows.find((r) => r.id === id);
    startBusy(async () => {
      try {
        await updateCustomerInfo(id, nm, row?.phone ?? "", row?.medicalRecordNumber ?? undefined);
        toast.success(`「${nm}」に直しました`);
        setEditingId(null);
        load();
      } catch (e: any) {
        toast.error(e?.message ?? "変更に失敗しました");
      }
    });
  };

  const handleDelete = (row: CleanupRow) => {
    // 何が一緒に消えるかを必ず見せてから消す。
    // 予約はカルテと一緒に消えるが、売上はお名前で残るので消えない。
    const lines = [`「${row.name}」のカルテを削除します。`, ""];
    if (row.visitDays > 0) {
      lines.push(`⚠ この方の予約（来院${row.visitDays}日ぶん）も一緒に消えます。`);
      for (const v of row.recentVisits) {
        lines.push(
          `　${formatVisitDate(v.date)} ${v.time}`
          + (v.courseName ? ` ${v.courseName}` : "")
          + (v.staffName ? ` / 担当 ${v.staffName}` : ""),
        );
      }
    }
    if (row.salesRows > 0) {
      lines.push(`※ 売上${row.salesRows}件は「${row.name}」名義のまま残ります（消えません）。`);
    }
    if (row.visitDays === 0 && row.salesRows === 0) {
      lines.push("来院も売上もないカルテです。");
    }
    lines.push("", "消したぶんは復元できるよう保存しますが、画面上は元に戻せません。", "よろしいですか？");
    if (!confirm(lines.join("\n"))) return;

    startBusy(async () => {
      const res = await deleteCustomerRecord(row.id);
      if (res.success) {
        toast.success(
          res.removedAppointments
            ? `削除しました（予約${res.removedAppointments}件も削除）`
            : "削除しました",
        );
        load();
      } else {
        toast.error(res.error ?? "削除に失敗しました");
      }
    });
  };

  const handleMerge = (row: CleanupRow, into: SimilarCandidate) => {
    if (!confirm(
      `「${row.name}」を「${into.name}」にまとめますか？\n\n`
      + `予約・売上・LINE連携は「${into.name}」へ移り、「${row.name}」のカルテは消えます。`,
    )) return;
    startBusy(async () => {
      const res = await mergeCustomers(row.id, into.id);
      if (res?.success) { toast.success(`「${into.name}」にまとめました`); load(); }
      else toast.error(res?.error ?? "統合に失敗しました");
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <Link href="/admin/customers" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-2">
          <ChevronLeft className="w-4 h-4" /> 顧客管理へ戻る
        </Link>
        <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Users className="w-6 h-6 text-indigo-600" />
          お名前の整理
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          ふりがなだけ・カタカナだけなど、お名前が不完全なカルテを集めました。
          <br />
          似たお名前の候補も出るので、まとめる・直す・消す をその場で決められます。
        </p>
      </div>

      {/* 似た名前をさがす */}
      <section className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/10 p-5 space-y-3">
        <h2 className="font-black text-slate-800 dark:text-slate-100">似たお名前をさがす</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          空白のちがい・ふりがな・カタカナとひらがな・1文字の打ち間違い・姓だけ、をまとめて拾います。
        </p>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
            placeholder="例: アモウミ / 天羽 / 松田旺太"
          />
          <Button onClick={handleSearch} disabled={searching} className="gap-2 shrink-0">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            さがす
          </Button>
        </div>

        {hits !== null && (
          hits.length === 0 ? (
            <p className="text-sm text-slate-500">似たお名前は見つかりませんでした。</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {hits.map((h) => (
                <div key={h.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 dark:text-slate-100 truncate">
                      {h.name}
                      {h.medicalRecordNumber && (
                        <span className="ml-2 text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.5 rounded-full tabular-nums">
                          No.{h.medicalRecordNumber}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-300">{h.reason}</p>
                    <VisitSummary c={h} />
                  </div>
                  <span className="text-xs font-black text-slate-400 shrink-0 tabular-nums">{h.score}</span>
                </div>
              ))}
            </div>
          )
        )}
      </section>

      {/* 要整理リスト */}
      <section className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/10 p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-black text-slate-800 dark:text-slate-100">
            お名前が不完全なカルテ（{rows.length}件 / 全{total}件）
          </h2>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            再読込
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />読み込み中...
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">整理が必要なお名前はありません。</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-black text-slate-900 dark:text-slate-100 text-lg truncate">{row.name}</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                      <AlertTriangle className="w-3.5 h-3.5" />{row.cleanupReason}
                    </p>
                    <VisitSummary c={row} />
                    {row.recentVisits.length > 0 && (
                      <div className="mt-1.5">
                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                          来院の記録（どなたか思い出す手がかりに）
                        </p>
                        <ul className="mt-0.5 space-y-0.5">
                          {row.recentVisits.map((v, i) => (
                            <li key={i} className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-x-2">
                              <span className="font-mono font-bold tabular-nums">
                                {formatVisitDate(v.date)} {v.time}
                              </span>
                              {v.courseName && (
                                <span className="text-emerald-700 dark:text-emerald-300">{v.courseName}</span>
                              )}
                              {v.staffName && (
                                <span className="text-slate-500 dark:text-slate-400">担当: {v.staffName}</span>
                              )}
                              {v.memo && (
                                <span className="text-slate-500 dark:text-slate-400">「{v.memo}」</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => { setEditingId(editingId === row.id ? null : row.id); setNameDraft(row.name); }}
                    >
                      <Pencil className="w-3.5 h-3.5" />お名前を直す
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      title={
                        row.visitDays > 0
                          ? `このカルテと、予約（来院${row.visitDays}日ぶん）を削除します`
                          : "このカルテを削除します"
                      }
                      className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50"
                      onClick={() => handleDelete(row)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {row.visitDays > 0 ? `削除（予約${row.visitDays}日ぶんも）` : "削除"}
                    </Button>
                  </div>
                </div>

                {editingId === row.id && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 px-3 py-2.5">
                    <Input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleRename(row.id); } }}
                      className="h-9 w-56"
                      autoFocus
                    />
                    <Button size="sm" disabled={busy} onClick={() => handleRename(row.id)}>保存</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>やめる</Button>
                  </div>
                )}

                {row.similar.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-2">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">似たお名前の方</p>
                    <div className="space-y-1.5">
                      {row.similar.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{s.name}</span>
                            {s.medicalRecordNumber && (
                              <span className="ml-2 text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.5 rounded-full tabular-nums">
                                No.{s.medicalRecordNumber}
                              </span>
                            )}
                            <span className="ml-2 text-xs text-indigo-600 dark:text-indigo-300">{s.reason}</span>
                            <div><VisitSummary c={s} /></div>
                            {s.recentVisits.length > 0 && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {s.recentVisits.slice(0, 2).map((v) => (
                                  `${formatVisitDate(v.date)} ${v.time}`
                                  + (v.courseName ? ` ${v.courseName}` : "")
                                )).join(" / ")}
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            className="gap-1.5 shrink-0"
                            onClick={() => handleMerge(row, s)}
                          >
                            <Merge className="w-3.5 h-3.5" />この方にまとめる
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
