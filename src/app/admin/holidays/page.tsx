"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, CalendarX2 } from "lucide-react";
import { getClinicHolidays, toggleClinicHoliday, type ClinicHoliday } from "@/app/actions/holidays";

export default function AdminHolidaysPage() {
  const [holidays, setHolidays] = useState<ClinicHoliday[]>([]);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 初回データ取得
  useEffect(() => {
    async function loadData() {
      const data = await getClinicHolidays();
      setHolidays(data);
      // Date型配列に変換
      const dates = data.map((h) => {
        // YYYY-MM-DDをパース（ローカルタイムゾーンを考慮）
        const [y, m, d] = h.date.split("-").map(Number);
        return new Date(y, m - 1, d);
      });
      setSelectedDates(dates);
      setLoading(false);
    }
    loadData();
  }, []);

  // 日付クリック時の処理
  const handleDayClick = async (day: Date) => {
    const isSelected = selectedDates.some(
      (d) => d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate()
    );

    const dateStr = format(day, "yyyy-MM-dd");
    
    // UIを即時反映（オプティミスティック更新）
    if (isSelected) {
      setSelectedDates(prev => prev.filter(d => format(d, "yyyy-MM-dd") !== dateStr));
    } else {
      setSelectedDates(prev => [...prev, day]);
    }

    setSaving(true);
    const { success, error } = await toggleClinicHoliday(dateStr, !isSelected);
    setSaving(false);

    if (success) {
      toast.success(isSelected ? "休診日を解除しました" : "休診日を設定しました");
      // 再取得して同期
      const newData = await getClinicHolidays();
      setHolidays(newData);
    } else {
      toast.error(error || "設定に失敗しました");
      // UIを元に戻す
      const originalData = await getClinicHolidays();
      const resetDates = originalData.map((h) => {
        const [y, m, d] = h.date.split("-").map(Number);
        return new Date(y, m - 1, d);
      });
      setSelectedDates(resetDates);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">休診日設定</h1>
        <p className="text-slate-500 mt-2">
          臨時休診する日をカレンダーからタップして設定します。ここで設定した時間枠は予約できなくなります。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CalendarX2 className="w-5 h-5 mr-2 text-rose-500" />
              カレンダーから選択
            </CardTitle>
            <CardDescription>休診にする日をクリックして赤くしてください。</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <div className={`transition-opacity ${saving ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
              <Calendar
                mode="multiple"
                selected={selectedDates}
                locale={ja}
                onDayClick={handleDayClick}
                className="rounded-md border p-4 bg-white shadow-sm"
                modifiers={{
                  selected: selectedDates,
                }}
                modifiersClassNames={{
                  selected: "bg-rose-500 text-white hover:bg-rose-600 focus:bg-rose-500 font-bold",
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>設定済みの休診日一覧</CardTitle>
            <CardDescription>現在データベースに登録されている休診日です。</CardDescription>
          </CardHeader>
          <CardContent>
            {holidays.length === 0 ? (
              <p className="text-sm text-slate-500 p-4 text-center border rounded border-dashed bg-slate-50">
                特別に設定された休診日はありません。
              </p>
            ) : (
              <div className="bg-white border rounded-lg overflow-hidden">
                <ul className="divide-y max-h-[400px] overflow-y-auto">
                  {holidays.map((h) => {
                    const [y, m, d] = h.date.split("-").map(Number);
                    const dateObj = new Date(y, m - 1, d);
                    return (
                      <li key={h.id} className="p-3 px-4 flex justify-between items-center hover:bg-slate-50">
                        <div>
                          <p className="font-bold text-slate-800">
                            {format(dateObj, "yyyy年MM月dd日 (E)", { locale: ja })}
                          </p>
                          <p className="text-xs text-slate-500">{h.description}</p>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-rose-500 border-rose-200 hover:bg-rose-50"
                          onClick={() => handleDayClick(dateObj)}
                          disabled={saving}
                        >
                          解除する
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
