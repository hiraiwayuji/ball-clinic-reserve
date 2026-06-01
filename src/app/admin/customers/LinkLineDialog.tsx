"use client";

import { useState, useTransition, useEffect } from "react";
import {
  linkLineUser,
  unlinkLineUser,
  getRecentUnlinkedLineLogs,
  getLineLinksForCustomer,
  unlinkSpecificLineLink,
  setPrimaryLinkForCustomer,
} from "@/app/actions/adminCustomers";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageCircle, Link2, Unlink, Search, Loader2, CheckCircle2, Star } from "lucide-react";

interface Props {
  customerId: string;
  customerName: string;
  lineUserId: string | null;
  lineDisplayName?: string | null;
}

type LinkRow = { line_user_id: string; is_primary: boolean; display_label: string | null; linked_via: string | null; linked_at: string };

export function LinkLineDialog({ customerId, customerName, lineUserId, lineDisplayName }: Props) {
  const [open, setOpen] = useState(false);
  const [manualId, setManualId] = useState("");
  const [logs, setLogs] = useState<{ user_id: string; message: string | null; created_at: string; display_name: string | null }[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [isPending, startTransition] = useTransition();

  const reloadLinks = async () => {
    try {
      const data = await getLineLinksForCustomer(customerId);
      setLinks(data);
    } catch (e) {
      console.error("LINE links load error:", e);
    }
  };

  useEffect(() => {
    if (open) {
      reloadLinks();
    }
  }, [open, customerId]);

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
        await reloadLinks();
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

  const handleUnlinkOne = (uid: string) => {
    startTransition(async () => {
      try {
        await unlinkSpecificLineLink(customerId, uid);
        toast.success("この LINE 紐付けを解除しました");
        await reloadLinks();
      } catch {
        toast.error("解除に失敗しました");
      }
    });
  };

  const handleSetPrimary = (uid: string) => {
    startTransition(async () => {
      try {
        await setPrimaryLinkForCustomer(customerId, uid);
        toast.success("主紐付けを切替えました");
        await reloadLinks();
      } catch {
        toast.error("切替えに失敗しました");
      }
    });
  };

  return (
    <>
      {lineUserId ? (
        <button
          type="button"
          onClick={handleOpen}
          title={lineDisplayName ? `LINE: ${lineDisplayName}` : "LINE紐づけ済"}
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
            {/* 現在の紐付け一覧（複数対応） */}
            {links.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  紐付け済みの LINE ({links.length}件)
                </p>
                {links.map((l) => (
                  <div key={l.line_user_id} className="bg-emerald-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                      {l.is_primary && <Star className="w-3 h-3 fill-yellow-400 text-yellow-500" />}
                      {l.is_primary ? "主紐付け" : "サブ紐付け"}
                      {l.linked_via && <span className="text-[10px] text-slate-400 font-normal">({l.linked_via})</span>}
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono break-all">{l.line_user_id}</p>
                    <div className="flex gap-2">
                      {!l.is_primary && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] text-amber-700 border-amber-200 hover:bg-amber-50"
                          onClick={() => handleSetPrimary(l.line_user_id)}
                          disabled={isPending}
                        >
                          <Star className="w-3 h-3 mr-1" />
                          主にする
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => handleUnlinkOne(l.line_user_id)}
                        disabled={isPending}
                      >
                        <Unlink className="w-3 h-3 mr-1" />
                        この LINE を解除
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] text-red-600 border-red-200 hover:bg-red-50 w-full"
                  onClick={handleUnlink}
                  disabled={isPending}
                >
                  {isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Unlink className="w-3 h-3 mr-1" />}
                  すべての紐付けを解除する
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
                    {log.display_name ? (
                      <p className="text-sm font-bold text-emerald-700 mb-0.5 flex items-center gap-1">
                        <MessageCircle className="w-3.5 h-3.5" />{log.display_name}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 mb-0.5">（LINE表示名 取得不可）</p>
                    )}
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
