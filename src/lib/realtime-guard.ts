/**
 * Realtime subscribe のコールバックをタブ非表示時にスキップし、
 * 連続発火を debounce することでセッション競合（ログアウト）を防ぐ。
 *
 * 使い方:
 *   .on("postgres_changes", ..., realtimeGuard(() => fetchData()))
 */
export function realtimeGuard(fn: () => void, delayMs = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    // タブが非表示のときはスキップ（トークン更新競合を防ぐ）
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, delayMs);
  };
}
