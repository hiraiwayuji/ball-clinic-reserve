"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Eye, EyeOff, ArrowRight } from "lucide-react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("パスワードが一致しません");
      return;
    }
    if (password.length < 6) {
      setError("パスワードは6文字以上で入力してください");
      return;
    }

    setIsLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError("パスワードの更新に失敗しました: " + error.message);
      setIsLoading(false);
      return;
    }

    router.push("/admin-login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f4c81 100%)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-white">パスワード再設定</h1>
          <p className="text-blue-300/70 text-sm mt-2">新しいパスワードを入力してください</p>
        </div>

        <div className="rounded-2xl p-8 border border-white/10"
          style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)" }}>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                新しいパスワード
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="6文字以上"
                  required
                  className="pl-10 pr-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-slate-500 rounded-xl"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                パスワード確認
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="もう一度入力"
                  required
                  className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-slate-500 rounded-xl"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 text-red-400 text-sm p-3 rounded-xl border border-red-500/20">
                <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-xl text-base font-bold"
              style={{ background: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)" }}>
              {isLoading ? "更新中..." : (
                <span className="flex items-center gap-2">
                  パスワードを更新 <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
