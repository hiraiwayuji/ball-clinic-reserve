"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, Plus, Loader2, Target, NotebookPen, Trash2, ChevronDown, ChevronUp,
  TrendingUp, Scale, Home, Users, AlertTriangle, Award,
} from "lucide-react";
import { getPatientTraining, deleteAssessment, getClinicBenchmark, type PatientTraining, type ClinicBenchmark } from "@/app/actions/training";
import {
  AXES, REGIONS, axesFor, sidesFor, cellKey, AXIS_LABEL, SIDE_LABEL,
  axisAverages, regionAverages, overallAverage, asymmetries, toScoreMap, diffLevel, scoreColor,
  growth, movers, daysBetween, resolveBaseline, nearestSession, PERIOD_PRESETS, gradeOf, weaknessScan,
  type Assessment, type AxisKey, type Growth, type Mover, type Weakness,
} from "@/lib/training-catalog";

const fmtDelta = (d: number | null): string => (d == null ? "–" : d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1));
const deltaColor = (d: number | null): string => (d == null ? "#cbd5e1" : d > 0.05 ? "#059669" : d < -0.05 ? "#dc2626" : "#64748b");

// ── SVG レーダーチャート（部位別の総合点） ──
function RadarChart({ data }: { data: { label: string; value: number }[] }) {
  const size = 260;
  const center = size / 2;
  const radius = size * 0.32;
  const n = data.length;
  const angleStep = (Math.PI * 2) / n;
  const pts = data.map((d, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = (Math.min(d.value, 10) / 10) * radius;
    return {
      x: center + r * Math.cos(angle), y: center + r * Math.sin(angle),
      lx: center + (radius + 26) * Math.cos(angle), ly: center + (radius + 16) * Math.sin(angle),
    };
  });
  const grid = [0.25, 0.5, 0.75, 1];
  return (
    <div className="relative w-full max-w-[320px] mx-auto aspect-square">
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {grid.map((lv, idx) => (
          <polygon key={idx} fill="none" stroke="#e2e8f0" strokeWidth="1"
            points={data.map((_, i) => {
              const a = i * angleStep - Math.PI / 2; const r = radius * lv;
              return `${center + r * Math.cos(a)},${center + r * Math.sin(a)}`;
            }).join(" ")} />
        ))}
        {data.map((_, i) => {
          const a = i * angleStep - Math.PI / 2;
          return <line key={i} x1={center} y1={center} x2={center + radius * Math.cos(a)} y2={center + radius * Math.sin(a)} stroke="#e2e8f0" strokeWidth="1" />;
        })}
        {n > 0 && <polygon points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(16,185,129,0.2)" stroke="#10b981" strokeWidth="2.5" />}
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#10b981" />)}
        {data.map((d, i) => (
          <text key={i} x={pts[i].lx} y={pts[i].ly} textAnchor="middle" className="text-[10px] font-bold fill-slate-500">{d.label}</text>
        ))}
      </svg>
    </div>
  );
}

// ── SVG 推移ライン（セッション全体平均） ──
function TrendLine({ series }: { series: { date: string; value: number }[] }) {
  const w = 640, h = 160, padL = 28, padR = 12, padT = 12, padB = 24;
  const n = series.length;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i * (w - padL - padR)) / (n - 1));
  const y = (v: number) => padT + (1 - v / 10) * (h - padT - padB);
  const line = series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(s.value)}`).join(" ");
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[420px]" style={{ height: h }}>
        {[0, 2, 4, 6, 8, 10].map((g) => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={w - padR} y2={y(g)} stroke="#f1f5f9" strokeWidth="1" />
            <text x={4} y={y(g) + 3} className="text-[9px] fill-slate-400">{g}</text>
          </g>
        ))}
        <path d={line} fill="none" stroke="#10b981" strokeWidth="2.5" />
        {series.map((s, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(s.value)} r="4" fill="#10b981" />
            <text x={x(i)} y={h - 8} textAnchor="middle" className="text-[9px] fill-slate-400">{s.date.slice(5)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function PatientTrainingPage() {
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId;

  const [data, setData] = useState<PatientTraining | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [benchmark, setBenchmark] = useState<ClinicBenchmark | null>(null);
  // 期間指定（比較の基準）
  const [periodKey, setPeriodKey] = useState<string>("prev");
  const [useCustom, setUseCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, b] = await Promise.all([getPatientTraining(customerId), getClinicBenchmark(customerId)]);
      setData(d);
      setBenchmark(b);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const latest = data?.assessments[0] ?? null;
  const radarData = useMemo(
    () => (latest ? regionAverages(latest.measurements).filter((r) => r.value != null).map((r) => ({ label: r.label, value: r.value as number })) : []),
    [latest],
  );
  const axisAvg = useMemo(() => (latest ? axisAverages(latest.measurements) : null), [latest]);
  const asym = useMemo(() => (latest ? asymmetries(latest.measurements) : []), [latest]);
  const trend = useMemo(() => {
    if (!data) return [];
    return [...data.assessments]
      .reverse()
      .map((a) => ({ date: a.assessed_on, value: overallAverage(a.measurements) }))
      .filter((s): s is { date: string; value: number } => s.value != null);
  }, [data]);

  // 期間指定の成長分析（基準セッション from → 比較 to）
  const period = useMemo(() => {
    const A = data?.assessments ?? [];
    if (A.length < 2 || !latest) return null;
    let from: Assessment | null;
    let to: Assessment = latest;
    if (useCustom) {
      from = customFrom ? nearestSession(A, customFrom) : A[A.length - 1];
      if (customTo) to = nearestSession(A, customTo) ?? latest;
    } else {
      from = resolveBaseline(A, periodKey);
    }
    if (!from || from.id === to.id) return { from: null, to, g: null as Growth | null, movers: [] as Mover[], span: null as string | null };
    return {
      from, to,
      g: growth(from, to),
      movers: movers(from, to),
      span: `${from.assessed_on} → ${to.assessed_on}（${daysBetween(from.assessed_on, to.assessed_on)}日）`,
    };
  }, [data, latest, periodKey, useCustom, customFrom, customTo]);

  // 弱点スキャン（最新 vs 前回）
  const weaknesses = useMemo(() => {
    const A = data?.assessments ?? [];
    if (!latest) return [] as Weakness[];
    return weaknessScan(latest, A[1] ?? null);
  }, [data, latest]);

  const handleDelete = async (id: string) => {
    if (!confirm("この評価を削除しますか？（元に戻せません）")) return;
    const res = await deleteAssessment(id);
    if (res.success) { toast.success("削除しました"); load(); }
    else toast.error(res.error ?? "削除に失敗しました");
  };

  if (loading) {
    return <div className="p-10 text-center text-slate-400 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />読み込み中…</div>;
  }
  if (!data) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12 space-y-3">
        <p className="text-slate-500">患者が見つかりませんでした。</p>
        <Link href="/admin/training" className="text-emerald-600 underline">一覧へ戻る</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-10">
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/admin/training" className="p-2 -ml-2 rounded-lg active:bg-slate-100"><ChevronLeft className="w-5 h-5" /></Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{data.patient.name} さん</h1>
            <p className="text-xs text-slate-500">評価 {data.assessments.length} 回</p>
          </div>
        </div>
        <Link href={`/admin/training/${customerId}/new`}>
          <Button className="h-11 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4 mr-1" />新規評価</Button>
        </Link>
      </div>

      {data.assessments.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-slate-500 text-sm">
          まだ評価がありません。「新規評価」から最初の採点をはじめましょう。
        </CardContent></Card>
      ) : (
        <>
          {/* 3軸サマリー（最新） */}
          {axisAvg && (
            <div className="grid grid-cols-3 gap-2">
              {AXES.map((a) => {
                const v = axisAvg[a.key];
                return (
                  <Card key={a.key}>
                    <CardContent className="py-3 px-3 text-center">
                      <div className="text-xs text-slate-500">{a.label}</div>
                      <div className="text-2xl font-black" style={{ color: v != null ? scoreColor(v) : "#cbd5e1" }}>
                        {v != null ? v.toFixed(1) : "–"}
                      </div>
                      <div className="text-[10px] text-slate-400">/ 10</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* 他者比較（ランク＋みんなの平均） */}
          {benchmark && axisAvg && (
            <BenchmarkPanel bench={benchmark} myAxis={axisAvg} />
          )}

          {/* 期間で見る伸び（期間指定） */}
          {period && (
            <PeriodGrowthPanel
              period={period}
              periodKey={periodKey}
              setPeriodKey={(k) => { setPeriodKey(k); setUseCustom(false); }}
              useCustom={useCustom}
              setUseCustom={setUseCustom}
              customFrom={customFrom} setCustomFrom={setCustomFrom}
              customTo={customTo} setCustomTo={setCustomTo}
            />
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {/* レーダー */}
            {radarData.length >= 3 && (
              <Card>
                <CardHeader className="pb-0"><CardTitle className="text-sm flex items-center gap-1.5"><TrendingUp className="w-4 h-4" />部位別バランス（最新 {latest?.assessed_on}）</CardTitle></CardHeader>
                <CardContent><RadarChart data={radarData} /></CardContent>
              </Card>
            )}

            {/* 左右差 */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Scale className="w-4 h-4" />左右差（最新）</CardTitle></CardHeader>
              <CardContent className="space-y-2.5">
                {asym.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">左右そろった測定がまだありません</p>
                ) : (
                  asym.slice(0, 8).map((a, i) => {
                    const lvl = diffLevel(a.diff);
                    const barColor = lvl === "bad" ? "#ef4444" : lvl === "warn" ? "#f59e0b" : "#10b981";
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="font-medium">{a.label}・{a.axisLabel}</span>
                          <span className="font-bold" style={{ color: barColor }}>
                            差 {a.diff}{a.diff > 0 ? `（${a.higher === "left" ? "左" : "右"}が上）` : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <span className="w-4 shrink-0">左</span>
                          <div className="flex-1 h-2 bg-slate-100 rounded"><div className="h-full rounded" style={{ width: `${a.left * 10}%`, backgroundColor: scoreColor(a.left) }} /></div>
                          <span className="w-4 text-right">{a.left}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                          <span className="w-4 shrink-0">右</span>
                          <div className="flex-1 h-2 bg-slate-100 rounded"><div className="h-full rounded" style={{ width: `${a.right * 10}%`, backgroundColor: scoreColor(a.right) }} /></div>
                          <span className="w-4 text-right">{a.right}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {/* 推移 */}
          {trend.length >= 2 && (
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm flex items-center gap-1.5"><TrendingUp className="w-4 h-4" />総合点の推移</CardTitle></CardHeader>
              <CardContent><TrendLine series={trend} /></CardContent>
            </Card>
          )}

          {/* 弱点と自宅トレーニング */}
          {weaknesses.length > 0 && <WeaknessPanel items={weaknesses} />}

          {/* 履歴（宿題・目標・メモ） */}
          <div>
            <h2 className="text-sm font-bold text-slate-500 mb-2">評価の履歴</h2>
            <div className="space-y-2">
              {data.assessments.map((a) => (
                <HistoryCard
                  key={a.id}
                  a={a}
                  open={openId === a.id}
                  onToggle={() => setOpenId(openId === a.id ? null : a.id)}
                  onDelete={() => handleDelete(a.id)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// 他者比較（評価ランク＋みんなの平均・順位）
function BenchmarkPanel({ bench, myAxis }: { bench: ClinicBenchmark; myAxis: Record<AxisKey, number | null> }) {
  const g = gradeOf(bench.myOverall);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Users className="w-4 h-4" />みんなとの比較（院内 {bench.nPatients} 人）</CardTitle></CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-black text-white" style={{ background: g.color }}>{g.label}</div>
            <div>
              <div className="text-xs text-slate-500">総合点</div>
              <div className="text-2xl font-black leading-none" style={{ color: bench.myOverall != null ? scoreColor(bench.myOverall) : "#cbd5e1" }}>{bench.myOverall ?? "–"}<span className="text-sm text-slate-400 font-normal"> / 10</span></div>
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <div><div className="text-xs text-slate-500">みんなの平均</div><div className="text-lg font-bold">{bench.overallAvg ?? "–"}</div></div>
            {bench.rank != null && <div><div className="text-xs text-slate-500">順位</div><div className="text-lg font-bold">{bench.rank}<span className="text-xs text-slate-400"> / {bench.nPatients}位</span></div></div>}
            {bench.percentile != null && <div><div className="text-xs text-slate-500">上位</div><div className="text-lg font-bold">{bench.percentile}%</div></div>}
          </div>
        </div>
        {/* 軸別: この子 vs 平均 */}
        <div className="space-y-2.5">
          {AXES.map((a) => {
            const mine = myAxis[a.key];
            const avg = bench.axisAvg[a.key];
            const gr = gradeOf(mine);
            return (
              <div key={a.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium flex items-center gap-1.5">{a.label}<span className="text-[10px] px-1.5 rounded font-bold text-white" style={{ background: gr.color }}>{gr.label}</span></span>
                  <span className="text-slate-500">この子 <b style={{ color: mine != null ? scoreColor(mine) : "#cbd5e1" }}>{mine != null ? mine.toFixed(1) : "–"}</b> / 平均 {avg != null ? avg.toFixed(1) : "–"}</span>
                </div>
                <div className="relative h-2.5 bg-slate-100 rounded">
                  <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${(mine ?? 0) * 10}%`, background: a.color }} />
                  {avg != null && <div className="absolute inset-y-0 w-0.5 bg-slate-500" style={{ left: `calc(${avg * 10}% - 1px)` }} title="みんなの平均" />}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-400 mt-2">縦線＝みんなの平均。A〜Dは点数のランク（S:9+ / A:7.5+ / B:6+ / C:4.5+ / D）。</p>
      </CardContent>
    </Card>
  );
}

// 期間で見る伸び（期間指定 + その期間の伸び + 項目別）
type PeriodData = { from: Assessment | null; to: Assessment; g: Growth | null; movers: Mover[]; span: string | null };
function PeriodGrowthPanel({
  period, periodKey, setPeriodKey, useCustom, setUseCustom,
  customFrom, setCustomFrom, customTo, setCustomTo,
}: {
  period: PeriodData; periodKey: string; setPeriodKey: (k: string) => void;
  useCustom: boolean; setUseCustom: (b: boolean) => void;
  customFrom: string; setCustomFrom: (s: string) => void; customTo: string; setCustomTo: (s: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><TrendingUp className="w-4 h-4" />期間で見る伸び</CardTitle></CardHeader>
      <CardContent>
        {/* 期間セレクタ */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {PERIOD_PRESETS.map((p) => (
            <button key={p.key} onClick={() => setPeriodKey(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${!useCustom && periodKey === p.key ? "bg-emerald-600 text-white border-transparent" : "bg-white text-slate-600 border-slate-200"}`}>
              {p.label}
            </button>
          ))}
          <button onClick={() => setUseCustom(!useCustom)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${useCustom ? "bg-emerald-600 text-white border-transparent" : "bg-white text-slate-600 border-slate-200"}`}>
            カスタム
          </button>
        </div>
        {useCustom && (
          <div className="flex items-center gap-2 mb-3 text-xs">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="border rounded-lg px-2 py-1.5" />
            <span className="text-slate-400">→</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="border rounded-lg px-2 py-1.5" />
            <span className="text-slate-400">（未指定は最新）</span>
          </div>
        )}

        {!period.g ? (
          <p className="text-xs text-slate-400 py-4 text-center">この期間の基準になる評価がありません</p>
        ) : (
          <>
            <div className="text-[11px] text-slate-400 mb-2">{period.span}</div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
              <div>
                <div className="text-xs text-slate-500">総合の伸び</div>
                <div className="text-3xl font-black leading-none" style={{ color: deltaColor(period.g.overall) }}>{fmtDelta(period.g.overall)}</div>
              </div>
              <div className="flex gap-4">
                {AXES.map((a) => (
                  <div key={a.key}><div className="text-xs text-slate-500">{a.label}</div><div className="text-lg font-bold" style={{ color: deltaColor(period.g!.axes[a.key]) }}>{fmtDelta(period.g!.axes[a.key])}</div></div>
                ))}
              </div>
            </div>
            <MoversPanel movers={period.movers} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// 弱点と自宅トレーニング
function WeaknessPanel({ items }: { items: Weakness[] }) {
  const top = items.slice(0, 5);
  const tagStyle = (reason: string) =>
    reason.startsWith("低スコア") ? "bg-red-50 text-red-600"
    : reason.startsWith("左右差") ? "bg-amber-50 text-amber-600"
    : "bg-orange-50 text-orange-600";
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-500" />弱点と自宅トレーニング（宿題の候補）</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {top.map((w, i) => (
          <div key={i} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="font-bold text-sm">{w.label}・{w.axisLabel}</span>
              <span className="text-xs font-bold" style={{ color: scoreColor(w.score) }}>{w.score}点</span>
              {w.reasons.map((r, j) => <span key={j} className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${tagStyle(r)}`}>{r}</span>)}
            </div>
            <div className="flex items-start gap-1.5 text-xs">
              <Home className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {w.exercises.map((ex, k) => (
                  <span key={k} className="text-slate-600"><b className="text-slate-700">{ex.name}</b>{ex.note ? <span className="text-slate-400">（{ex.note}）</span> : null}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
        <p className="text-[10px] text-slate-400">低スコア・左右差・前回からの低下を自動抽出。メニューは院で調整できます。</p>
      </CardContent>
    </Card>
  );
}

// 前回からの項目別の伸び（上がった／下がった）
function MoversPanel({ movers }: { movers: Mover[] }) {
  const gains = movers.filter((m) => m.delta > 0).slice(0, 6);
  const drops = movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 6);
  const Row = ({ m }: { m: Mover }) => (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-slate-600">
        {m.label}・{m.axisLabel}{m.side !== "both" ? `（${SIDE_LABEL[m.side]}）` : ""}
      </span>
      <span className="flex items-center gap-1.5 tabular-nums">
        <span className="text-slate-400">{m.from}→{m.to}</span>
        <b style={{ color: deltaColor(m.delta) }}>{fmtDelta(m.delta)}</b>
      </span>
    </div>
  );
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-sm text-emerald-700">前回から伸びた項目</CardTitle></CardHeader>
        <CardContent className="divide-y divide-slate-100">
          {gains.length ? gains.map((m, i) => <Row key={i} m={m} />) : <p className="text-xs text-slate-400 py-3 text-center">前回より上がった項目はまだありません</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-sm text-red-600">下がった・要チェック項目</CardTitle></CardHeader>
        <CardContent className="divide-y divide-slate-100">
          {drops.length ? drops.map((m, i) => <Row key={i} m={m} />) : <p className="text-xs text-slate-400 py-3 text-center">下がった項目はありません（良い状態）</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryCard({ a, open, onToggle, onDelete }: { a: Assessment; open: boolean; onToggle: () => void; onDelete: () => void }) {
  const axisAvg = axisAverages(a.measurements);
  const map = toScoreMap(a.measurements);
  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <button type="button" onClick={onToggle} className="flex items-center gap-3 min-w-0 flex-1 text-left">
          <div className="min-w-0">
            <div className="font-bold text-sm">{a.assessed_on}{a.assessor_name ? `・${a.assessor_name}` : ""}</div>
            <div className="flex gap-2 mt-1 text-[11px]">
              {AXES.map((ax) => {
                const v = axisAvg[ax.key];
                return <span key={ax.key} className="text-slate-500">{ax.label} <b style={{ color: v != null ? scoreColor(v) : "#cbd5e1" }}>{v != null ? v.toFixed(1) : "–"}</b></span>;
              })}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onDelete} className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
          <button onClick={onToggle} className="p-2 rounded-lg text-slate-400">{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
        </div>
      </div>

      {/* 目標・宿題・メモ（常時表示） */}
      {(a.next_goal || a.homework || a.overall_memo) && (
        <div className="px-4 pb-3 space-y-1 text-sm">
          {a.overall_memo && <p className="text-slate-600">{a.overall_memo}</p>}
          {a.next_goal && <p className="flex gap-1.5 text-emerald-700"><Target className="w-4 h-4 shrink-0 mt-0.5" /><span>次回目標：{a.next_goal}</span></p>}
          {a.homework && <p className="flex gap-1.5 text-amber-700"><NotebookPen className="w-4 h-4 shrink-0 mt-0.5" /><span>宿題：{a.homework}</span></p>}
        </div>
      )}

      {/* 詳細スコア表 */}
      {open && (
        <div className="border-t px-4 py-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400">
                <th className="text-left font-medium pb-1">部位</th>
                {AXES.map((ax) => <th key={ax.key} className="font-medium pb-1 px-1">{ax.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {REGIONS.map((r) => {
                const applicable = axesFor(r);
                const sides = sidesFor(r);
                return (
                  <tr key={r.key} className="border-t border-slate-100">
                    <td className="py-1.5 font-medium whitespace-nowrap">{r.label}</td>
                    {AXES.map((ax) => {
                      if (!applicable.includes(ax.key)) return <td key={ax.key} className="text-center text-slate-300">–</td>;
                      return (
                        <td key={ax.key} className="text-center px-1">
                          <div className="flex gap-1 justify-center">
                            {sides.map((sd) => {
                              const v = map[cellKey(r.key, ax.key, sd)];
                              return (
                                <span key={sd} className="inline-flex items-center gap-0.5">
                                  {sd !== "both" && <span className="text-[9px] text-slate-400">{SIDE_LABEL[sd]}</span>}
                                  <b style={{ color: v != null ? scoreColor(v) : "#cbd5e1" }}>{v != null ? v : "–"}</b>
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
