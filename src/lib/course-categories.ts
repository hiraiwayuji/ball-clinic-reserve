// コース分類カテゴリ（柔整 / 鍼灸 / 整体）の共通定義
// "use server" ファイルからは非 async export を出せないため、
// const / type は別ファイルに分離してここに集約する（Next.js 16 制約）。

export type CourseCategory = "jusei" | "shinkyu" | "seitai";

export const COURSE_CATEGORIES: CourseCategory[] = ["jusei", "shinkyu", "seitai"];

export const CATEGORY_LABELS: Record<CourseCategory, string> = {
  jusei: "柔整",
  shinkyu: "鍼灸",
  seitai: "整体",
};
