"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";

type Props = {
  totalCount: number;
  onClose: () => void;
};

export default function DailyCompletionCelebration({ totalCount, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-slate-900 border border-violet-700/50 rounded-3xl p-8 text-center max-w-sm shadow-2xl [animation:var(--animate-float-up)]">
        {/* キラキラ演出 */}
        <div className="flex justify-center gap-3 mb-4">
          <Sparkles
            className="w-6 h-6 text-violet-400 [animation:var(--animate-sparkle)] delay-100"
            style={{ animationDelay: "100ms" }}
          />
          <Sparkles
            className="w-8 h-8 text-indigo-400 [animation:var(--animate-sparkle)]"
            style={{ animationDelay: "200ms" }}
          />
          <Sparkles
            className="w-6 h-6 text-violet-400 [animation:var(--animate-sparkle)]"
            style={{ animationDelay: "300ms" }}
          />
        </div>

        {/* 絵文字 */}
        <div className="text-5xl mb-4">🎉</div>

        {/* テキスト */}
        <h2 className="text-2xl font-black text-white mb-2">
          本日の業務、お疲れ様でした！
        </h2>
        <p className="text-slate-400 mb-6">
          本日 {totalCount} 名様の対応が完了しました。
        </p>

        {/* ボタン */}
        <div className="flex flex-col gap-3">
          <Link
            href="/admin/sales"
            className="w-full px-4 py-3 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            今日の集計を確認する
          </Link>
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
