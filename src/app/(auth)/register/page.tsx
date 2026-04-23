"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUpAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Mail, Eye, EyeOff, Building2, KeyRound, ArrowRight, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
const _isExternalLogo = CLINIC_CONFIG.logoSmallUrl.startsWith("http");

export default function RegisterPage() {
  const [error, setError]         = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone]           = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const password  = formData.get("password") as string;
    const confirm   = formData.get("confirmPassword") as string;

    if (password !== confirm) {
      setError("パスワードが一致しません。");
      setIsLoading(false);
      return;
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上で設定してください。");
      setIsLoading(false);
      return;
    }

    const result = await signUpAction(formData);

    if (result?.error) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    setDone(true);
    if (result?.autoLogin) {
      setTimeout(() => {
        router.push("/admin");
        router.refresh();
      }, 1500);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 25%, #064e3b 50%, #1e293b 75%, #0f172a 100%)",
          backgroundSize: "400% 400%",
          animation: "gradientShift 15s ease infinite",
        }}
      />
      <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full opacity-10 blur-3xl z-0"
        style={{ background: "radial-gradient(circle, #10b981, transparent)", animation: "float 8s ease-in-out infinite" }}
      />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl z-0"
        style={{ background: "radial-gradient(circle, #06b6d4, transparent)", animation: "float 12s ease-in-out infinite reverse" }}
      />
      <div
        className="absolute inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className={`inline-flex items-center justify-center rounded-2xl mb-6 shadow-2xl overflow-hidden bg-white/10 backdrop-blur-sm ${CLINIC_CONFIG.usesWordmarkLogo ? "px-4 py-3" : "w-20 h-20"}`}
            style={{ boxShadow: "0 0 40px rgba(16, 185, 129, 0.3)" }}
          >
            <div className={`relative ${CLINIC_CONFIG.usesWordmarkLogo ? "w-40 h-12 bg-white rounded-lg px-2 py-1" : "w-14 h-14"}`}>
              {_isExternalLogo ? (
                  <img src={CLINIC_CONFIG.logoSmallUrl} alt={CLINIC_CONFIG.nameShort} className="max-h-12 w-auto object-contain" />
                ) : (
                  <Image src={CLINIC_CONFIG.logoSmallUrl} alt={CLINIC_CONFIG.nameShort} fill className="object-contain" />
                )}
            </div>
          </div>
          {!CLINIC_CONFIG.usesWordmarkLogo && <h1 className="text-3xl font-black text-white tracking-tight">接骨院管理システム</h1>}
          <p className="text-emerald-300/70 text-sm mt-2 font-medium tracking-wide">
            新規クリニック登録
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8 shadow-2xl border border-white/10"
          style={{
            background: "rgba(255, 255, 255, 0.05)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {done ? (
            /* 完了画面 */
            <div className="text-center py-8 space-y-4">
              <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />
              <h2 className="text-xl font-bold text-white">登録完了！</h2>
              <p className="text-slate-300 text-sm">
                クリニックアカウントを作成しました。<br />
                ダッシュボードに移動します…
              </p>
              <p className="text-slate-500 text-xs">
                自動移動しない場合は
                <button onClick={() => router.push("/admin")} className="text-emerald-400 underline ml-1">
                  こちら
                </button>
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-white">アカウント作成</h2>
                <p className="text-slate-400 text-sm mt-1">
                  発行されたセットアップコードを使って登録してください
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* 院名 */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    院名・クリニック名
                  </label>
                  <div className="relative group">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                    <Input
                      name="clinicName"
                      type="text"
                      placeholder="○○接骨院"
                      required
                      className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:ring-emerald-500/20 rounded-xl"
                    />
                  </div>
                </div>

                {/* メール */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    メールアドレス
                  </label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                    <Input
                      name="email"
                      type="email"
                      placeholder="doctor@example.com"
                      required
                      autoCapitalize="off"
                      autoCorrect="off"
                      autoComplete="email"
                      spellCheck={false}
                      className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:ring-emerald-500/20 rounded-xl"
                    />
                  </div>
                </div>

                {/* パスワード */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    パスワード（8文字以上）
                  </label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                    <Input
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="パスワードを設定"
                      required
                      autoCapitalize="off"
                      autoCorrect="off"
                      autoComplete="new-password"
                      spellCheck={false}
                      className="pl-10 pr-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:ring-emerald-500/20 rounded-xl"
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

                {/* パスワード確認 */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    パスワード（確認）
                  </label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                    <Input
                      name="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="同じパスワードを入力"
                      required
                      autoCapitalize="off"
                      autoCorrect="off"
                      autoComplete="new-password"
                      spellCheck={false}
                      className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:ring-emerald-500/20 rounded-xl"
                    />
                  </div>
                </div>

                {/* セットアップコード */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    セットアップコード
                  </label>
                  <div className="relative group">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                    <Input
                      name="setupPassword"
                      type="password"
                      placeholder="発行されたコードを入力"
                      required
                      autoCapitalize="off"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck={false}
                      className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:ring-emerald-500/20 rounded-xl"
                    />
                  </div>
                  <p className="text-slate-500 text-xs pl-1">
                    ※ 管理者から発行されるコードです
                  </p>
                </div>

                {/* エラー */}
                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 text-red-400 text-sm p-3 rounded-xl border border-red-500/20">
                    <div className="w-2 h-2 rounded-full bg-red-400 shrink-0 animate-pulse" />
                    {error}
                  </div>
                )}

                {/* 送信 */}
                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl text-base font-bold shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] mt-2"
                  style={{
                    background: isLoading
                      ? "rgba(16, 185, 129, 0.5)"
                      : "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
                  }}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      登録中...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      クリニックを登録する
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </form>

              <div className="mt-6 pt-5 border-t border-white/5 text-center">
                <p className="text-slate-500 text-xs">
                  すでにアカウントをお持ちの方は
                  <a href="/admin-login" className="text-emerald-400/80 hover:text-emerald-300 underline underline-offset-2 ml-1">
                    こちらからログイン
                  </a>
                </p>
              </div>
            </>
          )}
        </div>

        <div className="text-center mt-6 space-y-2">
          <div className="flex justify-center gap-4 text-xs">
            <a href="/terms"   target="_blank" className="text-slate-500 hover:text-slate-300 underline underline-offset-2">利用規約</a>
            <a href="/privacy" target="_blank" className="text-slate-500 hover:text-slate-300 underline underline-offset-2">プライバシーポリシー</a>
          </div>
          <p className="text-slate-600 text-xs">© 2026 接骨院管理システム All rights reserved.</p>
        </div>
      </div>

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
