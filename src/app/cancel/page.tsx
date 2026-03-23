"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle, Search, CheckCircle, Phone } from "lucide-react";
import Link from "next/link";

export default function CancelPage() {
  const [searchType, setSearchType] = useState<"number" | "phone">("number");
  const [reservationNumber, setReservationNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"input" | "select" | "confirm" | "done">("input");
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selectedApt, setSelectedApt] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    setLoading(true);
    setError("");
    try {
      const params = searchType === "number"
        ? `id=${reservationNumber.trim().toUpperCase()}`
        : `phone=${phone.trim()}`;
      const res = await fetch(`/api/cancel?${params}`);
      const data = await res.json();
      if (data.success) {
        if (data.appointments) {
          setAppointments(data.appointments);
          setStep("select");
        } else {
          setSelectedApt(data.appointment);
          setStep("confirm");
        }
      } else {
        setError(data.error || "予約が見つかりませんでした");
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (aptId?: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: aptId || reservationNumber.trim().toUpperCase() }),
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

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-xl font-bold text-slate-900">ボール接骨院</Link>
          <h1 className="text-2xl font-bold text-slate-800 mt-4">予約キャンセル</h1>
          <p className="text-slate-500 text-sm mt-2">予約番号または電話番号でキャンセルできます</p>
        </div>

        {step === "input" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Search className="w-5 h-5 text-blue-600" />
                予約を検索
              </CardTitle>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => { setSearchType("number"); setError(""); }}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${searchType === "number" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  予約番号で検索
                </button>
                <button
                  onClick={() => { setSearchType("phone"); setError(""); }}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${searchType === "phone" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  電話番号で検索
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {searchType === "number" ? (
                <Input
                  placeholder="例: ABC12345（英数字8文字）"
                  value={reservationNumber}
                  onChange={(e) => setReservationNumber(e.target.value.toUpperCase())}
                  className="text-center text-lg tracking-widest font-mono"
                  maxLength={8}
                />
              ) : (
                <Input
                  placeholder="例: 090-0000-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                />
              )}
              {error && <p className="text-red-500 text-sm text-center">{error}</p>}
              <Button
                onClick={handleSearch}
                disabled={loading || (searchType === "number" ? reservationNumber.length < 8 : phone.length < 5)}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {loading ? "検索中..." : "予約を検索する"}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "select" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">予約を選択してください</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {appointments.map((apt, i) => (
                <div key={i} className="border rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">日時</span>
                    <span className="font-bold">{apt.date} {apt.time}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">受診</span>
                    <span>{apt.visitType}</span>
                  </div>
                  <Button
                    onClick={() => { setSelectedApt(apt); setStep("confirm"); }}
                    variant="outline"
                    className="w-full text-red-600 border-red-200 hover:bg-red-50"
                  >
                    この予約をキャンセル
                  </Button>
                </div>
              ))}
              <Button variant="ghost" className="w-full" onClick={() => setStep("input")}>戻る</Button>
            </CardContent>
          </Card>
        )}

        {step === "confirm" && selectedApt && (
          <Card className="border-orange-200">
            <CardHeader className="bg-orange-50">
              <CardTitle className="flex items-center gap-2 text-lg text-orange-800">
                <XCircle className="w-5 h-5" />
                キャンセル確認
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">お名前</span>
                  <span className="font-bold">{selectedApt.name} 様</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">日時</span>
                  <span className="font-bold">{selectedApt.date} {selectedApt.time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">受診</span>
                  <span className="font-bold">{selectedApt.visitType}</span>
                </div>
              </div>
              <p className="text-red-600 text-sm text-center font-bold">この予約をキャンセルしますか？</p>
              {error && <p className="text-red-500 text-sm text-center">{error}</p>}
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(appointments.length > 0 ? "select" : "input")}>
                  戻る
                </Button>
                <Button
                  onClick={() => handleCancel(selectedApt.aptId)}
                  disabled={loading}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  {loading ? "処理中..." : "キャンセルする"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "done" && (
          <Card className="border-green-200">
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <h2 className="text-xl font-bold text-slate-800">キャンセル完了</h2>
              <p className="text-slate-500 text-sm">予約をキャンセルしました。<br/>またのご予約をお待ちしております。</p>
              <Link href="/reserve/calendar">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 mt-4">
                  新しく予約する
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
