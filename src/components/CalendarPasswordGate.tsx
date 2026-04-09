"use client";

import { useState } from "react";
import { Lock, Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyCalendarPassword } from "@/app/actions/family-calendar";
import { toast } from "sonner";

interface Props {
  calendarId: string;
  onVerified: () => void;
}

export default function CalendarPasswordGate({ calendarId, onVerified }: Props) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    try {
      const res = await verifyCalendarPassword(calendarId, password);
      if (res.success) {
        localStorage.setItem(`family_calendar_auth_${calendarId}`, password);
        onVerified();
        toast.success("認証しました");
      } else {
        toast.error("合言葉が正しくありません");
      }
    } catch (e) {
      toast.error("認証中にエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center border border-slate-800 shadow-2xl">
            <Lock className="w-10 h-10 text-violet-500 animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">合言葉が必要です</h1>
            <p className="text-slate-500 text-sm mt-2">
              このカレンダーは保護されています。<br />
              共有された合言葉を入力してください。
            </p>
          </div>
        </div>

        <form onSubmit={handleVerify} className="space-y-4 pt-4">
          <div className="relative group">
            <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-violet-400 transition-colors" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="合言葉を入力"
              autoFocus
              className="w-full h-14 bg-slate-900 border border-slate-800 rounded-2xl pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-shadow text-center tracking-widest placeholder:tracking-normal"
            />
          </div>
          <Button
            type="submit"
            disabled={loading || !password}
            className="w-full h-14 rounded-2xl bg-violet-600 hover:bg-violet-500 text-lg font-bold shadow-xl shadow-violet-900/20"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "カレンダーを開く"}
          </Button>
        </form>

        <p className="text-[10px] text-slate-600">
          一度認証すると、このブラウザでは次回から自動的に開けます。
        </p>
      </div>
    </div>
  );
}
