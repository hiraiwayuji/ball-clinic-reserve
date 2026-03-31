"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface WaitlistEntry {
  id: string;
  start_time: string;
  is_first_visit: boolean;
  created_at: string;
  customers: { name: string; phone: string | null } | null;
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

  const fetchWaitlist = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("appointments")
        .select("id, start_time, is_first_visit, created_at, customers(name, phone)")
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
      const { error } = await supabase
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", aptId);
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
        <Button variant="outline" onClick={fetchWaitlist} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          更新
        </Button>
      </div>

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
                        <p className="font-semibold text-slate-800 truncate">{entry.customers?.name || "名前なし"} 様</p>
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
