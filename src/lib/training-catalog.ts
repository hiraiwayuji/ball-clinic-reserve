/**
 * トレーニング評価アプリの共通定義（部位カタログ・3軸・院ゲート・集計）。
 *
 * 方針:
 *  - 対象は「ボール接骨院・からだ鍼灸整骨院・マッスル整体」の3院のみ。
 *  - 評価は「部位 × 3軸（筋力/反射/運動神経）× 左右」で 0〜10点。
 *  - 項目は今は標準セット固定（院ごとの追加編集は将来対応）。
 *
 * サーバー/クライアント双方から import する純粋モジュール（server 専用の依存を持たない）。
 */

/**
 * トレーニング評価を有効にする院（3院のみ）の許可リスト。
 * これは「現在の院」ではなく“対象院の集合”なので、各院の clinic_id を明示列挙する必要がある。
 * clinic-guard.ts の NON_BALL_HOSTS と同じく意図的なハードコード。
 */
export const TRAINING_CLINIC_IDS = new Set<string>([
  // clinic-leak-ignore: 対象院の許可リスト（現在院の判定ではなく集合の定義）
  "00000000-0000-0000-0000-000000000001", // ball
  "d3b55abc-46a6-4cbe-8198-21c0392d9a2e", // karada
  "9f2a3359-3f84-451a-9ccd-d50cb3dd8bbd", // muscle
]);

/** この稼働（Vercelデプロイ）でトレーニング評価が使えるか。build時に埋め込まれる clinic_id で判定。 */
export function isTrainingEnabled(): boolean {
  const id = process.env.NEXT_PUBLIC_CLINIC_ID ?? "00000000-0000-0000-0000-000000000001";
  return TRAINING_CLINIC_IDS.has(id);
}

// ───────────────────────── 3軸 ─────────────────────────
export type AxisKey = "strength" | "reflex" | "motor";
export type Axis = { key: AxisKey; label: string; color: string; desc: string };
export const AXES: Axis[] = [
  { key: "strength", label: "筋力",     color: "#ef4444", desc: "その部位の力の強さ" },
  { key: "reflex",   label: "反射",     color: "#f59e0b", desc: "刺激への反応の速さ・鋭さ" },
  { key: "motor",    label: "運動神経", color: "#3b82f6", desc: "思い通りに動かせるか（協調・コントロール）" },
];
export const AXIS_LABEL: Record<AxisKey, string> = {
  strength: "筋力", reflex: "反射", motor: "運動神経",
};

// ───────────────────────── 部位 ─────────────────────────
export type RegionKey = "toe" | "ankle" | "hip" | "iliopsoas" | "abs" | "back" | "reflex";
export type Region = {
  key: RegionKey;
  label: string;
  group: string;      // 表示グルーピング（下肢/体幹/神経）
  bilateral: boolean; // 左右差を取るか（true=左右別、false=中央/全身で1値）
  hint?: string;      // 採点時のヒント（測り方の例）
  axes?: AxisKey[];   // その部位で評価する軸（省略時は3軸すべて）
};

// 足の指 → 足首 → 股関節 → 体幹（腸腰筋/腹筋/背筋）→ 反射神経 の順。
export const REGIONS: Region[] = [
  { key: "toe",       label: "足の指",   group: "下肢", bilateral: true,  hint: "グーパー・タオルギャザー・指の握り" },
  { key: "ankle",     label: "足首",     group: "下肢", bilateral: true,  hint: "背屈/底屈・片足バランス・可動域" },
  { key: "hip",       label: "股関節",   group: "下肢", bilateral: true,  hint: "開脚・片足立ち・可動域" },
  { key: "iliopsoas", label: "腸腰筋",   group: "体幹", bilateral: true,  hint: "もも上げ・脚の引き上げ" },
  { key: "abs",       label: "腹筋",     group: "体幹", bilateral: true,  hint: "体幹の安定・ねじり・保持" },
  { key: "back",      label: "背筋",     group: "体幹", bilateral: true,  hint: "姿勢保持・反り・引き上げ" },
  // 反射神経は全身の反応。筋力の概念が薄いので「反射」「運動神経」の2軸のみ、左右差なし。
  { key: "reflex",    label: "反射神経", group: "神経", bilateral: false, hint: "合図→反応・全身の素早さ・切り返し", axes: ["reflex", "motor"] },
];

export const REGION_LABEL: Record<RegionKey, string> = REGIONS.reduce(
  (acc, r) => { acc[r.key] = r.label; return acc; },
  {} as Record<RegionKey, string>,
);
export const REGION_MAP: Record<RegionKey, Region> = REGIONS.reduce(
  (acc, r) => { acc[r.key] = r; return acc; },
  {} as Record<RegionKey, Region>,
);

export type Side = "left" | "right" | "both";
export const SIDE_LABEL: Record<Side, string> = { left: "左", right: "右", both: "" };

/** その部位で評価する軸 */
export function axesFor(region: Region): AxisKey[] {
  return region.axes ?? AXES.map((a) => a.key);
}
/** その部位で入力する左右（bilateral=左右、それ以外=both単体） */
export function sidesFor(region: Region): Side[] {
  return region.bilateral ? ["left", "right"] : ["both"];
}
/** measurement を一意に指すキー */
export function cellKey(item: RegionKey, axis: AxisKey, side: Side): string {
  return `${item}:${axis}:${side}`;
}

/** 評価に入りうる「セル」の総数（進捗表示の分母に使う） */
export const TOTAL_CELLS: number = REGIONS.reduce(
  (n, r) => n + axesFor(r).length * sidesFor(r).length,
  0,
);

// ───────────────────────── データ型 ─────────────────────────
export type Measurement = {
  item_key: RegionKey;
  axis: AxisKey;
  side: Side;
  score: number | null;
  memo?: string | null;
};
export type Assessment = {
  id: string;
  customer_id: string;
  assessed_on: string;      // "yyyy-MM-dd"
  assessor_name: string | null;
  overall_memo: string | null;
  next_goal: string | null;
  homework: string | null;
  created_at?: string;
  measurements: Measurement[];
};

// ───────────────────────── 集計ヘルパー ─────────────────────────
const avg = (nums: number[]): number | null =>
  nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;

/** measurements を cellKey → score の早見表にする */
export function toScoreMap(ms: Measurement[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const m of ms) {
    if (m.score != null) map[cellKey(m.item_key, m.axis, m.side)] = m.score;
  }
  return map;
}

/** 軸ごとの平均点（0〜10）。未測定は分母から除外。 */
export function axisAverages(ms: Measurement[]): Record<AxisKey, number | null> {
  const out = {} as Record<AxisKey, number | null>;
  for (const a of AXES) {
    out[a.key] = avg(ms.filter((m) => m.axis === a.key && m.score != null).map((m) => m.score as number));
  }
  return out;
}

/** 部位ごとの平均点（軸・左右をならした値）。レーダー用。 */
export function regionAverages(ms: Measurement[]): { key: RegionKey; label: string; value: number | null }[] {
  return REGIONS.map((r) => ({
    key: r.key,
    label: r.label,
    value: avg(ms.filter((m) => m.item_key === r.key && m.score != null).map((m) => m.score as number)),
  }));
}

/** セッション全体の平均点（推移グラフ用） */
export function overallAverage(ms: Measurement[]): number | null {
  return avg(ms.filter((m) => m.score != null).map((m) => m.score as number));
}

/** 左右差の一覧（bilateral 部位×軸で、左右そろっているものだけ） */
export type Asymmetry = {
  item: RegionKey; label: string; axis: AxisKey; axisLabel: string;
  left: number; right: number; diff: number; higher: "left" | "right";
};
export function asymmetries(ms: Measurement[]): Asymmetry[] {
  const map = toScoreMap(ms);
  const out: Asymmetry[] = [];
  for (const r of REGIONS) {
    if (!r.bilateral) continue;
    for (const ax of axesFor(r)) {
      const l = map[cellKey(r.key, ax, "left")];
      const rt = map[cellKey(r.key, ax, "right")];
      if (l == null || rt == null) continue;
      out.push({
        item: r.key, label: r.label, axis: ax, axisLabel: AXIS_LABEL[ax],
        left: l, right: rt, diff: Math.abs(l - rt),
        higher: l >= rt ? "left" : "right",
      });
    }
  }
  // 差が大きい順
  return out.sort((a, b) => b.diff - a.diff);
}

/** 左右差の警告レベル（色分け用）。0-1=良好, 2-3=注意, 4+=要改善 */
export function diffLevel(diff: number): "ok" | "warn" | "bad" {
  if (diff >= 4) return "bad";
  if (diff >= 2) return "warn";
  return "ok";
}

/** スコア(0-10)→色（低いほど赤、高いほど緑）。UIの共通トーン。 */
export function scoreColor(score: number): string {
  if (score >= 8) return "#10b981"; // emerald
  if (score >= 6) return "#84cc16"; // lime
  if (score >= 4) return "#f59e0b"; // amber
  if (score >= 2) return "#f97316"; // orange
  return "#ef4444";                 // red
}

// ───────────────────────── 成長分析（推移・伸び） ─────────────────────────
const dayMs = 86400000;
function parseDate(s: string): number {
  return new Date(`${s}T00:00:00`).getTime();
}
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to) - parseDate(from)) / dayMs);
}

/**
 * 「◯日前」に最も近い過去セッションを返す（1ヶ月/半年の伸びの基準点）。
 * assessments は新しい順。latest 自身は除外し、目標日時に最も近いものを採用。
 */
export function baselineForWindow(assessments: Assessment[], daysAgo: number): Assessment | null {
  if (assessments.length < 2) return null;
  const latest = assessments[0];
  const target = parseDate(latest.assessed_on) - daysAgo * dayMs;
  let best: Assessment | null = null;
  let bestDiff = Infinity;
  for (const a of assessments.slice(1)) {
    const diff = Math.abs(parseDate(a.assessed_on) - target);
    if (diff < bestDiff) { bestDiff = diff; best = a; }
  }
  return best;
}

export type Growth = { overall: number | null; axes: Record<AxisKey, number | null> };
/** from→to の伸び（総合・軸ごとの平均点差） */
export function growth(from: Assessment, to: Assessment): Growth {
  const fO = overallAverage(from.measurements);
  const tO = overallAverage(to.measurements);
  const fA = axisAverages(from.measurements);
  const tA = axisAverages(to.measurements);
  const axes = {} as Record<AxisKey, number | null>;
  for (const a of AXES) {
    const f = fA[a.key], t = tA[a.key];
    axes[a.key] = f != null && t != null ? t - f : null;
  }
  return { overall: fO != null && tO != null ? tO - fO : null, axes };
}

export type Mover = {
  item: RegionKey; label: string; axis: AxisKey; axisLabel: string; side: Side;
  from: number; to: number; delta: number;
};
/** 項目ごとの伸び（from→to、左右別）。delta 降順。前回比・初回比の両方に使える。 */
export function movers(from: Assessment, to: Assessment): Mover[] {
  const fm = toScoreMap(from.measurements);
  const tm = toScoreMap(to.measurements);
  const out: Mover[] = [];
  for (const r of REGIONS) {
    for (const ax of axesFor(r)) {
      for (const sd of sidesFor(r)) {
        const k = cellKey(r.key, ax, sd);
        if (fm[k] == null || tm[k] == null) continue;
        out.push({
          item: r.key, label: r.label, axis: ax, axisLabel: AXIS_LABEL[ax], side: sd,
          from: fm[k], to: tm[k], delta: tm[k] - fm[k],
        });
      }
    }
  }
  return out.sort((a, b) => b.delta - a.delta);
}

/** 左右差の推移（各セッションの bilateral 平均左右差）。バランス改善の可視化用。 */
export function asymmetryTrend(assessments: Assessment[]): { date: string; avgDiff: number }[] {
  return [...assessments].reverse().map((a) => {
    const list = asymmetries(a.measurements);
    const avgDiff = list.length ? list.reduce((s, x) => s + x.diff, 0) / list.length : 0;
    return { date: a.assessed_on, avgDiff: Math.round(avgDiff * 10) / 10 };
  });
}

// ───────────────────────── 期間の指定（比較の基準点） ─────────────────────────
export type PeriodPreset = { key: string; label: string; days?: number };
export const PERIOD_PRESETS: PeriodPreset[] = [
  { key: "prev", label: "前回" },
  { key: "1m", label: "1ヶ月", days: 30 },
  { key: "3m", label: "3ヶ月", days: 90 },
  { key: "6m", label: "半年", days: 180 },
  { key: "1y", label: "1年", days: 365 },
  { key: "first", label: "初回" },
];

/** プリセット/カスタムから比較の基準セッションを解決。assessments は新しい順。 */
export function resolveBaseline(assessments: Assessment[], key: string): Assessment | null {
  if (assessments.length < 2) return null;
  if (key === "prev") return assessments[1];
  if (key === "first") return assessments[assessments.length - 1];
  const preset = PERIOD_PRESETS.find((p) => p.key === key);
  if (preset?.days) return baselineForWindow(assessments, preset.days);
  return null;
}

/** 指定日に最も近いセッション（カスタム期間の from/to 用） */
export function nearestSession(assessments: Assessment[], dateStr: string): Assessment | null {
  if (!assessments.length) return null;
  const target = parseDate(dateStr);
  let best = assessments[0];
  let bestDiff = Infinity;
  for (const a of assessments) {
    const diff = Math.abs(parseDate(a.assessed_on) - target);
    if (diff < bestDiff) { bestDiff = diff; best = a; }
  }
  return best;
}

// ───────────────────────── 評価ランク（A〜D） ─────────────────────────
export type Grade = { label: string; color: string };
/** 0-10 点 → 評価ランク（S/A/B/C/D）。他者比較・成績表用。 */
export function gradeOf(score: number | null): Grade {
  if (score == null) return { label: "–", color: "#cbd5e1" };
  if (score >= 9) return { label: "S", color: "#059669" };
  if (score >= 7.5) return { label: "A", color: "#16a34a" };
  if (score >= 6) return { label: "B", color: "#84cc16" };
  if (score >= 4.5) return { label: "C", color: "#f59e0b" };
  return { label: "D", color: "#ef4444" };
}

// ───────────────────────── 弱点スキャン ＋ 自宅トレーニング ─────────────────────────
export type HomeExercise = { name: string; note?: string };
/** 部位ごとの自宅トレーニング（宿題）候補。院で調整前提の標準セット。 */
export const HOME_TRAINING: Record<RegionKey, HomeExercise[]> = {
  toe: [
    { name: "タオルギャザー", note: "左右各20回。足指でタオルをたぐり寄せる" },
    { name: "足指グーパー", note: "30回。指を大きく開いて握る" },
    { name: "青竹踏み", note: "1〜2分。土踏まずを刺激" },
  ],
  ankle: [
    { name: "カーフレイズ", note: "左右各15回。かかと上げ下げ" },
    { name: "片足バランス", note: "左右各30秒。ふらつく側を長めに" },
    { name: "チューブ背屈・底屈", note: "左右各15回。足首をゆっくり" },
  ],
  hip: [
    { name: "ヒップリフト", note: "20回。お尻を締めて持ち上げる" },
    { name: "クラムシェル", note: "左右各15回。横向きで膝を開く" },
    { name: "股割りストレッチ", note: "30秒×2。可動域を広げる" },
  ],
  iliopsoas: [
    { name: "もも上げマーチ", note: "左右各20回。膝を高く" },
    { name: "ニートゥチェスト", note: "15回。座って膝を胸へ引き寄せ" },
    { name: "レッグレイズ", note: "10回。脚をまっすぐ上げ下げ" },
  ],
  abs: [
    { name: "デッドバグ", note: "左右各10回。手足を交互に伸ばす" },
    { name: "プランク", note: "30秒。体を一直線に" },
    { name: "サイドプランク", note: "左右各20秒。弱い側を長めに" },
  ],
  back: [
    { name: "バードドッグ", note: "左右各10回。四つ這いで手足を伸ばす" },
    { name: "バックエクステンション", note: "15回。反りすぎ注意" },
    { name: "ヒップヒンジ", note: "15回。股関節から曲げる" },
  ],
  reflex: [
    { name: "ラダートレーニング", note: "3種×2セット。素早い足さばき" },
    { name: "反応キャッチ", note: "合図でボールをつかむ／落ちる前にキャッチ" },
    { name: "ステップ切り返し", note: "左右の切り返しを素早く" },
  ],
};

export type Weakness = {
  item: RegionKey; label: string; axis: AxisKey; axisLabel: string;
  score: number;                 // 弱い側の点（左右のうち低い方）
  asymDiff: number | null;       // 左右差（bilateral のみ）
  delta: number | null;          // 前回比（弱い側）
  reasons: string[];             // 低スコア／左右差／低下
  priority: number;              // 大きいほど優先
  exercises: HomeExercise[];
};

/**
 * 最新セッションから弱点を検出。低スコア・左右差・前回からの低下を合成して優先度づけ。
 * prev があれば「低下」も評価に含める。
 */
export function weaknessScan(latest: Assessment, prev: Assessment | null): Weakness[] {
  const lm = toScoreMap(latest.measurements);
  const pm = prev ? toScoreMap(prev.measurements) : {};
  const out: Weakness[] = [];
  for (const r of REGIONS) {
    for (const ax of axesFor(r)) {
      const sides = sidesFor(r);
      const vals = sides.map((sd) => lm[cellKey(r.key, ax, sd)]).filter((v): v is number => v != null);
      if (vals.length === 0) continue;
      const score = Math.min(...vals);
      // 左右差
      let asymDiff: number | null = null;
      if (r.bilateral) {
        const l = lm[cellKey(r.key, ax, "left")], rt = lm[cellKey(r.key, ax, "right")];
        if (l != null && rt != null) asymDiff = Math.abs(l - rt);
      }
      // 前回比（弱い側で比較）
      const weakSide = sides.find((sd) => lm[cellKey(r.key, ax, sd)] === score) ?? sides[0];
      const prevScore = pm[cellKey(r.key, ax, weakSide)];
      const delta = prevScore != null ? score - prevScore : null;

      const reasons: string[] = [];
      let priority = 0;
      if (score <= 5) { reasons.push(`低スコア(${score}点)`); priority += (6 - score); }
      if (asymDiff != null && asymDiff >= 3) { reasons.push(`左右差${asymDiff}`); priority += asymDiff; }
      if (delta != null && delta < 0) { reasons.push(`前回より${Math.abs(delta)}低下`); priority += Math.abs(delta) * 1.5; }
      if (reasons.length === 0) continue;

      out.push({
        item: r.key, label: r.label, axis: ax, axisLabel: AXIS_LABEL[ax],
        score, asymDiff, delta, reasons, priority,
        exercises: HOME_TRAINING[r.key],
      });
    }
  }
  return out.sort((a, b) => b.priority - a.priority);
}
