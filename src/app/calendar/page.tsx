"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Users, Plus, ArrowRight, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ensureCalendarExists } from "@/app/actions/calendar";

function generateCalendarId(): string {
  // 人間が読みやすい8文字のID
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// 履歴管理用の型と関数
type CalendarHistory = {
  id: string;
  name: string;
  lastAccessed: number;
};

function getHistory(): CalendarHistory[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem("calendar_history");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveToHistory(id: string, name: string = "ファミリーカレンダー") {
  if (typeof window === "undefined") return;
  try {
    const history = getHistory();
    const newHistory = [
      { id, name, lastAccessed: Date.now() },
      ...history.filter(h => h.id !== id)
    ].slice(0, 5); // 最新5件まで保存
    localStorage.setItem("calendar_history", JSON.stringify(newHistory));
  } catch (e) {
    console.error("Failed to save history:", e);
  }
}

export default function CalendarLandingPage() {
  const router = useRouter();
  const [joinId, setJoinId] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<CalendarHistory[]>([]);

  // クライアントマウント時に履歴を読み込む
  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const handleCreate = async () => {
    const newId = generateCalendarId();
    await ensureCalendarExists(newId, "ファミカレ");
    saveToHistory(newId, "新規作成カレンダー"); // 履歴に保存
    router.push(`/calendar/${newId}`);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = joinId.trim().toLowerCase();
    if (!trimmed) { setError("IDを入力してください"); return; }
    if (trimmed.length < 4) { setError("有効なカレンダーIDを入力してください"); return; }
    saveToHistory(trimmed, "カレンダー"); // 履歴に保存
    router.push(`/calendar/${trimmed}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-950 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
      {/* 背景の装飾円 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* ロゴ・タイトル */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-white/20">
            <CalendarDays className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">ファミリーカレンダー</h1>
          <p className="text-white/60 text-sm">家族みんなで使えるGoogleカレンダー風アプリ</p>
        </div>

        {/* 新規作成カード */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-4 ring-1 ring-white/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-violet-500/30 rounded-xl flex items-center justify-center">
              <Plus className="w-5 h-5 text-violet-200" />
            </div>
            <div>
              <p className="font-semibold text-white">新しいカレンダーを作成</p>
              <p className="text-white/50 text-xs">URLを共有するだけで家族と使えます</p>
            </div>
          </div>
          <Button
            onClick={handleCreate}
            className="w-full bg-violet-500 hover:bg-violet-400 text-white font-bold h-12 rounded-xl transition"
          >
            カレンダーを新規作成
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {/* 既存参加カード */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 ring-1 ring-white/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-indigo-500/30 rounded-xl flex items-center justify-center">
              <Key className="w-5 h-5 text-indigo-200" />
            </div>
            <div>
              <p className="font-semibold text-white">既存のカレンダーに参加</p>
              <p className="text-white/50 text-xs">カレンダーIDまたはURLを入力</p>
            </div>
          </div>
          <form onSubmit={handleJoin} className="space-y-3">
            <Input
              value={joinId}
              onChange={(e) => { setJoinId(e.target.value); setError(""); }}
              placeholder="カレンダーID（例: abc12345）"
              className="bg-white/10 border-white/20 text-white placeholder:text-white/30 h-12 rounded-xl focus:ring-indigo-400"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <Button
              type="submit"
              variant="outline"
              className="w-full border-white/30 text-white hover:bg-white/10 hover:text-white h-12 rounded-xl font-bold transition"
            >
              <Users className="w-4 h-4 mr-2" />
              参加する
            </Button>
          </form>
        </div>

        {/* 履歴リスト */}
        {history.length > 0 && (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 ring-1 ring-white/20 mt-4">
            <p className="font-semibold text-white mb-3 text-sm">最近使ったカレンダー</p>
            <div className="space-y-2">
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => router.push(`/calendar/${h.id}`)}
                  className="w-full flex items-center justify-between bg-white/5 hover:bg-white/20 transition p-3 rounded-lg text-left"
                >
                  <div>
                    <p className="text-white text-sm font-medium">{h.id}</p>
                    <p className="text-white/50 text-xs">
                      {new Date(h.lastAccessed).toLocaleDateString()} にアクセス
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-white/50" />
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-white/30 text-xs mt-6">
          カレンダーIDを知っている人なら誰でも参加できます
        </p>
      </div>
    </div>
  );
}
