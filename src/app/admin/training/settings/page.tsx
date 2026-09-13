"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronUp, ChevronDown, Plus, Loader2, Save, Eye, EyeOff, Trash2, Lock, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTrainingCatalog, saveTrainingCatalog, type TrainingCatalogSettings } from "@/app/actions/training";
import {
  CATALOG_KEY_RE, CATALOG_LIMITS, materializeRegionAxes,
  type Axis, type Region, type TrainingCatalog, type HomeExercise,
} from "@/lib/training-catalog";

/** 新しい軸・項目の key（保存済みの点数と紐づくので、一度決めたら変えない） */
function newKey(taken: Set<string>): string {
  for (;;) {
    const k = "c_" + Math.random().toString(36).slice(2, 10);
    if (CATALOG_KEY_RE.test(k) && !taken.has(k)) return k;
  }
}

const FLEX_AXIS = { label: "柔軟性", color: "#14b8a6", desc: "体のやわらかさ・動かせる範囲" };

/** よく使う項目（押すとそのまま追加。中身はあとで書き換えられる） */
const REGION_TEMPLATES: Omit<Region, "key" | "axes">[] = [
  { label: "前屈", group: "柔軟性", bilateral: false, hint: "立った姿勢で前にかがみ、指先が床にどこまで届くか", exercises: [{ name: "前屈ストレッチ", note: "息を吐きながら30秒×3" }] },
  { label: "後屈", group: "柔軟性", bilateral: false, hint: "腰に手を当てて、後ろにどこまで反れるか", exercises: [{ name: "キャット＆カウ", note: "ゆっくり10回" }] },
  { label: "開脚", group: "柔軟性", bilateral: false, hint: "座って脚を開き、前にどこまで倒れられるか", exercises: [{ name: "開脚ストレッチ", note: "30秒×3" }] },
  { label: "肩の柔軟性", group: "柔軟性", bilateral: true, hint: "背中の後ろで、上と下から手が届くか（左右それぞれ）", exercises: [{ name: "タオルストレッチ", note: "左右各30秒" }] },
];

/**
 * その項目で評価している軸を、明示したリストにする。
 * 🚨 非表示の軸も残す。落とすと、その軸の過去の点数が採点画面から消え、修正保存で消えてしまう（2026-09-14 検品指摘）。
 */
function effectiveAxes(r: Region, cat: TrainingCatalog): string[] {
  return materializeRegionAxes(r, cat);
}

export default function TrainingCatalogSettingsPage() {
  const [loaded, setLoaded] = useState<TrainingCatalogSettings | null>(null);
  const [draft, setDraft] = useState<TrainingCatalog | null>(null);
  const [saving, setSaving] = useState(false);
  const [openRegion, setOpenRegion] = useState<string | null>(null);

  const load = async () => {
    const res = await getTrainingCatalog();
    setLoaded(res);
    setDraft(structuredClone(res.catalog));
  };
  useEffect(() => { load().catch(() => toast.error("設定を読み込めませんでした")); }, []);

  const savedAxisKeys = useMemo(() => new Set(loaded?.catalog.axes.map((a) => a.key) ?? []), [loaded]);
  const savedRegionKeys = useMemo(() => new Set(loaded?.catalog.regions.map((r) => r.key) ?? []), [loaded]);
  const usedAxis = useMemo(() => new Set(loaded?.usedAxisKeys ?? []), [loaded]);
  const usedRegion = useMemo(() => new Set(loaded?.usedRegionKeys ?? []), [loaded]);
  /** 点数が入っている「項目key|軸key」。この組み合わせは項目から外させない */
  const usedPairs = useMemo(() => new Set(loaded?.usedPairKeys ?? []), [loaded]);
  const dirty = useMemo(() => !!loaded && !!draft && JSON.stringify(loaded.catalog) !== JSON.stringify(draft), [loaded, draft]);
  const canEdit = !!loaded?.canEdit;

  // 保存していない変更があるまま画面を離れようとしたら止める
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  if (!loaded || !draft) {
    return <div className="p-10 text-center text-slate-400 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />読み込み中…</div>;
  }

  const update = (fn: (d: TrainingCatalog) => TrainingCatalog) => setDraft((d) => (d ? fn(structuredClone(d)) : d));

  // ── 軸 ──
  /**
   * 軸を足した「次の設定」を作る。既存の項目に勝手に付かないよう、先に各項目の「今の軸」を明示してから足す。
   * 🚨 key は setDraft の更新関数の中で作らない。更新関数は後から実行されるので、
   *    呼び出し元に返した key が空のままになり、項目に空の軸が入る（2026-09-13 実機で発覚）。
   */
  const withNewAxis = (d: TrainingCatalog, label: string, color: string, desc: string): { next: TrainingCatalog; key: string } => {
    const next = structuredClone(d);
    next.regions = next.regions.map((r) => (r.axes && r.axes.length ? r : { ...r, axes: effectiveAxes(r, d) }));
    const key = newKey(new Set(next.axes.map((a) => a.key)));
    next.axes.push({ key, label, color, desc });
    return { next, key };
  };
  const addAxis = (label: string, color: string, desc: string): string => {
    const { next, key } = withNewAxis(draft, label, color, desc);
    setDraft(next);
    return key;
  };
  const setAxis = (key: string, patch: Partial<Axis>) => update((d) => {
    d.axes = d.axes.map((a) => (a.key === key ? { ...a, ...patch } : a));
    return d;
  });
  const moveAxis = (i: number, dir: -1 | 1) => update((d) => {
    const j = i + dir;
    if (j < 0 || j >= d.axes.length) return d;
    [d.axes[i], d.axes[j]] = [d.axes[j], d.axes[i]];
    return d;
  });
  const removeNewAxis = (key: string) => update((d) => {
    d.axes = d.axes.filter((a) => a.key !== key);
    d.regions = d.regions.map((r) => (r.axes ? { ...r, axes: r.axes.filter((k) => k !== key) } : r));
    return d;
  });

  // ── 項目 ──
  /** 項目を足す。柔軟性のひな形なら「柔軟性」の軸を使う（無ければ一緒に作る）。key はここで同期的に決める。 */
  const addRegion = (tpl?: Omit<Region, "key" | "axes">) => {
    let d = structuredClone(draft);
    let axes: string[];
    if (tpl?.group === "柔軟性") {
      const flex = d.axes.find((a) => a.label === FLEX_AXIS.label && !a.hidden);
      if (flex) {
        axes = [flex.key];
      } else {
        const created = withNewAxis(d, FLEX_AXIS.label, FLEX_AXIS.color, FLEX_AXIS.desc);
        d = created.next;
        axes = [created.key];
        toast.success("「柔軟性」の軸も一緒に追加しました");
      }
    } else {
      axes = d.axes.filter((a) => !a.hidden).map((a) => a.key);
    }
    const key = newKey(new Set(d.regions.map((r) => r.key)));
    const base: Region = tpl
      ? { ...structuredClone(tpl), key, axes }
      : { key, label: "", group: "その他", bilateral: true, axes, exercises: [] };
    d.regions.push(base);
    setDraft(d);
    setOpenRegion(key);
  };
  const setRegion = (key: string, patch: Partial<Region>) => update((d) => {
    d.regions = d.regions.map((r) => (r.key === key ? { ...r, ...patch } : r));
    return d;
  });
  const toggleRegionAxis = (key: string, axisKey: string) => {
    const r = draft.regions.find((x) => x.key === key);
    if (!r) return;
    const cur = effectiveAxes(r, draft);
    if (cur.includes(axisKey) && usedPairs.has(key + "|" + axisKey)) {
      toast.error("この項目のこの軸には過去の点数があるので外せません。使わない場合は、軸を「非表示」にしてください。");
      return;
    }
    const next = cur.includes(axisKey) ? cur.filter((k) => k !== axisKey) : [...cur, axisKey];
    if (next.length === 0) {
      toast.error("評価する軸は1つ以上えらんでください");
      return;
    }
    setRegion(key, { axes: draft.axes.map((a) => a.key).filter((k) => next.includes(k)) });
  };
  const moveRegion = (i: number, dir: -1 | 1) => update((d) => {
    const j = i + dir;
    if (j < 0 || j >= d.regions.length) return d;
    [d.regions[i], d.regions[j]] = [d.regions[j], d.regions[i]];
    return d;
  });
  const removeNewRegion = (key: string) => update((d) => {
    d.regions = d.regions.filter((r) => r.key !== key);
    return d;
  });
  const setExercises = (key: string, fn: (ex: HomeExercise[]) => HomeExercise[]) => update((d) => {
    d.regions = d.regions.map((r) => (r.key === key ? { ...r, exercises: fn([...(r.exercises ?? [])]) } : r));
    return d;
  });

  const save = async () => {
    const emptyAxis = draft.axes.find((a) => !a.label.trim());
    const emptyRegion = draft.regions.find((r) => !r.label.trim());
    if (emptyAxis || emptyRegion) {
      toast.error("名前が空の軸・項目があります。名前を入れるか、取り消してください。");
      if (emptyRegion) setOpenRegion(emptyRegion.key);
      return;
    }
    setSaving(true);
    const cleaned: TrainingCatalog = {
      axes: draft.axes,
      regions: draft.regions.map((r) => ({ ...r, exercises: (r.exercises ?? []).filter((e) => e.name.trim()) })),
    };
    const res = await saveTrainingCatalog(cleaned);
    setSaving(false);
    if (res.success) {
      toast.success("評価の項目を保存しました。次の採点から使えます。");
      await load();
    } else {
      toast.error(res.error ?? "保存に失敗しました");
    }
  };

  // 非表示の項目も含めて見る（同じ名前の項目が2つできると紛らわしい）
  const templateUsed = (label: string) => draft.regions.some((r) => r.label === label);

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-28">
      <div className="flex items-center gap-2">
        <Link href="/admin/training" className="p-2 -ml-2 rounded-lg active:bg-slate-100"><ChevronLeft className="w-5 h-5" /></Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold">評価の項目を設定</h1>
          <p className="text-xs text-slate-500">
            採点する「軸」（筋力・柔軟性など）と「項目」（足首・前屈など）を、この院に合わせて変えられます。
            {loaded.isCustom ? "" : "いまは標準の項目のままです。"}
          </p>
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 flex gap-2">
          <Lock className="w-4 h-4 shrink-0 mt-0.5" />
          <span>見ることはできますが、変更できるのはオーナーだけです。</span>
        </div>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 leading-relaxed">
        一度保存した軸・項目は、過去の点数とつながっているため削除できません。使わなくなったら「非表示」にしてください。
        非表示にすると新しい採点には出なくなり、過去の点数はグラフに残ります。
      </div>

      {/* 軸 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">評価の軸（点数をつける観点）</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {draft.axes.map((a, i) => {
            const isNew = !savedAxisKeys.has(a.key);
            return (
              <div key={a.key} className={`rounded-lg border p-2.5 ${a.hidden ? "bg-slate-50 opacity-70" : "bg-white"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="color" value={a.color} disabled={!canEdit}
                    onChange={(e) => setAxis(a.key, { color: e.target.value })}
                    className="w-9 h-9 rounded border shrink-0" aria-label={`${a.label || "新しい軸"}の色`}
                  />
                  <Input
                    value={a.label} disabled={!canEdit} maxLength={CATALOG_LIMITS.axisLabel}
                    onChange={(e) => setAxis(a.key, { label: e.target.value })}
                    placeholder="軸の名前（例: 柔軟性）" className="h-9 w-40 font-bold"
                  />
                  <Input
                    value={a.desc} disabled={!canEdit} maxLength={CATALOG_LIMITS.axisDesc}
                    onChange={(e) => setAxis(a.key, { desc: e.target.value })}
                    placeholder="説明（任意）" className="h-9 flex-1 min-w-[160px]"
                  />
                  {usedAxis.has(a.key) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">点数あり</span>}
                  {isNew && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-bold">未保存</span>}
                  {canEdit && (
                    <div className="flex items-center gap-0.5 ml-auto">
                      <button type="button" onClick={() => moveAxis(i, -1)} disabled={i === 0} className="p-1.5 rounded text-slate-400 disabled:opacity-30" aria-label="上へ"><ChevronUp className="w-4 h-4" /></button>
                      <button type="button" onClick={() => moveAxis(i, 1)} disabled={i === draft.axes.length - 1} className="p-1.5 rounded text-slate-400 disabled:opacity-30" aria-label="下へ"><ChevronDown className="w-4 h-4" /></button>
                      {isNew ? (
                        <button type="button" onClick={() => removeNewAxis(a.key)} className="p-1.5 rounded text-slate-400 hover:text-red-500" aria-label="追加を取り消す"><Trash2 className="w-4 h-4" /></button>
                      ) : (
                        <button type="button" onClick={() => setAxis(a.key, { hidden: !a.hidden })} className="px-2 py-1 rounded text-xs font-bold text-slate-600 bg-slate-100 inline-flex items-center gap-1">
                          {a.hidden ? <><Eye className="w-3.5 h-3.5" />表示する</> : <><EyeOff className="w-3.5 h-3.5" />非表示</>}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {canEdit && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => addAxis("", "#64748b", "")} disabled={draft.axes.length >= CATALOG_LIMITS.axes}>
                <Plus className="w-4 h-4 mr-1" />軸を追加
              </Button>
              {!draft.axes.some((a) => a.label === FLEX_AXIS.label) && (
                <Button type="button" variant="outline" size="sm" onClick={() => addAxis(FLEX_AXIS.label, FLEX_AXIS.color, FLEX_AXIS.desc)}>
                  <Sparkles className="w-4 h-4 mr-1" />「柔軟性」を追加
                </Button>
              )}
            </div>
          )}
          <p className="text-[11px] text-slate-400">軸を足しても、今ある項目には付きません。付けたい項目を開いて、下の「評価する軸」で選んでください。鍵のついた軸は過去の点数があるので、その項目からは外せません。</p>
        </CardContent>
      </Card>

      {/* 項目 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">評価する項目</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {draft.regions.map((r, i) => {
            const isNew = !savedRegionKeys.has(r.key);
            const open = openRegion === r.key;
            const current = effectiveAxes(r, draft);
            const axisOptions = draft.axes.filter((a) => !a.hidden || current.includes(a.key));
            return (
              <div key={r.key} className={`rounded-lg border ${r.hidden ? "bg-slate-50 opacity-70" : "bg-white"}`}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <button type="button" onClick={() => setOpenRegion(open ? null : r.key)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">{r.group || "その他"}</span>
                    <span className={`font-bold truncate ${r.label ? "" : "text-slate-400"}`}>{r.label || "（名前を入れてください）"}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{r.bilateral ? "左右" : "左右なし"}・{current.length}軸</span>
                    {usedRegion.has(r.key) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold shrink-0">点数あり</span>}
                    {isNew && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-bold shrink-0">未保存</span>}
                    {r.hidden && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 font-bold shrink-0">非表示</span>}
                  </button>
                  {canEdit && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button type="button" onClick={() => moveRegion(i, -1)} disabled={i === 0} className="p-1.5 rounded text-slate-400 disabled:opacity-30" aria-label="上へ"><ChevronUp className="w-4 h-4" /></button>
                      <button type="button" onClick={() => moveRegion(i, 1)} disabled={i === draft.regions.length - 1} className="p-1.5 rounded text-slate-400 disabled:opacity-30" aria-label="下へ"><ChevronDown className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>

                {open && (
                  <div className="border-t px-3 py-3 space-y-3">
                    <div className="grid sm:grid-cols-2 gap-2">
                      <label className="text-xs text-slate-500">項目の名前
                        <Input value={r.label} disabled={!canEdit} maxLength={CATALOG_LIMITS.regionLabel} onChange={(e) => setRegion(r.key, { label: e.target.value })} placeholder="例: 前屈" className="h-10 mt-1" />
                      </label>
                      <label className="text-xs text-slate-500">まとまり（表示の見出し）
                        <Input value={r.group} disabled={!canEdit} maxLength={CATALOG_LIMITS.group} onChange={(e) => setRegion(r.key, { group: e.target.value })} placeholder="例: 柔軟性" className="h-10 mt-1" />
                      </label>
                    </div>
                    <label className="text-xs text-slate-500 block">測り方の説明（採点画面に出ます）
                      <Input value={r.hint ?? ""} disabled={!canEdit} maxLength={CATALOG_LIMITS.hint} onChange={(e) => setRegion(r.key, { hint: e.target.value })} placeholder="例: 立った姿勢で前にかがみ、指先が床にどこまで届くか" className="h-10 mt-1" />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox" checked={r.bilateral} disabled={!canEdit || usedRegion.has(r.key)}
                        onChange={(e) => setRegion(r.key, { bilateral: e.target.checked })} className="w-4 h-4 accent-emerald-600"
                      />
                      左右を分けて測る
                      {usedRegion.has(r.key) && <span className="text-[11px] text-slate-400">（点数があるため変更できません）</span>}
                    </label>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">評価する軸</p>
                      <div className="flex flex-wrap gap-1.5">
                        {axisOptions.map((a) => {
                          const on = current.includes(a.key);
                          const locked = on && usedPairs.has(r.key + "|" + a.key);
                          return (
                            <button
                              key={a.key} type="button" disabled={!canEdit}
                              onClick={() => toggleRegionAxis(r.key, a.key)}
                              aria-pressed={on}
                              title={locked ? "過去の点数があるので、この項目からは外せません" : undefined}
                              className={`px-2.5 py-1 rounded-full text-xs font-bold border ${on ? "text-white border-transparent" : "bg-white text-slate-600 border-slate-200"}`}
                              style={on ? { backgroundColor: a.color } : undefined}
                            >
                              {a.label || "（名前なし）"}{a.hidden ? "（非表示）" : ""}
                              {locked && <Lock className="inline w-3 h-3 ml-1 -mt-0.5" aria-hidden />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">弱点に出たときの自宅トレーニング（宿題の候補）</p>
                      <div className="space-y-1.5">
                        {(r.exercises ?? []).map((ex, k) => (
                          <div key={k} className="flex gap-1.5">
                            <Input value={ex.name} disabled={!canEdit} maxLength={CATALOG_LIMITS.exerciseName} onChange={(e) => setExercises(r.key, (list) => { list[k] = { ...list[k], name: e.target.value }; return list; })} placeholder="メニュー名" className="h-9 w-40" />
                            <Input value={ex.note ?? ""} disabled={!canEdit} maxLength={CATALOG_LIMITS.exerciseNote} onChange={(e) => setExercises(r.key, (list) => { list[k] = { ...list[k], note: e.target.value }; return list; })} placeholder="回数・やり方（任意）" className="h-9 flex-1" />
                            {canEdit && <button type="button" onClick={() => setExercises(r.key, (list) => list.filter((_, idx) => idx !== k))} className="p-2 text-slate-400 hover:text-red-500" aria-label="このメニューを消す"><Trash2 className="w-4 h-4" /></button>}
                          </div>
                        ))}
                        {canEdit && (r.exercises ?? []).length < CATALOG_LIMITS.exercises && (
                          <button type="button" onClick={() => setExercises(r.key, (list) => [...list, { name: "" }])} className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1">
                            <Plus className="w-3.5 h-3.5" />メニューを追加
                          </button>
                        )}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex justify-end pt-1">
                        {isNew ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => removeNewRegion(r.key)}><Trash2 className="w-4 h-4 mr-1" />追加を取り消す</Button>
                        ) : (
                          <Button type="button" variant="outline" size="sm" onClick={() => setRegion(r.key, { hidden: !r.hidden })}>
                            {r.hidden ? <><Eye className="w-4 h-4 mr-1" />表示する</> : <><EyeOff className="w-4 h-4 mr-1" />非表示にする</>}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {canEdit && (
            <div className="pt-2 space-y-2">
              <Button type="button" variant="outline" size="sm" onClick={() => addRegion()} disabled={draft.regions.length >= CATALOG_LIMITS.regions}>
                <Plus className="w-4 h-4 mr-1" />項目を追加
              </Button>
              <div>
                <p className="text-[11px] text-slate-500 mb-1">よく使う項目から追加（あとで中身を書き換えられます）</p>
                <div className="flex flex-wrap gap-1.5">
                  {REGION_TEMPLATES.map((t) => (
                    <button
                      key={t.label} type="button" onClick={() => addRegion(t)} disabled={templateUsed(t.label)}
                      title={templateUsed(t.label) ? "同じ名前の項目があります（非表示なら、その項目を表示に戻してください）" : undefined}
                      className="px-2.5 py-1 rounded-full text-xs font-bold border border-emerald-200 bg-emerald-50 text-emerald-700 disabled:opacity-40"
                    >
                      ＋{t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 保存バー */}
      {canEdit && (
        <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-white/95 backdrop-blur border-t px-4 py-3 z-20">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="text-xs text-slate-500 shrink-0">{dirty ? "保存していない変更があります" : "変更はありません"}</div>
            <Button onClick={save} disabled={saving || !dirty} className="flex-1 h-12 text-base bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-1" />保存する</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
