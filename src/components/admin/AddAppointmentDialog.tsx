"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarIcon, Plus, X, User, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createManualReservation } from "@/app/actions/adminReserve";
import { searchPatientsForBooking, PatientSuggestion } from "@/app/actions/patientSearch";
import { toast } from "sonner";
import { getTimeSlots } from "@/lib/time-slots";

export function AddAppointmentDialog({
  onSuccess,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
  defaultDate,
  defaultTime,
}: {
  onSuccess?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultDate?: Date;
  defaultTime?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (externalOnOpenChange) externalOnOpenChange(val);
    else setInternalOpen(val);
  };

  const [date, setDate] = useState<Date | undefined>(defaultDate);
  const [time, setTime] = useState<string>(defaultTime || "");
  const [visitType, setVisitType] = useState<string>("new");
  const [recurringWeeks, setRecurringWeeks] = useState<string>("1");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 患者サジェスト
  const [nameValue, setNameValue] = useState("");
  const [phoneValue, setPhoneValue] = useState("");
  const [suggestions, setSuggestions] = useState<PatientSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientSuggestion | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      if (defaultDate) setDate(defaultDate);
      if (defaultTime) setTime(defaultTime);
    } else {
      // ダイアログを閉じたらリセット
      setNameValue("");
      setPhoneValue("");
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedPatient(null);
      setVisitType("new");
      setRecurringWeeks("1");
    }
  }, [open, defaultDate, defaultTime]);

  // 名前入力でデバウンス検索
  const handleNameChange = useCallback((value: string) => {
    setNameValue(value);
    setSelectedPatient(null);
    setSuggestions([]);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (value.trim().length < 1) {
      setShowSuggestions(false);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchPatientsForBooking(value);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  // 患者を選択
  const handleSelectPatient = (patient: PatientSuggestion) => {
    setSelectedPatient(patient);
    setNameValue(patient.name);
    setPhoneValue(patient.phone);
    setShowSuggestions(false);
    // 来院履歴があれば再診に設定
    if (patient.totalVisits > 0) setVisitType("return");
  };

  // サジェスト外クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date || !time) {
      toast.error("日付と時間を選択してください");
      return;
    }
    setIsSubmitting(true);
    try {
      const formData = new FormData(e.currentTarget);
      formData.set("name", nameValue);
      formData.set("phone", phoneValue);
      formData.append("date", format(date, "yyyy-MM-dd"));
      formData.append("time", time);
      formData.append("visitType", visitType);
      formData.append("recurringWeeks", recurringWeeks);

      const result = await createManualReservation(formData);
      if (result.success) {
        toast.success(
          Number(recurringWeeks) > 1
            ? `${recurringWeeks}週分の予約を追加しました`
            : "予約を追加しました"
        );
        setOpen(false);
        setDate(undefined);
        setTime("");
        setVisitType("new");
        setRecurringWeeks("1");
        onSuccess?.();
      } else {
        toast.error(result.error || "エラーが発生しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectClass =
    "flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-blue-600 text-white shadow-sm hover:bg-blue-700 h-9 px-4 py-2">
        <Plus className="w-4 h-4 mr-2" />
        新規予約を追加
      </DialogTrigger>

      <DialogContent className="w-full max-w-lg mx-auto max-h-[92dvh] overflow-y-auto p-0 gap-0 rounded-2xl">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b sticky top-0 bg-white z-10">
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle className="text-base font-bold">新規予約の手動追加</DialogTitle>
              <p className="text-sm text-slate-500 mt-0.5">電話・直接受付の予約を登録します</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4 space-y-4">
            {/* 予約日 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                予約日 <span className="text-red-500">*</span>
              </Label>
              <Popover>
                <PopoverTrigger className="flex items-center w-full h-11 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm hover:bg-accent transition-colors text-left">
                  <CalendarIcon className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
                  {date ? (
                    format(date, "yyyy年M月d日（E）", { locale: ja })
                  ) : (
                    <span className="text-muted-foreground">日付を選択</span>
                  )}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[200]" align="start" side="bottom" sideOffset={4}>
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                    locale={ja}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* 時間 + 所要時間 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  時間 <span className="text-red-500">*</span>
                </Label>
                <select value={time} onChange={(e) => setTime(e.target.value)} className={selectClass + " bg-slate-900 text-white"}>
                  {!date ? (
                    <option value="" disabled className="bg-slate-900 text-white">先に日付を選択</option>
                  ) : getTimeSlots(date, true).length === 0 ? (
                    <option value="" disabled className="bg-slate-900 text-white">休診日</option>
                  ) : (
                    <option value="" disabled className="bg-slate-900 text-white">時間を選択</option>
                  )}
                  {date && getTimeSlots(date, true).map((t) => (
                    <option key={t} value={t} className="bg-slate-900 text-white">{t}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  所要時間
                </Label>
                <select name="duration" defaultValue="30" className={selectClass + " bg-slate-900 text-white"}>
                  <option value="30" className="bg-slate-900 text-white">30分</option>
                  <option value="60" className="bg-slate-900 text-white">60分</option>
                  <option value="90" className="bg-slate-900 text-white">90分</option>
                  <option value="120" className="bg-slate-900 text-white">120分</option>
                  <option value="150" className="bg-slate-900 text-white">150分</option>
                  <option value="180" className="bg-slate-900 text-white">180分</option>
                </select>
              </div>
            </div>

            {/* 患者名（サジェスト付き） */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                患者名 <span className="text-red-500">*</span>
              </Label>
              <div className="relative" ref={suggestionsRef}>
                <div className="relative">
                  <Input
                    name="name"
                    required
                    placeholder="山田 太郎"
                    value={nameValue}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    className="h-11 bg-slate-900 text-white pr-8"
                    autoComplete="off"
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-3.5 w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>

                {/* サジェストドロップダウン */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="px-3 py-1.5 bg-slate-50 border-b text-xs text-slate-500 font-medium">
                      既存の患者さん（クリックで選択）
                    </div>
                    {suggestions.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectPatient(patient)}
                        className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-bold text-slate-800">{patient.name}</p>
                              <p className="text-xs text-slate-500">{patient.phone}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {patient.daysSinceLastVisit !== null ? (
                              <div className="flex items-center gap-1 text-xs">
                                <Clock className="w-3 h-3 text-blue-400" />
                                <span className={`font-semibold ${
                                  patient.daysSinceLastVisit <= 7 ? "text-green-600" :
                                  patient.daysSinceLastVisit <= 30 ? "text-blue-600" :
                                  patient.daysSinceLastVisit <= 90 ? "text-amber-600" : "text-red-500"
                                }`}>
                                  {patient.daysSinceLastVisit}日前に来院
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">来院記録なし</span>
                            )}
                            <p className="text-xs text-slate-400 mt-0.5">計{patient.totalVisits}回</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 選択済み患者バッジ */}
              {selectedPatient && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mt-1">
                  <User className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs text-blue-700 font-medium">既存患者として登録</span>
                  {selectedPatient.daysSinceLastVisit !== null && (
                    <span className="text-xs text-blue-500 ml-auto">
                      前回来院: {selectedPatient.daysSinceLastVisit}日前
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 電話番号 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                電話番号 <span className="text-red-500">*</span>
              </Label>
              <Input
                name="phone"
                type="tel"
                required
                placeholder="090-0000-0000"
                value={phoneValue}
                onChange={(e) => setPhoneValue(e.target.value)}
                className="h-11 bg-slate-900 text-white"
              />
            </div>

            {/* 初診/再診 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                初診 / 再診
              </Label>
              <div className="flex gap-2">
                {["new", "return"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisitType(v)}
                    className={`flex-1 h-11 rounded-lg border text-sm font-semibold transition-all ${
                      visitType === v
                        ? v === "new"
                          ? "bg-amber-500 border-amber-500 text-white"
                          : "bg-blue-600 border-blue-600 text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {v === "new" ? "初診" : "再診"}
                  </button>
                ))}
              </div>
            </div>

            {/* 繰り返し */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                繰り返し設定
              </Label>
              <select
                value={recurringWeeks}
                onChange={(e) => setRecurringWeeks(e.target.value)}
                className={selectClass}
              >
                <option value="1">今回のみ（繰り返しなし）</option>
                <option value="2">2週連続（毎週）</option>
                <option value="3">3週連続（毎週）</option>
                <option value="4">4週連続（毎週）</option>
                <option value="8">8週連続（約2ヶ月）</option>
                <option value="12">12週連続（約3ヶ月）</option>
              </select>
            </div>

            {/* メモ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                メモ（症状など）
              </Label>
              <Input name="symptoms" placeholder="例: 腰痛（電話予約）" className="h-11" />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 pt-3 border-t sticky bottom-0 bg-white space-y-2">
            <Button
              type="submit"
              disabled={isSubmitting || !date || !time}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
            >
              {isSubmitting ? "保存中..." : "予約を追加する"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="w-full h-10 rounded-xl text-sm"
            >
              キャンセル
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
