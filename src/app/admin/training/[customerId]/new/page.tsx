"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft, ChevronDown, ChevronUp, Loader2, Save, Target, NotebookPen, CheckCircle2,
} from "lucide-react";
import { getPatientById } from "@/app/actions/patientSearch";
import { getLatestAssessment, saveAssessment, type SaveMeasurement } from "@/app/actions/training";
import {
  REGIONS, axesFor, sidesFor, cellKey, AXIS_LABEL, SIDE_LABEL, TOTAL_CELLS,
  toScoreMap, diffLevel, scoreColor, type Assessment, type RegionKey, type AxisKey, type Side,
} from "@/lib/training-catalog";

function todayJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const DIFF_STYLE: Record<"ok" | "warn" | "bad", string> = {
  ok: "bg-emerald-50 text-emerald-600",
  warn: "bg-amber-50 text-amber-600",
  bad: "bg-red-50 text-red-600",
};

/** 0〜10 のチップ列。選択中は色付き。もう一度押すと解除。 */
function ScoreChips({
  value, prev, onChange,
}: { value: number | null; prev?: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: 11 }, (_, n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(active ? null : n)}
            className={`w-9 h-9 rounded-md text-sm font-bold border transition-colors ${
              active ? "text-white border-transparent" : "bg-white text-slate-600 border-slate-200 active:bg-slate-100"
            } ${prev === n && !active ? "ring-1 ring-slate-300" : ""}`}
            style={active ? { backgroundColor: scoreColor(n) } : undefined}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

export default function NewAssessmentPage() {
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId;
  const router = useRouter();

  const [patientName, setPatientName] = useState<string>("");
  const [prev, setPrev] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 採点値: cellKey -> score
  const [scores, setScores] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Set<RegionKey>>(new Set([REGIONS[0].key]));

  const [assessedOn, setAssessedOn] = useState(todayJst());
  const [assessorName, setAssessorName] = useState("");
  const [overallMemo, setOverallMemo] = useState("");
  const [nextGoal, setNextGoal] = useState("");
  const [homework, setHomework] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [p, latest] = await Promise.all([
          getPatientById(customerId),
          getLatestAssessment(customerId),
        ]);
        setPatientName(p?.name ?? "");
        setPrev(latest);
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId]);

  const prevMap = useMemo(() => (prev ? toScoreMap(prev.measurements) : {}), [prev]);
  const filledCount = Object.keys(scores).length;

  const setScore = (key: string, v: number | null) => {
    setScores((s) => {
      const next = { ...s };
      if (v == null) delete next[key];
      else next[key] = v;
      return next;
    });
  };

  const toggleRegion = (key: RegionKey) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const regionFilled = (key: RegionKey) => {
    const r = REGIONS.find((x) => x.key === key)!;
    let n = 0;
    for (const ax of axesFor(r)) for (const sd of sidesFor(r)) if (scores[cellKey(key, ax, sd)] != null) n++;
    return n;
  };

  const handleSave = async () => {
    if (filledCount === 0) {
      toast.error("少なくとも1項目は採点してください。");
      return;
    }
    setSaving(true);
    const measurements: SaveMeasurement[] = [];
    for (const r of REGIONS) {
      for (const ax of axesFor(r)) {
        for (const sd of sidesFor(r)) {
          const v = scores[cellKey(r.key, ax, sd)];
          if (v != null) measurements.push({ item_key: r.key, axis: ax, side: sd, score: v });
        }
      }
    }
    const res = await saveAssessment({
      customerId,
      assessedOn,
      assessorName,
      overallMemo,
      nextGoal,
      homework,
      measurements,
    });
    setSaving(false);
    if (res.success) {
      toast.success("評価を保存しました");
      router.push(`/admin/training/${customerId}`);
    } else {
      toast.error(res.error ?? "保存に失敗しました");
    }
  };

  if (loading) {
    return (
      <div className="p-10 text-center text-slate-400 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> 読み込み中…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-28">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 mb-3">
        <Link href={`/admin/training/${customerId}`} className="p-2 -ml-2 rounded-lg active:bg-slate-100">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <div className="font-bold truncate">{patientName || "患者"} さんの評価</div>
          <div className="text-xs text-slate-500">入力済み {filledCount} / {TOTAL_CELLS} 項目</div>
        </div>
      </div>

      {/* 進捗バー */}
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-4">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(filledCount / TOTAL_CELLS) * 100}%` }} />
      </div>

      {/* 前回のつづき */}
      {prev && (prev.next_goal || prev.homework || prev.overall_memo) && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
          <div className="font-bold text-emerald-700 mb-1">前回（{prev.assessed_on}）のつづき — これを超えよう</div>
          {prev.next_goal && (
            <p className="flex gap-1.5 text-emerald-800"><Target className="w-4 h-4 shrink-0 mt-0.5" /><span>目標：{prev.next_goal}</span></p>
          )}
          {prev.homework && (
            <p className="flex gap-1.5 text-amber-700 mt-0.5"><NotebookPen className="w-4 h-4 shrink-0 mt-0.5" /><span>宿題：{prev.homework}</span></p>
          )}
          {prev.overall_memo && <p className="text-slate-500 mt-0.5 text-xs">前回メモ：{prev.overall_memo}</p>}
        </div>
      )}

      {/* 日付・担当 */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div>
          <label className="text-xs text-slate-500">評価日</label>
          <Input type="date" value={assessedOn} onChange={(e) => setAssessedOn(e.target.value)} className="h-11" />
        </div>
        <div>
          <label className="text-xs text-slate-500">担当（任意）</label>
          <Input value={assessorName} onChange={(e) => setAssessorName(e.target.value)} placeholder="担当者名" className="h-11" />
        </div>
      </div>

      {/* 部位カード */}
      <div className="space-y-2">
        {REGIONS.map((r) => {
          const open = expanded.has(r.key);
          const filled = regionFilled(r.key);
          const total = axesFor(r).length * sidesFor(r).length;
          return (
            <div key={r.key} className="rounded-xl border bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => toggleRegion(r.key)}
                className="w-full flex items-center justify-between px-4 py-3 active:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{r.group}</span>
                  <span className="font-bold">{r.label}</span>
                  {filled > 0 && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                      {filled}/{total}
                    </span>
                  )}
                </div>
                {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {open && (
                <div className="px-4 pb-4 pt-1 space-y-4 border-t">
                  {r.hint && <p className="text-xs text-slate-400 -mt-0.5">測り方の例：{r.hint}</p>}
                  {axesFor(r).map((ax) => (
                    <AxisBlock
                      key={ax}
                      region={r.key}
                      axis={ax}
                      sides={sidesFor(r)}
                      scores={scores}
                      prevMap={prevMap}
                      setScore={setScore}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* メモ・目標・宿題 */}
      <div className="mt-5 space-y-3">
        <div>
          <label className="text-sm font-bold flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-slate-400" />今日できたこと・メモ</label>
          <Textarea value={overallMemo} onChange={(e) => setOverallMemo(e.target.value)} placeholder="どこまでできたか、気づいたこと" rows={2} className="mt-1" />
        </div>
        <div>
          <label className="text-sm font-bold flex items-center gap-1.5 text-emerald-700"><Target className="w-4 h-4" />次回の目標（次はここまで）</label>
          <Textarea value={nextGoal} onChange={(e) => setNextGoal(e.target.value)} placeholder={prev?.next_goal ? `前回の目標：${prev.next_goal}` : "次回に目指すレベル"} rows={2} className="mt-1" />
        </div>
        <div>
          <label className="text-sm font-bold flex items-center gap-1.5 text-amber-700"><NotebookPen className="w-4 h-4" />今週の宿題</label>
          <Textarea value={homework} onChange={(e) => setHomework(e.target.value)} placeholder="家でやること" rows={2} className="mt-1" />
        </div>
      </div>

      {/* 保存バー（画面下固定） */}
      <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-white/95 backdrop-blur border-t px-4 py-3 z-20">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="text-xs text-slate-500 shrink-0">{filledCount} 項目採点</div>
          <Button onClick={handleSave} disabled={saving} className="flex-1 h-12 text-base bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-1" />保存する</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AxisBlock({
  region, axis, sides, scores, prevMap, setScore,
}: {
  region: RegionKey; axis: AxisKey; sides: Side[];
  scores: Record<string, number>; prevMap: Record<string, number>;
  setScore: (key: string, v: number | null) => void;
}) {
  // 左右差バッジ（bilateral のとき、左右そろっていれば）
  let diffBadge: React.ReactNode = null;
  if (sides.length === 2) {
    const l = scores[cellKey(region, axis, "left")];
    const rt = scores[cellKey(region, axis, "right")];
    if (l != null && rt != null) {
      const d = Math.abs(l - rt);
      const lvl = diffLevel(d);
      diffBadge = (
        <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${DIFF_STYLE[lvl]}`}>
          左右差 {d}{d > 0 ? `（${l >= rt ? "左" : "右"}が上）` : ""}
        </span>
      );
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm font-bold">{AXIS_LABEL[axis]}</span>
        {diffBadge}
      </div>
      <div className="space-y-2">
        {sides.map((sd) => {
          const key = cellKey(region, axis, sd);
          const prev = prevMap[key];
          return (
            <div key={sd} className="flex items-start gap-2">
              {sd !== "both" && <span className="w-5 shrink-0 text-sm font-bold text-slate-500 pt-2">{SIDE_LABEL[sd]}</span>}
              <div className="flex-1">
                <ScoreChips value={scores[key] ?? null} prev={prev ?? null} onChange={(v) => setScore(key, v)} />
                {prev != null && <div className="text-[11px] text-slate-400 mt-0.5">前回 {prev} 点</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
