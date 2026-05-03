"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";

type HealthResult = {
  ok: boolean;
  env: {
    hasChannelId: boolean;
    hasChannelSecret: boolean;
    hasStaticAccessToken: boolean;
    hasOwnerLineUserId: boolean;
    lineOfficialUrl: string | null;
  };
  tokenSource: "client_credentials" | "static_token" | "none";
  tokenValid: boolean | null;
  botInfo: { userId?: string; basicId?: string; displayName?: string; pictureUrl?: string } | null;
  statusCode: number | null;
  notificationTargets: {
    clinicId: string;
    enabledCount: number;
    hasOwnerEnvFallback: boolean;
  };
  warnings: string[];
  error: string | null;
  checkedAt: string;
};

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
      )}
      <div className="flex-1">
        <span className={ok ? "text-slate-700 dark:text-slate-200" : "text-rose-700 dark:text-rose-400 font-bold"}>
          {label}
        </span>
        {detail && <span className="text-slate-500 dark:text-slate-400 ml-2">{detail}</span>}
      </div>
    </div>
  );
}

export default function LineHealthChecker() {
  const [result, setResult] = useState<HealthResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const runCheck = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/line/health", { cache: "no-store" });
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          return;
        }
        const data = (await res.json()) as HealthResult;
        setResult(data);
      } catch (e: any) {
        setError(e?.message ?? "fetch failed");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button onClick={runCheck} disabled={pending} className="gap-2">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
          {pending ? "診断中…" : "LINE 連携を診断する"}
        </Button>
        {result && (
          <span className="text-xs text-slate-500">
            {new Date(result.checkedAt).toLocaleString("ja-JP")} 時点
          </span>
        )}
      </div>

      {error && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg text-sm text-rose-700 dark:text-rose-400">
          診断 API 呼び出しエラー: {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* 総合判定 */}
          <div
            className={`p-4 rounded-xl border ${
              result.ok
                ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900"
                : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900"
            }`}
          >
            <div className="flex items-center gap-2">
              {result.ok ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-600" />
              )}
              <p
                className={`font-bold ${
                  result.ok
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-700 dark:text-rose-400"
                }`}
              >
                {result.ok ? "LINE 連携 正常" : "LINE 連携 要対応"}
              </p>
            </div>
            {result.botInfo && (
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                公式アカウント: <span className="font-mono">{result.botInfo.basicId}</span>{" "}
                ({result.botInfo.displayName})
              </p>
            )}
          </div>

          {/* 警告 */}
          {result.warnings.length > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
              <p className="text-xs font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1 mb-2">
                <AlertTriangle className="w-3 h-3" />
                警告 ({result.warnings.length} 件)
              </p>
              <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
                {result.warnings.map((w, i) => (
                  <li key={i} className="flex gap-1">
                    <span>•</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* env 状態 */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
              環境変数
            </p>
            <StatusRow label="LINE_CHANNEL_ID" ok={result.env.hasChannelId} />
            <StatusRow label="LINE_CHANNEL_SECRET" ok={result.env.hasChannelSecret} />
            <StatusRow
              label="LINE_CHANNEL_ACCESS_TOKEN（任意）"
              ok={true}
              detail={result.env.hasStaticAccessToken ? "あり" : "なし（ID/Secret で動的取得）"}
            />
            <StatusRow
              label="OWNER_LINE_USER_ID（フォールバック）"
              ok={true}
              detail={result.env.hasOwnerLineUserId ? "あり" : "なし"}
            />
            <StatusRow
              label="NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL"
              ok={true}
              detail={result.env.lineOfficialUrl ?? "なし（コードフォールバック使用）"}
            />
          </div>

          {/* token 状態 */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
              トークン
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-200">
              取得方式:{" "}
              <span className="font-mono">
                {result.tokenSource === "client_credentials"
                  ? "ID/Secret から動的取得"
                  : result.tokenSource === "static_token"
                  ? "静的 token（推奨されない）"
                  : "取得不可"}
              </span>
            </p>
            <StatusRow
              label="LINE API 認証"
              ok={result.tokenValid === true}
              detail={
                result.tokenValid === true
                  ? "OK"
                  : result.tokenValid === false
                  ? `失敗 (HTTP ${result.statusCode ?? "?"})`
                  : "未確認"
              }
            />
          </div>

          {/* 通知先 */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
              通知先
            </p>
            <StatusRow
              label="admin_notification_targets テーブル"
              ok={result.notificationTargets.enabledCount > 0}
              detail={`${result.notificationTargets.enabledCount} 件 (有効)`}
            />
            <StatusRow
              label="OWNER_LINE_USER_ID env (フォールバック)"
              ok={true}
              detail={result.notificationTargets.hasOwnerEnvFallback ? "あり" : "なし"}
            />
          </div>

          {result.error && (
            <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-600 dark:text-slate-400 font-mono break-all">
              {result.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
