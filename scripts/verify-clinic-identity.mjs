#!/usr/bin/env node
/**
 * 各院ドメインが「正しいクリニックとして焼き込まれているか」を /api/clinic-info で検証する。
 *
 * 背景:
 *   各院は同一リポジトリの別 Vercel プロジェクト。クリニック識別は NEXT_PUBLIC_CLINIC_*
 *   (ビルド時埋め込み) のみで、未設定だとボール接骨院(デフォルト)へサイレント・フォールバックする。
 *   デプロイ(アプデ)中に env が正しく焼き込まれないと、他院ドメインがボール表示になり、
 *   予約データもボールの clinic_id に入ってしまう。これを早期検知するための軽量チェック。
 *
 * 使い方:
 *   node scripts/verify-clinic-identity.mjs
 *   → 1院でもズレてたら exit 1。朝のヘルスチェック(Task Scheduler)やデプロイ直後に実行。
 */

const TARGETS = [
  { name: "ball-clinic-reserve", url: "https://ball-clinic-reserve.vercel.app", expectClinic: "ボール",   expectDefault: true  },
  { name: "karada-clinic",       url: "https://karada-clinic.vercel.app",       expectClinic: "からだ",   expectDefault: false },
  { name: "muscleseitai",        url: "https://muscleseitai.vercel.app",         expectClinic: "マッスル", expectDefault: false },
  { name: "relaq-clinic",        url: "https://relaq-clinic.vercel.app",         expectClinic: "RELAQ",    expectDefault: false },
];

const TIMEOUT_MS = 15000;

async function check(t) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(t.url + "/api/clinic-info", { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return { ok: false, msg: `HTTP ${res.status}` };
    const info = await res.json();
    const nameOk = (info.clinicName || "").includes(t.expectClinic);
    const defaultOk = !!info.isDefault === !!t.expectDefault;
    if (nameOk && defaultOk) {
      return { ok: true, msg: `clinic="${info.clinicName}" id=${info.clinicId}` };
    }
    return {
      ok: false,
      msg: `❗フォールバック疑い: clinic="${info.clinicName}" id=${info.clinicId} isDefault=${info.isDefault}` +
           ` (期待: "${t.expectClinic}"を含む / default=${t.expectDefault})`,
    };
  } catch (e) {
    return { ok: false, msg: `err=${e.message}` };
  } finally {
    clearTimeout(timer);
  }
}

let bad = 0;
for (const t of TARGETS) {
  const r = await check(t);
  if (!r.ok) bad++;
  console.log(`${r.ok ? "✅" : "❌"} ${t.name.padEnd(22)} ${r.msg}`);
}

console.log(`\n${bad === 0 ? "✅ 全院クリニック識別OK" : `❌ ${bad}院で識別ズレ（他院ドメインがボール等にフォールバックしている可能性）`}`);
process.exit(bad === 0 ? 0 : 1);
