import * as XLSX from "xlsx";
import type { AttendanceExcelStaff } from "@/app/actions/attendance";

/**
 * 月次勤怠管理表（Excel）の生成。
 *
 * 藤川先生が今まで手作業で作っていた「R8〜勤怠管理表（からだ）.xlsx」と
 * 同じ様式で、打刻データから自動生成する。
 * ・スタッフ1人につきシート1枚（元ファイルと同じ「R8.8月 森藤」形式のシート名）
 * ・列は 日付/曜日/区分/出勤/休憩/退勤/総稼働/通常勤務/普通残業/深夜/深夜残業/備考
 * ・合計も各行もExcelの数式で入れる（あとから時刻を手直ししたら自動で計算し直される）
 *
 * 数式の考え方:
 *   総稼働   G = 退勤 - 出勤 - 休憩
 *   深夜時間 = 22時以降に働いた分
 *   総残業   = 8時間を超えた分
 *   深夜残業 K = 深夜時間と総残業の重なり（min）
 *   深夜     J = 深夜時間 - 深夜残業
 *   普通残業 I = 総残業 - 深夜残業
 *   通常勤務 H = 総稼働 - 普通残業 - 深夜残業
 *
 * ⚠ 元ファイルの数式は22時をまたぐ日で壊れていたので、ここは直してある。
 *   元: K=総稼働-8時間（22時超なら）／J=退勤-22時-K
 *   → 9:30-23:00（休憩45分）の日で K=4:45（正しくは1:00）、J=-3:45（マイナス）、
 *     通常勤務も9:00（正しくは8:00）になっていた。
 *   これまでの実データに22時超えが無かったため表面化していなかっただけ。
 */

/** aoa_to_sheet に渡すセル。SheetJS は t を省くと数式セルを書き出せないので必ず付ける */
type Cell = string | number | null | { t: "n"; f: string };

/** 令和の年（西暦-2018）。元ファイルのシート名が「R8.8月 森藤」形式のため */
function reiwaYear(year: number): number {
  return year - 2018;
}

/** "HH:mm" → Excelのシリアル値（1日=1.0） */
function hmToSerial(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h * 60 + m) / (24 * 60);
}

function formula(f: string): Cell {
  return { t: "n", f };
}

/** Excelのシート名に使えない文字を除く（: \ / ? * [ ] と31文字制限） */
function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);
}

export function downloadMonthlyAttendanceExcel(
  month: string,                    // "YYYY-MM"
  clinicName: string,
  staffList: AttendanceExcelStaff[],
  defaultBreakMinutes = 45,
) {
  const [yy, mm] = month.split("-").map(Number);
  const rY = reiwaYear(yy);
  const wb = XLSX.utils.book_new();

  for (const staff of staffList) {
    // データ行は元ファイルと同じく10行目から（1日 = 行10）
    const FIRST_DATA_ROW = 10;
    const lastRow = FIRST_DATA_ROW + staff.days.length - 1;

    const rows: Cell[][] = [];
    // 1行目: 年・月・タイトル
    rows.push([rY, "年", mm, "月", "　　勤　怠　管　理　表"]);
    rows.push([]);
    // 3行目: 院名・氏名
    rows.push([clinicName, null, null, null, null, null, null, null, null, null, "氏名", staff.staffName]);
    rows.push([]);
    // 5〜7行目: 集計欄（数式）
    rows.push([null, null, null, null, null, null, "出勤日数", null,
      formula(`COUNTA(D${FIRST_DATA_ROW}:D${lastRow})&"日"`), null, "休日出勤", null, 0]);
    rows.push([null, null, null, null, null, null, "通　　常", null,
      formula(`SUM(H${FIRST_DATA_ROW}:H${lastRow})`), null, "普通残業", null,
      formula(`SUM(I${FIRST_DATA_ROW}:I${lastRow})`)]);
    rows.push([null, null, null, null, null, null, "総勤稼働", null,
      formula(`SUM(G${FIRST_DATA_ROW}:G${lastRow})`), null, "深夜残業", null,
      formula(`SUM(K${FIRST_DATA_ROW}:K${lastRow})`)]);
    rows.push([]);
    // 9行目: 見出し
    rows.push(["日付", "曜日", "区分", "出勤", "休憩", "退勤", "総稼働", "通常勤務", "普通残業", "深夜", "深夜残業", "備考"]);

    // 10行目〜: 日ごと（ここまでで9行ぶん積んであるので i=0 が行10になる）
    staff.days.forEach((d, i) => {
      const row = FIRST_DATA_ROW + i;
      const hasPunch = !!(d.clockIn && d.clockOut);

      let clockIn: number | null = d.clockIn ? hmToSerial(d.clockIn) : null;
      let clockOut: number | null = d.clockOut ? hmToSerial(d.clockOut) : null;
      // 日付をまたいで退勤した場合（22:00出勤→翌0:30退勤 等）。
      // そのままだと退勤 < 出勤 になり総稼働がマイナスになるので翌日扱いにする。
      if (clockIn != null && clockOut != null && clockOut < clockIn) clockOut += 1;

      // 休憩は記録されている実績を使う。未記録の日だけ既定値を入れる
      // （森川先生=2時間、森藤先生=45分、パートは休憩なし、と人によって違うため）
      const brkMin = d.breakMinutes > 0 ? d.breakMinutes : defaultBreakMinutes;
      const brk = hasPunch ? brkMin / (24 * 60) : null;
      const note = d.isClosed && !hasPunch ? "院休診" : null;

      rows.push([
        d.day,
        d.weekday,
        null,                                    // 区分（手入力欄）
        clockIn,
        brk,
        clockOut,
        // 出勤・退勤の両方が入っている日だけ計算する（片方だけだとマイナスになるため）
        formula(`IF(COUNT(D${row},F${row})=2,F${row}-D${row}-E${row},0)`),                  // G 総稼働
        formula(`G${row}-I${row}-K${row}`),                                                 // H 通常勤務
        formula(`MAX(0,G${row}-TIME(8,0,0))-K${row}`),                                      // I 普通残業
        formula(`MAX(0,IF(COUNT(F${row})=1,F${row}-TIME(22,0,0),0))-K${row}`),              // J 深夜
        // 深夜残業＝「22時以降」と「8時間超」が重なっている分だけ
        formula(`MIN(MAX(0,IF(COUNT(F${row})=1,F${row}-TIME(22,0,0),0)),MAX(0,G${row}-TIME(8,0,0)))`), // K 深夜残業
        note,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows as unknown[][]);

    ws["!cols"] = [
      { wch: 6 }, { wch: 6 }, { wch: 8 }, { wch: 9 }, { wch: 9 }, { wch: 9 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 9 }, { wch: 10 }, { wch: 20 },
    ];

    // タイトル・院名・氏名・備考のセル結合（元ファイルと同じ）
    ws["!merges"] = [
      { s: { r: 0, c: 4 }, e: { r: 0, c: 13 } },   // E1:N1 タイトル
      { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } },    // A3:F3 院名
      { s: { r: 2, c: 11 }, e: { r: 2, c: 13 } },  // L3:N3 氏名
      ...staff.days.map((_, i) => ({
        s: { r: FIRST_DATA_ROW - 1 + i, c: 11 },
        e: { r: FIRST_DATA_ROW - 1 + i, c: 13 },
      })),                                          // L:N 備考
    ];

    // 表示形式。総稼働などは合計で24時間を超えるので [h]:mm（h:mm だと桁が落ちる）
    const applyFmt = (addr: string, fmt: string) => {
      const c = (ws as Record<string, unknown>)[addr] as { z?: string } | undefined;
      if (c) c.z = fmt;
    };
    for (let i = 0; i < staff.days.length; i++) {
      const row = FIRST_DATA_ROW + i;
      for (const col of ["D", "E", "F"]) applyFmt(`${col}${row}`, "h:mm");
      for (const col of ["G", "H", "I", "J", "K"]) applyFmt(`${col}${row}`, "[h]:mm");
    }
    for (const addr of ["I6", "I7", "M5", "M6", "M7"]) applyFmt(addr, "[h]:mm");

    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(`R${rY}.${mm}月 ${staff.staffName}`));
  }

  XLSX.writeFile(wb, `勤怠管理表_R${rY}.${mm}月.xlsx`);
}
