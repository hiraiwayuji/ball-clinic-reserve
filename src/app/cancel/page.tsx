"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle, Search, CheckCircle, CalendarDays } from "lucide-react";
import Link from "next/link";

export default function CancelPage() {
  const [searchType, setSearchType] = useState<"number" | "phone" | "name">("phone");
  const [reservationNumber, setReservationNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<"input" | "list" | "done">("input");
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    setLoading(true);
    setError("");
    setSelectedIds(new Set());
    try {
      const params =
        searchType === "number" ? `id=${reservationNumber.trim().toUpperCase()}` :
        searchType === "phone" ? `phone=${phone.trim()}` :
        `name=${encodeURIComponent(name.trim())}`;
      const res = await fetch(`/api/cancel?${params}`);
      const data = await res.json();
      if (data.success) {
        setAppointments(data.appointments || []);
        setStep("list");
      } else {
        setError(data.error || "予約が見つかりませんでした");
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (aptId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(aptId) ? next.delete(aptId) : next.add(aptId);
      return next;
    });
  };

  const handleCancel = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`選択した ${selectedIds.size} 件の予約をキャンセルしますか？`)) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (data.success) {
        setStep("done");
      } else {
        setError(data.error || "キャンセルに失敗しました");
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = (status: string) => {
    if (status === "confirmed") return { text: "確定", color: "text-blue-600 bg-blue-50" };
    if (status === "waiting") return { text: "C待ち", color: "text-orange-600 bg-orange-50" };
    return { text: "確認待ち", color: "text-amber-600 bg-amber-50" };
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-xl font-bold text-slate-900">ボール接骨院</Link>
          <h1 className="text-2xl font-bold text-slate-800 mt-4">予約キャンセル</h1>
          <p className="text-slate-500 text-sm mt-2">予約を検索してキャンセルする予約を選んでください</p>
        </div>

        {step === "input" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Search className="w-5 h-5 text-blue-600" />
                予約を検索
              </CardTitle>
              <div className="flex gap-2 mt-2">
                {(["phone", "name", "number"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => { setSearchType(type); setError(""); }}
                    className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${searchType === type ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}
                  >
                    {type === "phone" ? "電話番号" : type === "name" ? "お名前" : "予約番号"}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {searchType === "number" ? (
                <Input placeholder="例: ABC12345（英数字8文字）" value={reservationNumber}
                  onChange={(e) => setReservationNumber(e.target.value.toUpperCase())}
                  className="text-center text-lg tracking-widest font-mono" maxLength={8} />
              ) : searchType === "phone" ? (
                <Input placeholder="例: 090-0000-0000" value={phone}
                  onChange={(e) => setPhone(e.target.value)} type="tel" />
              ) : (
                <Input placeholder="例: 山田 太郎" value={name}
                  onChange={(e) => setName(e.target.value)} />
              )}
              {error && <p className="text-red-500 text-sm text-center">{error}</p>}
              <Button
                onClick={handleSearch}
                disabled={loading || (
                  searchType === "number" ? reservationNumber.length < 8 :
                  searchType === "phone" ? phone.length < 5 :
                  name.trim().length < 1
                )}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {loading ? "検索中..." : "予約を検索する"}
              </Button>
              <Link href="/"><Button variant="ghost" className="w-full text-slate-500">トップへ戻る</Button></Link>
            </CardContent>
          </Card>
        )}

        {step === "list" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-blue-600" />
                  予約一覧
                </CardTitle>
                <p className="text-sm text-slate-500">キャンセルしたい予約にチェックを入れてください</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {appointments.map((apt) => {
                  const s = statusLabel(apt.status);
                  const checked = selectedIds.has(apt.aptId);
                  return (
                    <label
                      key={apt.aptId}
                      className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${checked ? "border-red-300 bg-red-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(apt.aptId)}
                        className="mt-1 w-4 h-4 accent-red-600 shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 truncate">{apt.name} 様</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ml-2 shrink-0 ${s.color}`}>{s.text}</span>
                        </div>
                        <p className="text-sm text-slate-600">{apt.date} {apt.time}</p>
                        <p className="text-xs text-slate-400">{apt.visitType}</p>
                      </div>
                    </label>
                  );
                })}
              </CardContent>
            </Card>

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <Button
              onClick={handleCancel}
              disabled={loading || selectedIds.size === 0}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              {loading ? "処理中..." : `選択した ${selectedIds.size} 件をキャンセルする`}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => { setStep("input"); setSelectedIds(new Set()); }}>
              検索に戻る
            </Button>
            <Link href="/"><Button variant="ghost" className="w-full text-slate-500">トップへ戻る</Button></Link>
          </div>
        )}

        {step === "done" && (
          <Card className="border-green-200">
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <h2 className="text-xl font-bold text-slate-800">キャンセル完了</h2>
              <p className="text-slate-500 text-sm">予約をキャンセルしました。<br />またのご予約をお待ちしております。</p>
              <div className="flex flex-col gap-2 mt-4">
                <Link href="/reserve/calendar">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700">新しく予約する</Button>
                </Link>
                <Link href="/"><Button variant="ghost" className="w-full text-slate-500">トップへ戻る</Button></Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
