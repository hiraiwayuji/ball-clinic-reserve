#!/usr/bin/env node
/**
 * デプロイ前スキーマ確認（preflight）。
 *
 * 背景（2026-07-18 の事故）:
 *   この共有Supabaseでは migrate-on-build.mjs が実際には走っていない
 *   （__applied_migrations が無い＝手動スキーマ管理）。そのため
 *   supabase/migrations/ に .sql を足しても本番DBには入らず、
 *   新カラムを参照するコードだけ本番で実行時エラーになった
 *   （勤怠 overtime_grace_minutes / wage_passcode_hash、売上 exclude_from_sales）。
 *
 * このスクリプトは supabase/migrations/*.sql の
 *   ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <c> ...
 * を拾い、その (table, column) が本番DBに実在するかを
 * PostgREST（service role）で確認する。1つでも欠けていれば
 * 「適用すべきSQL」を表示して exit 1（＝push/デプロイを止める）。
 *
 * 既定は「今回のpushで新しく増えたマイグレーション」だけを対象にする
 * （origin/main に無いファイル）。古い既存ドリフトで毎回止まらないため。
 * `--all` を付けると全マイグレーションを対象にした drift 監査になる。
 *
 * 使い方:
 *   node scripts/preflight-schema.mjs         # push前ゲート（新規ぶんのみ）
 *   node scripts/preflight-schema.mjs --all   # 全ドリフト監査
 * 必要な環境変数（.env.local から自動読込。既に process.env にあればそれを優先）:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 方針:
 *   - カラムが「確実に無い」(PostgREST 42703) ときだけ FAIL する。
 *   - 環境変数が無い / ネットワークが不調 等の「判定できない」ときは
 *     WARN を出して素通り（=デプロイは止めない）。誤って止めると
 *     かえって運用を妨げるため、確証があるときだけブロックする。
 *   - 緊急時は SKIP_SCHEMA_CHECK=1 で丸ごとスキップ可能。
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const CHECK_ALL = process.argv.includes("--all");

function warn(msg) { console.log(`\x1b[33m[preflight] ${msg}\x1b[0m`); }
function ok(msg) { console.log(`\x1b[32m[preflight] ${msg}\x1b[0m`); }
function fail(msg) { console.log(`\x1b[31m[preflight] ${msg}\x1b[0m`); }

if (process.env.SKIP_SCHEMA_CHECK === "1") {
  warn("SKIP_SCHEMA_CHECK=1 のためスキーマ確認をスキップします。");
  process.exit(0);
}

// .env.local を素朴にパースして環境変数を補完（依存を増やさない）
function loadDotEnvLocal() {
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue; // 既存を優先
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
loadDotEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  warn("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が無いためスキーマ確認をスキップします（判定不可のため素通り）。");
  process.exit(0);
}

// origin/main に既に存在するマイグレーションファイル名の集合を返す。
// これに含まれないファイル＝「今回のpushで新しく増えたぶん」。
function migrationsOnOrigin() {
  try {
    const out = execSync("git ls-tree -r --name-only origin/main -- supabase/migrations", {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    });
    const set = new Set();
    for (const line of out.split(/\r?\n/)) {
      const f = line.trim();
      if (f.endsWith(".sql")) set.add(f.split("/").pop());
    }
    return set;
  } catch {
    return null; // origin/main が取れない → 判定不可
  }
}

// migrations から (table, column) を収集
function collectAddColumns() {
  const wanted = new Map(); // "table.column" -> { table, column, file }
  let files = [];
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  } catch {
    return wanted;
  }

  // 既定（ゲート）は「新規マイグレーションのみ」に絞る。--all なら全ファイル。
  if (!CHECK_ALL) {
    const onOrigin = migrationsOnOrigin();
    if (onOrigin === null) {
      warn("origin/main と比較できないため、新規マイグレーションの特定をスキップします（判定不可＝素通り）。");
      return wanted; // 空 → 後段で「確認対象なし」で exit 0
    }
    files = files.filter((f) => !onOrigin.has(f));
    if (files.length === 0) {
      ok("今回のpushで新しく増えたマイグレーションはありません（確認対象なし）。");
      process.exit(0);
    }
    warn(`新規マイグレーション ${files.length} 件を確認します: ${files.join(", ")}`);
  }
  // ALTER TABLE ... （次の ALTER / ; で切れるまで）ごとに ADD COLUMN IF NOT EXISTS を拾う
  const alterRe = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?["']?([a-zA-Z0-9_]+)["']?([\s\S]*?)(?=ALTER\s+TABLE|;|$)/gi;
  const addRe = /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+["']?([a-zA-Z0-9_]+)["']?/gi;
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    let m;
    while ((m = alterRe.exec(sql))) {
      const table = m[1];
      const body = m[2] || "";
      let a;
      addRe.lastIndex = 0;
      while ((a = addRe.exec(body))) {
        const column = a[1];
        wanted.set(`${table}.${column}`, { table, column, file: f });
      }
    }
  }
  return wanted;
}

// PostgREST でカラムの存在を確認。存在=true / 確実に無い=false / 判定不可=null
async function columnExists(table, column) {
  const url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?select=${encodeURIComponent(column)}&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Connection: "close" },
    });
    if (res.ok) {
      await res.arrayBuffer().catch(() => {}); // ボディを読み切ってソケットを綺麗に返す
      return true;
    }
    let body = null;
    try { body = await res.json(); } catch { await res.arrayBuffer().catch(() => {}); }
    const code = body?.code;
    if (code === "42703") return false;          // undefined_column ＝ 確実に無い
    if (code === "42P01") return null;            // テーブルが無い（別管理かも）→判定不可
    return null;                                  // その他(RLS/権限/一時的)→判定不可
  } catch {
    return null;                                  // ネットワーク不調→判定不可
  }
}

const wanted = collectAddColumns();
if (wanted.size === 0) {
  ok("追加カラムの定義は見つかりませんでした（確認対象なし）。");
  process.exit(0);
}

const missing = [];
let undecided = 0;
await Promise.all(
  [...wanted.values()].map(async (w) => {
    const r = await columnExists(w.table, w.column);
    if (r === false) missing.push(w);
    else if (r === null) undecided++;
  }),
);

if (missing.length === 0) {
  ok(`必要なカラムは全て本番DBに存在します（${wanted.size}件確認${undecided ? `・判定不可${undecided}件は素通り` : ""}）。`);
  process.exitCode = 0;
} else {
  // 欠けているカラムがある＝このままデプロイすると実行時エラー。止める。
  fail("本番DBに存在しないカラムがあります。先にスキーマを適用してください（このままだと該当機能が本番でエラーになります）:");
  for (const m of missing) {
    console.log(`   - ${m.table}.${m.column}   (${m.file})`);
  }
  console.log("");
  console.log("  対処: Supabase に下記を適用してから push してください。");
  for (const m of missing) {
    // 型まではここで断定しないので、該当マイグレーションの ADD COLUMN 文をそのまま適用するのが確実
    console.log(`     -- supabase/migrations/${m.file} の ${m.table}.${m.column} を適用`);
  }
  console.log("");
  console.log("  緊急でどうしても止めたくないときだけ: SKIP_SCHEMA_CHECK=1 を付けて再実行");
  process.exitCode = 1;
}
