"use client";

import { useEffect, useMemo, useState, useTransition, useCallback, useRef } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Save, RefreshCw, BarChart3, Coins, UserPlus, CalendarDays, CalendarPlus, CheckCircle2 } from "lucide-react";
import {
  getTallySheet,
  saveTallySheet,
  type TallyStaff,
  type TallyRow,
} from "@/app/actions/tally";
import { updateCheckinStatus, type CheckinStatus } from "@/app/actions/adminReserve";
import { AddAppointmentDialog } from "@/components/admin/AddAppointmentDialog";
import type { TallyColumn } from "@/lib/tally-columns";

type UIRow = {
  _id: number;
  customer_name: string;
  medical_record_number: string;
  minutes: string;
  staff_id: string | null;
  is_first_visit: boolean;
  amounts: Record<string, string>; // colKey -> 入力文字列
  variants: Record<string, string>; // colKey -> 選択された種別
  // 予約紐付け・受付ステータス（会計済の連動／次回予約に使用）
  appointment_id: string | null;
  customer_id: string | null;
  customer_phone: string;
  checkin_status: CheckinStatus;
};

let ROW_SEQ = 1;

function toUIRow(r: TallyRow): UIRow {
  const amounts: Record<string, string> = {};
  Object.entries(r.amounts ?? {}).forEach(([k, v]) => {
    // 0 も「入力済み」として保持する（自賠責など窓口0円を欠落させない）
    amounts[k] = v == null ? "" : String(v);
  });
  return {
    _id: ROW_SEQ++,
    customer_name: r.customer_name,
    medical_record_number: r.medical_record_number,
    minutes: r.minutes,
    staff_id: r.staff_id,
    is_first_visit: r.is_first_visit,
    amounts,
    variants: { ...(r.variants ?? {}) },
    appointment_id: r.appointment_id ?? null,
    customer_id: r.customer_id ?? null,
    customer_phone: r.customer_phone ?? "",
    checkin_status: (r.checkin_status ?? null) as CheckinStatus,
  };
}

function blankRow(): UIRow {
  return {
    _id: ROW_SEQ++,
    customer_name: "",
    medical_record_number: "",
    minutes: "",
    staff_id: null,
    is_first_visit: false,
    amounts: {},
    variants: {},
    appointment_id: null,
    customer_id: null,
    customer_phone: "",
    checkin_status: null,
  };
}

const yen = (n: number) => `¥${n.toLocaleString()}`;
const num = (s: string) => {
  const n = parseInt((s ?? "").replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};

// ───────── 列幅（ドラッグでリサイズ＋localStorageに保存） ─────────
// 各列ヘッダの右端をドラッグして幅を変えられる。変えた幅はこの端末に保存され、
// 次に開いたときも同じ幅で表示される。合計・新患・会計済・次回予約・削除は固定。
// 2026-08-04: 藤川先生の要望「横スライドせずに1画面で見たい」に合わせて既定幅を見直し。
// 担当と施術メニュー（物販含む）を従来の半分にした。既定幅の合計は約1141pxで、
// サイドバーのある管理画面でも横スクロールなしに収まる。
// ※ 幅は端末のlocalStorageに保存されるため、既定値を変えたら必ずキーの版数も上げること
//   （上げないと以前ドラッグ調整した端末に古い幅が残り、変更が反映されない）。
const WIDTHS_KEY = "tally-col-widths-v2";
const MIN_COL_W = 44;
const DEFAULT_COL_W = 56; // 施術メニュー・物販の既定幅（旧112の半分）
const DEFAULT_FIXED_W: Record<string, number> = {
  __name: 132, __mrn: 82, __min: 54, __staff: 49, // 担当は旧98の半分
  __total: 92, __new: 48, __done: 58, __next: 86, __del: 36,
};

export default function TallySheet({ initialDate }: { initialDate?: string }) {
  const [date, setDate] = useState<string>(
    initialDate || format(new Date(), "yyyy-MM-dd"),
  );
  const [columns, setColumns] = useState<TallyColumn[]>([]);
  const [staff, setStaff] = useState<TallyStaff[]>([]);
  const [rows, setRows] = useState<UIRow[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [isToday, setIsToday] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, startSaving] = useTransition();
  // 次回予約ダイアログ（対象行を1つだけ開く）
  const [nextReserveRow, setNextReserveRow] = useState<UIRow | null>(null);

  // 横スクロール同期：列が多くて1画面に収まらない時、表の上にも分かりやすいスライドバーを出す。
  // （行が多いと下端のスクロールバーまで遠いので、上からも横移動できるようにする）
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);

  // 列幅（緑=広げる/紫=狭める、を自由に。次回以降もこの端末で保持）
  const [widths, setWidths] = useState<Record<string, number>>(DEFAULT_FIXED_W);
  const widthsRef = useRef(widths);
  useEffect(() => { widthsRef.current = widths; }, [widths]);
  // 保存済みの幅を初期読み込み
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WIDTHS_KEY);
      if (raw) setWidths((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch {}
  }, []);
  // 動的な支払い列に既定幅を用意
  useEffect(() => {
    setWidths((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const c of columns) if (next[c.key] == null) { next[c.key] = DEFAULT_COL_W; changed = true; }
      return changed ? next : prev;
    });
  }, [columns]);

  const getW = useCallback(
    (id: string) => widths[id] ?? DEFAULT_FIXED_W[id] ?? DEFAULT_COL_W,
    [widths],
  );

  const resizing = useRef<{ id: string; startX: number; startW: number } | null>(null);
  const onResizeMove = useCallback((e: PointerEvent) => {
    const r = resizing.current;
    if (!r) return;
    const w = Math.max(MIN_COL_W, Math.round(r.startW + (e.clientX - r.startX)));
    setWidths((prev) => ({ ...prev, [r.id]: w }));
  }, []);
  const onResizeEnd = useCallback(() => {
    window.removeEventListener("pointermove", onResizeMove);
    window.removeEventListener("pointerup", onResizeEnd);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    resizing.current = null;
    try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(widthsRef.current)); } catch {}
  }, [onResizeMove]);
  const onResizeStart = useCallback(
    (id: string) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizing.current = { id, startX: e.clientX, startW: widthsRef.current[id] ?? DEFAULT_FIXED_W[id] ?? DEFAULT_COL_W };
      window.addEventListener("pointermove", onResizeMove);
      window.addEventListener("pointerup", onResizeEnd);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [onResizeMove, onResizeEnd],
  );
  // アンマウント時にドラッグ用リスナーが残らないように
  useEffect(() => () => {
    window.removeEventListener("pointermove", onResizeMove);
    window.removeEventListener("pointerup", onResizeEnd);
  }, [onResizeMove, onResizeEnd]);

  const resetWidths = useCallback(() => {
    setWidths({ ...DEFAULT_FIXED_W });
    try { localStorage.removeItem(WIDTHS_KEY); } catch {}
  }, []);

  const resizeHandle = (id: string) => (
    <span
      onPointerDown={onResizeStart(id)}
      className="absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none select-none z-10 hover:bg-indigo-400/50 active:bg-indigo-500/60"
      title="ドラッグで列幅を調整"
      aria-hidden
    />
  );

  const totalWidth = useMemo(() => {
    let w = getW("__name") + getW("__mrn") + getW("__min") + getW("__staff");
    for (const c of columns) w += getW(c.key);
    w += getW("__total") + getW("__new") + getW("__done") + getW("__next") + getW("__del");
    return w;
  }, [columns, getW]);

  // 表が画面幅に収まっているかを見て、収まっている時は上の横スライドバーを出さない
  // （既定幅なら1画面に収まるので、余計なバーが「まだ横に何かある」と誤解させないように）
  const [viewportW, setViewportW] = useState(0);
  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    const measure = () => setViewportW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);
  const needsHScroll = viewportW > 0 && totalWidth > viewportW + 1;

  const syncTopToTable = () => {
    if (tableScrollRef.current && topScrollRef.current) tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
  };
  const syncTableToTop = () => {
    if (tableScrollRef.current && topScrollRef.current) topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
  };

  const load = useCallback((d: string) => {
    setLoading(true);
    getTallySheet(d)
      .then((data) => {
        setColumns(data.columns);
        setStaff(data.staff);
        setIsOwner(data.isOwner);
        setIsToday(data.isToday);
        const ui = data.rows.map(toUIRow);
        // 入力しやすいよう常に末尾に空行を1つ用意
        ui.push(blankRow());
        setRows(ui);
      })
      .catch(() => toast.error("日計表の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const canEditDate = isOwner; // スタッフは当日のみ（日付固定）

  const updateRow = (id: number, patch: Partial<UIRow>) => {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  };
  const updateAmount = (id: number, key: string, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r._id === id ? { ...r, amounts: { ...r.amounts, [key]: value } } : r,
      ),
    );
  };
  const updateVariant = (id: number, key: string, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r._id === id ? { ...r, variants: { ...r.variants, [key]: value } } : r,
      ),
    );
  };
  const removeRow = (id: number) => setRows((prev) => prev.filter((r) => r._id !== id));
  const addRow = () => setRows((prev) => [...prev, blankRow()]);

  // 「会計済」トグル。予約に紐づく行は受付カウンターの checkin_status と連動。
  const toggleDone = (row: UIRow, done: boolean) => {
    const nextStatus: CheckinStatus = done ? "done" : "arrived";
    // 楽観的更新
    updateRow(row._id, { checkin_status: nextStatus });
    if (!row.appointment_id) {
      // 予約に紐づかない飛び込み行はこの画面内だけの印（カウンター連動なし）
      return;
    }
    updateCheckinStatus(row.appointment_id, nextStatus)
      .then((res) => {
        if (!res.success) {
          updateRow(row._id, { checkin_status: row.checkin_status }); // 失敗時ロールバック
          toast.error(res.error ?? "会計済の更新に失敗しました");
        }
      })
      .catch(() => {
        updateRow(row._id, { checkin_status: row.checkin_status });
        toast.error("会計済の更新に失敗しました");
      });
  };

  // 行合計
  const rowTotal = (r: UIRow) => columns.reduce((s, c) => s + num(r.amounts[c.key] ?? ""), 0);
  // 金額欄に何か入力されているか（"0" も入力済みとして扱う＝自賠責など窓口0円を計上対象に）
  const rowEntered = (r: UIRow) => columns.some((c) => (r.amounts[c.key] ?? "").trim() !== "");

  // 列ごとの小計
  const colSubtotals = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of columns) m[c.key] = rows.reduce((s, r) => s + num(r.amounts[c.key] ?? ""), 0);
    return m;
  }, [rows, columns]);

  const grandTotal = useMemo(
    () => Object.values(colSubtotals).reduce((s, v) => s + v, 0),
    [colSubtotals],
  );

  // 人数（名前あり＆金額あり）と新患。
  // 同じ人が同じ日に2行になることがある（保険→鍼灸を担当を分けて続けて入れた場合など）ので、
  // 行数ではなく「お名前の数」で数える。行数で数えると来院人数が水増しになる。
  const stats = useMemo(() => {
    const people = new Set<string>();
    const newPatients = new Set<string>();
    for (const r of rows) {
      const name = r.customer_name.trim();
      if (!name || !rowEntered(r)) continue;
      people.add(name);
      if (r.is_first_visit) newPatients.add(name);
    }
    return { people: people.size, newPatients: newPatients.size };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns]);

  const handleSave = () => {
    // 名前があり、いずれかの金額欄が入力済みの行だけ送る（"0" も計上対象。完全な空行は無視）
    const payload: TallyRow[] = rows
      .filter((r) => r.customer_name.trim() && rowEntered(r))
      .map((r) => {
        const amounts: Record<string, number> = {};
        const variants: Record<string, string> = {};
        for (const c of columns) {
          const cell = (r.amounts[c.key] ?? "").trim();
          if (cell === "") continue; // 未入力はスキップ／"0" は 0 円として登録
          amounts[c.key] = num(cell);
          const v = (r.variants[c.key] ?? "").trim();
          if (v) variants[c.key] = v;
        }
        return {
          customer_name: r.customer_name.trim(),
          medical_record_number: r.medical_record_number.trim(),
          minutes: r.minutes.trim(),
          staff_id: r.staff_id || null,
          is_first_visit: r.is_first_visit,
          amounts,
          variants,
        };
      });

    startSaving(async () => {
      const res = await saveTallySheet(date, payload);
      if (res.success) {
        toast.success(`日計表を保存しました（${res.saved ?? 0}件）`);
        load(date);
      } else {
        toast.error(res.error ?? "保存に失敗しました");
      }
    });
  };

  const saveButton = (
    <button
      type="button"
      onClick={handleSave}
      disabled={saving}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold shadow-md active:scale-95 transition-all disabled:opacity-60"
    >
      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      保存
    </button>
  );

  if (loading) {
    return (
      <div className="p-10 text-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin inline-block" /> 読み込み中...
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-5 max-w-[1280px] mx-auto">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">窓口日計表</h1>
            <p className="text-xs text-slate-500">受付・会計・次回予約までこの1画面で</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <CalendarDays className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={date}
              disabled={!canEditDate}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-200 outline-none disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            onClick={() => load(date)}
            className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700"
            title="再読み込み"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={resetWidths}
            className="hidden sm:inline-flex items-center px-2.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 text-xs font-medium"
            title="列の幅を初期状態に戻す"
          >
            列幅リセット
          </button>
          {isOwner && (
            <Link
              href="/admin/sales/analytics"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-300 text-sm font-medium hover:bg-indigo-100"
            >
              <BarChart3 className="w-4 h-4" /> データ分析
            </Link>
          )}
          {/* 保存は右上 */}
          {saveButton}
        </div>
      </div>

      {!isToday && !isOwner && (
        <p className="mb-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          当日以外の記帳はオーナーのみ可能です。
        </p>
      )}

      {/* 集計サマリ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-4 shadow">
          <p className="text-[11px] opacity-80">本日合計</p>
          <p className="text-2xl font-black tracking-tight">{yen(grandTotal)}</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
          <p className="text-[11px] text-slate-500">来院人数</p>
          <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{stats.people}<span className="text-sm font-medium text-slate-400 ml-1">名</span></p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-emerald-500" />
          <div>
            <p className="text-[11px] text-slate-500">うち新患</p>
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{stats.newPatients}<span className="text-sm font-medium text-slate-400 ml-1">名</span></p>
          </div>
        </div>
      </div>

      {/* 横スクロール用スライドバー（表の上）。列幅を広げて1画面に収まらない時だけ出す */}
      {needsHScroll && (
        <div
          ref={topScrollRef}
          onScroll={syncTopToTable}
          className="overflow-x-auto rounded-t-xl border border-b-0 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
          style={{ height: 16 }}
          aria-hidden
        >
          <div style={{ width: totalWidth, height: 1 }} />
        </div>
      )}

      {/* グリッド */}
      <div ref={tableScrollRef} onScroll={syncTableToTop} className={`overflow-x-auto border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm ${needsHScroll ? "rounded-b-2xl" : "rounded-2xl"}`}>
        <table className="text-sm border-collapse table-fixed" style={{ width: totalWidth, minWidth: totalWidth }}>
          <colgroup>
            <col style={{ width: getW("__name") }} />
            <col style={{ width: getW("__mrn") }} />
            <col style={{ width: getW("__min") }} />
            <col style={{ width: getW("__staff") }} />
            {columns.map((c) => (
              <col key={c.key} style={{ width: getW(c.key) }} />
            ))}
            <col style={{ width: getW("__total") }} />
            <col style={{ width: getW("__new") }} />
            <col style={{ width: getW("__done") }} />
            <col style={{ width: getW("__next") }} />
            <col style={{ width: getW("__del") }} />
          </colgroup>
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300">
              <th className="relative overflow-hidden px-2 py-2 text-left font-semibold sticky left-0 z-20 bg-slate-50 dark:bg-slate-900/50">
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap pr-1">名前</span>
                {resizeHandle("__name")}
              </th>
              <th className="relative overflow-hidden px-2 py-2 text-left font-semibold">
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap pr-1">カルテNo</span>
                {resizeHandle("__mrn")}
              </th>
              <th className="relative overflow-hidden px-2 py-2 text-center font-semibold">
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap">min</span>
                {resizeHandle("__min")}
              </th>
              <th className="relative overflow-hidden px-2 py-2 text-left font-semibold">
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap pr-1">担当</span>
                {resizeHandle("__staff")}
              </th>
              {columns.map((c) => (
                <th key={c.key} className="relative overflow-hidden px-1 py-2 text-right font-semibold text-[11px]" title={c.label}>
                  <span className="block overflow-hidden text-ellipsis whitespace-nowrap pr-1">{c.label}</span>
                  {resizeHandle(c.key)}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-semibold overflow-hidden">合計</th>
              <th className="px-1 py-2 text-center font-semibold overflow-hidden">新患</th>
              <th className="px-1 py-2 text-center font-semibold overflow-hidden">会計済</th>
              <th className="px-1 py-2 text-center font-semibold overflow-hidden">次回予約</th>
              <th className="px-1 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = rowTotal(r);
              const isDone = r.checkin_status === "done";
              return (
                <tr key={r._id} className={[
                  "border-t border-slate-100 dark:border-slate-700/50 hover:bg-slate-50/60 dark:hover:bg-slate-900/30",
                  isDone ? "bg-emerald-50/40 dark:bg-emerald-900/10" : "",
                ].join(" ")}>
                  <td className="px-1 py-1 sticky left-0 bg-white dark:bg-slate-800">
                    <input
                      value={r.customer_name}
                      onChange={(e) => updateRow(r._id, { customer_name: e.target.value })}
                      placeholder="お名前"
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      value={r.medical_record_number}
                      onChange={(e) => updateRow(r._id, { medical_record_number: e.target.value })}
                      inputMode="numeric"
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 outline-none focus:border-indigo-400"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      value={r.minutes}
                      onChange={(e) => updateRow(r._id, { minutes: e.target.value })}
                      inputMode="numeric"
                      className="w-full px-1 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-center text-slate-600 dark:text-slate-200 outline-none focus:border-indigo-400"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      value={r.staff_id ?? ""}
                      onChange={(e) => updateRow(r._id, { staff_id: e.target.value || null })}
                      className="w-full px-0.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-[11px] text-slate-600 dark:text-slate-300 outline-none focus:border-indigo-400"
                      title={staff.find((s) => s.id === r.staff_id)?.name ?? "担当を選択"}
                    >
                      <option value="">—</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </td>
                  {columns.map((c) => {
                    const hasVariants = (c.variants?.length ?? 0) > 0;
                    return (
                      <td key={c.key} className="px-1 py-1 align-top">
                        <div className="flex flex-col gap-1">
                          {hasVariants && (
                            <select
                              value={r.variants[c.key] ?? ""}
                              onChange={(e) => updateVariant(r._id, c.key, e.target.value)}
                              className="w-full px-0.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/60 text-[10px] text-slate-600 dark:text-slate-300 outline-none focus:border-indigo-400"
                              title={r.variants[c.key] ? `${c.label}：${r.variants[c.key]}` : "種別を選択"}
                            >
                              <option value="">種別</option>
                              {c.variants!.map((v) => (
                                <option key={v} value={v}>{v}</option>
                              ))}
                            </select>
                          )}
                          <input
                            value={r.amounts[c.key] ?? ""}
                            onChange={(e) => updateAmount(r._id, c.key, e.target.value)}
                            inputMode="numeric"
                            placeholder="0"
                            className="w-full px-1 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-right text-[13px] text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400"
                          />
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-right font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                    {total ? yen(total) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={r.is_first_visit}
                      onChange={(e) => updateRow(r._id, { is_first_visit: e.target.checked })}
                      className="w-4 h-4 accent-emerald-500"
                      title="新患"
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={(e) => toggleDone(r, e.target.checked)}
                      className="w-4 h-4 accent-indigo-600"
                      title={r.appointment_id ? "会計済（受付カウンターと連動）" : "会計済（この画面内の印）"}
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => setNextReserveRow(r)}
                      disabled={!r.customer_name.trim()}
                      className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700/50 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="次回予約を入れる"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      予約
                    </button>
                  </td>
                  <td className="px-1 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(r._id)}
                      className="p-1 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50"
                      title="行を削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* 小計フッター */}
          <tfoot>
            <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 font-bold text-slate-700 dark:text-slate-200">
              <td className="px-2 py-2.5 sticky left-0 bg-slate-50 dark:bg-slate-900/50" colSpan={4}>小計</td>
              {columns.map((c) => (
                <td key={c.key} className="px-1 py-2.5 text-right text-[11px] whitespace-nowrap overflow-hidden" title={c.label}>
                  {colSubtotals[c.key] ? yen(colSubtotals[c.key]) : <span className="text-slate-300">—</span>}
                </td>
              ))}
              <td className="px-2 py-2.5 text-right text-indigo-700 dark:text-indigo-300 whitespace-nowrap">{yen(grandTotal)}</td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* アクション */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-50"
        >
          <Plus className="w-4 h-4" /> 行を追加
        </button>
        {/* 下部にも保存（長い表でスクロールしても押せるように） */}
        {saveButton}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        ※ 保存するとこの日の日計表は入力内容で上書きされます。金額が入っていない行は登録されません。<br />
        ※「会計済」は予約のある方は受付カウンターの「会計完了」と連動します（金額の保存ボタンとは別に、その場で反映されます）。<br />
        ※ 各列の見出しの右端をドラッグすると列幅を変えられます。変えた幅はこの端末に保存され、次に開いたときも同じ幅になります（「列幅リセット」で初期化）。
      </p>

      {/* 次回予約ダイアログ（対象行の患者をプリフィル） */}
      {nextReserveRow && (
        <AddAppointmentDialog
          open={!!nextReserveRow}
          onOpenChange={(o) => { if (!o) setNextReserveRow(null); }}
          defaultName={nextReserveRow.customer_name || undefined}
          defaultPhone={nextReserveRow.customer_phone || undefined}
          defaultMedicalRecordNumber={nextReserveRow.medical_record_number || undefined}
          defaultCustomerId={nextReserveRow.customer_id || undefined}
          defaultStaffId={nextReserveRow.staff_id || undefined}
          defaultVisitType="return"
          hideTrigger
          onSuccess={() => {
            toast.success("次回予約を登録しました");
            setNextReserveRow(null);
          }}
        />
      )}
    </div>
  );
}
