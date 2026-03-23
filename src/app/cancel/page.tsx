"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle, Search, CheckCircle } from "lucide-react";
import Link from "next/link";

export default function CancelPage() {
  const [reservationNumber, setReservationNumber] = useState("");
  const [step, setStep] = useState<"input" | "confirm" | "done">("input");
  const [appointment, setAppointment] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    if (!reservationNumber.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/cancel?id=${reservationNumber.trim().toUpperCase()}`);
      const data = await res.json();
      if (data.success) {
        setAppointment(data.appointment);
        setStep("confirm");
      } else {
        setError(data.error || "予約が見つかりませんでした");
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reservationNumber.trim().toUpperCase() }),
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
          <p className="text-slate-500 text-sm mt-2">予約番号を入力してキャンセルしてください</p>
        </div>

        {step === "input" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Search className="w-5 h-5 text-blue-600" />
                予約番号を入力
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="例: ABC12345（英数字8文字）"
                value={reservationNumber}
                onChange={(e) => setReservationNumber(e.target.value.toUpperCase())}
                className="text-center text-lg tracking-widest font-mono"
                maxLength={8}
              />
              {error && <p className="text-red-500 text-sm text-center">{error}</p>}
              <Button
                onClick={handleSearch}
                disabled={loading || reservationNumber.length < 8}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {loading ? "検索中..." : "予約を検索する"}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "confirm" && appointment && (
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
                  <span className="font-bold">{appointment.name} 様</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">日時</span>
                  <span className="font-bold">{appointment.date} {appointment.time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">受診</span>
                  <span className="font-bold">{appointment.visitType}</span>
                </div>
              </div>
              <p className="text-red-600 text-sm text-center font-bold">この予約をキャンセルしますか？</p>
              {error && <p className="text-red-500 text-sm text-center">{error}</p>}
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep("input")}>
                  戻る
                </Button>
                <Button
                  onClick={handleCancel}
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
