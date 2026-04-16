#!/usr/bin/env node
/**
 * 新規クリニック セットアップ情報ジェネレーター
 *
 * 使い方:
 *   node setup_clinic.js --url https://example.com --slug relaq --clinic-id <UUID> --setup-password relaq2026
 *
 * オプション:
 *   --url             クリニックの公式サイトURL（必須）
 *   --slug            Vercelプロジェクト名に使う短縮名（例: relaq, karada）
 *   --clinic-id       Supabase STEP1で取得したUUID（省略可）
 *   --setup-password  登録用パスワード（省略時は slug+2026）
 */

const args = process.argv.slice(2);
const get = (key) => {
  const i = args.indexOf(key);
  return i !== -1 ? args[i + 1] : null;
};

const siteUrl = get("--url");
const slug = get("--slug") || "clinic";
const clinicId = get("--clinic-id") || "【Supabase STEP1 で取得したUUID】";
const setupPassword = get("--setup-password") || `${slug}2026`;

if (!siteUrl) {
  console.error("エラー: --url が必要です");
  console.error("例: node setup_clinic.js --url https://relaq.jp --slug relaq --clinic-id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
  process.exit(1);
}

// ── サイト取得 & 情報抽出 ──────────────────────────────────────────────
async function fetchSiteInfo(url) {
  console.log(`\n🔍 サイトを取得中: ${url}\n`);
  let html = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ClinicSetupBot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    html = await res.text();
  } catch (e) {
    console.warn(`⚠️  サイト取得失敗: ${e.message}`);
    return {};
  }

  const extract = (patterns) => {
    for (const p of patterns) {
      const m = html.match(p);
      if (m) return m[1]?.trim();
    }
    return null;
  };

  // クリニック名（og:site_name 優先 → title の最初の区切り前）
  const rawName =
    extract([
      /property="og:site_name"\s+content="([^"]+)"/i,
      /name="application-name"\s+content="([^"]+)"/i,
      /<title>([^|│<\-–\(（]+)/i,
      /<h1[^>]*>([^<]{3,30})<\/h1>/i,
    ]) || null;
  const name = rawName ? rawName.replace(/[|│\-–].*/,'').trim() : null;

  // ロゴURL（cmn_sitelogo などロゴっぽいsrc優先、og:imageはフォールバック）
  const rawLogo =
    extract([
      /<img[^>]+src="([^"]*(?:sitelogo|site[-_]?logo|cmn_logo|logo[-_]?main)[^"]*\.(?:png|svg|jpg|webp))"/i,
      /<img[^>]+src="([^"]*logo[^"]*\.(?:png|svg|jpg|webp))"/i,
      /property="og:image"\s+content="([^"]+)"/i,
    ]) || null;

  const logoUrl = rawLogo
    ? rawLogo.startsWith("http")
      ? rawLogo
      : new URL(rawLogo, url).href
    : null;

  // 電話番号（ハイフンあり優先、なしは変換）
  const rawPhone =
    extract([
      /href="tel:([0-9\-]+)"/i,
      /(?:tel:|TEL:|電話[：:]?\s*)([0-9０-９]{2,4}[-－][0-9０-９]{2,4}[-－][0-9０-９]{3,4})/,
      /([0-9]{2,4}-[0-9]{2,4}-[0-9]{3,4})/,
      /([0-9]{10,11})/,
    ]) || null;
  // ハイフンなし10桁を変換
  const phone = rawPhone && /^[0-9]{10,11}$/.test(rawPhone)
    ? rawPhone.replace(/^(0\d{1,3})(\d{2,4})(\d{4})$/, '$1-$2-$3')
    : rawPhone;

  // 住所（〒番号の後 or 都道府県から始まる文字列）
  const address =
    extract([
      /〒[0-9]{3}-[0-9]{4}[\s　]*([^\s　<]{5,30}(?:[市区町村]\S{0,10})?)/,
      /(?:住所|所在地)[：:\s]{1,3}((?:北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)[^\s<]{3,25})/,
    ]) || null;

  // キャッチコピー
  const catchcopy =
    extract([
      /property="og:description"\s+content="([^"]{10,50})"/i,
      /name="description"\s+content="([^"]{10,50})"/i,
    ])?.replace(/。.*$/, '').trim() || null;

  return { name, logoUrl, phone, address, catchcopy };
}

// ── メイン ────────────────────────────────────────────────────────────
(async () => {
  const info = await fetchSiteInfo(siteUrl);

  const clinicName = info.name || "【クリニック名】";
  // 短縮名: 括弧・読み・業種説明を除いた部分
  const nameShort = clinicName
    .replace(/[（(].+?[)）]/, '')
    .replace(/[\s　]*(鍼灸|マッサージ|整骨院|接骨院|治療院|クリニック|整体院|カイロ).*$/, '')
    .trim() || clinicName;
  const logoUrl = info.logoUrl || "【ロゴURL】";
  const phone = info.phone || "【電話番号】";
  const address = info.address || "【住所】";
  const catchcopy = info.catchcopy || "【キャッチコピー】";

  const vercelProjectName = `${slug}-clinic`;
  const vercelUrl = `https://${vercelProjectName}.vercel.app`;

  console.log("═══════════════════════════════════════════════════════");
  console.log(`  ${clinicName}  セットアップ情報`);
  console.log("═══════════════════════════════════════════════════════");
  console.log(`\n📋 取得情報（自動）:`);
  console.log(`  クリニック名 : ${clinicName}`);
  console.log(`  短縮名       : ${nameShort}`);
  console.log(`  ロゴURL      : ${logoUrl}`);
  console.log(`  電話番号     : ${phone}`);
  console.log(`  住所         : ${address}`);
  console.log(`  キャッチコピー: ${catchcopy}`);

  console.log(`\n🗂  Vercel プロジェクト名: ${vercelProjectName}`);
  console.log(`🔗 デプロイ後URL         : ${vercelUrl}`);
  console.log(`🔑 clinic_id             : ${clinicId}`);
  console.log(`🔐 SETUP_PASSWORD        : ${setupPassword}`);

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 Vercel Environment Variables（コピペ用）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT_PUBLIC_SUPABASE_URL=https://uatmzcnoumafeuzprkdo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=【Supabase Publishable key】
SUPABASE_SERVICE_ROLE_KEY=【Supabase Secret key】
NEXT_PUBLIC_APP_MODE=CLINIC
NEXT_PUBLIC_CLINIC_ID=${clinicId}
NEXT_PUBLIC_CLINIC_NAME=${clinicName}
NEXT_PUBLIC_CLINIC_NAME_SHORT=${nameShort}
NEXT_PUBLIC_CLINIC_LOGO_URL=${logoUrl}
NEXT_PUBLIC_CLINIC_LOGO_SMALL_URL=${logoUrl}
NEXT_PUBLIC_CLINIC_PHONE=${phone}
NEXT_PUBLIC_CLINIC_ADDRESS=${address}
NEXT_PUBLIC_CLINIC_MAPS_URL=【Google Maps URL（地図で院名検索 → 共有 → リンクをコピー）】
NEXT_PUBLIC_CLINIC_CATCHCOPY=${catchcopy}
NEXT_PUBLIC_CLINIC_DESCRIPTION=${catchcopy}
NEXT_PUBLIC_CLINIC_HOURS_1=【例: 月・火・木・金: 9:00 〜 18:00（最終受付 17:30）】
NEXT_PUBLIC_CLINIC_HOURS_2=【例: 土: 9:00 〜 13:00（任意・不要なら削除）】
NEXT_PUBLIC_CLINIC_HOURS_CLOSED=【例: ※水・日・祝日は休診】
SETUP_PASSWORD=${setupPassword}
LINE_CHANNEL_SECRET=【当日取得】
LINE_CHANNEL_ACCESS_TOKEN=【当日取得】
NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL=https://lin.ee/【当日取得】
GEMINI_API_KEY=【Google AI Studio】
REMIND_SECRET=remind_${slug}_${Math.random().toString(36).slice(2, 8)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 導入当日URL:
  登録ページ : ${vercelUrl}/register  （SETUP_PASSWORD: ${setupPassword}）
  管理画面   : ${vercelUrl}/admin/dashboard
  予約ページ : ${vercelUrl}/reserve
`);
})();
