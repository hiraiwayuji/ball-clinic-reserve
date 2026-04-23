"use client";

import { useState, useTransition } from "react";
import { updateEmailAction, updatePasswordAction } from "@/app/actions/auth";
import { toast } from "sonner";
import { Mail, Lock, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  currentEmail: string | null;
}

export default function AccountSettingsForm({ currentEmail }: Props) {
  // --- Email ---
  const [newEmail, setNewEmail] = useState("");
  const [emailPending, startEmailTransition] = useTransition();

  // --- Password ---
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordPending, startPasswordTransition] = useTransition();

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startEmailTransition(async () => {
      const fd = new FormData();
      fd.append("email", newEmail);
      const result = await updateEmailAction(fd);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(result.success);
        setNewEmail("");
      }
    });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startPasswordTransition(async () => {
      const fd = new FormData();
      fd.append("currentPassword", currentPassword);
      fd.append("newPassword", newPassword);
      fd.append("confirmPassword", confirmPassword);
      const result = await updatePasswordAction(fd);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(result.success ?? "パスワードを変更しました");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* メールアドレス変更 */}
      <div>
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2">
          <Mail className="w-4 h-4 text-blue-500" />
          メールアドレスの変更
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          現在のメールアドレス：<span className="font-medium text-slate-700 dark:text-slate-300">{currentEmail ?? "（未取得）"}</span>
        </p>
        <form onSubmit={handleEmailSubmit} className="flex gap-3 max-w-md">
          <Input
            type="email"
            placeholder="新しいメールアドレス"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            autoCapitalize="off"
            autoCorrect="off"
            className="h-10"
          />
          <Button
            type="submit"
            disabled={emailPending || !newEmail.trim()}
            className="h-10 px-5 shrink-0"
          >
            {emailPending ? "送信中..." : "変更する"}
          </Button>
        </form>
        <p className="text-xs text-slate-400 mt-2">※ 変更後、新しいメールアドレスに確認メールが届きます</p>
      </div>

      <div className="border-t dark:border-slate-800" />

      {/* パスワード変更 */}
      <div>
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2">
          <Lock className="w-4 h-4 text-blue-500" />
          パスワードの変更
        </h3>
        <p className="text-xs text-slate-500 mb-4">8文字以上のパスワードを設定してください</p>
        <form onSubmit={handlePasswordSubmit} className="space-y-3 max-w-md">
          {/* 現在のパスワード */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              type={showCurrent ? "text" : "password"}
              placeholder="現在のパスワード"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoCapitalize="off"
              autoCorrect="off"
              className="pl-9 pr-10 h-10"
            />
            <button type="button" tabIndex={-1}
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* 新しいパスワード */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              type={showNew ? "text" : "password"}
              placeholder="新しいパスワード（8文字以上）"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoCapitalize="off"
              autoCorrect="off"
              className="pl-9 pr-10 h-10"
            />
            <button type="button" tabIndex={-1}
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* 確認 */}
          <div className="relative">
            <CheckCircle2 className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${confirmPassword && confirmPassword === newPassword ? "text-emerald-500" : "text-slate-400"}`} />
            <Input
              type={showConfirm ? "text" : "password"}
              placeholder="新しいパスワード（確認）"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoCapitalize="off"
              autoCorrect="off"
              className="pl-9 pr-10 h-10"
            />
            <button type="button" tabIndex={-1}
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <Button
            type="submit"
            disabled={passwordPending || !currentPassword || !newPassword || !confirmPassword}
            className="w-full h-10"
          >
            {passwordPending ? "変更中..." : "パスワードを変更する"}
          </Button>
        </form>
      </div>
    </div>
  );
}
