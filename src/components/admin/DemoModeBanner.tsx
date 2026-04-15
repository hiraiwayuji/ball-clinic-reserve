"use client";

import { isDemo } from "@/lib/app-mode";
import { FlaskConical } from "lucide-react";

/**
 * DEMOモード時にページ上部に表示するバナー
 * 機能制限がある場合はその旨を明示する
 */
export default function DemoModeBanner({ restrictions }: { restrictions?: string }) {
  if (!isDemo) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-3 mb-4">
      <FlaskConical className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-bold text-amber-300">デモモードで表示中</p>
        <p className="text-xs text-amber-400/80 mt-0.5">
          {restrictions || "一部の操作（パスワード変更・LINE連携解除など）は無効化されています。データの追加・閲覧は通常通り行えます。"}
        </p>
      </div>
    </div>
  );
}
