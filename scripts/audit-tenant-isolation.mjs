#!/usr/bin/env node
/**
 * テナント分離監査スクリプト
 *
 * src/ 以下のすべてのファイルを走査し、テナント分離テーブルへの Supabase クエリで
 * clinic_id（or clinic_settings なら id）フィルタが付いているかを検出する。
 *
 * 使い方:
 *   node scripts/audit-tenant-isolation.mjs
 *
 * 終了コード:
 *   0 - 漏れなし
 *   1 - 漏れあり（CIで失敗扱いにする）
 *
 * 検出ロジック:
 *   `.from("テーブル名")` を見つけて、そこから次の `;` または空行か
 *   `.insert(`/`.update(`/`.delete(` までを 1 クエリチェーンとみなし、
 *   その範囲に `.eq("clinic_id"` （clinic_settings なら `.eq("id"`）が
 *   出現するかをチェックする。
 *
 *   INSERT は body 内に clinic_id: ... があれば OK とみなす。
 *
 * 例外ルール:
 *   - // tenant-isolation-ignore コメントがチェーン直前/直後にあれば許容
 *   - clinic_users への user_id 検索（認証フロー）は別途許容
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "src");

/** clinic_id カラムを持つテーブル */
const TENANT_TABLES = new Set([
  "admin_notification_targets",
  "ai_blog_proposals",
  "ai_chat_messages",
  "ai_memos",
  "appointments",
  "audit_log",
  "calendar_events",
  "cash_sales",
  "clinic_expenses",
  "clinic_holidays",
  "clinic_targets",
  "clinic_users",
  "customer_line_links",
  "customers",
  "daily_tasks",
  "insurance_payments",
  "line_reserve_tokens",
  "monthly_evaluations",
  "payment_categories",
  "pending_expenses",
  "pending_settings_changes",
  "reminders",
  "reservation_courses",
  "reservation_rooms",
  "reservation_staff",
  "shift_locations",
  "staff_badges",
  "staff_points",
  "staff_points_summary",
  "staff_shifts",
  "staff_tasks",
  "staff_working_hours",
  "staff_working_overrides",
]);

/** 主キー自体が clinic_id を兼ねるテーブル（id カラムでフィルタ） */
const TENANT_TABLES_ID_KEY = new Set([
  "clinic_settings",
]);

const ALL_TENANT_TABLES = new Set([...TENANT_TABLES, ...TENANT_TABLES_ID_KEY]);

const IGNORE_FILES = [
  /\.next\//,
  /node_modules\//,
  /\.test\./,
  /\.spec\./,
  /\.bak$/,
  /scripts\/audit-tenant-isolation\.mjs$/,
];

const violations = [];

/** ファイルを再帰的に列挙 */
function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx|mjs|cjs|js)$/.test(name)) {
      const rel = path.relative(process.cwd(), full).replace(/\\/g, "/");
      if (IGNORE_FILES.some((re) => re.test(rel))) continue;
      out.push(full);
    }
  }
  return out;
}

/**
 * 1ファイル中の `.from("table")` 出現箇所を全部チェック。
 * 漏れがあれば violations に push。
 */
function checkFile(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  const rel = path.relative(process.cwd(), filePath).replace(/\\/g, "/");

  // `.from("table")` または `.from('table')` を抽出。後続の式チェーンも含めて。
  // Regex で全箇所をスキャンする。
  const fromRe = /\.from\(\s*["'`]([a-zA-Z0-9_]+)["'`]\s*\)/g;
  let m;
  while ((m = fromRe.exec(src)) !== null) {
    const table = m[1];
    if (!ALL_TENANT_TABLES.has(table)) continue;

    const startIdx = m.index;
    // この .from(...) から「クエリチェーンの終わり」までを抽出する。
    // 終わりは、awaitの終了や ; or 空行 で雑に判定。
    // 厳密ではないが、近接 1500 文字を見れば十分。
    const chunk = src.slice(startIdx, startIdx + 1500);

    // 同じファイル内の前後 200 文字に // tenant-isolation-ignore がある場合は許容。
    const ignoreWindow = src.slice(Math.max(0, startIdx - 200), startIdx + chunk.length + 200);
    if (/tenant-isolation-ignore/.test(ignoreWindow)) continue;

    // 期待されるフィルタキー
    const filterKey = TENANT_TABLES_ID_KEY.has(table) ? "id" : "clinic_id";

    // チェーン内に .eq("filterKey", ...) があるか
    // INSERT/UPDATE の場合は body 内に clinic_id: が必要
    const hasEqFilter = new RegExp(`\\.eq\\(\\s*["'\`]${filterKey}["'\`]`).test(chunk);
    const hasInsertOrUpsertWithClinic = /\.(insert|upsert)\s*\(/.test(chunk) && /clinic_id\s*:/.test(chunk);

    // INSERT (clinic_id 含む) は OK。UPDATE/DELETE は .eq("clinic_id", ...) 必須。
    const isInsertOrUpsertOnly = /\.(insert|upsert)\s*\(/.test(chunk) && !/\.(select|update|delete)\b/.test(chunk);

    if (hasEqFilter) continue;
    if (isInsertOrUpsertOnly && hasInsertOrUpsertWithClinic) continue;

    // 漏れの種類を判定:
    //   - SELECT 漏れ: 別院データが見える → ERROR（CI fail）
    //   - INSERT/UPDATE/DELETE 漏れ: 別院 IDが衝突した場合の誤操作リスク → WARN
    const hasSelect = /\.select\s*\(/.test(chunk);
    const hasMutation = /\.(insert|upsert|update|delete)\s*\(/.test(chunk);
    const severity = hasSelect && !hasMutation ? "ERROR" : "WARN";

    // 行番号を計算
    const lineNumber = src.slice(0, startIdx).split("\n").length;

    violations.push({
      file: rel,
      line: lineNumber,
      table,
      filterKey,
      severity,
      snippet: src
        .slice(startIdx, startIdx + 120)
        .replace(/\s+/g, " ")
        .slice(0, 120),
    });
  }
}

const VERBOSE = process.argv.includes("--verbose");

const files = walk(ROOT);
for (const f of files) checkFile(f);

const errors = violations.filter((v) => v.severity === "ERROR");
const warnings = violations.filter((v) => v.severity === "WARN");

if (errors.length === 0 && warnings.length === 0) {
  console.log(`✅ テナント分離OK (${files.length} ファイルをチェック)`);
  console.log(`   ${ALL_TENANT_TABLES.size} 個のテナント分離テーブルすべてで`);
  console.log(`   clinic_id（or id）フィルタが付いていることを確認しました。`);
  process.exit(0);
}

if (errors.length > 0) {
  console.error(`❌ SELECT で clinic_id フィルタ漏れ（漏洩リスク）を ${errors.length} 件検出:\n`);
  for (const v of errors) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    table: ${v.table} (require .eq("${v.filterKey}", ...))`);
    console.error(`    ${v.snippet}...`);
    console.error();
  }
}

if (warnings.length > 0) {
  console.warn(`⚠️  INSERT/UPDATE/DELETE で clinic_id フィルタ漏れ（誤操作リスク）を ${warnings.length} 件検出:`);
  console.warn(`   ※ 単一行 .eq("id", uuid) 特定の場合は実害なしだが、防御的に追加推奨。\n`);
  if (VERBOSE) {
    for (const v of warnings) {
      console.warn(`  ${v.file}:${v.line}`);
      console.warn(`    table: ${v.table} (require .eq("${v.filterKey}", ...))`);
      console.warn(`    ${v.snippet}...`);
      console.warn();
    }
  } else {
    // 個別出力は warn 多すぎるので summary だけ
    const byFile = new Map();
    for (const v of warnings) {
      byFile.set(v.file, (byFile.get(v.file) || 0) + 1);
    }
    for (const [file, count] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) {
      console.warn(`   - ${file}: ${count} 件`);
    }
    console.warn();
    console.warn(`詳細は \`node scripts/audit-tenant-isolation.mjs --verbose\` で表示できます。`);
  }
}

console.error(`例外として許容したい場合は、対象クエリの直前に`);
console.error(`  // tenant-isolation-ignore: <理由>`);
console.error(`コメントを書けばスキップされます。`);

// CI fail は ERROR の有無で決定
process.exit(errors.length > 0 ? 1 : 0);
