#!/usr/bin/env node
/**
 * 患者さん向け文面の「施術時間の決め打ち」監査スクリプト
 *
 * 【背景】2026-07-27、60分で確定した予約の確定LINEに「再診（30分）」と書かれて患者さんに届いた。
 * 原因は文面の組み立てが
 *     is_first_visit ? "初診（60分）" : "再診（30分）"
 * という決め打ちで、実際の施術時間（end_time - start_time）を見ていなかったこと。
 * ボール接骨院の直近90日は 995件中 403件（約4割）が決め打ちと実時間が食い違っており、
 * 確定LINEを送るたびに誤った時間が届きうる状態だった。
 *
 * このスクリプトは「初診/再診の判定と分数表記が同じ式に同居している」箇所を検出して
 * ビルドを止める。施術時間は必ず src/lib/appointment-summary.ts の関数を通すこと。
 *
 * 使い方: node scripts/audit-patient-duration.mjs
 * 終了コード: 0=問題なし / 1=違反あり
 *
 * 例外: 該当行または直前行に `// patient-duration-ignore: <理由>` コメントがあれば許容。
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "src");
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build"]);
// プレゼン資料・デモ画面は患者さんに届く文面ではないので対象外
const SKIP_PATHS = [/[\\/]presentation[\\/]/];

/** 初診/再診の分岐と「N分」表記が同じ行に同居していたら決め打ちの疑い */
const HARDCODED = /is_first_visit[^\n]*\?[^\n]*\d+\s*分/;

/** コメント行（// … / * … / /* …）は説明文なので対象外。このファイル自身の解説も引っかかるため。 */
function isCommentLine(line) {
  return /^\s*(\/\/|\*|\/\*)/.test(line);
}

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    const rel = path.relative(process.cwd(), full);
    if (SKIP_PATHS.some((re) => re.test(rel))) continue;
    files.push({ full, rel });
  }
})(ROOT);

const violations = [];
for (const { full, rel } of files) {
  const lines = fs.readFileSync(full, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!HARDCODED.test(lines[i])) continue;
    if (isCommentLine(lines[i])) continue;
    const prev = i > 0 ? lines[i - 1] : "";
    if (/patient-duration-ignore/.test(lines[i]) || /patient-duration-ignore/.test(prev)) continue;
    violations.push({ file: rel, line: i + 1, snippet: lines[i].trim().slice(0, 120) });
  }
}

if (violations.length === 0) {
  console.log(`✅ 施術時間の決め打ちなし (${files.length} ファイルをチェック)`);
  console.log(`   患者さん向けの分数表記は end_time から算出されています。`);
  process.exit(0);
}

console.error(`\n❌ 施術時間を初診/再診から決め打ちしている箇所があります（患者さんに誤った時間が届きます）:\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.snippet}`);
}
console.error(`\n対処: src/lib/appointment-summary.ts の formatTimeRange / formatVisitLabel を使い、`);
console.error(`      施術時間は end_time - start_time から出してください。`);
console.error(`      患者さんに届かない画面など意図的な場合は // patient-duration-ignore: 理由 を付けてください。\n`);
process.exit(1);
