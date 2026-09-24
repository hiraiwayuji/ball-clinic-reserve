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

// ───────────────────────────────────────────────────────────
// (3) 先生個別の予約NG（対応不可）が、担当自由メニューの定員から引かれているか
// ───────────────────────────────────────────────────────────
// 🚨 2026-09-21 からだ鍼灸整骨院 9/22:
//   森藤先生を終日「対応不可」にしても定員が2人のままで、森川先生に予約が入っている
//   時間まで患者さんに「◯空き」と見えていた（予約すると担当未設定の仮予約が入る）。
//   画面（getDailyAvailability）とサーバーの最終ガード（createReservation）の
//   両方が countNgOnlyStaff を使っていること、その中身が変わっていないことを見る。
const NG_FILE = "src/lib/staff-ng-capacity.ts";
function checkStaffNgCapacity() {
  if (!existsSync(NG_FILE)) {
    fail(`${NG_FILE} が見つかりません`, "   移動・改名したら、この監査も直してください。");
    return;
  }
  let ts;
  try { ts = require_("typescript"); } catch { ts = null; }
  if (ts) {
    const js = ts.transpileModule(readFileSync(NG_FILE, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const mod = { exports: {} };
    new Function("module", "exports", js)(mod, mod.exports);
    const fn = mod.exports.countNgOnlyStaff;
    if (typeof fn !== "function") {
      fail(`${NG_FILE} が countNgOnlyStaff を export していません`);
    } else {
      const pool = new Set([A, B]);
      const C = "cccccccc-0000-0000-0000-000000000003"; // 定員に数えていない先生
      const blocks = [
        { staff_id: B, start_time: "10:00:00", end_time: "10:20:00" },
        { staff_id: B, start_time: "10:20:00", end_time: "10:40:00" },
        { staff_id: C, start_time: "10:00:00", end_time: "12:00:00" },
        { staff_id: null, start_time: "18:00:00", end_time: "20:00:00" },
      ];
      const none = new Set();
      const cases = [
        ["NGの先生は定員から1人引く", fn(blocks, pool, 600, 620, none) === 1],
        ["同じ先生のNGが続いていても引くのは1人", fn(blocks, pool, 600, 640, none) === 1],
        ["NGが終わった直後（10:40）は引かない", fn(blocks, pool, 640, 660, none) === 0],
        ["NGが始まる直前（9:40-10:00）は引かない", fn(blocks, pool, 580, 600, none) === 0],
        ["NGの先生がその時間に予約も持っていれば二重に引かない", fn(blocks, pool, 600, 620, new Set([B])) === 0],
        ["定員に数えていない先生のNGは引かない", fn(blocks, new Set([A]), 600, 620, none) === 0],
        ["院ぜんたいの休憩（staff_id なし）は引かない", fn(blocks, pool, 1080, 1100, none) === 0],
      ];
      for (const [label, ok] of cases) {
        if (!ok) fail(`先生個別NGの定員計算が変わっています: ${label}`);
      }

      // 🚨 2026-09-24 からだ 9/24 17:40（藤川先生「予約入れれないところで入ってしまっています」）:
      //   森川先生=対応不可・森藤先生=受付17:30まで で誰も受けられないのに定員が1残り、
      //   ◯空き→予約成立→自動割当は誰も見つけられず**担当未設定**で入り、
      //   予約表では先頭の列（藤川院長）に出た。
      //   受付時間外・休憩の先生も、NG と同じように定員から引くこと。
      const unavail = mod.exports.countUnavailableOnlyStaff;
      if (typeof unavail !== "function") {
        fail(`${NG_FILE} が countUnavailableOnlyStaff を export していません`);
      } else {
        const none = new Set();
        const offCases = [
          ["受付時間外の先生は定員から引く", unavail([], pool, 1060, 1080, none, new Set([A])) === 1],
          ["受付時間外の先生が2人なら2人ぶん引く", unavail([], pool, 1060, 1080, none, new Set([A, B])) === 2],
          ["NGの先生と受付時間外の先生が同じなら二重に引かない",
            unavail(blocks, pool, 600, 620, none, new Set([B])) === 1],
          ["NGの先生と受付時間外の先生が別ならそれぞれ引く",
            unavail(blocks, pool, 600, 620, none, new Set([A])) === 2],
          ["受付時間外でも、その時間に自分の予約を持っていれば二重に引かない",
            unavail([], pool, 1060, 1080, new Set([A]), new Set([A])) === 0],
          ["定員に数えていない先生が受付時間外でも引かない",
            unavail([], new Set([A]), 1060, 1080, none, new Set([C])) === 0],
          ["受付時間内なら引かない（従来どおり）", unavail([], pool, 600, 620, none, new Set()) === 0],
        ];
        for (const [label, ok] of offCases) {
          if (!ok) fail(`受付時間外の先生の定員計算が変わっています: ${label}`);
        }
      }

      // 「もう取れないか」の式そのもの。定員に数えていない先生（ネット受付しない院長など）の
      // 予約を、NGで減らした定員と比べてはいけない（2026-09-21 検品で 9/21 15:20 に再現）。
      const full = mod.exports.isPoolFull;
      const toward = mod.exports.countsTowardPool;
      if (typeof full !== "function" || typeof toward !== "function") {
        fail(`${NG_FILE} が isPoolFull / countsTowardPool を export していません`);
      } else {
        const fullCases = [
          ["院長の予約1件＋先生AがNG＋先生Bは空き → 取れる",
            full({ totalCount: 1, poolCount: 0, capacity: 2, ngOnly: 1 }) === false],
          ["先生Aの予約1件＋先生BがNG → 取れない",
            full({ totalCount: 1, poolCount: 1, capacity: 2, ngOnly: 1 }) === true],
          ["予約なし＋2人ともNG → 取れない",
            full({ totalCount: 0, poolCount: 0, capacity: 2, ngOnly: 2 }) === true],
          ["予約なし＋1人だけNG → 取れる",
            full({ totalCount: 0, poolCount: 0, capacity: 2, ngOnly: 1 }) === false],
          ["NGの無い日は従来どおり（1件では埋まらない）",
            full({ totalCount: 1, poolCount: 1, capacity: 2, ngOnly: 0 }) === false],
          ["NGの無い日は従来どおり（定員ぶん入れば埋まる）",
            full({ totalCount: 2, poolCount: 1, capacity: 2, ngOnly: 0 }) === true],
          ["受付する先生が1人の日にその先生がNG → 取れない",
            full({ totalCount: 0, poolCount: 0, capacity: 1, ngOnly: 1 }) === true],
          ["定員に数えた先生の予約は数える", toward({ staff_id: A, status: "confirmed" }, pool) === true],
          ["定員に数えていない先生の予約は数えない", toward({ staff_id: C, status: "confirmed" }, pool) === false],
          ["担当未設定の実予約は数える（安全側）", toward({ staff_id: null, status: "pending" }, pool) === true],
          ["キャンセル待ちは数えない", toward({ staff_id: null, status: "waiting" }, pool) === false],
        ];
        for (const [label, ok] of fullCases) {
          if (!ok) fail(`担当自由メニューの満枠判定が変わっています: ${label}`);
        }
      }
    }
  }
  const code = stripComments(readFileSync("src/app/actions/reserve.ts", "utf8"));
  const calls = Math.min(
    code.split("countUnavailableOnlyStaff(").length - 1,
    code.split("isPoolFull(").length - 1,
    code.split("countsTowardPool(").length - 1,
  );
  if (calls < 2) {
    fail(
      "reserve.ts が countUnavailableOnlyStaff / isPoolFull / countsTowardPool を2か所（空き表示と登録ガード）で使っていません",
      `   見つかった呼び出し: ${calls} か所
` +
      "   片方だけだと「×なのに入る」か「◯なのに弾かれる／担当未設定で入る」になります。",
    );
  }

  // 受付時間・休憩を定員から引く材料（offDutyStaffAt）も、空き表示と登録ガードの両方で使うこと。
  const offCalls = code.split("offDutyStaffAt(").length - 1;
  if (offCalls < 2) {
    fail(
      "reserve.ts が offDutyStaffAt を2か所（空き表示と登録ガード）で使っていません",
      `   見つかった呼び出し: ${offCalls} か所\n` +
      "   片方だけだと、受付が終わっている先生が定員に残り、9/24 17:40 と同じことが起きます。",
    );
  }

  // 自動割当で誰も受けられなかったとき、担当未設定のまま予約を作らないこと（fail-closed）。
  if (!/picked\.staff/.test(code) || !/picked\.failed/.test(code)) {
    fail(
      "reserve.ts が「担当を割り当てられなかった予約」を止めていません",
      "   pickStaffForBooking が誰も見つけられなかったとき、担当未設定のまま入れると\n" +
      "   予約表の先頭の列（からだなら藤川院長）に出て、入れられない時間に予約が入ったように見えます。\n" +
      "   ただし DB障害で判定できなかったとき（failed）は、従来どおり受け付けること。",
    );
  }
}
checkStaffNgCapacity();

// ───────────────────────────────────────────────────────────
// (4) 先生の「その日だけの休憩」が、どの空き判定にも同じ優先順位で効いているか
// ───────────────────────────────────────────────────────────
// 2026-09-21: 予約表で休憩を日ごとに動かせるようにした（staff_working_overrides kind="break"）。
//   それまでは予約表の表示にしか効いておらず、患者さんのWeb予約と院内の登録は
//   毎週の休憩のままだった。ここがズレると「予約表では空けたのにWebで取れない」
//   「休憩にしたのにWebから予約が入る」になる。
const AVAIL_FILE = "src/lib/staff-availability.ts";
function checkStaffDateBreak() {
  if (!existsSync(AVAIL_FILE)) {
    fail(`${AVAIL_FILE} が見つかりません`, "   移動・改名したら、この監査も直してください。");
    return;
  }
  let ts;
  try { ts = require_("typescript"); } catch { ts = null; }
  if (ts) {
    const js = ts.transpileModule(readFileSync(AVAIL_FILE, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const mod = { exports: {} };
    new Function("module", "exports", js)(mod, mod.exports);
    const { buildStaffSchedule, isStaffSpanBookableYmd, isTimeWithinStaffHoursYmd, filterSlotsByStaffSchedule } = mod.exports;
    if (typeof buildStaffSchedule !== "function" || typeof isStaffSpanBookableYmd !== "function") {
      fail(`${AVAIL_FILE} が buildStaffSchedule / isStaffSpanBookableYmd を export していません`);
    } else {
      // 2026-09-24 は木曜(4)。毎週の休憩は 14:00〜14:40
      const weekly = [{ day_of_week: 4, start_time: "09:30:00", end_time: "18:00:00", break_start: "14:00:00", break_end: "14:40:00" }];
      const row = { schedule_based_booking: false };
      const THU = "2026-09-24";
      const NEXT_THU = "2026-10-01";
      const base = buildStaffSchedule(row, [], weekly, 0);
      const moved = buildStaffSchedule(row, [], weekly, 0, [{ date: THU, start: "15:00", end: "15:40" }]);
      const none = buildStaffSchedule(row, [], weekly, 0, [{ date: THU, start: null, end: null }]);
      const onlyDate = buildStaffSchedule(row, [], [], 0, [{ date: THU, start: "13:00", end: "13:20" }]);
      const slots = ["13:40", "14:00", "14:20", "14:40", "15:00", "15:20", "15:40"];
      const d = new Date(2026, 8, 24);
      const cases = [
        ["上書きなし: いつもの休憩中(14:00)は取れない", isStaffSpanBookableYmd(THU, "14:00", 20, base) === false],
        ["上書きなし: 休憩の外(15:00)は取れる", isStaffSpanBookableYmd(THU, "15:00", 20, base) === true],
        ["休憩を15:00へ動かした日: 元の休憩(14:00)が取れる", isStaffSpanBookableYmd(THU, "14:00", 20, moved) === true],
        ["休憩を15:00へ動かした日: 新しい休憩(15:00)は取れない", isStaffSpanBookableYmd(THU, "15:00", 20, moved) === false],
        ["休憩を15:00へ動かした日: 休憩にかかる長いメニュー(14:40から40分)は取れない", isStaffSpanBookableYmd(THU, "14:40", 40, moved) === false],
        ["休憩を15:00へ動かした日: 休憩の終わりちょうど(15:40)は取れる", isStaffSpanBookableYmd(THU, "15:40", 20, moved) === true],
        ["動かしたのはその日だけ: 翌週はいつもの休憩(14:00)で取れない", isStaffSpanBookableYmd(NEXT_THU, "14:00", 20, moved) === false],
        ["動かしたのはその日だけ: 翌週の15:00は取れる", isStaffSpanBookableYmd(NEXT_THU, "15:00", 20, moved) === true],
        ["休憩なしの日: いつもの休憩の時間(14:00)が取れる", isStaffSpanBookableYmd(THU, "14:00", 20, none) === true],
        ["休憩なしはその日だけ: 翌週は14:00が取れない", isStaffSpanBookableYmd(NEXT_THU, "14:00", 20, none) === false],
        ["開始時刻だけの判定も同じ: 動かした日の15:20は休憩中", isTimeWithinStaffHoursYmd(THU, "15:20", moved) === false],
        ["枠の一覧も同じ: 動かした日は 15:00/15:20 だけが消える",
          JSON.stringify(filterSlotsByStaffSchedule(slots, d, moved)) === JSON.stringify(["13:40", "14:00", "14:20", "14:40", "15:40"])],
        ["勤務表が無い先生でも、その日だけの休憩は効く", onlyDate !== null && isStaffSpanBookableYmd(THU, "13:00", 20, onlyDate) === false],
        ["勤務表が無い先生: 休憩の外は取れる", onlyDate !== null && isStaffSpanBookableYmd(THU, "13:20", 20, onlyDate) === true],
      ];
      for (const [label, ok] of cases) {
        if (!ok) fail(`その日だけの休憩の判定が変わっています: ${label}`);
      }
    }
  }

  // buildStaffSchedule を呼ぶ判定ファイルは、その日だけの休憩も一緒に渡していること
  const FILES = [
    ["src/app/actions/reserve.ts", "fetchStaffDateBreaks(", 5],
    ["src/app/actions/courses.ts", "fetchStaffDateBreaks(", 3],
    ["src/app/actions/adminReserve.ts", "dateBreaksOf(", 1],
  ];
  for (const [file, needle, min] of FILES) {
    if (!existsSync(file)) { fail(`${file} が見つかりません`); continue; }
    const code = stripComments(readFileSync(file, "utf8"));
    const builds = code.split("buildStaffSchedule(").length - 1;
    const uses = code.split(needle).length - 1;
    if (uses < min) {
      fail(
        `${file} が、その日だけの休憩を空き判定に渡していません`,
        `   buildStaffSchedule の呼び出し ${builds} か所に対して、${needle} が ${uses} か所（${min} か所以上のはず）。\n` +
        "   渡し忘れた判定だけ、予約表で動かした休憩が効かなくなります。",
      );
    }
  }

  // 院長の「名前クリック→勤務時間」の保存は、その日だけの休憩（kind="break"）の行に触らないこと。
  // 触ると、勤務時間だけ直したのに「休憩なし」が消えて毎週の休憩が黙って復活したり、
  // 誰も変えていない日に毎週と同じ時刻の行ができて「変更中」になる（2026-09-21 検品指摘）。
  const SCHED_FILE = "src/app/actions/staff-schedule.ts";
  if (!existsSync(SCHED_FILE)) {
    fail(`${SCHED_FILE} が見つかりません`);
  } else {
    const code = stripComments(readFileSync(SCHED_FILE, "utf8"));
    const from = code.indexOf("export async function upsertStaffScheduleForDate");
    const to = code.indexOf("export async function", from + 10);
    if (from < 0 || to < 0) {
      fail(`${SCHED_FILE} に upsertStaffScheduleForDate が見つかりません`, "   改名したら、この監査も直してください。");
    } else {
      const body = code.slice(from, to);
      // 許しているのは「休憩以外の行を探す」ための .neq("kind", "break") だけ
      const touches = body.replace(/\.neq\("kind",\s*"break"\)/g, "").includes('"break"');
      if (touches) {
        fail(
          "upsertStaffScheduleForDate（名前クリックの勤務時間の保存）が、休憩の行（kind=\"break\"）を書き換えています",
          "   休憩を書いてよいのは setStaffBreakForDate だけです。",
        );
      }
    }
    if (!code.includes("export async function setStaffBreakForDate")) {
      fail(`${SCHED_FILE} に setStaffBreakForDate がありません`);
    }
  }
}
checkStaffDateBreak();

// ───────────────────────────────────────────────────────────
// (5) 実際に起きた事故そのものを、からだ鍼灸整骨院の本番の設定で再現して見張る
// ───────────────────────────────────────────────────────────
// 2026-09-24 藤川先生「予約入れれないところで入ってしまっています」。
//   9/24(木) 17:40 は 森川先生=対応不可（17:00〜18:00）/ 森藤先生=受付17:30まで。
//   誰も受けられないのに患者さんには ◯空き に見え、予約が成立して**担当未設定**で入り、
//   予約表では先頭の列（藤川院長）に出た。
// 「取れない時間が塞がるか」だけでなく「取れる時間まで塞いでいないか」も両方見る。
function checkKarada0924() {
  let ts;
  try { ts = require_("typescript"); } catch { return; }
  const load = (file) => {
    if (!existsSync(file)) { fail(`${file} が見つかりません`); return null; }
    const js = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const mod = { exports: {} };
    new Function("module", "exports", js)(mod, mod.exports);
    return mod.exports;
  };
  const avail = load(AVAIL_FILE);
  const cap = load(NG_FILE);
  if (!avail || !cap) return;
  const { buildStaffSchedule, offDutyStaffAt } = avail;
  const { countUnavailableOnlyStaff, isPoolFull } = cap;
  if (typeof offDutyStaffAt !== "function") {
    fail(`${AVAIL_FILE} が offDutyStaffAt を export していません`);
    return;
  }

  const THU = "2026-09-24"; // 木曜(4)
  const PREP = 30;          // からだの「準備・片付け」30分
  const DUR = 20;           // 保険施術（再診）20分
  const MORIKAWA = "morikawa";
  const MORIFUJI = "morifuji";
  // 本番の勤務表そのまま（2026-09-24 実測）
  const schedules = new Map([
    [MORIKAWA, buildStaffSchedule({ schedule_based_booking: false }, [],
      [{ day_of_week: 4, start_time: "09:30:00", end_time: "20:30:00", break_start: "12:00:00", break_end: "14:00:00" }], PREP)],
    [MORIFUJI, buildStaffSchedule({ schedule_based_booking: false }, [],
      [{ day_of_week: 4, start_time: "09:30:00", end_time: "18:00:00", break_start: "14:00:00", break_end: "14:45:00" }], PREP)],
  ]);
  // 受付が入れた「森川先生だけ対応不可」17:00〜18:00（20分×3行）
  const ngBlocks = [
    { staff_id: MORIKAWA, start_time: "17:00:00", end_time: "17:20:00" },
    { staff_id: MORIKAWA, start_time: "17:20:00", end_time: "17:40:00" },
    { staff_id: MORIKAWA, start_time: "17:40:00", end_time: "18:00:00" },
  ];
  const pool = new Set([MORIKAWA, MORIFUJI]);
  const NO_BUSY = new Set();
  /** その時刻が「もう取れない」か（予約はまだ0件として、定員だけで見る） */
  const full = (hm) => {
    const [h, m] = hm.split(":").map(Number);
    const t = h * 60 + m;
    const ngOnly = countUnavailableOnlyStaff(
      ngBlocks, pool, t, t + DUR, NO_BUSY, offDutyStaffAt(schedules, THU, hm, DUR),
    );
    return isPoolFull({ totalCount: 0, poolCount: 0, capacity: 2, ngOnly });
  };

  // 🚨 院ぜんたいの休憩（祝日の休憩 13:00〜13:40 など）に「食い込む」開始時刻も塞ぐこと。
  //   2026-09-24 検品2回目: 画面側の連続枠判定をやめたとき、サーバーが休憩そのものの時間しか
  //   塞いでいなかったため、40分メニューの 12:40 が ◯ に見えて、お名前やアンケートを全部
  //   入れたあと登録ガードで弾かれる状態になっていた（選べるのに登録できない）。
  //   登録ガード（createReservation の hitBreak）と同じ半開区間の重なりで見る。
  // 製品コードの hitsBlockedSlot を**実際に動かして**確かめる（テストの中に書き直した
  // 別実装を照合しても、半開区間を <= に変える等の退化は見つからない）。
  const { hitsBlockedSlot } = cap;
  if (typeof hitsBlockedSlot !== "function") {
    fail(`${NG_FILE} が hitsBlockedSlot を export していません`);
  } else {
    // 祝日の休憩 13:00〜13:40（院ぜんたい）＋ 先生Bだけの予約NG 16:00〜16:20
    const blocks = [
      { staff_id: null, start_time: "13:00:00", end_time: "13:40:00" },
      { staff_id: B, start_time: "16:00:00", end_time: "16:20:00" },
    ];
    const at = (hm, dur) => {
      const [h, m] = hm.split(":").map(Number);
      const s = h * 60 + m;
      return [s, s + dur];
    };
    const hit = (hm, dur, req = null) => hitsBlockedSlot(blocks, ...at(hm, dur), req);
    const breakCases = [
      ["40分メニューは 12:40 から始められない（12:40〜13:20 が休憩にかぶる）", hit("12:40", 40) === true],
      ["60分メニューは 12:20 から始められない", hit("12:20", 60) === true],
      ["20分メニューなら 12:40 は取れる（12:40〜13:00 は休憩前）", hit("12:40", 20) === false],
      ["休憩の終わりちょうど 13:40 からは取れる", hit("13:40", 40) === false],
      ["休憩の中（13:00）は取れない", hit("13:00", 20) === true],
      ["休憩と関係ない 10:00 は取れる", hit("10:00", 60) === false],
      ["先生Bだけの予約NGは、担当自由のコースを塞がない", hit("16:00", 20) === false],
      ["先生Bだけの予約NGは、先生B固定のコースを塞ぐ", hit("16:00", 20, B) === true],
      ["先生Bだけの予約NGは、先生A固定のコースを塞がない", hit("16:00", 20, A) === false],
      ["先生B固定のコースでも、NGに食い込む 15:40 の40分は塞ぐ", hit("15:40", 40, B) === true],
      ["先生B固定のコースで、NGの終わりちょうど 16:20 は取れる", hit("16:20", 20, B) === false],
      ["院ぜんたいの休憩は、先生固定のコースも塞ぐ", hit("13:00", 20, A) === true],
    ];
    for (const [label, ok] of breakCases) {
      if (!ok) fail(`休憩にまたがる開始時刻の判定が変わっています: ${label}`);
    }
  }
  // 画面（getDailyAvailability）が本当にこの判定を使っているか。
  // 休憩そのものの時間を塞ぐだけに戻すと、40分メニューの 12:40 が ◯ に戻って同じ事故になる。
  // 担当固定コースの受付時間・休憩（offDutyStaffAt）も同じ理由で必須。
  {
    const code = stripComments(readFileSync("src/app/actions/reserve.ts", "utf8"));
    if (!code.includes("hitsBlockedSlot(")) {
      fail(
        "reserve.ts の空き表示が、休憩に「食い込む」開始時刻を塞いでいません",
        "   休憩そのものの時間だけ塞ぐと、40分メニューの 12:40（12:40〜13:20 が休憩にかぶる）が\n" +
        "   ◯ に見えて、申し込みの最後で登録ガードに弾かれます（選べるのに登録できない）。",
      );
    }
    if (!/requiredStaffId\s*&&\s*offDutyStaffAt\(/.test(code)) {
      fail(
        "reserve.ts の空き表示が、担当固定コースの先生の受付時間・休憩を見ていません",
        "   開始時刻しか見ないと、受付 17:30 までの先生に 17:20 の20分枠が ◯ で出て、\n" +
        "   申し込みの最後に「受付時間・休憩にかかってしまいます」で弾かれます。",
      );
    }
  }

  const cases = [
    // 塞がるべきところ（事故そのもの）
    ["17:40 は取れない（森川=対応不可・森藤=受付17:30まで）", full("17:40") === true],
    ["17:20 も取れない（森川=対応不可・森藤は20分だと17:30を超える）", full("17:20") === true],
    // 塞ぎすぎていないところ（逆向き）
    ["11:00 は取れる（2人とも受付中）", full("11:00") === false],
    ["13:00 は取れる（森川は休憩でも森藤が受けられる）", full("13:00") === false],
    ["14:00 は取れる（森藤は休憩でも森川の休憩は14:00で明け）", full("14:00") === false],
    ["17:00 は取れる（森川は対応不可でも森藤はまだ受付中）", full("17:00") === false],
    ["18:00 は取れる（森川の対応不可は18:00で明け）", full("18:00") === false],
    ["20:00 は取れない（森川の受付も20:00まで）", full("20:00") === true],
  ];
  for (const [label, ok] of cases) {
    if (!ok) fail(`からだ 9/24 の空き判定が変わっています: ${label}`);
  }
}
checkKarada0924();

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
console.log("   ・先生個別の予約NGが、担当自由メニューの定員から引かれていることを確認（表示と登録の両方）");
console.log("   ・先生の「その日だけの休憩」が、Web予約・院内の登録のどちらにも効いていることを確認");
console.log("   ・その時間に受付時間外・休憩の先生が、担当自由メニューの定員から引かれていることを確認");
console.log("   ・からだ 9/24 17:40 の事故を本番の勤務表で再現し、塞ぐ／塞ぎすぎない の両方を確認");
console.log("   ・自動割当で誰も受けられなかったとき、担当未設定のまま予約を作らないことを確認");
