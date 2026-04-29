"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InfoIcon, RefreshCcw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

type LogRow = {
  created_at: string | null;
  user_id: string | null;
  event_type: string | null;
  message: string | null;
};

type HealthResult = {
  ok: boolean;
  hasAccessToken: boolean;
  hasSecret: boolean;
  tokenValid: boolean | null;
  botInfo: { userId?: string; basicId?: string; displayName?: string } | null;
  statusCode: number | null;
  error: string | null;
  checkedAt: string;
};

export default function LineSetupClient() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logError, setLogError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [logRes, healthRes] = await Promise.all([
        fetch("/api/debug-log", { cache: "no-store" }),
        fetch("/api/line/health", { cache: "no-store" }),
      ]);
      const logJson = await logRes.json().catch(() => ({ logs: [], error: "ログのJSON解析に失敗" }));
      const healthJson = await healthRes.json().catch(() => null);
      setLogs(logJson.logs ?? []);
      setLogError(logJson.error ?? null);
      setHealth(healthJson);
    } catch (e: any) {
      setLogError(e?.message ?? "通信エラー");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, 5000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const formatTime = (iso: string | null) => {
    if (!iso) return "(no time)";
    try {
      return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    } catch {
      return iso;
    }
  };

  const errorCount = logs.filter((l) => l.event_type === "reply_error").length;

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">LINE Messaging API 接続デバッグ</h1>
        <Button onClick={fetchAll} variant="outline" size="sm" disabled={loading}>
          <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          更新
        </Button>
      </div>

      {/* ヘルスバッジ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            連携ヘルスチェック
            {health == null ? (
              <Badge variant="outline">確認中…</Badge>
            ) : health.ok ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle2 className="w-3 h-3 mr-1" /> 正常
              </Badge>
            ) : (
              <Badge className="bg-red-600 hover:bg-red-700">
                <XCircle className="w-3 h-3 mr-1" /> 異常あり
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            LINE_CHANNEL_ACCESS_TOKEN が LINE 側で有効か `/v2/bot/info` を叩いて確認しています。5秒ごとに自動更新。
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {health == null ? (
            <p className="text-slate-500">確認中…</p>
          ) : (
            <>
              <p>
                ACCESS_TOKEN: {health.hasAccessToken ? "✅ 設定あり" : "❌ 未設定"} / SECRET:{" "}
                {health.hasSecret ? "✅ 設定あり" : "❌ 未設定"}
              </p>
              <p>
                トークン有効性:{" "}
                {health.tokenValid === true
                  ? "✅ 有効"
                  : health.tokenValid === false
                  ? `❌ 無効（HTTP ${health.statusCode ?? "?"}）`
                  : "—"}
              </p>
              {health.botInfo?.displayName && (
                <p>
                  Bot名: <b>{health.botInfo.displayName}</b>{" "}
                  {health.botInfo.basicId && <span className="text-slate-500">({health.botInfo.basicId})</span>}
                </p>
              )}
              {health.error && (
                <p className="text-red-600 break-all">エラー: {health.error}</p>
              )}
              <p className="text-slate-400 text-xs">checked at {formatTime(health.checkedAt)}</p>
            </>
          )}
          {!health?.ok && health != null && (
            <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-red-800">
              <p className="font-bold flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> 復旧手順
              </p>
              <ol className="list-decimal list-inside text-xs mt-1 space-y-0.5">
                <li>LINE Official Account Manager（manager.line.biz）にログイン → 接骨院アカウントを選択</li>
                <li>設定 → Messaging API → チャネルアクセストークン（長期）を再発行</li>
                <li>新トークンを <code className="bg-white px-1 rounded">.env.local</code> と Vercel 環境変数（LINE_CHANNEL_ACCESS_TOKEN）の両方に貼り付け</li>
                <li>ローカルは next dev 再起動、Vercel は Redeploy</li>
                <li className="text-rose-700 font-bold">※ developers.line.biz は使用しません（過去にアカウント表示の問題あり）。Official Account Manager 経由のみで完結します。</li>
              </ol>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 受信ログ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            最新のWebhook受信ログ
            {errorCount > 0 && (
              <Badge className="bg-red-600 hover:bg-red-700">reply_error × {errorCount}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            直近80件。<b>赤字</b>は LINE への返信に失敗した記録（reply_error）です。これが出ている時はトークン失効など連携不良が起きています。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-950 text-green-400 p-4 rounded-lg font-mono text-xs overflow-auto max-h-[480px] whitespace-pre-wrap">
            {logError && <div className="text-red-400">⚠ {logError}</div>}
            {logs.length === 0 && !logError && (
              <div className="text-slate-500">まだログがありません。LINE で公式アカウントに何か送ってみてください。</div>
            )}
            {logs.map((row, i) => {
              const isError = row.event_type === "reply_error";
              return (
                <div key={i} className={isError ? "text-red-400" : ""}>
                  [{formatTime(row.created_at)}] type={row.event_type ?? "?"} user={row.user_id ?? "?"} msg=
                  {row.message ?? "(non-text)"}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex items-start gap-3">
        <InfoIcon className="h-5 w-5 text-blue-600 mt-0.5" />
        <div className="text-sm text-blue-800 space-y-1">
          <p className="font-bold">ローカル開発で Webhook を受けたい場合</p>
          <p>
            別ターミナルで <code className="bg-white px-1 rounded">npx localtunnel --port 3000</code> を実行し、表示された URL に{" "}
            <code className="bg-white px-1 rounded">/api/line/webhook</code> を付けたものを LINE Developers の Webhook URL に設定してください。
          </p>
        </div>
      </div>
    </div>
  );
}
