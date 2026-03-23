"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, CalendarDays } from "lucide-react";
import Link from "next/link";

export default function CheckPage() {
  const [searchType, setSearchType] = useState<"number" | "phone">("number");
  const [reservationNumber, setReservationNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"input" | "result">("input");
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const statusLabel = (status: string) => {
    if (status === "confirmed") return { text: "✅ 予約確定", color: "text-green-600 bg-green-50" };
    if (status === "waiting") return { text: "🕐 キャンセル待ち", color: "text-yellow-600 bg-yellow-50" };
    return { text: "⏳ 確認待ち", color: "text-blue-600 bg-blue-50" };
  };

  const handleSearch = async () => {
    setLoading(true);
    setError("");
    try {
      const params = searchType === "number"
        ? `id=${reservationNumber.trim().toUpperCase()}`
        : `phone=${phone.trim()}`;
      const res = await fetch(`/api/check?${params}`);
      const data = await res.json();
      if (data.success) {
        setAppointments(data.appointments || [data.appointment]);
        setStep("result");
      } else {
        setError(data.error || "予約が見つかりませんでした");
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-xl font-bold text-slate-900">ボール接骨院</Link>
          <h1 className="text-2xl font-bold text-slate-800 mt-4">予約確認</h1>
          <p className="text-slate-500 text-sm mt-2">予約番号または電話番号で確認できます</p>
        </div>

        {step === "input" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Search className="w-5 h-5 text-blue-600" />
                予約を検索
              </CardTitle>
              <div className="flex gap-2 mt-2">
                <button onClick={() => { setSearchType("number"); setError(""); }}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${searchType === "number" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                  予約番号で検索
                </button>
                <button onClick={() => { setSearchType("phone"); setError(""); }}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${searchType === "phone" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                  電話番号で検索
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {searchType === "number" ? (
                <Input placeholder="例: ABC12345（英数字8文字）" value={reservationNumber}
                  onChange={(e) => setReservationNumber(e.target.value.toUpperCase())}
                  className="text-center text-lg tracking-widest font-mono" maxLength={8} />
              ) : (
                <Input placeholder="例: 090-0000-0000" value={phone}
                  onChange={(e) => setPhone(e.target.value)} type="tel" />
              )}
              {error && <p className="text-red-500 text-sm text-center">{error}</p>}
              <Button onClick={handleSearch}
                disabled={loading || (searchType === "number" ? reservationNumber.length < 8 : phone.length < 5)}
                className="w-full bg-blue-600 hover:bg-blue-700">
                {loading ? "検索中..." : "予約を確認する"}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "result" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 text-center">予約内容</h2>
            {appointments.map((apt, i) => {
              const status = statusLabel(apt.status);
              return (
                <Card key={i} className="border-blue-100">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-sm">お名前</span>
                      <span className="font-bold">{apt.name} 様</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-sm flex items-center gap-1"><CalendarDays className="w-3 h-3" /> 日時</span>
                      <span className="font-bold text-sm">{apt.date} {apt.time}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-sm">受診</span>
                      <span>{apt.visitType}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-sm">ステータス</span>
                      <span className={`text-sm font-bold px-3 py-1 rounded-full ${status.color}`}>{status.text}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            <div className="flex flex-col gap-2">
              <Button variant="outline" className="w-full" onClick={() => setStep("input")}>別の予約を確認する</Button>
              <Link href="/cancel"><Button variant="ghost" className="w-full text-red-500 hover:text-red-600">この予約をキャンセルする</Button></Link>
              <Link href="/reserve/calendar"><Button className="w-full bg-blue-600 hover:bg-blue-700">新しく予約する</Button></Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
