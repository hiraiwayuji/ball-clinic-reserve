"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dumbbell, Search, ChevronRight, Loader2, CalendarClock, Target, NotebookPen } from "lucide-react";
import { listTrainingPatients, type TrainingPatientRow } from "@/app/actions/training";
import { searchPatients } from "@/app/actions/patientSearch";

type SearchHit = { id: string; name: string; phone: string | null };

export default function TrainingHomePage() {
  const [recent, setRecent] = useState<TrainingPatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setRecent(await listTrainingPatients());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 検索（デバウンス）
  const runSearch = useCallback(async (term: string) => {
    if (!term.trim()) { setHits([]); return; }
    setSearching(true);
    try {
      const res = await searchPatients(term);
      setHits((res ?? []).map((r: any) => ({ id: r.id, name: r.name, phone: r.phone ?? null })));
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(q), 300);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
          <Dumbbell className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold">トレーニング評価</h1>
          <p className="text-xs text-slate-500">筋力・反射・運動神経の3軸＋左右差で採点し、宿題と次回目標を記録します</p>
        </div>
      </div>

      {/* 患者検索 */}
      <div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="患者名で検索して評価をはじめる"
            className="pl-9 h-12 text-base"
            inputMode="search"
          />
        </div>
        {q.trim() && (
          <div className="mt-2 rounded-xl border bg-white overflow-hidden">
            {searching ? (
              <div className="p-4 text-sm text-slate-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> 検索中…
              </div>
            ) : hits.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">該当する患者がいません</div>
            ) : (
              hits.map((h) => (
                <Link
                  key={h.id}
                  href={`/admin/training/${h.id}`}
                  className="flex items-center justify-between px-4 py-3 border-b last:border-b-0 active:bg-slate-50 hover:bg-slate-50"
                >
                  <span className="font-medium">{h.name}</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>
              ))
            )}
          </div>
        )}
      </div>

      {/* 最近評価した患者 */}
      <div>
        <h2 className="text-sm font-bold text-slate-500 mb-2">最近評価した人</h2>
        {loading ? (
          <div className="p-6 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> 読み込み中…
          </div>
        ) : recent.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-500 text-sm">
              まだ評価がありません。上の検索から患者を選んで最初の評価をはじめましょう。
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recent.map((p) => (
              <Link key={p.customerId} href={`/admin/training/${p.customerId}`}>
                <Card className="hover:border-emerald-300 transition-colors">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold truncate">{p.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="w-3.5 h-3.5" />
                            {p.lastAssessedOn}・計{p.sessions}回
                          </span>
                          {p.lastGoal && (
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                              <Target className="w-3.5 h-3.5" />
                              次回目標あり
                            </span>
                          )}
                          {p.lastHomework && (
                            <span className="inline-flex items-center gap-1 text-amber-600">
                              <NotebookPen className="w-3.5 h-3.5" />
                              宿題あり
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
