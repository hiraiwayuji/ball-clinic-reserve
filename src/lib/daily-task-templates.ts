// 先生タスクのテンプレ定義（候補ボタン用）。
// "use server" ファイル（staff-daily-tasks.ts）からは値（オブジェクト/配列）を
// export できない（本番ビルドで "A use server file can only export async functions" エラー）ため、
// 値だけをこの非サーバーファイルに分離する。型は import type で参照（実行時には消える）。

import type { TaskKind } from "@/app/actions/staff-daily-tasks";

/** この院でよく使う業務テンプレ（先生の自己追加・院長の手動追加の候補ボタンに使用）。 */
export const TASK_TEMPLATES: { title: string; kind: TaskKind }[] = [
  { title: "柔整書類の確認", kind: "karte" },
  { title: "保険証の確認", kind: "karte" },
  { title: "カルテ整理", kind: "karte" },
  { title: "受付業務のお手伝い", kind: "other" },
  { title: "ベッドメイキング", kind: "cleaning" },
  { title: "細かい場所のお掃除", kind: "cleaning" },
  { title: "トイレ掃除", kind: "cleaning" },
  { title: "朝の掃除", kind: "cleaning" },
  { title: "SNS投稿・ブログ下書き", kind: "sns" },
];
