#!/usr/bin/env node
/**
 * 「予約が取れるかの判定」が画面とサーバーでズレていないかを見張る監査。
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
 * 原因はいつも同じ。**「予約が取れるか」を決める場所が2つあり、片方だけ直す**こと。
 *   - 画面（時間プルダウンの空き）: src/app/actions/adminDaySlots.ts
 *   - 登録（サーバーの最終ガード）: src/app/actions/adminReserve.ts の findLaneConflict
 * ここがズレると必ず「選べるのに登録できない」か「選べないのに実は取れる」になる。
 *
 * この監査は、両方が同じ土台（buildStaffSpans）を使い続けているかだけを見る。
 * 完全な等価性までは見られないが、**入れ忘れ・巻き戻しは確実に落とせる**。
 */
import { readFileSync } from "node:fs";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

/** 見張る場所。file が rule を満たさなければ落とす。 */
const RULES = [
  {
    file: "src/app/actions/adminDaySlots.ts",
    must: "buildStaffSpans",
    why:
      "時間プルダウンの空き判定が、1件の予約を先生ごとに分けずに「予約まるごと」で見ています。\n" +
      "   2人で前後に分ける予約（例: 保険施術20分=A先生 → 鍼灸20分=B先生）で、\n" +
      "   A先生の後半が「予約あり」になって取れなくなります（2026-08-29 の不具合）。",
  },
  {
    file: "src/app/actions/adminReserve.ts",
    must: "buildStaffSpans",
    why:
      "登録時のかぶり判定が、1件の予約を先生ごとに分けずに見ています。\n" +
      "   画面では取れるのに登録で弾かれる、という食い違いになります。",
  },
];

/**
 * 画面とサーバーで「埋まり」の当たり判定がズレていないか。
 * 半開区間（前の予約の終了 == 次の予約の開始 は重ならない）で書かれているかを見る。
 * `<=` / `>=` を使うと 12:20〜12:40 の直後の 12:40 が取れなくなる。
 */
const BOUNDARY_RULES = [
  { file: "src/app/actions/adminDaySlots.ts", bad: /\bs\s*<=\s*b\.end\b|\be\s*>=\s*b\.start\b/ },
  { file: "src/app/actions/adminReserve.ts", bad: /\bs\s*<=\s*wantEnd\b|\be\s*>=\s*wantStart\b/ },
];

let ng = 0;

for (const rule of RULES) {
  let src;
  try {
    src = readFileSync(rule.file, "utf8");
  } catch {
    console.error(`${RED}❌ ${rule.file} が見つかりません（移動・改名したら、この監査も直してください）${RESET}`);
    ng++;
    continue;
  }
  if (!src.includes(rule.must)) {
    console.error(`${RED}❌ ${rule.file} が ${rule.must} を使っていません${RESET}`);
    console.error(`   ${rule.why}`);
    ng++;
  }
}

for (const rule of BOUNDARY_RULES) {
  let src;
  try {
    src = readFileSync(rule.file, "utf8");
  } catch {
    continue; // 上のループで報告済み
  }
  if (rule.bad.test(src)) {
    console.error(`${RED}❌ ${rule.file} の重なり判定が「端を含む」書き方になっています${RESET}`);
    console.error(
      "   前の予約の終了時刻と、次の予約の開始時刻が同じときは重なりません。\n" +
      "   ここを <= / >= にすると 12:20〜12:40 の直後の 12:40 が取れなくなります。",
    );
    ng++;
  }
}

if (ng > 0) {
  console.error(
    `\n${YELLOW}この監査は「予約が取れるかの判定を、画面とサーバーの両方で同じにする」ためのものです。\n` +
    `どちらか片方だけ直すと、必ず同じ不具合が戻ります（2026-08-01 → 08-22 → 08-29 で3回くり返しました）。${RESET}`,
  );
  process.exit(1);
}

console.log(`${GREEN}✅ 予約の空き判定 OK${RESET}`);
console.log("   画面（adminDaySlots）と登録（adminReserve）が、どちらも buildStaffSpans で");
console.log("   先生ごとの受け持ち時間に分けて判定しています。");
