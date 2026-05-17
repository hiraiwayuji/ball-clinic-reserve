"use client";

import { ListTodo } from "lucide-react";

// Phase 3 (5/20) で実装予定
// - 新規タスク登録フォーム
// - スタッフ別残タスクバッジ
// - フィルタ + 完了/未完了切替
// - 期限近・優先度ハイライト

export default function TasksTab() {
  return (
    <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-8 text-center">
      <ListTodo className="w-10 h-10 mx-auto mb-3 text-slate-400" />
      <h3 className="font-bold text-slate-700 mb-1">タスク管理</h3>
      <p className="text-sm text-slate-500">
        Phase 3 で実装予定（5/20 公開予定）<br />
        スタッフ別残タスクバッジ・期限管理・優先度ソートを搭載予定。
      </p>
    </div>
  );
}
