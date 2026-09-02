"use client";

import { useEffect, useMemo, useState, useTransition, useCallback, useRef } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Save, RefreshCw, BarChart3, Coins, UserPlus, CalendarDays, CalendarPlus, CheckCircle2, History, X, AlertTriangle } from "lucide-react";
import {
  getTallySheet,
  saveTallySheet,
  deleteTallyEntriesForName,
  getTallyChangeLog,
  type TallyStaff,
  type TallyRow,
  type TallyChangeLogEntry,
} from "@/app/actions/tally";
import { updateCheckinStatusMany, getMonthCrossingFirstVisits, type CheckinStatus } from "@/app/actions/adminReserve";
import { searchPatientsForBooking } from "@/app/actions/patientSearch";
import { updateSalePatientIdentity } from "@/app/actions/sales";
import { AddAppointmentDialog } from "@/components/admin/AddAppointmentDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TallyColumn } from "@/lib/tally-columns";
import { nameKey } from "@/lib/patient-count";

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
  // その行にまとまっている予約すべて（保険＋鍼灸など同じ人の同じ日の複数予約）
  appointment_ids: string[];
  customer_id: string | null;
  customer_phone: string;
  checkin_status: CheckinStatus;
  // 読み込み時のお名前（画面内だけの記録・送信対象外）。
  // スタッフがその場で名前を書き換えたときに「登録名も直しますか？」と聞くための元値。
  _originalName: string;
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
    appointment_ids: r.appointment_ids ?? (r.appointment_id ? [r.appointment_id] : []),
    customer_id: r.customer_id ?? null,
    customer_phone: r.customer_phone ?? "",
    checkin_status: (r.checkin_status ?? null) as CheckinStatus,
    _originalName: r.customer_name,
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
    appointment_ids: [],
    customer_id: null,
    customer_phone: "",
    checkin_status: null,
    _originalName: "",
  };
}

const yen = (n: number) => `¥${n.toLocaleString()}`;

/**
 * 金額欄の文字列を半角の数字だけにそろえる。
 * 全角数字（１５００）・全角や長音のマイナス（－ − ー）・カンマ・「円」「¥」・空白を吸収する。
 * 以前は全角数字がそのまま 0 扱いになり、画面では入っているのに保存すると消える
 * 「数字が静かに狂う」事故があった。
 */
const normalizeAmountText = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFKC")
    .replace(/[\u2212\u30FC\u2015\u2013\u2014]/g, "-")
    .replace(/[,，¥￥円\s]/g, "");

/** 金額欄の中身が「数字だけ」（先頭のマイナスは許す）か。空欄は未入力なので問題なし扱い */
const isValidAmountText = (v: string): boolean => {
  const t = normalizeAmountText(v);
  return t === "" || /^-?\d+$/.test(t);
};

const num = (s: string) => {
  const n = parseInt(normalizeAmountText(s), 10);
  return Number.isFinite(n) ? n : 0;
};

/** 金額欄のエラー文言（無ければ null）。マイナスと数字以外は保存させない */
const amountCellError = (v: string): string | null => {
  if ((v ?? "").trim() === "") return null;
  if (!isValidAmountText(v)) return "数字以外が入っています";
  if (num(v) < 0) return "マイナスは入れられません";
  return null;
};

/** 明示的に 0 が入っている欄か（未入力の空欄とは区別する） */
const isExplicitZero = (v: string): boolean =>
  normalizeAmountText(v) !== "" && amountCellError(v) === null && num(v) === 0;

/**
 * 「未保存の入力があるか」を見るための行の指紋。
 * 会計済チェック（その場で保存される）と画面内だけの値は含めない。
 */
function rowSignature(r: UIRow): string {
  const amounts: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.amounts)) {
    const t = normalizeAmountText(v);
    if (t !== "") amounts[k] = t;
  }
  const variants: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.variants)) if ((v ?? "").trim()) variants[k] = v.trim();
  return JSON.stringify({
    n: r.customer_name.trim(),
    m: r.medical_record_number.trim(),
    t: r.minutes.trim(),
    s: r.staff_id ?? null,
    f: r.is_first_visit,
    a: amounts,
    v: variants,
  });
}

/** 何も入っていない行（末尾の空行など）。未保存の判定から外す */
function isBlankRow(r: UIRow): boolean {
  return (
    r.customer_name.trim() === "" &&
    r.medical_record_number.trim() === "" &&
    r.minutes.trim() === "" &&
    !r.staff_id &&
    !r.is_first_visit &&
    !Object.values(r.amounts).some((v) => (v ?? "").trim() !== "")
  );
}

/** いちばん近いスクロールする親要素（管理画面は main がスクロールすることがある） */
function getScrollParent(el: HTMLElement | null): HTMLElement | Window {
  let cur = el?.parentElement ?? null;
  while (cur) {
    const oy = getComputedStyle(cur).overflowY;
    if ((oy === "auto" || oy === "scroll") && cur.scrollHeight > cur.clientHeight) return cur;
    cur = cur.parentElement;
  }
  return window;
}

/** 変更履歴1件を「保険施術: ¥1,500 → ¥1,800」のような行の配列にする（削除は変更後がnull） */
function changeLogLines(entry: TallyChangeLogEntry, columns: TallyColumn[]): string[] {
  const labelByKey = new Map(columns.map((c) => [c.key, c.label]));
  const beforeAmounts = entry.before?.amounts ?? {};
  const afterAmounts = entry.after?.amounts ?? {};
  const keys = new Set([...Object.keys(beforeAmounts), ...Object.keys(afterAmounts)]);
  const lines: string[] = [];
  for (const key of keys) {
    const b = beforeAmounts[key];
    const a = afterAmounts[key];
    if ((b ?? null) === (a ?? null)) continue;
    const label = labelByKey.get(key) ?? key;
    if (entry.action === "delete") {
      if (b != null) lines.push(`${label}: ${yen(b)}`);
    } else {
      lines.push(`${label}: ${b == null ? "（なし）" : yen(b)} → ${a == null ? "（なし）" : yen(a)}`);
    }
  }
  return lines;
}

// ───────── 列幅（ドラッグでリサイズ＋localStorageに保存） ─────────
// 各列ヘッダの右端をドラッグして幅を変えられる。変えた幅はこの端末に保存され、
// 次に開いたときも同じ幅で表示される。合計・新患・会計済・次回予約・削除は固定。
// 2026-08-04: 藤川先生の要望「横スライドせずに1画面で見たい」に合わせて既定幅を見直し。
// 担当と施術メニュー（物販含む）を従来の半分にした。既定幅の合計は約1141pxで、
// サイドバーのある管理画面でも横スクロールなしに収まる。
// ※ 幅は端末のlocalStorageに保存されるため、既定値を変えたら必ずキーの版数も上げること
//   （上げないと以前ドラッグ調整した端末に古い幅が残り、変更が反映されない）。
const WIDTHS_KEY = "tally-col-widths-v2";
const EDITOR_KEY = "tally-editor-staff-id";
const MIN_COL_W = 44;
const DEFAULT_COL_W = 56; // 施術メニュー・物販の既定幅（旧112の半分）
const DEFAULT_FIXED_W: Record<string, number> = {
  __name: 132, __mrn: 82, __min: 54, __staff: 49, // 担当は旧98の半分
  __total: 92, __new: 48, __done: 58, __next: 86, __del: 36,
};

export default function TallySheet({
  initialDate,
  focusName,
  focusAppointmentId,
}: {
  initialDate?: string;
  /** 受付カウンターの「日計表で会計」から来たときの、案内したい方のお名前 */
  focusName?: string;
  /** 同じく、その方の予約ID（こちらが優先。同姓同名でも間違えない） */
  focusAppointmentId?: string;
}) {
  const [date, setDate] = useState<string>(
    initialDate || format(new Date(), "yyyy-MM-dd"),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<TallyColumn[]>([]);
  const [monthCrossIds, setMonthCrossIds] = useState<Set<string>>(new Set());
  const [staff, setStaff] = useState<TallyStaff[]>([]);
  const [rows, setRows] = useState<UIRow[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [isToday, setIsToday] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, startSaving] = useTransition();
  // 次回予約ダイアログ（対象行を1つだけ開く）
  const [nextReserveRow, setNextReserveRow] = useState<UIRow | null>(null);

  // 当日以外を直すときに選んでもらう「操作した人」。ログインが共用アカウントの院もあり、
  // メールアドレスだけでは誰が直したか分からないため(2026-08-24 藤川先生の指摘)。
  // この端末の直近の選択を覚えておく（毎回選び直さなくていいように）。
  const [editorStaffId, setEditorStaffId] = useState<string>("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(EDITOR_KEY);
      if (saved) setEditorStaffId(saved);
    } catch {}
  }, []);
  const setEditorStaffIdPersist = useCallback((id: string) => {
    setEditorStaffId(id);
    try { localStorage.setItem(EDITOR_KEY, id); } catch {}
  }, []);
  const editorName = staff.find((s) => s.id === editorStaffId)?.name ?? "";

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

  // 読み込んだ時点（または保存した時点）の各行の指紋。これと今の行を比べて「未保存」を出す。
  // 行ごと（_id ごと）に持つので、飛び込み行を消しても他の行の未保存状態は消えない。
  const [baseline, setBaseline] = useState<Map<number, string>>(new Map());
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const load = useCallback((d: string, opts?: { silent?: boolean }) => {
    // silent: 保存直後の再読み込みなど。表を出したまま差し替える（画面が「読み込み中」に切り替わらない）
    if (!opts?.silent) setLoading(true);
    // 月またぎ（今月1回目）の予約IDを取って「月初」の印を出す。保険証確認・署名の見落とし防止。
    getMonthCrossingFirstVisits(`${d}T00:00:00+09:00`, `${d}T23:59:59+09:00`)
      .then((ids) => setMonthCrossIds(new Set(ids)))
      .catch(() => setMonthCrossIds(new Set()));
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
        setBaseline(new Map(ui.map((r) => [r._id, rowSignature(r)])));
      })
      .catch(() => toast.error("日計表の読み込みに失敗しました"))
      .finally(() => { if (!opts?.silent) setLoading(false); });
  }, []);

  useEffect(() => {
    load(date);
    setLastSavedAt(null);
  }, [date, load]);

  // 未保存の入力があるか（読み込み時／保存時の指紋と今の行を比べる）
  const isDirty = useMemo(() => {
    for (const r of rows) {
      const b = baseline.get(r._id);
      if (b == null) {
        if (!isBlankRow(r)) return true; // 追加した行に何か入っている
      } else if (b !== rowSignature(r)) {
        return true;
      }
    }
    return false;
  }, [rows, baseline]);

  // 未保存のままタブを閉じる・別ページへ移るときにブラウザの確認を出す
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const DISCARD_CONFIRM = "保存していない入力があります。捨てて進みますか？";
  const changeDate = (next: string) => {
    if (!next || next === date) return;
    if (isDirty && !confirm(DISCARD_CONFIRM)) return;
    setDate(next);
  };
  const reload = () => {
    if (isDirty && !confirm(DISCARD_CONFIRM)) return;
    load(date);
  };

  // ── 受付カウンターから来たときの案内（該当行へスクロール・数秒ハイライト・金額欄にフォーカス） ──
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());
  const firstAmountRefs = useRef(new Map<number, HTMLInputElement>());
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [focusBanner, setFocusBanner] = useState<{ name: string; found: boolean } | null>(null);
  const focusHandledRef = useRef(false);
  useEffect(() => {
    if (loading || focusHandledRef.current) return;
    if (!focusName && !focusAppointmentId) return;
    focusHandledRef.current = true;
    // 予約IDで探す（同姓同名でも間違えない）→ 無ければ名前（空白ゆれ込み）で探す
    let target: UIRow | undefined;
    if (focusAppointmentId) {
      target = rows.find((r) => r.appointment_id === focusAppointmentId || r.appointment_ids.includes(focusAppointmentId));
    }
    if (!target && focusName) {
      const k = nameKey(focusName);
      target = rows.find((r) => nameKey(r.customer_name) === k);
    }
    setFocusBanner({ name: (target?.customer_name || focusName || "").trim(), found: !!target });
    if (!target) return;
    const id = target._id;
    setHighlightId(id);
    requestAnimationFrame(() => {
      rowRefs.current.get(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
      firstAmountRefs.current.get(id)?.focus();
    });
    setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 2500);
  }, [loading, rows, focusName, focusAppointmentId]);

  // 記帳・修正・削除は誰でも、当日・過去日どちらもできる。その代わり、患者ごとに
  // 変わった内容をサーバー側で監査ログに残し、この画面から「変更履歴」で確認できる(2026-08-24)。
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<TallyChangeLogEntry[]>([]);

  const openHistory = useCallback(async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const entries = await getTallyChangeLog(date);
      setHistoryEntries(entries);
    } catch {
      toast.error("変更履歴の取得に失敗しました");
    } finally {
      setHistoryLoading(false);
    }
  }, [date]);

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

  // 行の削除ボタン。
  // ・予約に紐づく行（appointment_id あり）は、消してもその日の予約自体は残っているので
  //   次に開くとまた出てくる。誤解を防ぐため、ここでは金額欄だけ空に戻す。
  // ・予約に紐づかない行（飛び込み・手入力）は、保存済みのデータが残っていると
  //   前まで「表示から消えるだけで、保存データは残ったまま」だったため、
  //   次に開くとまた復活する不具合になっていた。ここで実際に保存データを消す。
  const handleDeleteRow = (row: UIRow) => {
    if (row.appointment_id) {
      if (!Object.values(row.amounts).some((v) => v.trim() !== "")) return; // 空なら何もしない
      // 以前は画面の金額欄を空にするだけで、保存しても「金額の無い行は送らない」ため
      // サーバーの記帳が残ったままだった（消したつもりが次に開くと復活する）。
      // ここでサーバーの記帳もその場で消す。行（予約）は残る。
      const serverName = (row._originalName || row.customer_name).trim();
      if (!isToday && !editorName) {
        toast.error("当日以外を消すときは、上の「操作者」でお名前を選んでください");
        return;
      }
      if (!confirm(`${row.customer_name || "この行"}様の金額を消しますか？\n（この日の予約は残るので、行自体は消えません）`)) return;
      startSaving(async () => {
        // カルテ番号は空でも "" で渡す（同姓同名で「番号なしの人」を見分けるため。null は「指定なし」の意味になる）
        const res = await deleteTallyEntriesForName(date, serverName, editorName || null, row.medical_record_number.trim());
        if (res.success && (res.deleted ?? 0) === 0) {
          // サーバーに消せる記帳が無かった（同姓同名の日に、カルテ番号の無い古い記帳が
          // 番号ありの人の行に出ている等）。画面だけ消すと「消したのに次に開くと戻る」になるので消さない。
          toast.error("消せる記帳が見つかりませんでした。画面を再読み込みして、もう一度お試しください");
          return;
        }
        if (res.success) {
          const cleared: UIRow = { ...row, amounts: {}, variants: {} };
          updateRow(row._id, { amounts: {}, variants: {} });
          // 消した状態を「保存済み」の基準にする（この行だけ）
          setBaseline((prev) => { const m = new Map(prev); m.set(row._id, rowSignature(cleared)); return m; });
          toast.success("金額を消しました（行は残ります）");
        } else {
          toast.error(res.error ?? "削除に失敗しました");
        }
      });
      return;
    }
    const name = row.customer_name.trim();
    const hasData = name !== "" || Object.values(row.amounts).some((v) => v.trim() !== "");
    if (!hasData) { removeRow(row._id); return; } // 空の行はそのまま消すだけ
    if (!isToday && !editorName) {
      toast.error("当日以外を削除するときは、上の「操作者」でお名前を選んでください");
      return;
    }
    if (!confirm(`${name}様の${isToday ? "本日" : date}の記帳を削除しますか？\n元に戻せません。`)) return;
    startSaving(async () => {
      const res = await deleteTallyEntriesForName(date, name, editorName || null, row.medical_record_number.trim());
      if (res.success) {
        removeRow(row._id);
        toast.success(`${name}様の記帳を削除しました`);
      } else {
        toast.error(res.error ?? "削除に失敗しました");
      }
    });
  };

  // 手入力した名前から患者マスタを引いて、カルテ番号を自動で入れる。
  // 同じ名前が複数いるときは特定できないので入れない（違う番号を入れる方が危ない）。
  // 名前がマスタに無いときは知らせる（カタカナと漢字で二重登録される事故を防ぐ）。
  const fillFromPatientMaster = async (id: number, rawName: string) => {
    const name = rawName.trim();
    const key = name.replace(/[\s　]/g, "");
    if (!key) return;
    const row = rows.find((r) => r._id === id);

    // その日の予約に紐づく行の名前を、元と違う表記に直したとき
    // （例: 予約時はカタカナ「ヒガシムラ　ミユ」で登録されていた方を、
    //   受付が漢字「東村 心愛」に打ち直した）。
    // そのまま保存すると、登録名（customers.name）はカタカナのままなので、
    // 次回はまた別人として日計表に2人分かれて出てきてしまう。
    // ここで「登録名も直しますか？」と確認し、直せば同じ人のまま統合される。
    if (row?.customer_id && row._originalName && row._originalName.trim() !== name) {
      const origKey = row._originalName.replace(/[\s　]/g, "");
      if (origKey !== key) {
        toast(`「${row._originalName}」様のお名前を「${name}」に直しますか？`, {
          description: "次回からもこの名前で表示されます（別人として2人に分かれなくなります）",
          duration: 15000,
          action: {
            label: "直す",
            onClick: () => {
              startSaving(async () => {
                const res = await updateSalePatientIdentity(row.customer_id!, name, row.medical_record_number || null);
                if (res.success) {
                  toast.success(`お名前を「${name}」に直しました`);
                  updateRow(id, { _originalName: name });
                } else {
                  toast.error(res.error ?? "変更に失敗しました");
                }
              });
            },
          },
          cancel: { label: "このままでいい", onClick: () => {} },
        });
      }
    }

    if (row?.medical_record_number.trim()) return;
    try {
      const patients = await searchPatientsForBooking(name);
      const exact = patients.filter((p) => p.name.replace(/[\s　]/g, "") === key);
      if (exact.length === 1 && exact[0].medicalRecordNumber) {
        updateRow(id, { medical_record_number: exact[0].medicalRecordNumber });
      } else if (exact.length === 0 && patients.length > 0) {
        toast.warning(
          `「${name}」は患者登録にありません。${patients.map((p) => p.name).slice(0, 3).join("・")} のことでしたら、そちらの表記で入れてください`,
        );
      }
    } catch {}
  };

  // 「会計済」トグル。予約に紐づく行は受付カウンターの checkin_status と連動。
  //
  // 同じ人が同じ日に保険＋鍼灸のように2件予約している日は、この行に予約が
  // 2件ぶらさがっている。1件だけ done にしても表示は「一番手前のステータス」を
  // 使うため未会計のままに戻ってしまうので、行の予約を全部まとめて更新する。
  // （2026-08-18 からだ鍼灸整骨院 藤川先生より「会計済にできない」の報告）
  const toggleDone = (row: UIRow, done: boolean) => {
    const nextStatus: CheckinStatus = done ? "done" : "arrived";
    // 楽観的更新
    updateRow(row._id, { checkin_status: nextStatus });
    const ids = row.appointment_ids.length > 0
      ? row.appointment_ids
      : row.appointment_id ? [row.appointment_id] : [];
    if (ids.length === 0) {
      // 予約に紐づかない飛び込み行は印を保存する先が無い（チェック自体を無効にしている）
      updateRow(row._id, { checkin_status: row.checkin_status });
      toast.error("予約のない方は会計済の印を保存できません");
      return;
    }
    updateCheckinStatusMany(ids, nextStatus)
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
      // 「布川紗帆」と「布川　紗帆」は同じ人。空白を無視して数える
      const name = r.customer_name.replace(/[\s　]/g, "");
      if (!name || !rowEntered(r)) continue;
      people.add(name);
      if (r.is_first_visit) newPatients.add(name);
    }
    return { people: people.size, newPatients: newPatients.size };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns]);

  // 同じ名前が2行以上ある（同姓同名、または同じ人を2行に分けた）名前。
  // その行にはカルテ番号を常時見せて、どちらの人か分かるようにする。
  const dupNameKeys = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of rows) {
      const k = nameKey(r.customer_name);
      if (!k) continue;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    return new Set(Array.from(count.entries()).filter(([, n]) => n >= 2).map(([k]) => k));
  }, [rows]);

  // 赤枠（マイナス・数字以外）の金額欄の数。1つでもあれば保存を止める
  const invalidCellCount = useMemo(() => {
    let n = 0;
    for (const r of rows) for (const c of columns) if (amountCellError(r.amounts[c.key] ?? "")) n++;
    return n;
  }, [rows, columns]);

  const handleSave = () => {
    if (!isToday && !editorName) {
      toast.error("当日以外を保存するときは、上の「操作者」でお名前を選んでください");
      return;
    }
    if (invalidCellCount > 0) {
      toast.error("赤枠の金額を直してください（マイナスや数字以外は入れられません）");
      return;
    }
    // 名前があり、いずれかの金額欄が入力済みの行だけ送る（"0" も計上対象。完全な空行は無視）
    const sentRows = rows.filter((r) => r.customer_name.trim() && rowEntered(r));
    const sentIds = new Set(sentRows.map((r) => r._id));
    const payload: TallyRow[] = sentRows
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

    // 同じ人（名前＋カルテ番号）が2行に分かれているとサーバー側で1つにまとめられるので、
    // そのときだけ表を読み直す。それ以外は表をそのまま残す（スクロール位置や入力中の場所が飛ばない）。
    const personKeys = payload.map((r) => `${nameKey(r.customer_name)}|${r.medical_record_number}`);
    const needsReload = new Set(personKeys).size !== personKeys.length;

    startSaving(async () => {
      const res = await saveTallySheet(date, payload, editorName || null);
      if (res.success) {
        const now = format(new Date(), "HH:mm");
        toast.success(`日計表を保存しました（${res.saved ?? 0}件・${now}）`);
        setLastSavedAt(now);
        // 表は読み直さず、「保存済み」の基準と読み込み時の名前だけ更新する。
        // 更新するのは実際にサーバーへ送った行だけ（名前や担当だけ入れて金額の無い行は
        // 保存されていないので「未保存」のまま残す）。
        setRows((prev) => prev.map((r) => (sentIds.has(r._id) ? { ...r, _originalName: r.customer_name.trim() } : r)));
        setBaseline((prev) => {
          const m = new Map(prev);
          for (const r of rows) if (sentIds.has(r._id)) m.set(r._id, rowSignature(r));
          return m;
        });
        if (needsReload) {
          // スクロール位置を覚えておいて、読み直したあと同じ場所に戻す
          const sp = getScrollParent(rootRef.current);
          const y = sp instanceof Window ? sp.scrollY : sp.scrollTop;
          const x = tableScrollRef.current?.scrollLeft ?? 0;
          load(date, { silent: true });
          setTimeout(() => {
            if (sp instanceof Window) sp.scrollTo({ top: y }); else sp.scrollTop = y;
            if (tableScrollRef.current) tableScrollRef.current.scrollLeft = x;
          }, 300);
        }
      } else {
        toast.error(res.error ?? "保存に失敗しました");
      }
    });
  };

  // 金額欄からフォーカスが外れたとき、全角や「円」を半角数字に直して書き戻す（見た目と保存が一致する）
  const normalizeAmountOnBlur = (id: number, key: string, raw: string) => {
    if ((raw ?? "").trim() === "") return;
    if (amountCellError(raw)) return; // 直せないものは赤枠のまま残す
    const fixed = String(num(raw));
    if (fixed !== raw) updateAmount(id, key, fixed);
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
    <div ref={rootRef} className="p-3 sm:p-5 max-w-[1280px] mx-auto">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">窓口日計表</h1>
            <p className="text-xs text-slate-500">金額の記帳と会計済チェック。来院・待合の管理は「受付」で</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <CalendarDays className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => changeDate(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-200 outline-none"
            />
          </div>
          {!isToday && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap">操作者</span>
              <select
                value={editorStaffId}
                onChange={(e) => setEditorStaffIdPersist(e.target.value)}
                className="bg-transparent text-sm font-medium text-amber-800 dark:text-amber-200 outline-none"
                title="当日以外を直すときは、操作した方のお名前を選んでください"
              >
                <option value="">お名前を選択</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={reload}
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
          <button
            type="button"
            onClick={openHistory}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-50"
            title="この日の記帳・削除の変更履歴を見る"
          >
            <History className="w-4 h-4" /> 変更履歴
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

      {!isToday && (
        <p className="mb-3 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
          当日以外の日を表示しています。保存・削除するときは、上の「操作者」でお名前を選んでください。
          ここでの記帳・修正・削除は「変更履歴」に記録され、スタッフが直したときは院長へLINEで届きます。
        </p>
      )}

      {/* 受付カウンターから来たときの案内 */}
      {focusBanner && (
        <div
          className={[
            "mb-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm",
            focusBanner.found
              ? "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-900/20 dark:border-amber-700/60 dark:text-amber-100"
              : "bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-900/20 dark:border-rose-700/60 dark:text-rose-100",
          ].join(" ")}
          role="status"
        >
          <span className="flex-1 leading-snug">
            {focusBanner.found ? (
              <>受付から来ました：<b className="text-base">{focusBanner.name}様</b> の金額を入れて「保存」を押してください</>
            ) : (
              <><b>{focusBanner.name || "その方"}様</b>の行が見つかりません。「行を追加」で入力してください</>
            )}
          </span>
          <button
            type="button"
            onClick={() => setFocusBanner(null)}
            className="shrink-0 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="閉じる"
            title="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 集計サマリ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-4 shadow">
          <p className="text-[11px] opacity-80">この日の合計</p>
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

      {/* 使い方の1行（受付の方が迷わないように） */}
      <p className="mb-2 text-[12px] text-slate-600 dark:text-slate-300">
        金額は「保存」で記帳、会計済チェックはその場で受付画面に反映されます。予約のない方（行を追加した方）は会計済の印を保存できません。
      </p>

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
              const isHighlighted = highlightId === r._id;
              const isDupName = !!nameKey(r.customer_name) && dupNameKeys.has(nameKey(r.customer_name));
              const hasAppointment = !!r.appointment_id || r.appointment_ids.length > 0;
              return (
                <tr
                  key={r._id}
                  ref={(el) => { if (el) rowRefs.current.set(r._id, el); else rowRefs.current.delete(r._id); }}
                  className={[
                    "border-t border-slate-100 dark:border-slate-700/50 hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition-colors duration-700",
                    isDone ? "bg-emerald-50/40 dark:bg-emerald-900/10" : "",
                    isHighlighted ? "!bg-yellow-100 dark:!bg-yellow-500/20 ring-2 ring-inset ring-yellow-400" : "",
                  ].join(" ")}
                >
                  <td className={["px-1 py-1 sticky left-0", isHighlighted ? "bg-yellow-100 dark:bg-yellow-500/20" : "bg-white dark:bg-slate-800"].join(" ")}>
                    {r.appointment_id && monthCrossIds.has(r.appointment_id) && (
                      <span
                        className="block text-[9px] font-black text-violet-700 dark:text-violet-300 leading-none mb-0.5"
                        title="先月から続けて来られている方の今月1回目です。保険証の確認と署名をお願いします"
                      >
                        ● 月初
                      </span>
                    )}
                    <input
                      value={r.customer_name}
                      onChange={(e) => updateRow(r._id, { customer_name: e.target.value })}
                      onBlur={(e) => fillFromPatientMaster(r._id, e.target.value)}
                      placeholder="お名前"
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400"
                    />
                    {isDupName && (
                      <span
                        className="mt-0.5 flex items-center gap-1 text-[10px] leading-tight text-amber-700 dark:text-amber-300"
                        title="同じ名前の方がこの日に2人以上います。カルテ番号でどちらの方か確かめてください"
                      >
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span className="truncate">同姓同名あり／カルテ {r.medical_record_number.trim() || "番号なし"}</span>
                      </span>
                    )}
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
                      <option value="">未選択</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </td>
                  {columns.map((c, ci) => {
                    const hasVariants = (c.variants?.length ?? 0) > 0;
                    const cellValue = r.amounts[c.key] ?? "";
                    const cellError = amountCellError(cellValue);
                    const zero = isExplicitZero(cellValue);
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
                              <option value="">未選択</option>
                              {c.variants!.map((v) => (
                                <option key={v} value={v}>{v}</option>
                              ))}
                            </select>
                          )}
                          <input
                            ref={ci === 0 ? (el) => { if (el) firstAmountRefs.current.set(r._id, el); else firstAmountRefs.current.delete(r._id); } : undefined}
                            value={cellValue}
                            onChange={(e) => updateAmount(r._id, c.key, e.target.value)}
                            onBlur={(e) => normalizeAmountOnBlur(r._id, c.key, e.target.value)}
                            inputMode="numeric"
                            placeholder="—"
                            aria-invalid={!!cellError}
                            title={cellError ?? (zero ? "0円（窓口負担なし）" : undefined)}
                            className={[
                              "w-full px-1 py-1.5 rounded-lg border text-right text-[13px] outline-none",
                              cellError
                                ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200 focus:border-rose-500"
                                : zero
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-700 focus:border-emerald-500"
                                  : "border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:border-indigo-400",
                            ].join(" ")}
                          />
                          {cellError && (
                            <span className="text-[9px] leading-tight text-rose-600 dark:text-rose-300">{cellError}</span>
                          )}
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
                      checked={hasAppointment ? isDone : false}
                      disabled={!hasAppointment}
                      onChange={(e) => toggleDone(r, e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={hasAppointment ? "会計済（その場で受付画面に反映されます）" : "予約のない方は印を保存できません"}
                    />
                    {!hasAppointment && (
                      <span className="block text-[9px] leading-tight text-slate-400" title="予約のない方は印を保存できません">保存不可</span>
                    )}
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
                      onClick={() => handleDeleteRow(r)}
                      disabled={saving}
                      className="p-1 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 disabled:opacity-40"
                      title={
                        r.appointment_id
                          ? "この方の金額を消します（保存済みの記帳もその場で消えます。予約は残るので行は消えません）"
                          : "この行の記帳を完全に削除します"
                      }
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
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" /> 行を追加
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        ※「保存」を押すと、金額の入っている行がこの日の日計表として記帳されます（入っていない行は登録されません）。<br />
        ※ ゴミ箱で金額を消すと、保存済みの記帳もその場で消えます（予約のある方は行が残ります）。<br />
        ※「会計済」は予約のある方の受付画面の「会計完了」と連動します（保存ボタンとは別に、その場で反映されます）。<br />
        ※ 各列の見出しの右端をドラッグすると列幅を変えられます。変えた幅はこの端末に保存され、次に開いたときも同じ幅になります（「列幅リセット」で初期化）。
      </p>

      {/* 画面下に貼りつく保存バー：合計・保存状態・保存ボタン（長い表でも迷わず押せる） */}
      <div className="sticky bottom-0 z-30 -mx-3 sm:-mx-5 mt-4 px-3 sm:px-5 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-700 shadow-[0_-6px_16px_rgba(15,23,42,0.08)]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <p className="text-[11px] text-slate-500 leading-none mb-1">この日の合計</p>
              <p className="text-xl font-black tracking-tight text-slate-800 dark:text-slate-100 leading-none">{yen(grandTotal)}</p>
            </div>
            {isDirty ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-600 text-white text-xs font-bold shadow-sm">
                ● 未保存
              </span>
            ) : lastSavedAt ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-700 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" /> 保存済み {lastSavedAt}
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 text-xs font-medium">
                変更なし
              </span>
            )}
            {invalidCellCount > 0 && (
              <span className="text-xs font-bold text-rose-600 dark:text-rose-300">赤枠の金額を直してください（{invalidCellCount}か所）</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={[
              "flex items-center gap-2 px-8 py-3 rounded-xl text-white text-base font-bold shadow-md active:scale-95 transition-all disabled:opacity-60",
              isDirty
                ? "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 ring-4 ring-indigo-200 dark:ring-indigo-800"
                : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700",
            ].join(" ")}
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            保存
          </button>
        </div>
      </div>

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

      {/* 変更履歴：この日の記帳・削除を誰が・いつ・どう変えたか */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-4 h-4" /> 変更履歴（{date}）
            </DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="py-8 text-center text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin inline-block" /> 読み込み中...
            </div>
          ) : historyEntries.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">この日にはまだ記帳・削除の履歴がありません。</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {historyEntries.map((entry) => {
                const lines = changeLogLines(entry, columns);
                return (
                  <li key={entry.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        {entry.customerName || "（お名前なし）"}様
                      </span>
                      <span className={[
                        "text-[11px] font-bold px-2 py-0.5 rounded-full",
                        entry.action === "delete"
                          ? "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300"
                          : "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300",
                      ].join(" ")}>
                        {entry.action === "delete" ? "削除" : "修正"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-2">
                      {new Date(entry.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {" ／ "}
                      {entry.editorName ? `${entry.editorName}さん` : (entry.actorEmail ?? "不明なユーザー")}
                    </p>
                    {lines.length > 0 ? (
                      <ul className="text-xs text-slate-600 dark:text-slate-300 flex flex-col gap-0.5">
                        {lines.map((line, i) => <li key={i}>{line}</li>)}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-400">（金額の変更なし）</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
