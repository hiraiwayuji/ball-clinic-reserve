"use client";

import { useEffect, useState } from "react";
import { Bot, X } from "lucide-react";

type Props = {
  patientName: string;
  isFirstVisit?: boolean;
  onClose: () => void;
  onGoToCounter: () => void;
};

export default function PostSaleSecretaryPopup({
  patientName,
  isFirstVisit = false,
  onClose,
  onGoToCounter,
}: Props) {
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 8000);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 [animation:var(--animate-float-up)]">
      <div className="bg-slate-900 border border-indigo-700/60 rounded-2xl shadow-2xl w-72 p-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-violet-500 rounded-full flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <span className="text-[11px] font-black text-violet-400 uppercase tracking-wider">AI秘書</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* メッセージ */}
        <div className="mb-4">
          {isFirstVisit ? (
            <p className="text-sm text-slate-200 leading-snug">
              <span className="font-bold text-white">{patientName}様（初診）</span>の入力完了！🎉<br />
              <span className="text-slate-400">カルテ登録と次回案内をお忘れなく。受付に戻りますか？</span>
            </p>
          ) : (
            <p className="text-sm text-slate-200 leading-snug">
              <span className="font-bold text-white">{patientName}様</span>の売上入力、完了しました！<br />
              <span className="text-slate-400">次の方の準備はよろしいですか？</span>
            </p>
          )}
        </div>

        {/* ボタン */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onGoToCounter}
            className="w-full px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            受付に戻る
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            続けて入力
          </button>
        </div>

        {/* カウントダウン */}
        <p className="mt-2 text-[10px] text-slate-600 text-center">{countdown}秒後に自動で閉じます</p>
      </div>
    </div>
  );
}
