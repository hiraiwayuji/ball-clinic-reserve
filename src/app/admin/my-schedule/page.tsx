"use client";

import { useEffect, useMemo, useState } from "react";
import {
  format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, addDays, isSameMonth,
} from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";
import {
  Loader2, CalendarClock, ChevronLeft, ChevronRight, AlertTriangle, Copy, Link2, CheckCircle2,
} from "lucide-react";
import {
  listShiftCoordination, getShiftAutoEnabled, setShiftAutoEnabled,
  getShiftPolicy, setShiftPolicy, generateShiftFromRequests, confirmShiftLeaves,
  type ShiftSubmission, type ShiftStaff,
} from "@/app/actions/staff-shift-requests";
import { Sparkles, RefreshCw, Wand2, Save, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// display_color（名前）→ 実際の色
const COLOR: Record<string, string> = {
  blue: "#3b82f6", sky: "#0ea5e9", indigo: "#6366f1", violet: "#8b5cf6", purple: "#a855f7",
  pink: "#ec4899", rose: "#f43f5e", red: "#ef4444", orange: "#f97316", amber: "#f59e0b",
  yellow: "#eab308", lime: "#84cc16", green: "#22c55e", emerald: "#10b981", teal: "#14b8a6", cyan: "#06b6d4",
  slate: "#64748b", gray: "#6b7280",
};
const colorOf = (c: string | null) => (c && COLOR[c]) || "#64748b";

export default function ShiftCoordinationPage() {
  const [month, setMonth] = useState<Date | null>(null);
  const [submissions, setSubmissions] = useState<ShiftSubmission[]>([]);
  const [unsubmitted, setUnsubmitted] = useState<ShiftStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [shiftUrl, setShiftUrl] = useState("");
  const [autoEnabled, setAutoEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    setMonth(addMonths(new Date(), 1));
    if (typeof window !== "undefined") setShiftUrl(`${window.location.origin}/shift-request`);
    getShiftAutoEnabled().then(setAutoEnabled).catch(() => {});
  }, []);

  const toggleAuto = async () => {
    const next = !autoEnabled;
    setAutoEnabled(next);
    const r = await setShiftAutoEnabled(next);
    if (!r.success) { setAutoEnabled(!next); toast.error(r.error ?? "切替に失敗しました"); }
    else toast.success(next ? "自動運用をオンにしました" : "自動運用をオフにしました");
  };

  // ── Phase3: 軸・AI生成・確定 ──
  const [policy, setPolicy] = useState("");
  const [policySaving, setPolicySaving] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [extra, setExtra] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => { getShiftPolicy().then(setPolicy).catch(() => {}); }, []);

  const savePolicy = async () => {
    setPolicySaving(true);
    const r = await setShiftPolicy(policy);
    setPolicySaving(false);
    toast[r.success ? "success" : "error"](r.success ? "方針を保存しました" : (r.error ?? "保存失敗"));
  };

  const genDraft = async (withExtra = false) => {
    setGenerating(true);
    if (!draftOpen) setDraftOpen(true);
    const r = await generateShiftFromRequests(monthStr, withExtra ? extra : undefined);
    setGenerating(false);
    if (r.success) setDraft(r.draftMarkdown ?? "");
    else { toast.error(r.error ?? "生成失敗"); if (!draft) setDraftOpen(false); }
  };

  const confirmLeaves = async () => {
    if (!confirm(`${month && format(month, "yyyy年M月", { locale: ja })}の「休み希望」の日を、予約に反映（その日は予約を受け付けない）します。よろしいですか？`)) return;
    setConfirming(true);
    const r = await confirmShiftLeaves(monthStr);
    setConfirming(false);
    if (r.success) toast.success(`確定しました（休み ${r.written ?? 0}件を予約ブロックに反映）`);
    else toast.error(r.error ?? "確定に失敗しました");
  };

  const monthStr = useMemo(
    () => (month ? `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}` : ""),
    [month],
  );

  useEffect(() => {
    if (!monthStr) return;
    setLoading(true);
    listShiftCoordination(monthStr)
      .then((r) => {
        if (r.success) { setSubmissions(r.submissions ?? []); setUnsubmitted(r.unsubmitted ?? []); }
        else toast.error(r.error ?? "取得に失敗しました");
      })
      .finally(() => setLoading(false));
  }, [monthStr]);

  const grid = useMemo(() => {
    if (!month) return [] as Date[];
    const s = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const e = startOfWeek(addDays(endOfMonth(month), 6), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: s, end: e });
  }, [month]);

  // 日付 → その日に出勤可能なスタッフ（色チップ用）
  const availByDate = useMemo(() => {
    const m = new Map<string, { name: string; color: string; start?: string; end?: string }[]>();
    for (const sub of submissions) {
      for (const [key, d] of Object.entries(sub.days)) {
        if (!d.available) continue;
        if (!m.has(key)) m.set(key, []);
        m.get(key)!.push({ name: sub.staffName, color: colorOf(sub.displayColor), start: d.start, end: d.end });
      }
    }
    return m;
  }, [submissions]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shiftUrl); toast.success("リンクをコピーしました"); }
    catch { toast.error("コピーできませんでした"); }
  };

  const total = submissions.length + unsubmitted.length;

  return (
    <div className="container mx-auto py-6 max-w-5xl space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-blue-500" />
            出勤調整
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            スタッフの出勤希望をまとめて確認。各日の出勤できる人を色で表示します。
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-1">
          <button onClick={() => setMonth((d) => (d ? addMonths(d, -1) : d))} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft className="w-4 h-4" /></button>
          <span className="px-2 text-sm font-bold min-w-[110px] text-center">{month && format(month, "yyyy年M月", { locale: ja })}</span>
          <button onClick={() => setMonth((d) => (d ? addMonths(d, 1) : d))} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* スタッフへ送るリンク */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <Link2 className="w-5 h-5 text-blue-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-blue-800 dark:text-blue-200">スタッフへ送る「出勤希望リンク」</p>
          <p className="text-xs text-blue-600/80 dark:text-blue-300/80 truncate">{shiftUrl}</p>
        </div>
        <button onClick={copyLink} className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold">
          <Copy className="w-4 h-4" />リンクをコピー
        </button>
      </div>

      {/* 自動運用トグル */}
      <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">自動運用</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">毎月1日に翌月分の案内、締切（2週間前）が近づくと未提出の方へ自動リマインド＋院長へ報告します。</p>
        </div>
        <button
          type="button"
          onClick={toggleAuto}
          disabled={autoEnabled === null}
          aria-pressed={!!autoEnabled}
          className={`shrink-0 w-14 h-8 rounded-full relative transition-colors disabled:opacity-50 ${autoEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
        >
          <span className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${autoEnabled ? "left-7" : "left-1"}`} />
        </button>
      </div>

      {/* 軸（方針）＋AIで出勤表を作る */}
      <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-violet-500" />
          <p className="font-bold text-violet-800 dark:text-violet-200">AIで出勤表を作る</p>
        </div>
        <label className="block">
          <span className="text-xs font-bold text-violet-700 dark:text-violet-300">出勤表の方針・軸（AIに渡します）</span>
          <textarea
            value={policy}
            onChange={(e) => setPolicy(e.target.value)}
            rows={3}
            placeholder="例：朝は森川・島田のどちらかを必ず。遅い時間はなるべく森藤。1日最低2名。土曜は3名以上。"
            className="mt-1.5 w-full rounded-xl border border-violet-200 dark:border-violet-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button onClick={savePolicy} disabled={policySaving} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-violet-300 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 text-sm font-bold disabled:opacity-50">
            <Save className="w-4 h-4" />{policySaving ? "保存中..." : "方針を保存"}
          </button>
          <button onClick={() => genDraft(false)} disabled={generating} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-black disabled:opacity-50">
            <Sparkles className="w-4 h-4" />AIで出勤表の案を作る
          </button>
        </div>
        <p className="text-[11px] text-violet-600/80 dark:text-violet-300/70">提出済みの出勤希望と上の方針から、{month && format(month, "M月", { locale: ja })}の出勤表案をAIが作ります。確定すると「休み希望」の日が予約に反映されます。</p>
      </div>

      {/* 未提出 */}
      {!loading && (
        unsubmitted.length > 0 ? (
          <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-700 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <span className="font-black text-amber-800 dark:text-amber-200">未提出 {unsubmitted.length}名</span>
              <span className="text-xs text-amber-600">/ 全{total}名中 {submissions.length}名提出済み</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {unsubmitted.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-amber-300 rounded-full px-3 py-1 text-sm font-bold text-slate-700 dark:text-slate-200">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorOf(s.display_color) }} />
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        ) : total > 0 ? (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 rounded-2xl p-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <span className="font-bold text-emerald-800 dark:text-emerald-200">全員提出済みです（{submissions.length}名）</span>
          </div>
        ) : null
      )}

      {/* 凡例（提出者の色） */}
      {submissions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {submissions.map((s) => (
            <span key={s.staffId} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
              <span className="w-3 h-3 rounded-full" style={{ background: colorOf(s.displayColor) }} />
              {s.staffName}
            </span>
          ))}
        </div>
      )}

      {/* カレンダー：各日の出勤可能スタッフ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 md:p-5">
        {loading ? (
          <div className="h-48 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {["月", "火", "水", "木", "金", "土", "日"].map((d, i) => (
              <div key={d} className={`text-center text-[11px] font-bold py-1 ${i === 5 ? "text-blue-500" : i === 6 ? "text-rose-500" : "text-slate-400"}`}>{d}</div>
            ))}
            {grid.map((date) => {
              const inMonth = month && isSameMonth(date, month);
              const key = format(date, "yyyy-MM-dd");
              const avail = availByDate.get(key) ?? [];
              return (
                <div key={key} className={`min-h-[84px] rounded-lg border p-1.5 ${inMonth ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700" : "bg-slate-50 dark:bg-slate-950 border-transparent"}`}>
                  <div className={`text-xs font-bold ${inMonth ? "text-slate-600 dark:text-slate-300" : "text-slate-300 dark:text-slate-700"}`}>{format(date, "d")}</div>
                  {inMonth && (
                    <div className="mt-1 space-y-0.5">
                      {avail.slice(0, 5).map((a, i) => (
                        <div key={i} className="flex items-center gap-1 text-[9px] leading-tight rounded px-1 py-0.5 font-bold text-white truncate" style={{ background: a.color }} title={`${a.name} ${a.start ?? ""}〜${a.end ?? ""}`}>
                          {a.name}
                        </div>
                      ))}
                      {avail.length > 5 && <div className="text-[9px] text-slate-400 font-bold">+{avail.length - 5}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 連絡事項 */}
      {submissions.some((s) => s.note) && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">連絡事項</p>
          {submissions.filter((s) => s.note).map((s) => (
            <div key={s.staffId} className="flex items-start gap-2 text-sm">
              <span className="inline-flex items-center gap-1 font-bold text-slate-700 dark:text-slate-200 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorOf(s.displayColor) }} />{s.staffName}
              </span>
              <span className="text-slate-500 dark:text-slate-400">{s.note}</span>
            </div>
          ))}
        </div>
      )}

      {/* AI出勤表案モーダル */}
      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              AI出勤表案（{month && format(month, "yyyy年M月", { locale: ja })}）
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {generating ? (
              <div className="h-56 flex flex-col items-center justify-center text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500 mb-3" />
                <p className="text-sm">出勤希望と方針から作成中... 数十秒かかります</p>
              </div>
            ) : draft ? (
              <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <pre className="whitespace-pre-wrap text-xs md:text-sm leading-relaxed text-slate-700 dark:text-slate-200">{draft}</pre>
              </div>
            ) : null}
          </div>
          {/* 相談（再生成）＋確定 */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-3 space-y-2">
            <div className="flex gap-2">
              <input
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder="相談・調整の指示（例：土曜をもう1名増やして）"
                className="flex-1 h-10 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm"
              />
              <button onClick={() => genDraft(true)} disabled={generating} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-violet-300 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/30 text-sm font-bold disabled:opacity-50 shrink-0">
                <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />相談・再生成
              </button>
            </div>
            <button
              onClick={confirmLeaves}
              disabled={confirming || !draft}
              className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black disabled:opacity-50"
            >
              {confirming ? "反映中..." : "この内容で確定（休み希望を予約に反映）"}
            </button>
            <p className="text-[11px] text-slate-400 text-center">確定すると、各スタッフが「休み希望」にした日が予約システムでブロックされます（出勤可・未入力の日は変更しません）。細かい調整は「スタッフ予定」画面でできます。</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
