#!/usr/bin/env node
/**
 * デプロイ後の smoke test。
 * 全院の公開エンドポイント＋ admin 関連 path の応答コードを確認する。
 *
 * - /api/health: 200 必須
 * - /admin/dashboard: 302 or 401 必須（未認証で 5xx になるなら SSR エラー）
 * - /reserve: 200 必須
 *
 * 想定: 夜の本番デプロイ直後に手動で実行し、5xx が出てたら即 rollback。
 *
 * 使い方:
 *   node scripts/post-deploy-smoke.mjs
 */

const TARGETS = [
  { name: "ball-clinic-reserve", url: "https://ball-clinic-reserve.vercel.app" },
  { name: "karada-clinic",       url: "https://karada-clinic.vercel.app" },
  { name: "muscleseitai",        url: "https://muscleseitai.vercel.app" },
  { name: "relaq-clinic",        url: "https://relaq-clinic.vercel.app" },
];

const PATHS = [
  { path: "/api/health",      expect: [200],      critical: true  },
  { path: "/reserve",         expect: [200],      critical: true  },
  { path: "/admin/dashboard", expect: [302, 307, 401], critical: true  }, // 未認証で 5xx は SSR エラー。Next.js は 307 でリダイレクト
  { path: "/admin-login",     expect: [200],      critical: true  },
];

const TIMEOUT_MS = 15000;

async function probe(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: ctrl.signal });
    return { status: res.status, ms: Date.now() - t0, ok: true };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, ok: false, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

let failures = 0;

for (const t of TARGETS) {
  console.log(`\n=== ${t.name} (${t.url}) ===`);
  for (const p of PATHS) {
    const url = t.url + p.path;
    const r = await probe(url);
    const passed = r.ok && p.expect.includes(r.status);
    const mark = passed ? "✅" : (p.critical ? "❌" : "⚠️ ");
    console.log(`  ${mark} ${p.path.padEnd(20)} status=${r.status} (${r.ms}ms)${r.error ? ` err=${r.error}` : ""}`);
    if (!passed && p.critical) failures++;
  }
}

console.log(`\n${failures === 0 ? "✅" : "❌"} smoke test ${failures === 0 ? "passed" : `failed (${failures} critical)`}`);
process.exit(failures === 0 ? 0 : 1);
