// 患者名の「似ている」を判定する。
//
// この院の患者マスタには、同じ人が別々の表記で入ってしまっているものがある。
//   - ふりがなだけ:      「(アモウミ)」「(イワシ)」
//   - ふりがな付き:      「松浦拓登(タクト)」 と 「松浦 拓登」
//   - 空白ゆれ:          「布川紗帆」 と 「布川　紗帆」
//   - カタカナ/漢字:     「ヒガシムラ　ミユ」 と 「東村 心愛」
//   - 打ち間違い:        「松田旺太」 と 「松田旺汰」
//   - 姓だけ:            「布川」 と 「布川紗帆」
//
// AIに頼らず、その場で速く出せる範囲で候補を出すのが目的。
// 「同じ人だ」と断定はしない。人が見て決めるための材料を出す。

/** カタカナ → ひらがな（読みだけの名前と、ひらがなの名前を同じに扱う） */
function kanaToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  );
}

/** 比較用の正規化。全角半角・空白・カタカナ/ひらがなの違いを吸収する */
export function normalizeForCompare(value: string | null | undefined): string {
  return kanaToHira((value ?? "").normalize("NFKC"))
    .replace(/[\s　]/g, "")
    .toLowerCase();
}

/** かっこ書き（ふりがな）を外した部分 */
export function withoutReading(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/[（(][^）)]*[）)]/g, "").trim();
}

/** かっこの中身（ふりがな）だけを取り出す */
export function readingPart(value: string | null | undefined): string {
  const m = (value ?? "").normalize("NFKC").match(/[（(]([^）)]*)[）)]/);
  return (m?.[1] ?? "").trim();
}

/** 漢字を含むか（＝ちゃんとした氏名が入っていそうか） */
export function hasKanji(value: string | null | undefined): boolean {
  return /[一-鿿]/.test(value ?? "");
}

/**
 * 名前として不完全で、あとで直したほうがよいもの。
 * 「(アモウミ)」のようにふりがなしか無い／カタカナだけ／1〜2文字しかない、など。
 */
export function nameNeedsCleanup(name: string | null | undefined): { needs: boolean; reason: string } {
  const raw = (name ?? "").trim();
  if (!raw) return { needs: true, reason: "名前が空です" };
  const base = withoutReading(raw);
  if (!base.replace(/[\s　]/g, "")) {
    return { needs: true, reason: "ふりがなだけで、お名前が入っていません" };
  }
  if (!hasKanji(base) && /^[ァ-ヶー\s　]+$/.test(base)) {
    return { needs: true, reason: "カタカナだけのお名前です" };
  }
  const compact = normalizeForCompare(base);
  if (compact.length <= 2 && hasKanji(base)) {
    return { needs: true, reason: "姓だけの可能性があります" };
  }
  return { needs: false, reason: "" };
}

/** 編集距離（打ち間違いの検出用）。長さの差が大きいものは早めに打ち切る */
function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

export type SimilarityHit = {
  /** 0〜100。高いほど同じ人の可能性が高い */
  score: number;
  /** なぜ似ていると判断したか（画面にそのまま出す） */
  reason: string;
};

/**
 * 2つの名前がどれくらい似ているか。
 * 似ていないと判断したら null（候補に出さない）。
 */
export function compareNames(a: string, b: string): SimilarityHit | null {
  const rawA = (a ?? "").trim();
  const rawB = (b ?? "").trim();
  if (!rawA || !rawB) return null;

  const baseA = normalizeForCompare(withoutReading(rawA) || rawA);
  const baseB = normalizeForCompare(withoutReading(rawB) || rawB);
  if (!baseA || !baseB) return null;

  if (baseA === baseB) {
    return { score: 100, reason: "同じお名前です（空白・ふりがなの違いのみ）" };
  }

  // ふりがな同士 / 片方のふりがなと片方の名前
  const readA = normalizeForCompare(readingPart(rawA));
  const readB = normalizeForCompare(readingPart(rawB));
  if (readA && readB && readA === readB) {
    return { score: 80, reason: `ふりがなが同じです（${readingPart(rawA)}）` };
  }
  if (readA && readA === baseB) {
    return { score: 75, reason: `ふりがな「${readingPart(rawA)}」と一致します` };
  }
  if (readB && readB === baseA) {
    return { score: 75, reason: `ふりがな「${readingPart(rawB)}」と一致します` };
  }

  // 片方がもう片方の一部（「布川」と「布川紗帆」）
  const shorter = baseA.length <= baseB.length ? baseA : baseB;
  const longer = baseA.length <= baseB.length ? baseB : baseA;
  if (shorter.length >= 2 && longer.startsWith(shorter)) {
    return { score: 70, reason: "姓が同じで、片方はお名前が入っていません" };
  }
  if (shorter.length >= 3 && longer.includes(shorter)) {
    return { score: 60, reason: "お名前の一部が一致します" };
  }

  // 打ち間違い（「旺太」と「旺汰」）
  const maxDist = longer.length >= 5 ? 2 : 1;
  const dist = levenshtein(baseA, baseB, maxDist);
  if (dist <= maxDist) {
    return {
      score: dist === 1 ? 65 : 50,
      reason: `${dist}文字ちがいです（打ち間違いの可能性）`,
    };
  }

  // 姓が同じ（2文字以上の共通の先頭）
  let common = 0;
  while (common < shorter.length && baseA[common] === baseB[common]) common++;
  if (common >= 2) {
    return { score: 35, reason: "姓が同じです（ご家族の可能性もあります）" };
  }

  return null;
}
