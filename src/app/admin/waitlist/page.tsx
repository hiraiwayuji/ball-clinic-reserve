"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Clock, Trash2, RefreshCw, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { getMyClinicId } from "@/app/actions/auth";
import { createWaitlistEntryByStaff } from "@/app/actions/adminReserve";

interface WaitlistEntry {
  id: string;
  start_time: string;
  is_first_visit: boolean;
  created_at: string;
  customers: { name: string; phone: string | null; medical_record_number: string | null } | null;
  position: number;
}

interface WaitlistGroup {
  dateLabel: string;
  timeLabel: string;
  startTime: string;
  entries: WaitlistEntry[];
}

export default function WaitlistPage() {
  const [groups, setGroups] = useState<WaitlistGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  // 受付スタッフが手入力でキャンセル待ちを追加するフォーム
  const [addOpen, setAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fDate, setFDate] = useState("");
  const [fTime, setFTime] = useState("");
  const [fVisitType, setFVisitType] = useState("return");
  const [fNote, setFNote] = useState("");

  const resetForm = () => {
    setFName(""); setFPhone(""); setFDate(""); setFTime(""); setFVisitType("return"); setFNote("");
  };

  const handleAdd = async () => {
    if (!fName.trim() || !fPhone.trim() || !fDate || !fTime) {
      toast.error("氏名・電話番号・希望日・希望時間を入力してください");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("name", fName);
      fd.set("phone", fPhone);
      fd.set("date", fDate);
      fd.set("time", fTime);
      fd.set("visitType", fVisitType);
      fd.set("note", fNote);
      const res = await createWaitlistEntryByStaff(fd);
      if (res.success) {
        toast.success("キャンセル待ちに追加しました");
        setAddOpen(false);
        resetForm();
        fetchWaitlist();
      } else {
        toast.error(res.error || "追加に失敗しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  const fetchWaitlist = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const clinicId = await getMyClinicId();
      if (!clinicId) { toast.error("clinic_id が解決できませんでした"); return; }
      const { data, error } = await supabase
        .from("appointments")
        .select("id, start_time, is_first_visit, created_at, customers(name, phone, medical_record_number)")
        .eq("clinic_id", clinicId)
        .eq("status", "waiting")
        .order("start_time", { ascending: true })
        .order("created_at", { ascending: true });

      if (error || !data) {
        toast.error("データの取得に失敗しました");
        return;
      }

      // start_time ごとにグループ化
      const map = new Map<string, WaitlistEntry[]>();
      for (const apt of data) {
        const key = apt.start_time;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({
          ...apt,
          customers: Array.isArray(apt.customers) ? apt.customers[0] : apt.customers,
          position: 0,
        });
      }

      const grouped: WaitlistGroup[] = [];
      map.forEach((entries, startTime) => {
        const dt = new Date(startTime);
        entries.forEach((e, i) => { e.position = i + 1; });
        grouped.push({
          startTime,
          dateLabel: dt.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" }),
          timeLabel: dt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }),
          entries,
        });
      });

      setGroups(grouped);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWaitlist(); }, []);

  const handleCancel = async (aptId: string) => {
    if (!confirm("このキャンセル待ちを削除しますか？")) return;
    setCancelling(aptId);
    try {
      const supabase = createClient();
      const clinicId = await getMyClinicId();
      if (!clinicId) { toast.error("clinic_id が解決できませんでした"); return; }
      const { error } = await supabase
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", aptId)
        .eq("clinic_id", clinicId);
      if (error) { toast.error("削除に失敗しました"); return; }
      toast.success("キャンセル待ちを削除しました");
      fetchWaitlist();
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">キャンセル待ち管理</h1>
          <p className="text-slate-500 mt-1">時間帯ごとの待機順位を確認できます</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setAddOpen(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            キャンセル待ちを追加
          </Button>
          <Button variant="outline" onClick={fetchWaitlist} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            更新
          </Button>
        </div>
      </div>

      {/* 受付スタッフが電話・直接受付のキャンセル待ちを手入力する */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="w-full max-w-md mx-auto rounded-2xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-4 border-b">
            <div className="flex items-start justify-between gap-2">
              <div>
                <DialogTitle className="text-base font-bold">キャンセル待ちを追加</DialogTitle>
                <p className="text-sm text-slate-500 mt-0.5">電話・直接受付の希望を登録します</p>
              </div>
              <button
                type="button"
                onClick={() => { setAddOpen(false); resetForm(); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </DialogHeader>

          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">患者名 <span className="text-red-500">*</span></Label>
              <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="山田 太郎" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">電話番号 <span className="text-red-500">*</span></Label>
              <Input value={fPhone} onChange={(e) => setFPhone(e.target.value)} type="tel" placeholder="090-0000-0000" className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">希望日 <span className="text-red-500">*</span></Label>
                <Input value={fDate} onChange={(e) => setFDate(e.target.value)} type="date" className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">希望時間 <span className="text-red-500">*</span></Label>
                <Input value={fTime} onChange={(e) => setFTime(e.target.value)} type="time" step={300} className="h-11" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">初診 / 再診</Label>
              <div className="flex gap-2">
                {[["new", "初診"], ["return", "再診"]].map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setFVisitType(v)}
                    className={`flex-1 h-11 rounded-lg border text-sm font-semibold transition-all ${
                      fVisitType === v
                        ? v === "new" ? "bg-amber-500 border-amber-500 text-white" : "bg-blue-600 border-blue-600 text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">メモ（任意）</Label>
              <Input value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="例: 午前中希望 / 腰痛" className="h-11" />
            </div>
          </div>

          <div className="px-5 pb-5 pt-3 border-t space-y-2">
            <Button onClick={handleAdd} disabled={submitting} className="w-full h-11 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold">
              {submitting ? "登録中..." : "キャンセル待ちに追加する"}
            </Button>
            <Button variant="outline" onClick={() => { setAddOpen(false); resetForm(); }} className="w-full h-10 rounded-xl text-sm">
              キャンセル
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-slate-400">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>現在キャンセル待ちはありません</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <Card key={group.startTime}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  {group.dateLabel} {group.timeLabel}
                  <Badge variant="outline" className="ml-auto bg-orange-50 text-orange-700 border-orange-200">
                    {group.entries.length}名待機中
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {group.entries.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 font-bold text-sm flex items-center justify-center shrink-0">
                        {entry.position}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 truncate">
                          {entry.customers?.name || "名前なし"} 様
                          {entry.customers?.medical_record_number && (
                            <span className="ml-1.5 text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-full border border-slate-200 tabular-nums align-middle">No.{entry.customers.medical_record_number}</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">
                          {entry.is_first_visit ? "初診" : "再診"} ・ 登録: {new Date(entry.created_at).toLocaleDateString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" })}
                          {entry.customers?.phone && ` ・ ${entry.customers.phone}`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                        onClick={() => handleCancel(entry.id)}
                        disabled={cancelling === entry.id}
                      >
                        {cancelling === entry.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
