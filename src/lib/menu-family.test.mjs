// node --test src/lib/menu-family.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { menuFamily, sortBreakdown, NO_MENU_LABEL } from "./menu-family.ts";

// からだ鍼灸整骨院の本番メニュー名（2026-09-13 時点の reservation_courses）で確かめる
const cases = [
  ["保険施術（初診）", "保険施術"],
  ["保険施術（再診）", "保険施術"],
  ["鍼灸 1部位", "鍼灸"],
  ["鍼灸 全身", "鍼灸"],
  ["小児鍼", "小児鍼"],
  ["電気鍼", "電気鍼"],
  ["整体 半身（上 or 下）", "整体"],
  ["整体 全身", "整体"],
  ["マッサージ 60分", "マッサージ"],
  ["スパイラルテーピング 学生", "スパイラルテーピング"],
  ["じっくり全身調整", "じっくり全身調整"],
  ["経絡治療（2回目以降）", "経絡治療"],
  ["院長トータルリメイク 初回110分（カウンセリング込）", "院長トータルリメイク"],
  ["パーソナルトレーニング 20分", "パーソナルトレーニング"],
  ["ピラティス 60分", "ピラティス"],
  ["全角スペース　区切り", "全角スペース"],
  ["半角(かっこ) 付き", "半角"],
];

for (const [input, expected] of cases) {
  test(`${input} → ${expected}`, () => {
    assert.equal(menuFamily(input), expected);
  });
}

test("メニュー名が無い予約は「メニュー未設定」にまとめる", () => {
  assert.equal(menuFamily(null), NO_MENU_LABEL);
  assert.equal(menuFamily(undefined), NO_MENU_LABEL);
  assert.equal(menuFamily(""), NO_MENU_LABEL);
  assert.equal(menuFamily("（初診）"), NO_MENU_LABEL);
});

test("時間ちがいのメニューは1つの種類に合算できる（別々に数えない）", () => {
  const counts = {};
  for (const n of ["パーソナルトレーニング 20分", "パーソナルトレーニング 40分", "パーソナルトレーニング 60分"]) {
    const f = menuFamily(n);
    counts[f] = (counts[f] ?? 0) + 1;
  }
  assert.deepEqual(counts, { "パーソナルトレーニング": 3 });
});

test("内訳は件数の多い順。同数は名前順で並びが毎回変わらない", () => {
  const sorted = sortBreakdown({ "鍼灸": 3, "保険施術": 10, "整体": 3 });
  // 先頭は件数が最多のもの
  assert.equal(sorted[0].label, "保険施術");
  assert.equal(sorted[0].count, 10);
  // 同じ3件どうしは名前順（入力の順番に左右されない）
  const tie = ["整体", "鍼灸"].sort((a, b) => a.localeCompare(b, "ja"));
  assert.deepEqual(sorted.slice(1).map((x) => x.label), tie);
  const reversedInput = sortBreakdown({ "整体": 3, "保険施術": 10, "鍼灸": 3 });
  assert.deepEqual(reversedInput.map((x) => x.label), sorted.map((x) => x.label));
});

// ───────────── aggregateStaffMonth（タイムテーブルの件数とその内訳） ─────────────
import { aggregateStaffMonth, UNASSIGNED_STAFF_KEY } from "./menu-family.ts";

const monthOf = (iso) => iso.slice(0, 7);
const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);

test("主担当だけ・メニュー1つの予約は、件数1・内訳1", () => {
  const { counts, breakdown } = aggregateStaffMonth(
    [{ start_time: "2026-09-02T01:00:00Z", staff_id: "A", course_id: "c1", course_name: "鍼灸 2部位" }],
    monthOf,
  );
  assert.deepEqual(counts, { "2026-09": { A: 1 } });
  assert.deepEqual(breakdown, { "2026-09": { A: { "鍼灸": 1 } } });
});

test("1人で複数メニュー（保険施術＋鍼灸）は、件数1のまま内訳は両方に数える", () => {
  const { counts, breakdown } = aggregateStaffMonth(
    [{
      start_time: "2026-09-02T01:00:00Z", staff_id: "A", course_id: "hoken", course_name: "保険施術（再診）",
      additional_courses: [{ course_id: "sk", course_name: "鍼灸 1部位" }],
    }],
    monthOf,
  );
  assert.equal(counts["2026-09"].A, 1, "予約件数は1件のまま");
  assert.deepEqual(breakdown["2026-09"].A, { "保険施術": 1, "鍼灸": 1 }, "追加メニューも内訳に出る");
});

test("2人担当は、件数も内訳も担当全員に数える（ダッシュボードの達成率表と同じ）", () => {
  const { counts, breakdown } = aggregateStaffMonth(
    [{
      start_time: "2026-09-02T01:00:00Z", staff_id: "A", course_id: "hoken", course_name: "保険施術（再診）",
      additional_staff: [{ staff_id: "B" }],
      additional_courses: [{ course_id: "sk", course_name: "鍼灸 1部位" }],
    }],
    monthOf,
  );
  assert.deepEqual(counts["2026-09"], { A: 1, B: 1 });
  assert.deepEqual(breakdown["2026-09"].A, { "保険施術": 1, "鍼灸": 1 });
  assert.deepEqual(breakdown["2026-09"].B, { "保険施術": 1, "鍼灸": 1 });
});

test("同じメニューIDが主と追加に重なっても1つ、同じ先生の重複も1件", () => {
  const { counts, breakdown } = aggregateStaffMonth(
    [{
      start_time: "2026-09-02T01:00:00Z", staff_id: "A", course_id: "s", course_name: "整体 全身",
      additional_staff: [{ staff_id: "A" }, { staff_id: "A" }],
      additional_courses: [{ course_id: "s", course_name: "整体 全身" }],
    }],
    monthOf,
  );
  assert.deepEqual(counts["2026-09"], { A: 1 });
  assert.deepEqual(breakdown["2026-09"].A, { "整体": 1 });
});

test("別のメニューIDでも同じ種類なら種類の件数は2（時間ちがいを2回やった）", () => {
  const { breakdown } = aggregateStaffMonth(
    [{
      start_time: "2026-09-02T01:00:00Z", staff_id: "A", course_id: "m20", course_name: "マッサージ 20分",
      additional_courses: [{ course_id: "m40", course_name: "マッサージ 40分" }],
    }],
    monthOf,
  );
  assert.deepEqual(breakdown["2026-09"].A, { "マッサージ": 2 });
});

test("メニューが1つも無い予約は「メニュー未設定」1件。担当未設定は専用キー。月が違えば別", () => {
  const { counts, breakdown } = aggregateStaffMonth(
    [
      { start_time: "2026-09-30T01:00:00Z", staff_id: null, course_id: null, course_name: null },
      { start_time: "2026-10-01T01:00:00Z", staff_id: null, course_id: "p", course_name: "ピラティス 20分" },
    ],
    monthOf,
  );
  assert.deepEqual(counts, { "2026-09": { [UNASSIGNED_STAFF_KEY]: 1 }, "2026-10": { [UNASSIGNED_STAFF_KEY]: 1 } });
  assert.deepEqual(breakdown["2026-09"][UNASSIGNED_STAFF_KEY], { "メニュー未設定": 1 });
  assert.deepEqual(breakdown["2026-10"][UNASSIGNED_STAFF_KEY], { "ピラティス": 1 });
});

test("どの先生でも「内訳の合計 ＝ 担当した予約それぞれのメニュー数の合計」で、件数以上になる（壊れたJSONも崩れない）", () => {
  const rows = [
    { start_time: "2026-09-01T01:00:00Z", staff_id: "A", course_id: "x", course_name: "鍼灸 全身", additional_staff: [{ staff_id: "B" }, { staff_id: "C" }], additional_courses: [{ course_id: "y", course_name: "マッサージ 20分" }] },
    { start_time: "2026-09-01T02:00:00Z", staff_id: "B", course_id: null, course_name: null, additional_staff: "壊れた値", additional_courses: 42 },
    { start_time: "2026-09-01T03:00:00Z", staff_id: "C", course_id: "z", course_name: "電気鍼", additional_staff: [null, { staff_id: "" }, { staff_id: "A" }], additional_courses: [null, {}] },
  ];
  const { counts, breakdown } = aggregateStaffMonth(rows, monthOf);
  assert.deepEqual(counts["2026-09"], { A: 2, B: 2, C: 2 });
  // 予約1: メニュー2つ × 担当 A,B,C ／ 予約2: メニューなし(1) × B ／ 予約3: メニュー1つ × C,A
  assert.equal(sum(breakdown["2026-09"].A), 2 + 1);
  assert.equal(sum(breakdown["2026-09"].B), 2 + 1);
  assert.equal(sum(breakdown["2026-09"].C), 2 + 1);
  for (const [staff, n] of Object.entries(counts["2026-09"])) {
    assert.ok(sum(breakdown["2026-09"][staff]) >= n, `${staff}: 内訳の合計が件数より少ない`);
  }
});
