"use client";

import { useState, useTransition } from "react";
import { linkLineUser, unlinkLineUser, getRecentUnlinkedLineLogs } from "@/app/actions/adminCustomers";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageCircle, Link2, Unlink, Search, Loader2, CheckCircle2 } from "lucide-react";

interface Props {
  customerId: string;
  customerName: string;
  lineUserId: string | null;
}

export function LinkLineDialog({ customerId, customerName, lineUserId }: Props) {
  const [open, setOpen] = useState(false);
  const [manualId, setManualId] = useState("");
  const [logs, setLogs] = useState<{ user_id: string; message: string | null; created_at: string }[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleOpen = () => {
    setOpen(true);
    if (!logsLoaded) {
      startTransition(async () => {
        try {
          const data = await getRecentUnlinkedLineLogs();
          setLogs(data);
        } catch (e) {
          console.error("ログ取得エラー:", e);
          toast.error("LINEログの取得に失敗しました");
        } finally {
          setLogsLoaded(true);
        }
      });
    }
  };

  const handleLink = (uid: string) => {
    if (!uid.trim()) return;
    startTransition(async () => {
      try {
        await linkLineUser(customerId, uid.trim());
        toast.success(`${customerName}さんのLINEを紐づけました`);
        setOpen(false);
        setManualId("");
      } catch {
        toast.error("紐づけに失敗しました");
      }
    });
  };

  const handleUnlink = () => {
    startTransition(async () => {
      try {
        await unlinkLineUser(customerId);
        toast.success(`${customerName}さんのLINE紐づけを解除しました`);
        setOpen(false);
      } catch {
        toast.error("解除に失敗しました");
      }
    });
  };

  return (
    <>
      {lineUserId ? (
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
        >
          <CheckCircle2 className="w-3 h-3" />
          紐づけ済
        </button>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200 transition-colors"
        >
          <MessageCircle className="w-3 h-3" />
          未紐づけ
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              {customerName}さんのLINE紐づけ
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* 現在の状態 */}
            {lineUserId && (
              <div className="bg-emerald-50 rounded-lg p-3 space-y-2">
                <p className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> 紐づけ済み
                </p>
                <p className="text-[10px] text-slate-400 font-mono break-all">{lineUserId}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] text-red-600 border-red-200 hover:bg-red-50"
                  onClick={handleUnlink}
                  disabled={isPending}
                >
                  {isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Unlink className="w-3 h-3 mr-1" />}
                  紐づけを解除する
                </Button>
              </div>
            )}

            {/* 手動入力 */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-600 flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                LINE User IDを直接入力して登録
              </p>
              <p className="text-[10px] text-slate-400">
                Supabaseのline_debug_logsで確認したuser_idを貼り付けてください
              </p>
              <input
                type="text"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full h-9 text-xs border border-slate-200 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-sm"
                onClick={() => handleLink(manualId)}
                disabled={isPending || !manualId.trim()}
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                このIDで登録する
              </Button>
            </div>

            {/* 最近のLINEメッセージから選択 */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-600 flex items-center gap-1">
                <Search className="w-3 h-3" />
                最近LINEにメッセージを送ってきた方から選んで登録
              </p>
              <p className="text-[10px] text-slate-400">
                患者さんにLINEでボットへ何か1件送ってもらうと下に表示されます
              </p>

              {isPending && !logsLoaded ? (
                <div className="flex justify-center py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-3 text-[11px] text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  未紐づけのメッセージが見つかりません
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.user_id}
                    className="p-2 bg-slate-50 rounded-lg border border-slate-100"
                  >
                    <p className="font-mono text-[10px] text-slate-400 truncate mb-0.5">{log.user_id}</p>
                    <p className="text-xs text-slate-700 mb-1">「{log.message || "（メッセージなし）"}」</p>
                    <p className="text-[9px] text-slate-400 mb-2">{new Date(log.created_at).toLocaleDateString("ja-JP")}</p>
                    <Button
                      size="sm"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-xs h-8"
                      onClick={() => handleLink(log.user_id)}
                      disabled={isPending}
                    >
                      {isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      この方を登録する
                    </Button>
                  </div>
                ))}
              </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
