"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InfoIcon, RefreshCcw, ExternalLink } from "lucide-react";

export default function LineSetupPage() {
  const [logs, setLogs] = useState<string>("読み込み中...");
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/debug-log");
      const text = await res.text();
      setLogs(text);
    } catch (e) {
      setLogs("ログの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const timer = setInterval(fetchLogs, 5000); // 5秒おきに自動更新
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">LINE Messaging API 接続デバッグ</h1>
        <Button onClick={fetchLogs} variant="outline" size="sm" disabled={loading}>
          <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          更新
        </Button>
      </div>

      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex items-start gap-3">
        <InfoIcon className="h-5 w-5 text-blue-600 mt-0.5" />
        <div>
          <h3 className="font-bold text-blue-800">接続のヒント</h3>
          <p className="text-sm text-blue-700">
            ローカルPCでLINE Webhookを受け取るには、発行されたURL（例: <code className="bg-white/50 px-1 rounded">https://xxxx.loca.lt</code>）を「Webhook URL」に設定する必要があります。
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最新のWebhook受信ログ</CardTitle>
          <CardDescription>
            LINEからメッセージを送ると、ここにIDが表示されます。表示された内容から <b>U...</b> で始まるIDを探してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-950 text-green-400 p-4 rounded-lg font-mono text-sm overflow-auto max-h-[400px] whitespace-pre-wrap">
            {logs}
          </div>
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="text-blue-800">1. 次にやること</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-blue-900">
          <p className="font-bold">PCのターミナル（黒い画面）を新しく開き、以下を実行してください：</p>
          <div className="bg-white p-3 rounded border border-blue-200 font-mono text-sm flex justify-between items-center">
            <code>npx localtunnel --port 3000</code>
          </div>
          <p>実行後、<code className="font-bold">https://xxxx.loca.lt</code> というURLが表示されます。</p>
          
          <hr className="border-blue-200" />
          
          <p className="font-bold">2. LINE Developersの管理画面でWebhookを更新</p>
          <p className="text-sm">
            発行されたURLに <code className="bg-white px-1">/api/line/webhook</code> を付けたものを <b>Webhook URL</b> に貼り付けて保存してください。
          </p>
          <div className="bg-white p-2 rounded text-xs border border-blue-200 break-all text-slate-500 italic">
            例: https://xxxx.loca.lt/api/line/webhook
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
