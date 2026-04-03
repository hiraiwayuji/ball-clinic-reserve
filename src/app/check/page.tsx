"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, CalendarDays } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function CheckPage() {
  const [searchType, setSearchType] = useState<"number" | "phone" | "name">("number");
  const [reservationNumber, setReservationNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
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
        : searchType === "phone"
        ? `phone=${phone.trim()}`
        : `name=${encodeURIComponent(name.trim())}`;
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
    <div className="min-h-screen bg-[#0F172A] text-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="relative w-48 h-20 mx-auto mb-4">
            <Image src="/images/logo-white.png" alt="ボール接骨院" fill className="object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white mt-4 tracking-tight">予約確認</h1>
          <p className="text-blue-200/60 text-sm mt-2">予約番号・電話番号・お名前で確認できます</p>
        </div>

        {step === "input" && (
          <div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-8 shadow-2xl">
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-lg font-bold text-white">
                <Search className="w-5 h-5 text-blue-400" />
                <span>予約を検索</span>
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => { setSearchType("number"); setError(""); }}
                  className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-colors border ${searchType === "number" ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 border-white/10 text-blue-100/60 hover:bg-white/10"}`}>
                  予約番号
                </button>
                <button onClick={() => { setSearchType("phone"); setError(""); }}
                  className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-colors border ${searchType === "phone" ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 border-white/10 text-blue-100/60 hover:bg-white/10"}`}>
                  電話番号
                </button>
                <button onClick={() => { setSearchType("name"); setError(""); }}
                  className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-colors border ${searchType === "name" ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 border-white/10 text-blue-100/60 hover:bg-white/10"}`}>
                  お名前
                </button>
              </div>

              <div className="space-y-4 pt-2">
                {searchType === "number" ? (
                  <Input placeholder="例: ABC12345（英数字8文字）" value={reservationNumber}
                    onChange={(e) => setReservationNumber(e.target.value.toUpperCase())}
                    className="h-14 bg-white/5 border-white/10 rounded-2xl text-center text-white placeholder:text-white/20 text-lg tracking-widest font-mono focus:border-blue-500/50" maxLength={8} />
                ) : searchType === "phone" ? (
                  <Input placeholder="例: 090-0000-0000" value={phone}
                    onChange={(e) => setPhone(e.target.value)} type="tel" 
                    className="h-14 bg-white/5 border-white/10 rounded-2xl text-white placeholder:text-white/20 focus:border-blue-500/50" />
                ) : (
                  <Input placeholder="例: 山田 太郎" value={name}
                    onChange={(e) => setName(e.target.value)} 
                    className="h-14 bg-white/5 border-white/10 rounded-2xl text-white placeholder:text-white/20 focus:border-blue-500/50" />
                )}
                
                {error && (
                  <div className="flex items-center justify-center gap-2 bg-red-500/10 text-red-400 text-sm p-3 rounded-xl border border-red-500/20">
                    {error}
                  </div>
                )}
                
                <Button onClick={handleSearch}
                  disabled={loading || (searchType === "number" ? reservationNumber.length < 8 : searchType === "phone" ? phone.length < 5 : name.trim().length < 1)}
                  className="w-full h-16 text-lg font-bold rounded-2xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40">
                  {loading ? "検索中..." : "予約を確認する"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "result" && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white text-center">予約内容</h2>
            {appointments.map((apt, i) => {
              const status = statusLabel(apt.status);
              return (
                <div key={i} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl transition-all">
                  <div className="p-6 space-y-4">
                    <div className="flex justify-between items-center border-b border-white/5 pb-3">
                      <span className="text-blue-100/60 text-sm font-bold uppercase tracking-wider">お名前</span>
                      <span className="font-bold text-white text-lg">{apt.name} 様</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/5 pb-3">
                      <span className="text-blue-100/60 text-sm font-bold uppercase tracking-wider flex items-center gap-2"><CalendarDays className="w-4 h-4 text-blue-400" /> 日時</span>
                      <span className="font-bold text-white text-lg">{apt.date} {apt.time}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/5 pb-3">
                      <span className="text-blue-100/60 text-sm font-bold uppercase tracking-wider">受診</span>
                      <span className="text-white font-medium">{apt.visitType}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-blue-100/60 text-sm font-bold uppercase tracking-wider">ステータス</span>
                      <span className={`text-sm font-bold px-4 py-1.5 rounded-full ${apt.status === 'confirmed' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : apt.status === 'waiting' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                        {status.text}
                      </span>
                    </div>
                    
                    {apt.status === "waiting" && apt.waitlistPosition != null && (
                      <div className="mt-4 p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl text-center">
                        <p className="text-xs text-orange-400 font-bold uppercase tracking-wider mb-2">キャンセル待ち順位</p>
                        <p className="text-3xl font-black text-orange-300 drop-shadow-md">{apt.waitlistPosition}<span className="text-base font-bold ml-1">番目</span></p>
                        <p className="text-[11px] text-orange-200/80 mt-2">空きが出た際にご連絡いたします</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            <div className="flex flex-col gap-3 pt-4">
              <Button variant="outline" className="w-full h-14 rounded-2xl bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white" onClick={() => setStep("input")}>
                別の予約を確認する
              </Button>
              <Button className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-base font-bold" asChild>
                <Link href="/reserve/calendar">新しく予約する</Link>
              </Button>
              <Button variant="ghost" className="w-full h-14 rounded-2xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10" asChild>
                <Link href="/cancel">この予約をキャンセルする</Link>
              </Button>
              <Button variant="ghost" className="w-full h-14 rounded-2xl text-blue-200/60 hover:text-white hover:bg-white/5" asChild>
                <Link href="/">トップへ戻る</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
