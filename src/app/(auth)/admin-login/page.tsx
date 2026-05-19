"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginAction, sendPasswordResetEmail, demoLoginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Mail, Eye, EyeOff, Shield, ArrowRight, FlaskConical } from "lucide-react";
import Image from "next/image";
import { isDemo, isFamilyGift, APP_TITLE } from "@/lib/app-mode";
import { CLINIC_CONFIG } from "@/lib/clinic-config";

const ERROR_MESSAGES: Record<string, string> = {
  "no-clinic-access":
    "このアカウントは当院の管理画面にアクセス権がありません。別のアカウントでログインするか、管理者にお問い合わせください。",
  "misconfigured":
    "システム設定に問題があります。管理者にお問い合わせください（NEXT_PUBLIC_CLINIC_ID 未設定）。",
};

export default function AdminLoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL の ?error=... を読んでメッセージ表示（checkAdminAuth からのリダイレクト用）
  useEffect(() => {
    const errCode = searchParams.get("error");
    if (errCode && ERROR_MESSAGES[errCode]) {
      setError(ERROR_MESSAGES[errCode]);
    }
  }, [searchParams]);

  const handleDemoLogin = async () => {
    setIsDemoLoading(true);
    setError(null);
    const result = await demoLoginAction();
    if (result?.error) {
      setError(result.error);
      setIsDemoLoading(false);
      return;
    }
    router.push("/admin");
    router.refresh();
  };

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
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-[#F7FAFC] via-white to-[#E0F2FE]/40">
      <div className="w-full max-w-md">
        {/* ヘッダー: ロゴ + 院名 */}
        <div className="text-center mb-8">
          <div
            className={`inline-flex items-center justify-center rounded-2xl mb-6 bg-white border border-slate-200 shadow-sm overflow-hidden ${
              CLINIC_CONFIG.hasCustomLogo && CLINIC_CONFIG.usesWordmarkLogo ? "px-4 py-3" : "w-20 h-20"
            }`}
          >
            <div
              className={`relative flex items-center justify-center ${
                CLINIC_CONFIG.hasCustomLogo && CLINIC_CONFIG.usesWordmarkLogo ? "w-40 h-12" : "w-14 h-14"
              }`}
            >
              {CLINIC_CONFIG.hasCustomLogo ? (
                <img
                  src={CLINIC_CONFIG.logoSmallUrl}
                  alt={CLINIC_CONFIG.nameShort}
                  className="max-h-12 w-auto object-contain"
                />
              ) : CLINIC_CONFIG.isDefaultClinic ? (
                <Image
                  src={CLINIC_CONFIG.logoSmallUrl}
                  alt={CLINIC_CONFIG.nameShort}
                  fill
                  className="object-contain"
                />
              ) : (
                <Shield className="w-10 h-10 text-[#2563EB]" />
              )}
            </div>
          </div>
          {!CLINIC_CONFIG.usesWordmarkLogo && (
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {isFamilyGift ? APP_TITLE : CLINIC_CONFIG.nameShort}
            </h1>
          )}
          <p className="text-slate-500 text-sm mt-2">
            {isDemo ? "デモ環境 - 自由にお試しいただけます" : "予約管理システム"}
          </p>
          {isDemo && (
            <span className="mt-3 inline-block text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-full">
              DEMO MODE
            </span>
          )}
        </div>

        {/* ログインカード */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-8">
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-slate-900">管理者ログイン</h2>
            <p className="text-slate-500 text-sm mt-1">アカウント情報を入力してください</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-xs font-semibold text-slate-600 uppercase tracking-wider"
              >
                メールアドレス
              </label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#2563EB] transition-colors" />
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
                  className="pl-10 h-11 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:border-[#2563EB] focus-visible:ring-[#2563EB]/20 rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-xs font-semibold text-slate-600 uppercase tracking-wider"
              >
                パスワード
              </label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#2563EB] transition-colors" />
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
                  className="pl-10 pr-10 h-11 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:border-[#2563EB] focus-visible:ring-[#2563EB]/20 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-rose-50 text-rose-700 text-sm p-3 rounded-lg border border-rose-200">
                <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 rounded-lg text-base font-semibold bg-[#2563EB] hover:bg-[#1d4ed8] text-white transition-colors"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
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

          {isDemo && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleDemoLogin}
                disabled={isDemoLoading || isLoading}
                className="w-full h-11 rounded-lg text-base font-semibold transition-colors flex items-center justify-center gap-2 border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                {isDemoLoading ? (
                  <span className="w-4 h-4 border-2 border-amber-300/40 border-t-amber-600 rounded-full animate-spin" />
                ) : (
                  <FlaskConical className="w-4 h-4" />
                )}
                {isDemoLoading ? "ログイン中..." : "デモサイトを体験する"}
              </button>
              <p className="text-center text-amber-600/70 text-xs mt-2">
                テスト用アカウントで自動ログインします
              </p>
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-slate-200 text-center space-y-3">
            <p className="text-slate-500 text-xs">
              セッションはブラウザを閉じても保持されます
            </p>
            <button
              type="button"
              onClick={() => {
                setShowReset(!showReset);
                setError(null);
                setResetSent(false);
              }}
              className="text-[#2563EB] hover:text-[#1d4ed8] text-xs underline underline-offset-2 transition-colors"
            >
              パスワードをお忘れの方はこちら
            </button>
          </div>

          {showReset && (
            <div className="mt-5 pt-5 border-t border-slate-200">
              {resetSent ? (
                <div className="text-center text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  ✅ リセット用メールを送信しました。<br />
                  メールのリンクをクリックして新しいパスワードを設定してください。
                </div>
              ) : (
                <form onSubmit={handlePasswordReset} className="space-y-3">
                  <p className="text-slate-500 text-xs text-center">
                    登録済みのメールアドレスを入力してください
                  </p>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
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
                      className="pl-10 h-10 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-10 rounded-lg text-sm font-semibold text-white bg-[#0EA5E9] hover:bg-[#0284C7] transition-colors disabled:opacity-50"
                  >
                    {isLoading ? "送信中..." : "リセットメールを送信"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-slate-400 text-xs mt-6">
          © {new Date().getFullYear()} {CLINIC_CONFIG.nameShort} All rights reserved.
        </p>
      </div>
    </div>
  );
}
