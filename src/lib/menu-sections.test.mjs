// node --test src/lib/menu-sections.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMenuSections, normalizeGroup, RECOMMENDED_TITLE, OTHER_TITLE } from "./menu-sections.ts";

const c = (id, sort_order, menu_group = null, is_recommended = false, name = id) =>
  ({ id, name, sort_order, menu_group, is_recommended });

const titles = (r) => r.sections.map((s) => s.title);
const ids = (s) => s.courses.map((x) => x.id);

test("見出しもおすすめも無い院は、分けずにそのまま（他院の見た目を変えない）", () => {
  const input = [c("a", 2), c("b", 1)];
  const r = buildMenuSections(input);
  assert.equal(r.grouped, false);
  assert.equal(r.sections.length, 1);
  assert.deepEqual(ids(r.sections[0]), ["a", "b"], "並び順も触らない");
});

test("空白だけの見出しは『見出しなし』扱い（分け始めない）", () => {
  const r = buildMenuSections([c("a", 1, "   "), c("b", 2, "")]);
  assert.equal(r.grouped, false);
});

test("おすすめは先頭。おすすめのメニューは自分の見出しにも重ねて出る", () => {
  const r = buildMenuSections([
    c("hoken", 10, "保険施術"),
    c("jikkuri", 60, "整体・マッサージ", true),
    c("shinkyu", 20, "鍼灸"),
  ]);
  assert.equal(r.grouped, true);
  assert.deepEqual(titles(r), [RECOMMENDED_TITLE, "保険施術", "鍼灸", "整体・マッサージ"]);
  assert.deepEqual(ids(r.sections[0]), ["jikkuri"]);
  assert.deepEqual(ids(r.sections[3]), ["jikkuri"], "おすすめでも自分の見出しから消えない");
});

test("見出しの順番は、その見出しの一番上のメニューの並び順で決まる", () => {
  const r = buildMenuSections([
    c("tr1", 90, "トレーニング"),
    c("sh1", 20, "鍼灸"),
    c("tr0", 5, "トレーニング"),
    c("sh2", 26, "鍼灸"),
  ]);
  assert.deepEqual(titles(r), ["トレーニング", "鍼灸"]);
  assert.deepEqual(ids(r.sections[0]), ["tr0", "tr1"], "見出しの中もメニューの並び順");
});

test("入力の順番を入れ替えても結果は同じ", () => {
  const rows = [c("x", 3, "B"), c("y", 1, "A", true), c("z", 2, null)];
  const r1 = buildMenuSections(rows);
  const r2 = buildMenuSections([...rows].reverse());
  assert.deepEqual(
    r1.sections.map((s) => [s.key, s.title, ids(s)]),
    r2.sections.map((s) => [s.key, s.title, ids(s)]),
  );
});

test("見出しの無いメニューは最後に『その他のメニュー』", () => {
  const r = buildMenuSections([c("a", 1, "鍼灸"), c("b", 2, null), c("c", 3, "鍼灸")]);
  assert.deepEqual(titles(r), ["鍼灸", OTHER_TITLE]);
  assert.deepEqual(ids(r.sections[1]), ["b"]);
});

test("前後に空白がある見出しは同じ見出しにまとめる", () => {
  const r = buildMenuSections([c("a", 1, "鍼灸"), c("b", 2, " 鍼灸 "), c("d", 3, "鍼灸　".trim())]);
  assert.deepEqual(titles(r), ["鍼灸"]);
  assert.deepEqual(ids(r.sections[0]), ["a", "b", "d"]);
  assert.equal(normalizeGroup("  整体 "), "整体");
  assert.equal(normalizeGroup(null), null);
});

test("おすすめだけ設定して見出しが無い場合も分ける（おすすめ＋その他）", () => {
  const r = buildMenuSections([c("a", 1, null, true), c("b", 2)]);
  assert.equal(r.grouped, true);
  assert.deepEqual(titles(r), [RECOMMENDED_TITLE, OTHER_TITLE]);
  assert.deepEqual(ids(r.sections[1]), ["a", "b"], "おすすめもその他に重ねて出す");
});

test("ジャンプ用のキーは重複しない", () => {
  const r = buildMenuSections([c("a", 1, "A", true), c("b", 2, "B"), c("x", 3, null)]);
  const keys = r.sections.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("絞り込みで一つも残らなかったとき（空配列）は分けない", () => {
  const r = buildMenuSections([]);
  assert.equal(r.grouped, false);
  assert.deepEqual(ids(r.sections[0]), []);
});
