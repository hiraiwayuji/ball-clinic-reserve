#!/usr/bin/env node
/**
 * "use server" 非関数 export 監査スクリプト
 *
 * Next.js の制約: 先頭に "use server" ディレクティブを持つファイル（Server Actions）は
 * **async 関数しか export できない**。オブジェクト/配列/定数などの値を export すると
 * 本番ビルド（next build / next start）でのみ
 *   Error: A "use server" file can only export async functions, found object.
 * が発生し、そのファイルを読み込むページ全体が 500 になる。
 * （dev では再現しないため見逃されやすい。2026-06-21 に全adminページ障害の原因になった）
 *
 * このスクリプトは src/ 配下の "use server" ファイルを検出し、
 * 非 async 関数の値 export を ERROR として報告する（CI/ビルドを止める）。
 *
 * 使い方: node scripts/audit-use-server-exports.mjs
 * 終了コード: 0=問題なし / 1=違反あり
 *
 * 例外: 該当 export 行の直前/同行に `// use-server-export-ignore` コメントがあれば許容。
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "src");

const IGNORE_FILES = [/\.next\//, /node_modules\//, /\.test\./, /\.spec\./, /\.bak$/];

/** ファイル先頭の実ステートメントが "use server" ディレクティブかを判定。
 *  コメント・空行はスキップ。コメント内に "use server" があるだけのファイルは対象外。 */
function isUseServerFile(src) {
  let i = 0;
  const n = src.length;
  while (i < n) {
    // 空白
    if (/\s/.test(src[i])) { i++; continue; }
    // 行コメント
    if (src[i] === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    // ブロックコメント
    if (src[i] === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    // 最初の実トークン: "use server" / 'use server' ならディレクティブ
    const rest = src.slice(i);
    return rest.startsWith('"use server"') || rest.startsWith("'use server'");
  }
  return false;
}

/** 行が「非関数の値 export」かを判定。
 *  export const/let/var/default で、async / function / => を含まない行（=値の export）を違反とみなす。
 *  型 export（export type / export interface）は実行時に消えるので対象外。 */
function isValueExportLine(line) {
  const t = line.trim();
  if (!/^export\s+(const|let|var|default)\b/.test(t)) return false;
  if (/^export\s+(type|interface)\b/.test(t)) return false;
  // async 関数・通常関数・アロー関数の export は OK
  if (/\basync\b/.test(t) || /\bfunction\b/.test(t) || /=>/.test(t)) return false;
  return true;
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mjs|cjs|js)$/.test(name)) {
      const rel = path.relative(process.cwd(), full).replace(/\\/g, "/");
      if (IGNORE_FILES.some((re) => re.test(rel))) continue;
      out.push(full);
    }
  }
  return out;
}

const violations = [];
const files = walk(ROOT);

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  if (!isUseServerFile(src)) continue;
  const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!isValueExportLine(lines[i])) continue;
    // 例外コメント
    const prev = i > 0 ? lines[i - 1] : "";
    if (/use-server-export-ignore/.test(lines[i]) || /use-server-export-ignore/.test(prev)) continue;
    violations.push({ file: rel, line: i + 1, snippet: lines[i].trim().slice(0, 100) });
  }
}

if (violations.length === 0) {
  console.log(`✅ "use server" export OK (${files.length} ファイルをチェック)`);
  console.log(`   Server Actions ファイルは async 関数のみを export しています。`);
  process.exit(0);
}

console.error(`\n❌ "use server" ファイルが非関数の値を export しています（本番ビルドで500になります）:\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.snippet}`);
}
console.error(`\n対処: 値（定数オブジェクト/配列）は "use server" でない別ファイル（例 src/lib/*.ts）へ移し、`);
console.error(`      型は import type で参照、import 元を更新してください。`);
console.error(`      意図的な場合は該当行に // use-server-export-ignore を付けてください。\n`);
process.exit(1);
