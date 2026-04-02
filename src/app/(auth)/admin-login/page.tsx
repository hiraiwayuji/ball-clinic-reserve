"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginAction, sendPasswordResetEmail } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Mail, Eye, EyeOff, Shield, ArrowRight } from "lucide-react";
import Image from "next/image";

export default function AdminLoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await loginAction(formData);

    if (result?.error) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    // クッキーが確定してからナビゲート（スマホブラウザ対応）
    router.push("/admin");
    router.refresh();
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const result = await sendPasswordResetEmail(resetEmail, window.location.origin);
    setIsLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setResetSent(true);
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      {/* Animated gradient background */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 25%, #0f4c81 50%, #1e3a5f 75%, #0f172a 100%)',
          backgroundSize: '400% 400%',
          animation: 'gradientShift 15s ease infinite',
        }}
      />
      
      {/* Floating decorative orbs */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full opacity-10 blur-3xl z-0"
        style={{ background: 'radial-gradient(circle, #3b82f6, transparent)', animation: 'float 8s ease-in-out infinite' }}
      />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl z-0"
        style={{ background: 'radial-gradient(circle, #06b6d4, transparent)', animation: 'float 12s ease-in-out infinite reverse' }}
      />
      <div className="absolute top-1/2 right-1/3 w-48 h-48 rounded-full opacity-5 blur-2xl z-0"
        style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)', animation: 'float 10s ease-in-out infinite 2s' }}
      />

      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div 
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 shadow-2xl overflow-hidden bg-white/10 backdrop-blur-sm"
            style={{
              boxShadow: '0 0 40px rgba(59, 130, 246, 0.3)',
            }}
          >
            <div className="relative w-14 h-14">
              <Image 
                src="/images/logo-white.png" 
                alt="ボール接骨院" 
                fill 
                className="object-contain"
              />
            </div>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            ボール接骨院
          </h1>
          <p className="text-blue-300/70 text-sm mt-2 font-medium tracking-wide">
            予約管理システム
          </p>
        </div>

        {/* Glass card */}
        <div 
          className="rounded-2xl p-8 shadow-2xl border border-white/10"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-white">管理者ログイン</h2>
            <p className="text-slate-400 text-sm mt-1">アカウント情報を入力してください</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email field */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                メールアドレス
              </label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="admin@example.com"
                  required
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="email"
                  spellCheck={false}
                  className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl transition-all"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                パスワード
              </label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="パスワードを入力"
                  required
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="current-password"
                  spellCheck={false}
                  className="pl-10 pr-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            
            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 text-red-400 text-sm p-3 rounded-xl border border-red-500/20">
                <div className="w-2 h-2 rounded-full bg-red-400 shrink-0 animate-pulse" />
                {error}
              </div>
            )}

            {/* Submit button */}
            <Button 
              type="submit" 
              className="w-full h-12 rounded-xl text-base font-bold shadow-lg transition-all duration-300 hover:shadow-blue-500/25 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: isLoading 
                  ? 'rgba(59, 130, 246, 0.5)' 
                  : 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  認証中...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  ログイン
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </form>

          {/* Footer hint */}
          <div className="mt-8 pt-6 border-t border-white/5 text-center space-y-3">
            <p className="text-slate-500 text-xs">
              セッションはブラウザを閉じても保持されます
            </p>
            <button
              type="button"
              onClick={() => { setShowReset(!showReset); setError(null); setResetSent(false); }}
              className="text-blue-400/70 hover:text-blue-300 text-xs underline underline-offset-2 transition-colors"
            >
              パスワードをお忘れの方はこちら
            </button>
          </div>

          {/* パスワードリセットフォーム */}
          {showReset && (
            <div className="mt-6 pt-6 border-t border-white/10">
              {resetSent ? (
                <div className="text-center text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                  ✅ リセット用メールを送信しました。<br />
                  メールのリンクをクリックして新しいパスワードを設定してください。
                </div>
              ) : (
                <form onSubmit={handlePasswordReset} className="space-y-3">
                  <p className="text-slate-400 text-xs text-center">
                    登録済みのメールアドレスを入力してください
                  </p>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="admin@example.com"
                      required
                      autoCapitalize="off"
                      autoCorrect="off"
                      autoComplete="email"
                      spellCheck={false}
                      className="pl-10 h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 rounded-xl"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-11 rounded-xl text-sm font-semibold text-white transition-all"
                    style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}
                  >
                    {isLoading ? "送信中..." : "リセットメールを送信"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Copyright */}
        <p className="text-center text-slate-600 text-xs mt-8">
          © 2026 ボール接骨院 All rights reserved.
        </p>
      </div>

      {/* CSS animations */}
      <style jsx>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes float {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(30px, -30px); }
        }
      `}</style>
    </div>
  );
}
