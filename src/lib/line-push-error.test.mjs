// node --test src/lib/line-push-error.test.mjs
// Node 24 の型ストリップで .ts を直接読む（依存ゼロの純関数なので可能）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeLinePushFailure } from "./line-push-error.ts";

test("429 + monthly limit → 今月の上限（来月1日／プラン変更の案内が入る）", () => {
  const r = describeLinePushFailure(429, JSON.stringify({ message: "You have reached your monthly limit." }));
  assert.equal(r.kind, "monthly_limit");
  assert.equal(r.code, "LINE_MONTHLY_LIMIT");
  assert.match(r.message, /200通/);
  assert.match(r.message, /来月1日/);
  assert.match(r.message, /プラン変更/);
});

test("429 + monthly limit はオブジェクト本文でも同じ判定", () => {
  const r = describeLinePushFailure(429, { message: "You have reached your monthly limit." });
  assert.equal(r.kind, "monthly_limit");
});

test("429 だが monthly limit でない → 短時間の送りすぎ（上限の文は出さない）", () => {
  const r = describeLinePushFailure(429, JSON.stringify({ message: "Too many requests" }));
  assert.equal(r.kind, "rate_limit");
  assert.doesNotMatch(r.message, /200通/);
});

test("401 → 接続設定の誤り", () => {
  assert.equal(describeLinePushFailure(401, "").kind, "auth");
});

test("403 → 友だち未追加／ブロック", () => {
  const r = describeLinePushFailure(403, JSON.stringify({ message: "Failed to send messages" }));
  assert.equal(r.kind, "not_friend");
  assert.match(r.message, /友だち追加/);
});

test("400 + property 'to' invalid → 宛先IDが不正", () => {
  const r = describeLinePushFailure(400, JSON.stringify({ message: "The property, 'to', in the request body is invalid (line: -, column: -)" }));
  assert.equal(r.kind, "bad_recipient");
});

test("400 その他 → bad_request（本文を80字まで添える）", () => {
  const r = describeLinePushFailure(400, JSON.stringify({ message: "The request body has 1 error(s)" }));
  assert.equal(r.kind, "bad_request");
  assert.match(r.message, /1 error/);
});

test("未知のステータス → other にHTTPコードが入る", () => {
  const r = describeLinePushFailure(503, "");
  assert.equal(r.kind, "other");
  assert.equal(r.code, "LINE_HTTP_503");
  assert.match(r.message, /HTTP 503/);
});

test("壊れたJSON本文でも落ちない", () => {
  const r = describeLinePushFailure(500, "{not json");
  assert.equal(r.kind, "other");
  assert.match(r.message, /not json/);
});
