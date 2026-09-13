// node --test src/lib/training-catalog.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CATALOG, DEFAULT_AXES, DEFAULT_REGIONS,
  sanitizeCatalog, resolveCatalog, validateCatalogChange,
  visibleAxes, visibleRegions, axesFor, sidesFor, totalCells, axesToShow, axisLabel, regionLabel,
  axisAverages, regionAverages, asymmetries, growth, movers, weaknessScan,
} from "./training-catalog.ts";

const clone = (x) => JSON.parse(JSON.stringify(x));

// 院が「柔軟性」の軸と「前屈」「後屈」の項目を足した例
const withFlex = () => {
  const cat = clone(DEFAULT_CATALOG);
  cat.axes.push({ key: "c_flex", label: "柔軟性", color: "#14b8a6", desc: "体のやわらかさ" });
  cat.regions.push({ key: "c_zenkutsu", label: "前屈", group: "柔軟性", bilateral: false, hint: "立位体前屈で指先と床の距離", axes: ["c_flex"], exercises: [{ name: "前屈ストレッチ", note: "30秒×3" }] });
  cat.regions.push({ key: "c_koukutsu", label: "後屈", group: "柔軟性", bilateral: false, hint: "腰に手を当てて反る", axes: ["c_flex"], exercises: [] });
  return cat;
};

test("標準セットは変更前と同じ（軸4つ・項目9つ・反射神経は2軸で左右なし）", () => {
  assert.deepEqual(DEFAULT_AXES.map((a) => a.key), ["strength", "reflex", "power", "motor"]);
  assert.deepEqual(DEFAULT_REGIONS.map((r) => r.key), ["toe", "ankle", "hip", "hamstring", "iliopsoas", "abs", "back", "arm", "reflex"]);
  const reflex = DEFAULT_REGIONS.find((r) => r.key === "reflex");
  assert.deepEqual(axesFor(reflex, DEFAULT_CATALOG), ["reflex", "motor"]);
  assert.deepEqual(sidesFor(reflex), ["both"]);
  // 変更前の TOTAL_CELLS = 左右ありの8項目×4軸×2 + 反射神経2軸×1 = 66
  assert.equal(totalCells(DEFAULT_CATALOG), 66);
  // 自宅トレも引き継いでいる
  assert.equal(DEFAULT_REGIONS.find((r) => r.key === "hamstring").exercises.length, 4);
});

test("院の設定が未設定・壊れていれば標準セット", () => {
  assert.equal(resolveCatalog(null), DEFAULT_CATALOG);
  assert.equal(resolveCatalog("壊れた値"), DEFAULT_CATALOG);
  assert.equal(resolveCatalog({ axes: [], regions: [] }), DEFAULT_CATALOG);
  assert.equal(resolveCatalog({ axes: [{ key: "a", label: "A", hidden: true }], regions: [{ key: "r", label: "R" }] }), DEFAULT_CATALOG, "表示中の軸が無ければ使えない");
});

test("柔軟性の軸・前屈/後屈の項目を足した設定はそのまま使える", () => {
  const cat = resolveCatalog(withFlex());
  assert.equal(axisLabel(cat, "c_flex"), "柔軟性");
  assert.equal(regionLabel(cat, "c_zenkutsu"), "前屈");
  assert.deepEqual(axesFor(cat.regions.find((r) => r.key === "c_zenkutsu"), cat), ["c_flex"]);
  // 軸を足すと、評価する軸を指定していない標準の項目（左右ありの8項目）にも付く（8項目×左右2 = +16）。
  // 反射神経は軸を指定しているので増えない。前屈・後屈で +1 ずつ。
  // ※ 画面の設定では、軸を足したときに既存の項目へ勝手に付かないよう、各項目の軸を明示して保存する。
  assert.equal(totalCells(cat), 66 + 8 * 2 + 2);
  assert.ok(axesFor(cat.regions.find((r) => r.key === "toe"), cat).includes("c_flex"));
  assert.ok(!axesFor(cat.regions.find((r) => r.key === "reflex"), cat).includes("c_flex"));
});

test("key が不正・重複、存在しない軸の指定、長すぎる文字は直される", () => {
  const cat = sanitizeCatalog({
    axes: [
      { key: "strength", label: "  筋力  ", color: "red", desc: "x" },
      { key: "strength", label: "重複" },
      { key: "Bad-Key", label: "不正" },
      { key: "c_flex", label: "柔軟性がとても長い名前ですよね", color: "#14B8A6" },
    ],
    regions: [
      { key: "c_a", label: "前屈", axes: ["c_flex", "nope", "c_flex"], bilateral: "yes" },
      { key: "", label: "空" },
      { key: "c_b", label: "" },
    ],
  });
  assert.deepEqual(cat.axes.map((a) => a.key), ["strength", "c_flex"]);
  assert.equal(cat.axes[0].label, "筋力");
  assert.equal(cat.axes[0].color, "#64748b", "不正な色は灰色");
  assert.equal(cat.axes[1].label.length, 12, "軸の名前は12文字で切る");
  assert.deepEqual(cat.regions.map((r) => r.key), ["c_a"]);
  assert.deepEqual(cat.regions[0].axes, ["c_flex"], "実在する軸だけ・重複なし");
  assert.equal(cat.regions[0].bilateral, false, "true 以外は左右なし");
  assert.equal(cat.regions[0].group, "その他");
});

test("設定の保存: key を消すのはダメ、非表示にするのはOK", () => {
  const prev = withFlex();
  const removed = clone(prev);
  removed.regions = removed.regions.filter((r) => r.key !== "c_zenkutsu");
  assert.match(validateCatalogChange(prev, removed), /前屈.*削除できません/);

  const removedAxis = clone(prev);
  removedAxis.axes = removedAxis.axes.filter((a) => a.key !== "strength");
  assert.match(validateCatalogChange(prev, removedAxis), /筋力.*削除できません/);

  const hidden = clone(prev);
  hidden.regions.find((r) => r.key === "c_zenkutsu").hidden = true;
  hidden.regions.push({ key: "c_new", label: "開脚", group: "柔軟性", bilateral: false });
  assert.equal(validateCatalogChange(prev, hidden), null);
});

test("非表示の項目・軸は採点画面から消えるが、過去の点数の集計には残る", () => {
  const cat = withFlex();
  cat.regions.find((r) => r.key === "c_zenkutsu").hidden = true;
  cat.axes.find((a) => a.key === "power").hidden = true;
  const r = resolveCatalog(cat);
  assert.ok(!visibleRegions(r).some((x) => x.key === "c_zenkutsu"));
  assert.ok(!visibleAxes(r).some((x) => x.key === "power"));
  assert.ok(!axesFor(r.regions.find((x) => x.key === "toe"), r).includes("power"), "採点画面では非表示の軸を出さない");
  assert.ok(axesFor(r.regions.find((x) => x.key === "toe"), r, true).includes("power"), "集計では非表示の軸も含む");

  const ms = [
    { item_key: "c_zenkutsu", axis: "c_flex", side: "both", score: 4 },
    { item_key: "toe", axis: "power", side: "left", score: 8 },
    { item_key: "toe", axis: "power", side: "right", score: 2 },
  ];
  const aa = axisAverages(ms, r);
  assert.equal(aa.power, 5, "非表示の軸の過去の点数も平均に入る");
  assert.equal(aa.c_flex, 4);
  assert.ok(axesToShow(r, aa).some((a) => a.key === "power"), "点数がある非表示の軸は表示する");
  assert.ok(!axesToShow(r, { ...aa, power: null }).some((a) => a.key === "power"), "点数が無い非表示の軸は出さない");
  assert.equal(regionAverages(ms, r).find((x) => x.key === "c_zenkutsu").value, 4);
  assert.equal(asymmetries(ms, r)[0].diff, 6, "非表示の軸の左右差も見える");
});

test("足した軸・項目で、伸び・項目別の伸び・弱点（自宅トレ）が出る", () => {
  const cat = resolveCatalog(withFlex());
  const a1 = { id: "1", customer_id: "c", assessed_on: "2026-08-01", assessor_name: null, overall_memo: null, next_goal: null, homework: null,
    measurements: [{ item_key: "c_zenkutsu", axis: "c_flex", side: "both", score: 6 }] };
  const a2 = { ...a1, id: "2", assessed_on: "2026-09-01",
    measurements: [{ item_key: "c_zenkutsu", axis: "c_flex", side: "both", score: 3 }] };
  const g = growth(a1, a2, cat);
  assert.equal(g.axes.c_flex, -3);
  const mv = movers(a1, a2, cat);
  assert.deepEqual(mv.map((m) => [m.label, m.axisLabel, m.delta]), [["前屈", "柔軟性", -3]]);
  const w = weaknessScan(a2, a1, cat);
  assert.equal(w[0].label, "前屈");
  assert.deepEqual(w[0].reasons, ["低スコア(3点)", "前回より3低下"]);
  assert.deepEqual(w[0].exercises, [{ name: "前屈ストレッチ", note: "30秒×3" }]);
});

// ───────────── 保存済みの点数を消させない（2026-09-14 検品 NG1・NG2） ─────────────
import { buildScoredCells, findHiddenScoredCells, materializeRegionAxes } from "./training-catalog.ts";

test("NG1: 点数のある軸を項目から外す設定は止める（点数が無ければ外せる）", () => {
  const base = resolveCatalog(clone(DEFAULT_CATALOG));
  const next = clone(base);
  next.regions.find((r) => r.key === "ankle").axes = ["reflex", "power", "motor"]; // 筋力を外す
  const scored = buildScoredCells([{ item_key: "ankle", axis: "strength", side: "left" }]);
  const msg = findHiddenScoredCells(next, scored);
  assert.match(msg, /足首.*筋力.*外せません/);
  assert.equal(findHiddenScoredCells(base, scored), null, "外していなければ通る");
  assert.equal(findHiddenScoredCells(next, buildScoredCells([])), null, "点数が無ければ外せる");
});

test("NG2: 軸を非表示にしたあと別の軸を足しても、各項目に非表示の軸が残る", () => {
  const cat = clone(DEFAULT_CATALOG);
  cat.axes.find((a) => a.key === "power").hidden = true;
  const resolved = resolveCatalog(cat);
  const ankle = resolved.regions.find((r) => r.key === "ankle");
  const materialized = materializeRegionAxes(ankle, resolved);
  assert.ok(materialized.includes("power"), "非表示の瞬発力が落ちない");

  // 画面の「軸を足す」と同じ手順：各項目の軸を明示してから新しい軸を足す
  const next = clone(resolved);
  next.regions = next.regions.map((r) => ({ ...r, axes: materializeRegionAxes(r, resolved) }));
  next.axes.push({ key: "c_flex", label: "柔軟性", color: "#14b8a6", desc: "" });
  const scored = buildScoredCells([
    { item_key: "ankle", axis: "power", side: "left" },
    { item_key: "ankle", axis: "power", side: "right" },
  ]);
  assert.equal(findHiddenScoredCells(resolveCatalog(next), scored), null);
});

test("点数のある項目の「左右を分けて測る」を変える設定は止める", () => {
  const base = resolveCatalog(clone(DEFAULT_CATALOG));
  const toBoth = clone(base);
  toBoth.regions.find((r) => r.key === "ankle").bilateral = false;
  assert.match(findHiddenScoredCells(toBoth, buildScoredCells([{ item_key: "ankle", axis: "strength", side: "right" }])), /足首.*左右/);

  const toSides = clone(base);
  toSides.regions.find((r) => r.key === "reflex").bilateral = true;
  assert.match(findHiddenScoredCells(toSides, buildScoredCells([{ item_key: "reflex", axis: "reflex", side: "both" }])), /反射神経.*左右/);
});

test("点数のある項目・軸そのものを消す設定も止める", () => {
  const base = resolveCatalog(clone(DEFAULT_CATALOG));
  const noRegion = clone(base);
  noRegion.regions = noRegion.regions.filter((r) => r.key !== "toe");
  assert.match(findHiddenScoredCells(noRegion, buildScoredCells([{ item_key: "toe", axis: "motor", side: "left" }])), /削除できません/);
  const noAxis = clone(base);
  noAxis.axes = noAxis.axes.filter((a) => a.key !== "motor");
  assert.match(findHiddenScoredCells(noAxis, buildScoredCells([{ item_key: "toe", axis: "motor", side: "left" }])), /削除できません/);
});
