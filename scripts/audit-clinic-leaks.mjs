#!/usr/bin/env node
/**
 * クリニック・リーク監査（監査係）
 *
 * 「ボール接骨院」固有の値が、他院の画面・通知・予約に漏れる原因＝ハードコードを検出する。
 * 各院は同一リポジトリの別Vercelで env 差し替えで分けているため、ハードコードは
 * 「他院サイトがボールの電話/LINE/clinic_idになる」事故に直結する（有料会員様の院が混ざる）。
 *
 * 使い方:  node scripts/audit-clinic-leaks.mjs        （npm run audit:clinic-leaks）
 * 終了コード: 0=漏れなし / 1=ERROR（CI・build で失敗扱い）
 *
 * 検出（src/ 内、env フォールバックでない「素のハードコード」を ERROR）:
 *   1) ボール電話 088-635-5344
 *   2) ボール LINE id  shc8761q（その行に process.env.NEXT_PUBLIC_LINE が無い＝envフォールバックでない）
 *   3) LINE友だち追加URL  line.me/.../ti/p/%40xxx を env なしでハードコード
 *   4) ボール clinic_id  00000000-0000-0000-0000-000000000001（その行に process.env.NEXT_PUBLIC_CLINIC_ID が無い）
 *
 * 例外:
 *   - 同じ行 or 直前行に  // clinic-leak-ignore: 理由
 *   - 既定値の定義ファイル（ALLOWLIST_FILES）＝ボールがデフォルトである土台
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "src");

// ボールがデフォルト＝ここに素の値があるのは正常（土台の定義）。
const ALLOWLIST_FILES = new Set([
  "src/lib/clinic-config.ts",          // env ?? ボール既定値 の定義
  "src/lib/default-clinic-id.ts",      // PUBLIC_CLINIC_ID の定義
  "src/lib/clinic-guard.ts",           // ガードがボールIDを基準値として参照
  "src/lib/supabase/clinic-utils.ts",  // 認証ユーザーの clinic 解決（未ログイン時のみ既定）
]);

// ボール専用ページ（V-ARC マーケ等。常にボール文脈なのでリーク対象外）
const ALLOWLIST_DIR_PREFIXES = [
  "src/app/presentation/",
];

const RULES = [
  {
    id: "ball-phone",
    re: /088-?635-?5344/,
    needsEnv: null, // どの行でも素のボール電話は NG（通話番号は院ごとに違う）
    msg: "ボール接骨院の電話番号がハードコードされています（他院の患者に表示されます）。汎用文言にするか CLINIC_CONFIG.phone を使ってください。",
  },
  {
    id: "ball-line-id",
    re: /shc8761q/,
    needsEnv: /process\.env\.NEXT_PUBLIC_LINE/,
    msg: "ボールのLINE id がハードコードされています（他院でボールの友だちになります）。env / DB の line_official_account_url を使ってください。",
  },
  {
    id: "hardcoded-line-friend-url",
    re: /line\.me\/(?:R\/)?ti\/p\/%40[0-9a-z]+/i,
    needsEnv: /process\.env\.NEXT_PUBLIC_LINE/,
    msg: "LINE友だち追加URLが env なしでハードコードされています。院ごとに違うため env / DB から取得してください。",
  },
  {
    id: "ball-clinic-id",
    re: /00000000-0000-0000-0000-000000000001/,
    needsEnv: /process\.env\.NEXT_PUBLIC_CLINIC_ID/,
    msg: "ボールの clinic_id がハードコードされています（他院データがボールに入る恐れ）。PUBLIC_CLINIC_ID を import してください。",
  },
];

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".bak")) {
      out.push(full);
    }
  }
  return out;
}

function relPosix(file) {
  return path.relative(process.cwd(), file).split(path.sep).join("/");
}

const files = walk(ROOT);
const violations = [];

for (const file of files) {
  const rel = relPosix(file);
  if (ALLOWLIST_FILES.has(rel)) continue;
  if (ALLOWLIST_DIR_PREFIXES.some((p) => rel.startsWith(p))) continue;

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1] : "";
    if (/clinic-leak-ignore/.test(line) || /clinic-leak-ignore/.test(prev)) continue;

    // env フォールバック判定は複数行に分かれることがあるので直前2行も含めて見る
    const envWindow = (i >= 2 ? lines[i - 2] : "") + "\n" + prev + "\n" + line;
    for (const rule of RULES) {
      if (!rule.re.test(line)) continue;
      // env フォールバック（`process.env... ?? "ボール既定値"`）は許容
      if (rule.needsEnv && rule.needsEnv.test(envWindow)) continue;
      violations.push({ file: rel, line: i + 1, rule, snippet: line.trim().slice(0, 120) });
    }
  }
}

if (violations.length === 0) {
  console.log(`✅ クリニック・リークなし (${files.length} ファイルをチェック)`);
  console.log("   ボール固有の電話/LINE/clinic_id が他院へ漏れるハードコードは見つかりませんでした。");
  process.exit(0);
}

console.error(`❌ クリニック・リークを ${violations.length} 件検出（他院にボールの値が漏れる恐れ）:\n`);
for (const v of violations) {
  console.error(`  [${v.rule.id}] ${v.file}:${v.line}`);
  console.error(`    ${v.snippet}`);
  console.error(`    → ${v.rule.msg}`);
  console.error();
}
console.error("例外として許容する場合は、対象行 or 直前行に  // clinic-leak-ignore: 理由  を書いてください。");
process.exit(1);
