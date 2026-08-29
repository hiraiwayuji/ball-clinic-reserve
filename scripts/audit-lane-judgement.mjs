#!/usr/bin/env node
/**
 * 「予約が取れるか」の判定が退化していないかを見張る監査。
 *
 * 🚨 なぜ要るか（2026-08-29 ぼーるくん「前回も直りましたって言ってて、またもどってる。退化はやめて」）
 *
 * この判定は同じ不具合を3回くり返している。
 *
 *  2026-08-01 ff6a70f 「重複OKの担当を『×（予約あり）』で塞がないようにする」
 *             → からだで“取れるはずの枠”が × になり、院内で予約が入れられなかったのを直した。
 *  2026-08-22 0bcddfe 「かぶり予約をブロック＋院長承認制」
 *             → adminDaySlots.ts の laneExclusive を true 固定にし、**8/1 の修正を打ち消した**。
 *               同じコミットで作った buildStaffSpans（1件の予約を先生ごとに前後で分ける）は
 *               adminReserve.ts にだけ入れ、adminDaySlots.ts に入れ忘れた。
 *  2026-08-29 3f0624e 藤川先生「14:20〜14:40 の予約しかない先生の 14:40 が取れない」
 *             → 画面が予約まるごとを占有扱いにしていたのが原因。buildStaffSpans にそろえて修正。
 *
 * 原因はいつも同じ。**「予約が取れるか」を決める場所が複数あり、片方だけ直す**こと。
 *   - 院内の画面（時間プルダウンの空き）: src/app/actions/adminDaySlots.ts
 *   - 院内の登録（サーバーの最終ガード）: src/app/actions/adminReserve.ts の findLaneConflict
 *   - 患者さんのWeb予約（空き時間の表示）: src/app/actions/reserve.ts の getDailyAvailability
 * ここがズレると必ず「選べるのに登録できない」か「選べないのに実は取れる」になる。
 *
 * この監査は2段構えで見る。
 *   (1) 土台の buildStaffSpans を**実際に動かして**、答えが変わっていないか
 *       （呼んでいるかを grep するだけだと、中身を壊されても素通りするため）
 *   (2) 上の2ファイルが、その土台を使い続けているか／重なり判定が半開区間か
 *
 */
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

const SPANS_FILE = "src/lib/staff-spans.ts";
let ng = 0;
const fail = (title, detail) => {
  console.error(`${RED}❌ ${title}${RESET}`);
  if (detail) console.error(detail);
  ng++;
};

// ───────────────────────────────────────────────────────────
// (1) 土台を実際に動かして、答えが変わっていないか
// ───────────────────────────────────────────────────────────
/** staff-spans.ts を TypeScript でその場に JS 化して読み込む（テスト基盤を増やさずに実行検査する） */
function loadBuildStaffSpans() {
  if (!existsSync(SPANS_FILE)) {
    fail(`${SPANS_FILE} が見つかりません`, "   移動・改名したら、この監査も直してください。");
    return null;
  }
  let ts;
  try {
    ts = require_("typescript");
  } catch {
    console.warn(`${YELLOW}⚠ typescript を読み込めないため、動かしての確認はとばします（grep の確認だけ行います）${RESET}`);
    return null;
  }
  const src = readFileSync(SPANS_FILE, "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  // staff-spans.ts は import を持たない純粋関数なので、そのまま評価できる
  new Function("module", "exports", js)(mod, mod.exports);
  const fn = mod.exports.buildStaffSpans;
  if (typeof fn !== "function") {
    fail(`${SPANS_FILE} が buildStaffSpans を export していません`);
    return null;
  }
  return fn;
}

const A = "aaaaaaaa-0000-0000-0000-000000000001"; // 先生A（主担当）
const B = "bbbbbbbb-0000-0000-0000-000000000002"; // 先生B（追加担当）
const D = "2026-09-05";
const at = (hm) => `${D}T${hm}:00+09:00`;
const ms = (hm) => new Date(at(hm)).getTime();
const hm = (iso) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(iso));

function checkBehaviour(buildStaffSpans) {
  // 実際に起きた不具合そのもの：
  //   9/5 的場様 14:20-15:00 ＝ 森川（保険施術20分）14:20-14:40 ＋ 森藤（鍼灸1部位20分）14:40-15:00
  const twoStaff = {
    startTime: at("14:20"), endTime: at("15:00"), staffId: A,
    mainMinutes: 20, additionalStaff: [{ staff_id: B }],
    additionalCourses: [{ course_id: "c" }], additionalMinutes: [20],
    fallbackMinutes: 20,
  };
  const spans = buildStaffSpans(twoStaff);
  const spanOf = (id) => spans.find((s) => s.staffId === id);

  if (spans.length !== 2 || !spanOf(A) || !spanOf(B)) {
    fail("2人で受け持つ予約が、先生ごとに分かれていません", `   結果: ${JSON.stringify(spans)}`);
    return;
  }
  const got = `${hm(spanOf(A).startIso)}-${hm(spanOf(A).endIso)} / ${hm(spanOf(B).startIso)}-${hm(spanOf(B).endIso)}`;
  if (got !== "14:20-14:40 / 14:40-15:00") {
    fail(
      "2人で受け持つ予約の交代時刻が、メニューの所要時間どおりになっていません",
      `   期待: 14:20-14:40 / 14:40-15:00\n   実際: ${got}\n` +
      "   残り時間を人数で等分すると、20分刻みに乗らない時刻ができて事故になります。",
    );
  }

  // adminDaySlots.ts と同じ当たり判定で、枠が取れるかを見る（半開区間）
  const busy = (staffId, startHm, minutes) => {
    const sp = spanOf(staffId);
    if (!sp) return false;
    const s = ms(startHm);
    const e = s + minutes * 60000;
    return s < new Date(sp.endIso).getTime() && e > new Date(sp.startIso).getTime();
  };

  const cases = [
    ["先生A（前半だけ担当）の 14:40 は取れる", busy(A, "14:40", 20) === false],
    ["先生A の 14:20 は埋まり", busy(A, "14:20", 20) === true],
    ["先生B（後半だけ担当）の 14:40 は埋まり", busy(B, "14:40", 20) === true],
    ["先生B の 14:20 は取れる", busy(B, "14:20", 20) === false],
    ["予約の終了ちょうど（15:00）は取れる", busy(B, "15:00", 20) === false],
  ];
  for (const [label, ok] of cases) {
    if (!ok) fail(`空き判定が変わっています: ${label}`, "   1件の予約を先生ごとに分けて判定できていません。");
  }

  // 交代時刻は「メニューの所要時間」で決める。残り時間を人数で等分してはいけない。
  //   例) 三浦様 19:00-20:00 ＝ 保険施術20分（A）＋ 鍼灸3部位40分（B）
  //       正しい: A 19:00-19:20 / B 19:20-20:00
  //       等分   : A 19:00-19:30 / B 19:30-20:00 ← 20分刻みに乗らず、かぶり判定もズレる
  // 上の 20分＋20分 のケースは等分でも同じ答えになるので、これで見分ける。
  const uneven = buildStaffSpans({
    startTime: at("19:00"), endTime: at("20:00"), staffId: A,
    mainMinutes: 20, additionalStaff: [{ staff_id: B }],
    additionalCourses: [{ course_id: "c" }], additionalMinutes: [40],
    fallbackMinutes: 20,
  });
  const unevenA = uneven.find((s) => s.staffId === A);
  const unevenB = uneven.find((s) => s.staffId === B);
  const unevenGot = unevenA && unevenB
    ? `${hm(unevenA.startIso)}-${hm(unevenA.endIso)} / ${hm(unevenB.startIso)}-${hm(unevenB.endIso)}`
    : JSON.stringify(uneven);
  if (unevenGot !== "19:00-19:20 / 19:20-20:00") {
    fail(
      "交代時刻がメニューの所要時間で決まっていません（残り時間を人数で等分していませんか）",
      `   期待: 19:00-19:20 / 19:20-20:00（保険施術20分＋鍼灸3部位40分）\n` +
      `   実際: ${unevenGot}\n` +
      "   等分にすると 19:30 のような20分刻みに乗らない時刻ができ、かぶり判定もズレます。",
    );
  }

  // 担当が1人だけの予約は、これまでどおり予約まるごとを占有する
  const solo = buildStaffSpans({
    startTime: at("12:20"), endTime: at("12:40"), staffId: A,
    mainMinutes: 20, additionalStaff: null, additionalCourses: null,
    additionalMinutes: null, fallbackMinutes: 20,
  });
  if (solo.length !== 1 || hm(solo[0].startIso) !== "12:20" || hm(solo[0].endIso) !== "12:40") {
    fail("担当1人の予約が、予約の時間そのままになっていません", `   結果: ${JSON.stringify(solo)}`);
  } else {
    const s = ms("12:40");
    const e = s + 20 * 60000;
    const hit = s < new Date(solo[0].endIso).getTime() && e > new Date(solo[0].startIso).getTime();
    if (hit) {
      fail(
        "12:20〜12:40 の予約の直後（12:40）が取れなくなっています",
        "   前の予約の終了時刻と次の予約の開始時刻が同じときは、重なりません。",
      );
    }
  }
}

// ───────────────────────────────────────────────────────────
// (2) 判定している場所が、同じ土台を使い続けているか
// ───────────────────────────────────────────────────────────
const FILE_RULES = [
  {
    file: "src/app/actions/adminDaySlots.ts",
    must: "buildStaffSpans(",
    why:
      "時間プルダウンの空き判定が、1件の予約を先生ごとに分けずに「予約まるごと」で見ています。\n" +
      "   2人で前後に分ける予約（例: 保険施術20分=A先生 → 鍼灸20分=B先生）で、\n" +
      "   A先生の後半が「予約あり」になって取れなくなります（2026-08-29 の不具合）。",
    badBoundary: /\bs\s*<=\s*\w+\.end\b|\be\s*>=\s*\w+\.start\b/,
  },
  {
    file: "src/app/actions/adminReserve.ts",
    must: "buildStaffSpans(",
    why:
      "登録時のかぶり判定が、1件の予約を先生ごとに分けずに見ています。\n" +
      "   画面では取れるのに登録で弾かれる、という食い違いになります。",
    badBoundary: /\bs\s*<=\s*wantEnd\b|\be\s*>=\s*wantStart\b/,
  },
  {
    file: "src/app/actions/reserve.ts",
    must: "buildStaffSpans(",
    why:
      "患者さんのWeb予約の空き表示が、1件の予約を先生ごとに分けずに見ています。\n" +
      "   担当が決まっているコースで、前半だけ担当する先生の後半が予約できなくなり、\n" +
      "   逆に後半だけ担当する先生の枠が空きに見えて二重に予約されます。",
    badBoundary: null,
  },
];

/** コメント（// と ...）を落としてから探す。コメントに名前だけ残して素通り、を防ぐ。 */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

for (const rule of FILE_RULES) {
  if (!existsSync(rule.file)) {
    fail(`${rule.file} が見つかりません`, "   移動・改名したら、この監査も直してください。");
    continue;
  }
  const code = stripComments(readFileSync(rule.file, "utf8"));
  if (!code.includes(rule.must)) {
    fail(`${rule.file} が buildStaffSpans を呼んでいません`, `   ${rule.why}`);
  }
  if (rule.badBoundary && rule.badBoundary.test(code)) {
    fail(
      `${rule.file} の重なり判定が「端を含む」書き方になっています`,
      "   前の予約の終了時刻と、次の予約の開始時刻が同じときは重なりません。\n" +
      "   ここを <= / >= にすると 12:20〜12:40 の直後の 12:40 が取れなくなります。",
    );
  }
}

const buildStaffSpans = loadBuildStaffSpans();
if (buildStaffSpans) checkBehaviour(buildStaffSpans);

if (ng > 0) {
  console.error(
    `\n${YELLOW}この監査は「予約が取れるかの判定を、画面と登録で同じにする」ためのものです。\n` +
    `どちらか片方だけ直すと、必ず同じ不具合が戻ります（2026-08-01 → 08-22 → 08-29 で3回くり返しました）。${RESET}`,
  );
  process.exit(1);
}

console.log(`${GREEN}✅ 予約の空き判定 OK（院内の画面・院内の登録・患者さんのWeb予約の3か所）${RESET}`);
console.log("   ・buildStaffSpans を実際に動かして、先生ごとの受け持ち時間の分け方が変わっていないことを確認");
console.log("   ・adminDaySlots / adminReserve / reserve が、どれもその土台を使っていることを確認");
