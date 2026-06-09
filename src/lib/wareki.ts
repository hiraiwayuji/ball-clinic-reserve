// 和暦（年号）⇔ 西暦の相互変換ユーティリティ
// 生年月日の入力UI専用。DBには従来どおり ISO 形式（YYYY-MM-DD）で保存する。

export interface WarekiEra {
  /** 識別キー（state 用） */
  key: string;
  /** 表示名（令和・平成 など） */
  label: string;
  /** 元年に対応する西暦 */
  baseYear: number;
  /** 元号の開始日（境界判定用） */
  start: string; // YYYY-MM-DD
}

// 新しい元号が上に来るよう降順で定義
export const WAREKI_ERAS: WarekiEra[] = [
  { key: "reiwa", label: "令和", baseYear: 2019, start: "2019-05-01" },
  { key: "heisei", label: "平成", baseYear: 1989, start: "1989-01-08" },
  { key: "showa", label: "昭和", baseYear: 1926, start: "1926-12-25" },
  { key: "taisho", label: "大正", baseYear: 1912, start: "1912-07-30" },
  { key: "meiji", label: "明治", baseYear: 1868, start: "1868-01-25" },
];

export interface WarekiDate {
  eraKey: string;
  year: number; // 元号内の年（1 = 元年）
  month: number; // 1-12
  day: number; // 1-31
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 西暦 ISO 文字列（YYYY-MM-DD）→ 和暦。範囲外なら null */
export function isoToWareki(iso: string | null | undefined): WarekiDate | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || !month || !day) return null;

  // 開始日が新しい順に並んでいるので、最初に「開始日以降」に該当した元号を採用
  for (const era of WAREKI_ERAS) {
    if (iso >= era.start) {
      return {
        eraKey: era.key,
        year: year - era.baseYear + 1,
        month,
        day,
      };
    }
  }
  return null;
}

/** 和暦 → 西暦 ISO 文字列（YYYY-MM-DD）。不正なら null */
export function warekiToIso(w: Partial<WarekiDate>): string | null {
  const { eraKey, year, month, day } = w;
  if (!eraKey || !year || !month || !day) return null;
  const era = WAREKI_ERAS.find(e => e.key === eraKey);
  if (!era) return null;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const westernYear = era.baseYear + year - 1;
  return `${westernYear}-${pad(month)}-${pad(day)}`;
}

/** 和暦の表示文字列（例: 平成3年5月10日） */
export function formatWareki(iso: string | null | undefined): string | null {
  const w = isoToWareki(iso);
  if (!w) return null;
  const era = WAREKI_ERAS.find(e => e.key === w.eraKey);
  if (!era) return null;
  const y = w.year === 1 ? "元" : String(w.year);
  return `${era.label}${y}年${w.month}月${w.day}日`;
}
