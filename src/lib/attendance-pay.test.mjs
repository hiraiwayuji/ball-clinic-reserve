// node --test src/lib/attendance-pay.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hmToMinutes, formatMinutes, spanMinutes, legalBreakMinutes, effectiveBreakMinutes,
  splitWorkMinutes, payYenRaw, calcLedgerDay, summarizeLedger,
} from "./attendance-pay.ts";

test("時刻の読み取りと表示", () => {
  assert.equal(hmToMinutes("09:30"), 570);
  assert.equal(hmToMinutes("9:05"), 545);
  assert.equal(hmToMinutes("24:00"), null);
  assert.equal(hmToMinutes(""), null);
  assert.equal(formatMinutes(765), "12:45");
  assert.equal(formatMinutes(1500), "25:00", "24時間を超えても桁を落とさない");
  assert.equal(spanMinutes("22:00", "00:30"), 150, "日をまたいだら翌日扱い");
  assert.equal(spanMinutes("09:00", null), null);
});

test("法定の最低ラインの休憩: 6時間まで0分・8時間まで45分・超えたら60分", () => {
  assert.equal(legalBreakMinutes(360), 0);
  assert.equal(legalBreakMinutes(361), 45);
  assert.equal(legalBreakMinutes(525), 45, "在席8:45−45分＝8:00 なので45分のまま");
  assert.equal(legalBreakMinutes(526), 60);
});

test("休憩の決まり方: 記録 → いつもの休憩 → 法定", () => {
  assert.deepEqual(effectiveBreakMinutes(0, 120, 540), { minutes: 0, source: "recorded", isDefault: false }, "記録の0は休憩なし");
  assert.deepEqual(effectiveBreakMinutes(90, 120, 540), { minutes: 90, source: "recorded", isDefault: false });
  assert.deepEqual(effectiveBreakMinutes(null, 120, 540), { minutes: 120, source: "staff", isDefault: true });
  assert.deepEqual(effectiveBreakMinutes(null, 0, 540), { minutes: 0, source: "staff", isDefault: true }, "いつもの休憩0も有効");
  assert.deepEqual(effectiveBreakMinutes(null, null, 247), { minutes: 0, source: "legal", isDefault: true }, "4時間のパートさんは引かない");
  assert.deepEqual(effectiveBreakMinutes(undefined, undefined, 540), { minutes: 60, source: "legal", isDefault: true });
});

test("勤怠管理表の例: 9:30-23:00 休憩45分 → 通常8:00・普通残業3:45・深夜残業1:00", () => {
  assert.deepEqual(splitWorkMinutes("09:30", "23:00", 45), { total: 765, normal: 480, overtime: 225, night: 0, nightOvertime: 60 });
});

test("ちょうど8時間は残業なし／8時間以内で22時を過ぎた分は深夜", () => {
  assert.deepEqual(splitWorkMinutes("09:00", "18:00", 60), { total: 480, normal: 480, overtime: 0, night: 0, nightOvertime: 0 });
  assert.deepEqual(splitWorkMinutes("15:00", "23:00", 0), { total: 480, normal: 480, overtime: 0, night: 60, nightOvertime: 0 });
});

test("日をまたいだ退勤は翌日扱い・打刻もれは計算しない・休憩が長すぎてもマイナスにしない", () => {
  assert.deepEqual(splitWorkMinutes("22:00", "00:30", 0), { total: 150, normal: 150, overtime: 0, night: 150, nightOvertime: 0 });
  assert.equal(splitWorkMinutes("09:00", null, 45), null);
  assert.equal(splitWorkMinutes(null, "18:00", 45), null);
  assert.equal(splitWorkMinutes("13:31", "13:34", 45).total, 0);
});

test("深夜は22時〜翌5時の重なりだけ・総稼働を超えない（22時より後の出勤・5時越え・5時前の出勤）", () => {
  assert.equal(splitWorkMinutes("23:00", "02:00", 0).night, 180, "23時出勤→2時退勤は3時間");
  assert.deepEqual(splitWorkMinutes("22:00", "01:00", 60), { total: 120, normal: 120, overtime: 0, night: 120, nightOvertime: 0 }, "休憩で総稼働が2時間なら深夜も2時間まで");
  assert.deepEqual(splitWorkMinutes("21:00", "07:00", 60), { total: 540, normal: 480, overtime: 0, night: 360, nightOvertime: 60 }, "5時で止める（深夜420分のうち60分が深夜残業）");
  assert.equal(splitWorkMinutes("04:00", "09:00", 0).night, 60, "5時前の出勤は5時までが深夜");
  assert.equal(splitWorkMinutes("09:00", "21:59", 0).night, 0);
});

test("支給額: 通常＋残業25%＋深夜残業50%＋深夜25%の上乗せ", () => {
  // 9:30-23:00 休憩45分・時給1000円 → (480 + 225×1.25 + 60×1.5)/60×1000 = 14187.5
  assert.equal(payYenRaw(splitWorkMinutes("09:30", "23:00", 45), 1000), 14187.5);
  // 15:00-23:00・時給1000円 → (480 + 60×0.25)/60×1000 = 8250
  assert.equal(payYenRaw(splitWorkMinutes("15:00", "23:00", 0), 1000), 8250);
  assert.equal(payYenRaw(splitWorkMinutes("09:00", "18:00", 60), null), null, "時給なしは出さない");
});

test("1日ぶん: 休憩の記録が無い日は、いつもの休憩→法定の順に使う", () => {
  // 9:00-18:00（在席9時間）・いつもの休憩なし → 法定60分 → 8:00・残業なし
  const legal = calcLedgerDay({ clockIn: "09:00", clockOut: "18:00", breakMinutes: null }, 1200);
  assert.equal(legal.breakUsed, 60);
  assert.equal(legal.breakSource, "legal");
  assert.equal(legal.split.total, 480);
  assert.equal(legal.yen, 9600);
  // 同じ日・いつもの休憩45分 → 8:15・残業15分
  const staff = calcLedgerDay({ clockIn: "09:00", clockOut: "18:00", breakMinutes: null }, 1200, 45);
  assert.equal(staff.breakSource, "staff");
  assert.equal(staff.split.total, 495);
  assert.equal(staff.yen, Math.round(1200 * (480 + 15 * 1.25) / 60));
  // パートさんの午前（実データの形）: 9:25-13:32 → 休憩0 → 4:07
  assert.equal(calcLedgerDay({ clockIn: "09:25", clockOut: "13:32", breakMinutes: null }, null).split.total, 247);
  const m = calcLedgerDay({ clockIn: "09:00", clockOut: null, breakMinutes: null }, 1200);
  assert.equal(m.missing, true);
  assert.equal(m.yen, null);
});

test("月の集計: 出勤日数・打刻もれ・既定休憩の日数・端数は最後に四捨五入", () => {
  const days = [
    { clockIn: "09:00", clockOut: "13:00", breakMinutes: 0 },    // 4:00
    { clockIn: "09:00", clockOut: "13:01", breakMinutes: 0 },    // 4:01
    { clockIn: "09:00", clockOut: null, breakMinutes: null },    // 打刻もれ（出勤日数には数える）
    { clockIn: "10:00", clockOut: "19:00", breakMinutes: null }, // いつもの45分なら 8:15（残業15分）／法定なら60分で 8:00
  ];
  const s = summarizeLedger(days, 1001, 45);
  assert.equal(s.workDays, 4);
  assert.equal(s.missingDays, 1);
  assert.equal(s.defaultBreakDays, 1);
  assert.equal(s.total, 240 + 241 + 495);
  assert.equal(s.overtime, 15);
  assert.equal(s.yen, Math.round(1001 * (240 + 241 + 480 + 15 * 1.25) / 60));
  const legal = summarizeLedger(days, 1001);
  assert.equal(legal.total, 240 + 241 + 480);
  assert.equal(legal.overtime, 0);
  assert.equal(summarizeLedger(days, null).yen, null);
});
