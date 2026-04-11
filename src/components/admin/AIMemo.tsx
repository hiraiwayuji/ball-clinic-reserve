"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Save, Loader2, Trash2, Edit3, MessageSquare } from "lucide-react";
import { getAIMemos, upsertAIMemo, deleteAIMemo } from "@/app/actions/ai-secretary";
import { toast } from "sonner";

export default function AIMemo() {
  const [memo, setMemo] = useState("");
  const [existingMemo, setExistingMemo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    async function fetchMemo() {
      const res = await getAIMemos();
      if (res.success && res.data && res.data.length > 0) {
        setExistingMemo(res.data[0]);
        setMemo(res.data[0].content);
        setIsEditing(false);
      } else {
        setIsEditing(true);
      }
      setLoading(false);
    }
    fetchMemo();
  }, []);

  const handleSave = async () => {
    if (!memo.trim()) return;
    setIsSaving(true);
    const res = await upsertAIMemo(memo, existingMemo?.id);
    if (res.success) {
      toast.success("AI\u79d8\u66f8\u304c\u8a18\u9332\u3057\u307e\u3057\u305f");
      const refresh = await getAIMemos();
      if (refresh.success && refresh.data) {
        setExistingMemo(refresh.data[0]);
      }
      setIsEditing(false);
    } else {
      toast.error(res.error);
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!existingMemo?.id || !confirm("\u30e1\u30e2\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f")) return;
    const res = await deleteAIMemo(existingMemo.id);
    if (res.success) {
      toast.success("\u524a\u9664\u3057\u307e\u3057\u305f");
      setExistingMemo(null);
      setMemo("");
      setIsEditing(true);
    } else {
      toast.error(res.error);
    }
  };

  if (loading) return <div className="p-4 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-300" /></div>;

  return (
    <Card className="shadow-sm border-blue-200 bg-blue-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-black text-indigo-800 flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          AI秘書への伝言・メモ
        </CardTitle>
        <CardDescription className="text-[11px] font-semibold text-indigo-500">戦略への考えやAIへの指示をメモとして保存できます</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isEditing ? (
          <div className="space-y-2">
            {existingMemo && (
              <div className="bg-blue-100 border border-blue-200 rounded-lg px-3 py-2 text-xs text-slate-600 whitespace-pre-wrap">
                <span className="font-bold text-blue-600 block mb-1">現在のメモ</span>
                {existingMemo.content}
              </div>
            )}
            <Textarea
              placeholder="最近の悩み、共有したい情報、AIへの要望などを自由に入力してください..."
              className="min-h-[120px] text-sm bg-white text-slate-800 placeholder:text-slate-400 border-blue-200"
              value={memo}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMemo(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              {existingMemo && (
                <Button variant="ghost" size="sm" className="text-slate-600" onClick={() => { setMemo(existingMemo.content); setIsEditing(false); }}>
                  キャンセル
                </Button>
              )}
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSave} disabled={isSaving}>
                <Save className="w-4 h-4 mr-1" />
                秘書に伝える
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-white p-3 rounded-lg border border-blue-200 text-sm text-slate-800 font-medium whitespace-pre-wrap min-h-[100px] leading-relaxed">
              {existingMemo?.content}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-rose-600" onClick={handleDelete}>
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="text-blue-700 border-blue-300 hover:bg-blue-100" onClick={() => { setMemo(""); setIsEditing(true); }}>
                <Edit3 className="w-4 h-4 mr-1" />
                メモを追記・変更
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 shadow-sm"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("open-ai-chat", {
                    detail: {
                      message: `\u300cAI\u79d8\u66f8\u3078\u306e\u76f8\u8ac7\u300d\n\u4ee5\u4e0b\u306e\u30e1\u30e2\u5185\u5bb9\u306b\u3064\u3044\u3066\u3001\u5177\u4f53\u7684\u306b\u4f55\u3092\u3059\u3079\u304d\u304b\u30a2\u30c9\u30d0\u30a4\u30b9\u3092\u304f\u3060\u3055\u3044\u3002\n\n\u30e1\u30e2\u5185\u5bb9:\n${existingMemo?.content}`,
                      autoSend: true
                    }
                  }));
                }}
              >
                <Sparkles className="w-4 h-4 mr-1" />
                秘書と相談する
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
