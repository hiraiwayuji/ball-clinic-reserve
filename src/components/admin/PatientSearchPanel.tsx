"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import {
  searchPatients,
  getPatientById,
  getPatientAppointments,
  cloneAppointmentWeeksLater,
  predictNextVisit,
} from "@/app/actions/patientSearch";
import { format, isFuture, isPast } from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search, User, CalendarDays, ChevronRight, Loader2,
  Sparkles, Clock, Plus, RotateCcw,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRefresh: () => void;
  initialPatientId?: string | null;
}

type Patient = { id: string; name: string; phone: string; line_user_id: string | null };
type Appointment = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  is_first_visit: boolean;
  memo: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: "✅ 確定",
  pending: "⏳ 確認待ち",
  waiting: "🕐 C待ち",
};

export function PatientSearchPanel({ open, onOpenChange, onRefresh, initialPatientId }: Props) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Patient[]>([]);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [prediction, setPrediction] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [loadingApt, setLoadingApt] = useState(false);
  const [loadingPredict, setLoadingPredict] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // initialPatientId が渡されたら自動でロード
  useEffect(() => {
    if (open && initialPatientId) {
      setSelected(null);
      setAppointments([]);
      setQuery("");
      setPrediction("");
      setLoadingApt(true);
      Promise.all([
        getPatientById(initialPatientId),
        getPatientAppointments(initialPatientId),
      ]).then(([patient, apts]) => {
        if (patient) {
          setSelected(patient as Patient);
          setQuery(patient.name);
        }
        setAppointments(apts as Appointment[]);
        setLoadingApt(false);
      });
    }
  }, [open, initialPatientId]);

  // 検索
  useEffect(() => {
    if (!query.trim()) { setCandidates([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await searchPatients(query);
        setCandidates(res as Patient[]);
      });
    }, 300);
  }, [query]);

  const handleSelectPatient = async (p: Patient) => {
    setSelected(p);
    setCandidates([]);
    setQuery(p.name);
    setPrediction("");
    setLoadingApt(true);
    const apts = await getPatientAppointments(p.id);
    setAppointments(apts as Appointment[]);
    setLoadingApt(false);
  };

  const handlePredict = async () => {
    if (!selected) return;
    setLoadingPredict(true);
    const result = await predictNextVisit(selected.id);
    setPrediction(result);
    setLoadingPredict(false);
  };

  const handleClone = async (aptId: string, weeks: number) => {
    setCloningId(aptId + "_" + weeks);
    try {
      const res = await cloneAppointmentWeeksLater(aptId, weeks);
      const newDate = new Date((res as any).newDate);
      toast.success(`${format(newDate, "M月d日(E) HH:mm", { locale: ja })} に予約を追加しました`);
      onRefresh();
      // 一覧再取得
      if (selected) {
        const apts = await getPatientAppointments(selected.id);
        setAppointments(apts as Appointment[]);
      }
    } catch (e: any) {
      toast.error(e.message || "追加に失敗しました");
    } finally {
      setCloningId(null);
    }
  };

  const upcomingApts = appointments.filter(a => isFuture(new Date(a.start_time)));
  const pastApts = appointments.filter(a => isPast(new Date(a.start_time))).reverse();

  const handleClose = () => {
    onOpenChange(false);
    // reset
    setQuery("");
    setCandidates([]);
    setSelected(null);
    setAppointments([]);
    setPrediction("");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b sticky top-0 bg-white dark:bg-slate-900 z-10">
          <DialogTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
            <Search className="w-4 h-4 text-blue-600" />
            患者別 予約確認・予測
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-5">
          {/* 検索欄 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
                setAppointments([]);
                setPrediction("");
              }}
              placeholder="患者名を入力..."
              className="w-full h-11 pl-9 pr-4 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            {isPending && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />
            )}
            {/* 候補リスト */}
            {candidates.length > 0 && (
              <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
                {candidates.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 text-left border-b last:border-0 dark:border-slate-700"
                    onClick={() => handleSelectPatient(p)}
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">{p.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{p.phone}</p>
                    </div>
                    {p.line_user_id && (
                      <span className="ml-auto text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full font-semibold">LINE済</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 選択済み患者の予約情報 */}
          {selected && (
            <div className="space-y-5">
              {/* 患者ヘッダー */}
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/50 rounded-xl border border-blue-100 dark:border-blue-800">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-100">{selected.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{selected.phone}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto border-blue-200 text-blue-700 text-xs h-8"
                  onClick={handlePredict}
                  disabled={loadingPredict}
                >
                  {loadingPredict
                    ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    : <Sparkles className="w-3 h-3 mr-1" />
                  }
                  来院予測
                </Button>
              </div>

              {/* AI予測 */}
              {prediction && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-1">
                  <p className="text-xs font-bold text-indigo-700 flex items-center gap-1 mb-2">
                    <Sparkles className="w-3 h-3" /> AI来院予測
                  </p>
                  <p className="text-xs text-indigo-800 whitespace-pre-line leading-relaxed">{prediction}</p>
                </div>
              )}

              {loadingApt ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : (
                <>
                  {/* 今後の予約 */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5" />
                      今後の予約（{upcomingApts.length}件）
                    </h3>
                    {upcomingApts.length === 0 ? (
                      <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
                        今後の予約はありません
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {upcomingApts.map(apt => {
                          const start = new Date(apt.start_time);
                          const end = apt.end_time ? new Date(apt.end_time) : null;
                          const daysUntil = Math.round((start.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                          return (
                            <div key={apt.id} className="border border-slate-200 rounded-xl p-3 bg-white space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-bold text-slate-800 text-sm">
                                    {format(start, "M月d日(E)", { locale: ja })}
                                    <span className="ml-2 text-blue-700">{format(start, "HH:mm")}</span>
                                    {end && <span className="text-slate-400 text-xs">〜{format(end, "HH:mm")}</span>}
                                  </p>
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    {daysUntil === 0 ? "今日" : `${daysUntil}日後`}
                                    {" · "}{STATUS_LABEL[apt.status] || apt.status}
                                  </p>
                                  {apt.memo && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{apt.memo}</p>}
                                </div>
                              </div>
                              {/* 延長ボタン */}
                              <div className="flex gap-2 pt-1 border-t border-slate-100">
                                <p className="text-[10px] text-slate-400 flex items-center gap-0.5 mr-1">
                                  <RotateCcw className="w-3 h-3" /> 同時刻でコピー追加：
                                </p>
                                {[1, 2, 3, 4].map(w => {
                                  const key = apt.id + "_" + w;
                                  return (
                                    <button
                                      key={w}
                                      type="button"
                                      disabled={cloningId === key}
                                      onClick={() => handleClone(apt.id, w)}
                                      className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 transition-colors flex items-center gap-0.5"
                                    >
                                      {cloningId === key
                                        ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                        : <Plus className="w-2.5 h-2.5" />
                                      }
                                      +{w}週
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 過去の予約 */}
                  {pastApts.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        過去の来院（{pastApts.length}件）
                      </h3>
                      <div className="space-y-1.5 max-h-60 overflow-y-auto">
                        {pastApts.map(apt => {
                          const start = new Date(apt.start_time);
                          return (
                            <div key={apt.id} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg text-xs text-slate-600">
                              <span className="tabular-nums font-medium">{format(start, "yyyy/M/d(E)", { locale: ja })}</span>
                              <span className="text-slate-400">{format(start, "HH:mm")}</span>
                              {apt.is_first_visit && (
                                <span className="text-[9px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold">初診</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 初期状態 */}
          {!selected && !query && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-sm text-slate-400">患者名を入力して検索</p>
              <p className="text-xs text-slate-300 mt-1">今後の予約・来院パターンを確認できます</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
