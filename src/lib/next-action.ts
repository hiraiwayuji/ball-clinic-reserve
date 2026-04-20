/**
 * 予測型Next Actionロジック
 * ユーザーの行動履歴をlocalStorageに記録し、次にとる可能性が高いアクションを予測する。
 */

const STORAGE_KEY = "v_arc_next_action_history";
const MAX_HISTORY = 200;

export type ActionEvent = {
  from: string; // "counter:in_treatment" など
  to: string;   // "sales", "counter:done" など
  ts: number;
};

type History = ActionEvent[];

function load(): History {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as History) : [];
  } catch {
    return [];
  }
}

function save(history: History) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
  } catch {}
}

/** アクション遷移を記録する */
export function recordAction(from: string, to: string) {
  const history = load();
  history.push({ from, to, ts: Date.now() });
  save(history);
}

/** fromに続くtoの頻度マップを返す */
function getFrequencyMap(from: string): Record<string, number> {
  const history = load();
  const map: Record<string, number> = {};
  history.forEach((e) => {
    if (e.from === from) {
      map[e.to] = (map[e.to] ?? 0) + 1;
    }
  });
  return map;
}

/** 最も頻度の高い次アクションを返す（データ不足時はdefaultNextを返す） */
export function getPredictedNext(from: string, defaultNext?: string): string | null {
  const map = getFrequencyMap(from);
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? defaultNext ?? null;
}

/** 予測の信頼度（0〜1）を返す。サンプル5件以上で最大信頼度 */
export function getPredictedConfidence(from: string): number {
  const map = getFrequencyMap(from);
  const total = Object.values(map).reduce((s, n) => s + n, 0);
  const max   = Math.max(...Object.values(map), 0);
  if (total === 0) return 0;
  // サンプル数係数: 5件で安定とみなす
  const sampleFactor = Math.min(total / 5, 1);
  const dominance    = max / total;
  return sampleFactor * dominance;
}

/**
 * 「会計完了」→「売上入力」の遷移をハードコードのデフォルトとして返す。
 * ユーザーのhistoryが蓄積されればそちらが優先される。
 */
export const COUNTER_DONE_KEY    = "counter:done";
export const COUNTER_TREATMENT_KEY = "counter:in_treatment";
export const SALES_PAGE_KEY      = "sales";

/** カード会計完了後の推奨next action（デフォルト: sales） */
export function getPredictedNextForCounterDone(): { action: string; confidence: number } {
  const action     = getPredictedNext(COUNTER_DONE_KEY, SALES_PAGE_KEY) ?? SALES_PAGE_KEY;
  const confidence = getPredictedConfidence(COUNTER_DONE_KEY);
  // historyが空の場合でもデフォルト行動（sales）に高い信頼度を設定
  return { action, confidence: Math.max(confidence, 0.75) };
}
