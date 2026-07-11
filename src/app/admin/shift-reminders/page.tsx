"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";
import {
  Loader2, CalendarClock, MessageCircle, Plus, Trash2, Save, Link2, Copy, CheckCircle2, XCircle, Bell,
} from "lucide-react";
import {
  listShiftRounds, upsertShiftRound, deleteShiftRound, listStaffLineStatus,
  type ShiftRound, type StaffLineStatus,
} from "@/app/actions/shift-reminders";
import { getShiftAutoEnabled, setShiftAutoEnabled } from "@/app/actions/staff-shift-requests";

const COLOR: Record<string, string> = {
  blue: "#3b82f6", sky: "#0ea5e9", indigo: "#6366f1", violet: "#8b5cf6", purple: "#a855f7",
  pink: "#ec4899", rose: "#f43f5e", red: "#ef4444", orange: "#f97316", amber: "#f59e0b",
  yellow: "#eab308", lime: "#84cc16", green: "#22c55e", emerald: "#10b981", teal: "#14b8a6", cyan: "#06b6d4",
  slate: "#64748b", gray: "#6b7280",
};
const colorOf = (c: string | null) => (c && COLOR[c]) || "#64748b";

// deadline から1週間前を返す（YYYY-MM-DD）
function weekBefore(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 7));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

type Draft = { id?: string; label: string; periodStart: string; periodEnd: string; deadline: string; linkSendDate: string };
const EMPTY: Draft = { label: "", periodStart: "", periodEnd: "", deadline: "", linkSendDate: "" };

export default function ShiftRemindersPage() {
  const [enabled, setEnabled] = useState(false);
  const [rounds, setRounds] = useState<ShiftRound[]>([]);
  const [staff, setStaff] = useState<StaffLineStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [attendUrl, setAttendUrl] = useState("");

  const reload = async () => {
    const [r, s] = await Promise.all([listShiftRounds(), listStaffLineStatus()]);
    setRounds(r); setStaff(s);
  };

  useEffect(() => {
    if (typeof window !== "undefined") setAttendUrl(`${window.location.origin}/shift-request`);
    Promise.all([getShiftAutoEnabled(), listShiftRounds(), listStaffLineStatus()])
      .then(([en, r, s]) => { setEnabled(en); setRounds(r); setStaff(s); })
      .catch(() => toast.error("読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const toggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    const res = await setShiftAutoEnabled(next);
    if (res.success) toast.success(next ? "自動通知をオンにしました" : "自動通知をオフにしました");
    else { setEnabled(!next); toast.error(res.error ?? "切替に失敗しました"); }
  };

  const saveDraft = async () => {
    if (!draft.periodStart || !draft.periodEnd || !draft.deadline || !draft.linkSendDate) {
      toast.error("対象期間・締切・リンク配信日をすべて入力してください"); return;
    }
    setSaving(true);
    const res = await upsertShiftRound(draft);
    setSaving(false);
    if (res.success) { toast.success(draft.id ? "更新しました" : "追加しました"); setDraft(EMPTY); reload(); }
    else toast.error(res.error ?? "保存に失敗しました");
  };

  const remove = async (id: string) => {
    const res = await deleteShiftRound(id);
    if (res.success) { toast.success("削除しました"); reload(); }
    else toast.error(res.error ?? "削除に失敗しました");
  };

  const editRound = (r: ShiftRound) => {
    setDraft({ id: r.id, label: r.label ?? "", periodStart: r.periodStart, periodEnd: r.periodEnd, deadline: r.deadline, linkSendDate: r.linkSendDate });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const linkedCount = staff.filter((s) => s.linked).length;

  if (loading) {
    return <div className="max-w-3xl mx-auto p-10 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <Bell className="w-6 h-6 text-blue-600" />
        <h1 className="text-xl font-black text-slate-800">シフト希望の自動通知</h1>
      </div>

      {/* ON/OFF */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-slate-700">
            自動でお知らせ・催促を送る
            <span className="block text-[11px] font-normal text-slate-500">
              下で決めた「リンク配信日」に提出リンクを、締切前に未提出の人へ催促を自動送信します
            </span>
          </span>
          <button
            onClick={toggleEnabled}
            className={`relative w-12 h-7 rounded-full transition-colors ${enabled ? "bg-emerald-500" : "bg-slate-300"}`}
          >
            <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : ""}`} />
          </button>
        </label>
      </div>

      {/* 締切ラウンドの追加・編集 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-sm font-black text-slate-700">
          <CalendarClock className="w-4 h-4 text-slate-500" /> {draft.id ? "締切を編集" : "締切を追加"}
        </div>
        <p className="text-[11px] text-slate-500">
          例：8月前半 → 対象期間 8/1〜8/15・提出締切 7/5・リンク配信日 6/28（＝締切の1週間前）
        </p>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">名前（任意・例：8月前半）</span>
          <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="8月前半" className="mt-1 w-full h-10 rounded-xl border border-slate-300 px-3 text-sm bg-white" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <DateField label="対象期間（開始）" value={draft.periodStart} onChange={(v) => setDraft({ ...draft, periodStart: v })} />
          <DateField label="対象期間（終了）" value={draft.periodEnd} onChange={(v) => setDraft({ ...draft, periodEnd: v })} />
          <DateField
            label="提出締切"
            value={draft.deadline}
            onChange={(v) => setDraft((d) => ({ ...d, deadline: v, linkSendDate: d.linkSendDate || weekBefore(v) }))}
          />
          <DateField label="リンク配信日" value={draft.linkSendDate} onChange={(v) => setDraft({ ...draft, linkSendDate: v })} hint="通常は締切の1週間前" />
        </div>
        <div className="flex gap-2">
          <button onClick={saveDraft} disabled={saving}
            className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-black flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : draft.id ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {draft.id ? "更新する" : "この締切を追加"}
          </button>
          {draft.id && (
            <button onClick={() => setDraft(EMPTY)} className="h-11 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold">やめる</button>
          )}
        </div>
      </div>

      {/* 登録済みラウンド一覧 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 text-sm font-black text-slate-700">登録した締切</div>
        {rounds.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400 text-center">まだ締切が登録されていません。上のフォームから追加してください。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rounds.map((r) => (
              <li key={r.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    {r.label || `${r.periodStart.slice(5)}〜${r.periodEnd.slice(5)}`}
                    {r.status === "closed" && <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">終了</span>}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    対象 {fmt(r.periodStart)}〜{fmt(r.periodEnd)} ／ 締切 <span className="font-bold text-slate-700">{fmt(r.deadline)}</span> ／ リンク配信 {fmt(r.linkSendDate)}
                  </div>
                </div>
                <button onClick={() => editRound(r)} className="text-xs font-bold text-blue-600 hover:underline shrink-0">編集</button>
                <button onClick={() => remove(r.id)} className="text-slate-300 hover:text-rose-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* スタッフのLINE連携状況 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-black text-slate-700">
            <MessageCircle className="w-4 h-4 text-emerald-500" /> スタッフのLINE連携
          </div>
          <span className="text-xs font-bold text-slate-500">{linkedCount}/{staff.length}名 連携ずみ</span>
        </div>
        <p className="text-[11px] text-slate-500">
          連携ずみの人には各自のLINEに、未連携の人にはメールでお知らせが届きます。
          連携は各自が下のリンクを開き「LINEで受け取る」から行えます（1回だけ）。
        </p>
        <ul className="space-y-1.5">
          {staff.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorOf(s.displayColor) }} />
              <span className="flex-1 font-bold text-slate-700">{s.name}</span>
              {s.linked ? (
                <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />LINE連携ずみ</span>
              ) : (
                <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />未連携（メール）</span>
              )}
            </li>
          ))}
          {staff.length === 0 && <li className="text-sm text-slate-400">スタッフが登録されていません。</li>}
        </ul>
      </div>

      {/* 提出ページのリンク */}
      <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 text-sm">
        <div className="flex items-center gap-1.5 font-bold text-blue-700 mb-1"><Link2 className="w-3.5 h-3.5" /> スタッフ用の提出ページ</div>
        <p className="text-[11px] text-blue-600/80 mb-2">この画面で「LINEで受け取る」の連携もできます。スタッフに共有してください。</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate bg-white rounded-lg border border-blue-200 px-2 py-1.5 text-xs">{attendUrl}</code>
          <button
            onClick={async () => { try { await navigator.clipboard.writeText(attendUrl); toast.success("コピーしました"); } catch { toast.error("コピーできませんでした"); } }}
            className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> コピー</button>
        </div>
      </div>
    </div>
  );
}

function fmt(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return format(new Date(ymd + "T00:00:00+09:00"), "M/d(E)", { locale: ja });
}

function DateField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-10 rounded-xl border border-slate-300 px-3 text-sm bg-white" />
      {hint && <span className="block text-[10px] text-slate-400 mt-0.5">{hint}</span>}
    </label>
  );
}
