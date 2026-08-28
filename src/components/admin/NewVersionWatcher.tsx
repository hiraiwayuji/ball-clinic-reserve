"use client";

// デプロイ後、「開きっぱなしの画面」を使い続けると保存も検索も
// すべて「通信エラー」になる問題への対策（2026-08-28 受付で実際に発生）。
//
// 理由: デプロイするとサーバー側の内部ID（Server Action ID）が作り直されるため、
// 古い画面から送った命令をサーバーが受け取れなくなる。画面を開き直せば直る。
//
// ここでは「今動いているサーバーのバージョン」を定期的に見に行き、
// 自分（この画面）と食い違ったら、上部に開き直しの案内を出す。
// ※勝手に再読み込みはしない。入力途中の内容が消えるため、押すのは人が決める。

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const MY_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5分ごと

export default function NewVersionWatcher() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    // ローカル開発では毎回ビルドIDが "dev" なので何もしない
    if (MY_BUILD_ID === "dev") return;
    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/build-id", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        const serverId = data?.buildId;
        // サーバー側が "dev" のときは判定材料にならないので無視する
        if (!serverId || serverId === "dev") return;
        if (serverId === MY_BUILD_ID || cancelled) return;
        setStale(true);
      } catch {
        // 通信できないときは何も出さない（オフラインで驚かせない）
      }
    };

    // 別のタブから戻ってきたときにも見る（受付はタブを行き来するため）
    const onFocus = () => { void check(); };
    void check();
    const timer = setInterval(() => { void check(); }, CHECK_INTERVAL_MS);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!stale) return null;

  // sticky にはしない。管理画面のトップバー（sticky top-0）と同じ位置で重なり、
  // メニューを覆い隠してしまうため（2026-08-28 検品指摘）。
  return (
    <div className="bg-amber-100 border-b-2 border-amber-400 px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-sm font-bold text-amber-900">
        システムが新しくなりました。この画面は古いままです。
      </span>
      <span className="text-xs text-amber-800">
        このまま使うと保存や検索ができません。開き直してください。
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-amber-700"
      >
        <RefreshCw className="w-4 h-4" />
        今すぐ開き直す
      </button>
    </div>
  );
}
