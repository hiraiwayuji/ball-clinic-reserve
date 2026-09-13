/**
 * トレーニング評価アプリの共通定義（評価の軸・項目・院ゲート・集計）。
 *
 * 方針:
 *  - 対象は「ボール接骨院・からだ鍼灸整骨院・マッスル整体」の3院のみ。
 *  - 評価は「項目 × 軸 × 左右」で 0〜10点。
 *  - **軸と項目は院ごとに編集できる**（clinic_settings.training_catalog）。未設定の院は標準セット。
 *    例: 軸に「柔軟性」を足す／項目に「前屈」「後屈」を足す／測り方の説明を書き換える。
 *  - 一度作った軸・項目の key は**変えない・消さない**（保存済みの点数が key で紐づいているため）。
 *    使わなくなったものは hidden で「非表示」にする。非表示でも過去の点数はグラフに残る。
 *
 * サーバー/クライアント双方から import する純粋モジュール（server 専用の依存を持たない）。
 * `@/` エイリアスも使わないので node --test でそのまま読み込める。
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
  "cafe0000-0000-4000-8000-000000000001", // 【テスト工場】からだ検証用（実データなし。本番の各院のデプロイには影響しない）
]);

/** この稼働（Vercelデプロイ）でトレーニング評価が使えるか。build時に埋め込まれる clinic_id で判定。 */
export function isTrainingEnabled(): boolean {
  const id = process.env.NEXT_PUBLIC_CLINIC_ID ?? "00000000-0000-0000-0000-000000000001";
  return TRAINING_CLINIC_IDS.has(id);
}

// ───────────────────────── 型 ─────────────────────────
/** 軸の key（標準は strength / reflex / power / motor。院が足した軸は c_xxxx） */
export type AxisKey = string;
export type Axis = {
  key: AxisKey;
  label: string;
  color: string;
  desc: string;
  /** 非表示（新しい採点では出さない。過去の点数は残る） */
  hidden?: boolean;
};

/** 項目（部位など）の key（標準は toe / ankle …。院が足した項目は c_xxxx） */
export type RegionKey = string;
export type HomeExercise = { name: string; note?: string };
export type Region = {
  key: RegionKey;
  label: string;
  group: string;      // 表示グルーピング（下肢/体幹/神経/柔軟性 など）
  bilateral: boolean; // 左右差を取るか（true=左右別、false=中央/全身で1値）
  hint?: string;      // 採点時のヒント（測り方の例）
  axes?: AxisKey[];   // その項目で評価する軸（省略時は表示中の軸すべて）
  /** 非表示（新しい採点では出さない。過去の点数は残る） */
  hidden?: boolean;
  /** 弱点に出たときの自宅トレーニング（宿題）候補 */
  exercises?: HomeExercise[];
};

export type TrainingCatalog = { axes: Axis[]; regions: Region[] };

// ───────────────────────── 標準セット ─────────────────────────
export const DEFAULT_AXES: Axis[] = [
  { key: "strength", label: "筋力",     color: "#ef4444", desc: "その部位の力の強さ" },
  { key: "reflex",   label: "反射",     color: "#f59e0b", desc: "刺激への反応の速さ・鋭さ" },
  { key: "power",    label: "瞬発力",   color: "#8b5cf6", desc: "一気に力を出す速さ・爆発力" },
  { key: "motor",    label: "運動神経", color: "#3b82f6", desc: "思い通りに動かせるか（協調・コントロール）" },
];

/** 部位ごとの自宅トレーニング（宿題）候補。院で調整前提の標準セット。 */
const DEFAULT_HOME_TRAINING: Record<string, HomeExercise[]> = {
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
  hamstring: [
    { name: "レッグカール", note: "左右各15回。もも裏を意識" },
    { name: "ヒップヒンジ", note: "15回。股関節から前傾" },
    { name: "もも裏ストレッチ", note: "左右各30秒" },
    { name: "ノルディックハムストリング", note: "5〜8回。ゆっくり耐える" },
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
  arm: [
    { name: "腕立て伏せ", note: "10回。膝つきでもOK" },
    { name: "チューブ/ダンベルカール", note: "左右各15回" },
    { name: "壁押し・手押し相撲", note: "押す力を鍛える" },
    { name: "タオル握り", note: "左右各20回。握力" },
  ],
  reflex: [
    { name: "ラダートレーニング", note: "3種×2セット。素早い足さばき" },
    { name: "反応キャッチ", note: "合図でボールをつかむ／落ちる前にキャッチ" },
    { name: "ステップ切り返し", note: "左右の切り返しを素早く" },
  ],
};

// 足の指 → 足首 → 股関節 → 体幹（腸腰筋/腹筋/背筋）→ 反射神経 の順。
export const DEFAULT_REGIONS: Region[] = [
  { key: "toe",       label: "足の指",   group: "下肢", bilateral: true,  hint: "グーパー・タオルギャザー・指の握り" },
  { key: "ankle",     label: "足首",     group: "下肢", bilateral: true,  hint: "背屈/底屈・片足バランス・可動域" },
  { key: "hip",       label: "股関節",   group: "下肢", bilateral: true,  hint: "開脚・片足立ち・可動域" },
  { key: "hamstring", label: "ハムストリングス", group: "下肢", bilateral: true, hint: "レッグカール・前屈・もも裏の張り" },
  { key: "iliopsoas", label: "腸腰筋",   group: "体幹", bilateral: true,  hint: "もも上げ・脚の引き上げ" },
  { key: "abs",       label: "腹筋",     group: "体幹", bilateral: true,  hint: "体幹の安定・ねじり・保持" },
  { key: "back",      label: "背筋",     group: "体幹", bilateral: true,  hint: "姿勢保持・反り・引き上げ" },
  { key: "arm",       label: "腕",       group: "上肢", bilateral: true,  hint: "押す/引く・握力・腕の振り" },
  // 反射神経は全身の反応。筋力の概念が薄いので「反射」「運動神経」の2軸のみ、左右差なし。
  { key: "reflex",    label: "反射神経", group: "神経", bilateral: false, hint: "合図→反応・全身の素早さ・切り返し", axes: ["reflex", "motor"] },
].map((r) => ({ ...r, exercises: DEFAULT_HOME_TRAINING[r.key] ?? [] }));

export const DEFAULT_CATALOG: TrainingCatalog = { axes: DEFAULT_AXES, regions: DEFAULT_REGIONS };

// ───────────────────────── 院の設定を読む（壊れた値でも落ちない） ─────────────────────────
/** key に使える文字（保存済みの点数と紐づくので、英小文字・数字・_ だけ） */
export const CATALOG_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
export const CATALOG_LIMITS = {
  axes: 12, regions: 60, exercises: 10,
  axisLabel: 12, axisDesc: 60, regionLabel: 30, group: 12, hint: 80, exerciseName: 30, exerciseNote: 60,
} as const;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const FALLBACK_COLOR = "#64748b";

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * DB に保存された値を安全な形に直す。使えない値なら null。
 *  - key が不正・重複のものは捨てる
 *  - 文字数は上限で切る、色が不正なら灰色
 *  - 項目の axes は、実在する軸だけ残す（空なら「表示中の軸すべて」扱い）
 *  - 表示中の軸・項目が1つも無ければ使えない（null）
 */
export function sanitizeCatalog(raw: unknown): TrainingCatalog | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { axes?: unknown; regions?: unknown };
  if (!Array.isArray(obj.axes) || !Array.isArray(obj.regions)) return null;

  const axisKeys = new Set<string>();
  const axes: Axis[] = [];
  for (const a of obj.axes.slice(0, CATALOG_LIMITS.axes)) {
    if (!a || typeof a !== "object") continue;
    const x = a as Record<string, unknown>;
    const key = typeof x.key === "string" ? x.key : "";
    const label = str(x.label, CATALOG_LIMITS.axisLabel);
    if (!CATALOG_KEY_RE.test(key) || axisKeys.has(key) || !label) continue;
    axisKeys.add(key);
    axes.push({
      key,
      label,
      color: typeof x.color === "string" && COLOR_RE.test(x.color) ? x.color : FALLBACK_COLOR,
      desc: str(x.desc, CATALOG_LIMITS.axisDesc),
      ...(x.hidden === true ? { hidden: true } : {}),
    });
  }
  if (!axes.some((a) => !a.hidden)) return null;

  const regionKeys = new Set<string>();
  const regions: Region[] = [];
  for (const r of obj.regions.slice(0, CATALOG_LIMITS.regions)) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    const key = typeof x.key === "string" ? x.key : "";
    const label = str(x.label, CATALOG_LIMITS.regionLabel);
    if (!CATALOG_KEY_RE.test(key) || regionKeys.has(key) || !label) continue;
    regionKeys.add(key);
    const regionAxes = Array.isArray(x.axes)
      ? [...new Set(x.axes.filter((k): k is string => typeof k === "string" && axisKeys.has(k)))]
      : [];
    const exercises = Array.isArray(x.exercises)
      ? x.exercises.slice(0, CATALOG_LIMITS.exercises).flatMap((e) => {
          if (!e || typeof e !== "object") return [];
          const name = str((e as Record<string, unknown>).name, CATALOG_LIMITS.exerciseName);
          if (!name) return [];
          const note = str((e as Record<string, unknown>).note, CATALOG_LIMITS.exerciseNote);
          return [note ? { name, note } : { name }];
        })
      : [];
    const hint = str(x.hint, CATALOG_LIMITS.hint);
    regions.push({
      key,
      label,
      group: str(x.group, CATALOG_LIMITS.group) || "その他",
      bilateral: x.bilateral === true,
      ...(hint ? { hint } : {}),
      ...(regionAxes.length ? { axes: regionAxes } : {}),
      ...(x.hidden === true ? { hidden: true } : {}),
      exercises,
    });
  }
  if (!regions.some((r) => !r.hidden)) return null;
  return { axes, regions };
}

/** 院の設定値 → 使える catalog。未設定・壊れていれば標準セット。 */
export function resolveCatalog(raw: unknown): TrainingCatalog {
  return sanitizeCatalog(raw) ?? DEFAULT_CATALOG;
}

/**
 * 設定を保存してよいか。前の設定にあった key が消えていたらダメ（点数が迷子になる）。
 * 消したいときは hidden にする。問題なければ null、ダメなら理由の文。
 */
export function validateCatalogChange(prev: TrainingCatalog, next: TrainingCatalog): string | null {
  const nextAxes = new Set(next.axes.map((a) => a.key));
  const nextRegions = new Set(next.regions.map((r) => r.key));
  const lostAxis = prev.axes.find((a) => !nextAxes.has(a.key));
  if (lostAxis) return `軸「${lostAxis.label}」は削除できません（過去の点数が残っています）。使わない場合は「非表示」にしてください。`;
  const lostRegion = prev.regions.find((r) => !nextRegions.has(r.key));
  if (lostRegion) return `項目「${lostRegion.label}」は削除できません（過去の点数が残っています）。使わない場合は「非表示」にしてください。`;
  return null;
}

// ───────────────────────── 見せ方の決まり ─────────────────────────
export const visibleAxes = (cat: TrainingCatalog): Axis[] => cat.axes.filter((a) => !a.hidden);
export const visibleRegions = (cat: TrainingCatalog): Region[] => cat.regions.filter((r) => !r.hidden);

export function axisLabel(cat: TrainingCatalog, key: AxisKey): string {
  return cat.axes.find((a) => a.key === key)?.label ?? key;
}
export function regionLabel(cat: TrainingCatalog, key: RegionKey): string {
  return cat.regions.find((r) => r.key === key)?.label ?? key;
}

export type Side = "left" | "right" | "both";
export const SIDE_LABEL: Record<Side, string> = { left: "左", right: "右", both: "" };

/**
 * その項目で評価する軸。
 *  - 採点画面（includeHidden=false）: 表示中の軸だけ
 *  - 集計・過去の表示（includeHidden=true）: 非表示の軸も含める（過去の点数を消さないため）
 */
export function axesFor(region: Region, cat: TrainingCatalog, includeHidden = false): AxisKey[] {
  const pool = includeHidden ? cat.axes : visibleAxes(cat);
  const poolKeys = pool.map((a) => a.key);
  if (region.axes && region.axes.length) return region.axes.filter((k) => poolKeys.includes(k));
  return poolKeys;
}
/** その項目で入力する左右（bilateral=左右、それ以外=both単体） */
export function sidesFor(region: Region): Side[] {
  return region.bilateral ? ["left", "right"] : ["both"];
}
/** measurement を一意に指すキー */
export function cellKey(item: RegionKey, axis: AxisKey, side: Side): string {
  return `${item}:${axis}:${side}`;
}

/** 採点画面で入れられる「セル」の総数（進捗表示の分母） */
export function totalCells(cat: TrainingCatalog): number {
  return visibleRegions(cat).reduce((n, r) => n + axesFor(r, cat).length * sidesFor(r).length, 0);
}

/**
 * 点数を表示するときの軸の一覧。表示中の軸 ＋「非表示だけど、この値に点数がある軸」。
 * 非表示にした軸でも、過去の点数があれば見えなくならないようにする。
 */
export function axesToShow(cat: TrainingCatalog, values: Record<AxisKey, number | null>): Axis[] {
  return cat.axes.filter((a) => !a.hidden || values[a.key] != null);
}

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

/** 軸ごとの平均点（0〜10）。未測定は分母から除外。非表示の軸も集計する。 */
export function axisAverages(ms: Measurement[], cat: TrainingCatalog): Record<AxisKey, number | null> {
  const out: Record<AxisKey, number | null> = {};
  for (const a of cat.axes) {
    out[a.key] = avg(ms.filter((m) => m.axis === a.key && m.score != null).map((m) => m.score as number));
  }
  return out;
}

/** 項目ごとの平均点（軸・左右をならした値）。レーダー用。非表示の項目も含む（点数が無ければ null）。 */
export function regionAverages(ms: Measurement[], cat: TrainingCatalog): { key: RegionKey; label: string; value: number | null }[] {
  return cat.regions.map((r) => ({
    key: r.key,
    label: r.label,
    value: avg(ms.filter((m) => m.item_key === r.key && m.score != null).map((m) => m.score as number)),
  }));
}

/** セッション全体の平均点（推移グラフ用） */
export function overallAverage(ms: Measurement[]): number | null {
  return avg(ms.filter((m) => m.score != null).map((m) => m.score as number));
}

/** 左右差の一覧（bilateral 項目×軸で、左右そろっているものだけ） */
export type Asymmetry = {
  item: RegionKey; label: string; axis: AxisKey; axisLabel: string;
  left: number; right: number; diff: number; higher: "left" | "right";
};
export function asymmetries(ms: Measurement[], cat: TrainingCatalog): Asymmetry[] {
  const map = toScoreMap(ms);
  const out: Asymmetry[] = [];
  for (const r of cat.regions) {
    if (!r.bilateral) continue;
    for (const ax of axesFor(r, cat, true)) {
      const l = map[cellKey(r.key, ax, "left")];
      const rt = map[cellKey(r.key, ax, "right")];
      if (l == null || rt == null) continue;
      out.push({
        item: r.key, label: r.label, axis: ax, axisLabel: axisLabel(cat, ax),
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
export function growth(from: Assessment, to: Assessment, cat: TrainingCatalog): Growth {
  const fO = overallAverage(from.measurements);
  const tO = overallAverage(to.measurements);
  const fA = axisAverages(from.measurements, cat);
  const tA = axisAverages(to.measurements, cat);
  const axes: Record<AxisKey, number | null> = {};
  for (const a of cat.axes) {
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
export function movers(from: Assessment, to: Assessment, cat: TrainingCatalog): Mover[] {
  const fm = toScoreMap(from.measurements);
  const tm = toScoreMap(to.measurements);
  const out: Mover[] = [];
  for (const r of cat.regions) {
    for (const ax of axesFor(r, cat, true)) {
      for (const sd of sidesFor(r)) {
        const k = cellKey(r.key, ax, sd);
        if (fm[k] == null || tm[k] == null) continue;
        out.push({
          item: r.key, label: r.label, axis: ax, axisLabel: axisLabel(cat, ax), side: sd,
          from: fm[k], to: tm[k], delta: tm[k] - fm[k],
        });
      }
    }
  }
  return out.sort((a, b) => b.delta - a.delta);
}

/** 左右差の推移（各セッションの bilateral 平均左右差）。バランス改善の可視化用。 */
export function asymmetryTrend(assessments: Assessment[], cat: TrainingCatalog): { date: string; avgDiff: number }[] {
  return [...assessments].reverse().map((a) => {
    const list = asymmetries(a.measurements, cat);
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
 * prev があれば「低下」も評価に含める。自宅トレは項目に設定された exercises を使う。
 */
export function weaknessScan(latest: Assessment, prev: Assessment | null, cat: TrainingCatalog): Weakness[] {
  const lm = toScoreMap(latest.measurements);
  const pm = prev ? toScoreMap(prev.measurements) : {};
  const out: Weakness[] = [];
  for (const r of cat.regions) {
    for (const ax of axesFor(r, cat, true)) {
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
        item: r.key, label: r.label, axis: ax, axisLabel: axisLabel(cat, ax),
        score, asymDiff, delta, reasons, priority,
        exercises: r.exercises ?? [],
      });
    }
  }
  return out.sort((a, b) => b.priority - a.priority);
}

// ───────────────────────── 保存済みの点数を消さないための決まり ─────────────────────────
// 設定で「項目から軸を外す」「左右の分け方を変える」と、その点数が採点画面に出なくなり、
// 評価の修正を保存したときに「送られなかったセル」として消えてしまう（2026-09-14 検品で発覚）。
// そうなる設定は保存させない。

/** 保存済みの点数が「どの項目の、どの軸・左右」に入っているか */
export type ScoredCells = {
  /** "項目key|軸key" */
  pairs: Set<string>;
  /** 項目key → 点数が入っている左右 */
  sidesByItem: Map<string, Set<Side>>;
};

export function buildScoredCells(rows: { item_key: string; axis: string; side: string }[]): ScoredCells {
  const pairs = new Set<string>();
  const sidesByItem = new Map<string, Set<Side>>();
  for (const r of rows) {
    pairs.add(r.item_key + "|" + r.axis);
    const side: Side | null = r.side === "left" || r.side === "right" || r.side === "both" ? r.side : null;
    if (!side) continue;
    if (!sidesByItem.has(r.item_key)) sidesByItem.set(r.item_key, new Set());
    sidesByItem.get(r.item_key)!.add(side);
  }
  return { pairs, sidesByItem };
}

/**
 * 新しい設定で、保存済みの点数が採点画面に出なくなるものが無いか。
 * 問題なければ null、あれば理由の文（院長に見せる言葉）。
 */
export function findHiddenScoredCells(next: TrainingCatalog, scored: ScoredCells): string | null {
  for (const pair of scored.pairs) {
    const sep = pair.indexOf("|");
    const itemKey = pair.slice(0, sep);
    const axisKey = pair.slice(sep + 1);
    const region = next.regions.find((r) => r.key === itemKey);
    if (!region) return "過去の点数が入っている項目は削除できません。使わない場合は「非表示」にしてください。";
    const axis = next.axes.find((a) => a.key === axisKey);
    if (!axis) return "過去の点数が入っている軸は削除できません。使わない場合は「非表示」にしてください。";
    if (!axesFor(region, next, true).includes(axisKey)) {
      return "「" + region.label + "」の「" + axis.label + "」には過去の点数があるため、この項目から外せません。使わない場合は、軸を「非表示」にしてください。";
    }
  }
  for (const [itemKey, sides] of scored.sidesByItem) {
    const region = next.regions.find((r) => r.key === itemKey);
    if (!region) continue;
    const allowed = sidesFor(region);
    if ([...sides].some((s) => !allowed.includes(s))) {
      return "「" + region.label + "」には過去の点数があるため、「左右を分けて測る」は変えられません。";
    }
  }
  return null;
}

/**
 * 項目の「評価する軸」を、明示したリストにする（軸を足す前・軸を付け外しする前に使う）。
 * 🚨 非表示の軸も残す。落とすと、その軸の過去の点数が採点画面から消え、修正保存で消えてしまう。
 */
export function materializeRegionAxes(region: Region, cat: TrainingCatalog): AxisKey[] {
  return axesFor(region, cat, true);
}
