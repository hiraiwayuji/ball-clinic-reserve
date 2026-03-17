"use client";

import { useState } from "react";
import { signUpAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus, AlertTriangle, Mail, Lock, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default function AdminSetupPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    
    const formData = new FormData(e.currentTarget);
    const result = await signUpAction(formData);
    
    if (result && result.error) {
      setError(result.error);
      setIsLoading(false);
    } else if (result && result.success) {
      setSuccess(result.success);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      {/* Animated gradient background */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 25%, #4c1d95 50%, #312e81 75%, #0f172a 100%)',
          backgroundSize: '400% 400%',
          animation: 'gradientShift 15s ease infinite',
        }}
      />
      
      {/* Floating decorative orbs */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full opacity-10 blur-3xl z-0"
        style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)', animation: 'float 8s ease-in-out infinite' }}
      />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl z-0"
        style={{ background: 'radial-gradient(circle, #f59e0b, transparent)', animation: 'float 12s ease-in-out infinite reverse' }}
      />

      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo / Brand section */}
        <div className="text-center mb-8">
          <div 
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
            }}
          >
            <UserPlus className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            初期セットアップ
          </h1>
          <p className="text-amber-300/70 text-sm mt-2 font-medium tracking-wide">
            管理者アカウントの作成
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
          {/* Warning banner */}
          <div className="flex items-start gap-3 bg-amber-500/10 text-amber-300 text-xs p-3 rounded-xl border border-amber-500/20 mb-6">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>アカウント作成後は、セキュリティのためこのページを削除することをお勧めします。</p>
          </div>

          {!success ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email field */}
              <div className="space-y-2">
                <label htmlFor="email" className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  メールアドレス
                </label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-amber-400 transition-colors" />
                  <Input 
                    id="email" 
                    name="email"
                    type="email" 
                    placeholder="admin@example.com" 
                    required
                    className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-500/50 focus:ring-amber-500/20 rounded-xl transition-all"
                  />
                </div>
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <label htmlFor="password" className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  パスワード
                </label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-amber-400 transition-colors" />
                  <Input 
                    id="password" 
                    name="password"
                    type="password" 
                    placeholder="8文字以上を推奨" 
                    required
                    className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-500/50 focus:ring-amber-500/20 rounded-xl transition-all"
                  />
                </div>
              </div>

              {/* Setup Password field */}
              <div className="space-y-2">
                <label htmlFor="setupPassword" className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  セットアップ用合言葉
                </label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-amber-400 transition-colors" />
                  <Input 
                    id="setupPassword" 
                    name="setupPassword"
                    type="password" 
                    placeholder="SETUP_PASSWORD を入力" 
                    required
                    className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-500/50 focus:ring-amber-500/20 rounded-xl transition-all"
                  />
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
                className="w-full h-12 rounded-xl text-base font-bold shadow-lg transition-all duration-300 hover:shadow-amber-500/25 hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: isLoading 
                    ? 'rgba(245, 158, 11, 0.5)' 
                    : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    作成中...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    アカウントを作成
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </form>
          ) : (
            <div className="space-y-6 text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <p className="text-emerald-400 font-medium">{success}</p>
              <Link href="/admin-login">
                <Button 
                  className="w-full h-12 rounded-xl text-base font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
                  }}
                >
                  <span className="flex items-center gap-2">
                    ログイン画面へ
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </Button>
              </Link>
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
