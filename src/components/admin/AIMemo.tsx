"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Save, Loader2, Trash2, Edit3, MessageSquare } from "lucide-react";
import { getAIMemos, upsertAIMemo, deleteAIMemo } from "@/app/actions/ai-strategist";
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
      toast.success("軍師メモを記録しました");
      // Re-fetch to get the ID if it was a new record
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
    if (!existingMemo?.id || !confirm("メモを削除しますか？")) return;
    const res = await deleteAIMemo(existingMemo.id);
    if (res.success) {
      toast.success("削除しました");
      setExistingMemo(null);
      setMemo("");
      setIsEditing(true);
    } else {
      toast.error(res.error);
    }
  };

  if (loading) return <div className="p-4 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-300" /></div>;

  return (
    <Card className="shadow-sm border-blue-100 bg-blue-50/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center text-sm font-bold text-blue-700">
          <MessageSquare className="w-4 h-4 mr-2" />
          軍師への伝言・メモ
        </CardTitle>
        <CardDescription className="text-[10px]">戦略への反映やAIへの指示をメモとして保存できます</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isEditing ? (
          <div className="space-y-2">
            <Textarea 
              placeholder="最近の気付き、改善したい点、AIへの要望などを自由に入力してください..."
              className="min-h-[120px] text-sm bg-white"
              value={memo}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMemo(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              {existingMemo && (
                 <Button variant="ghost" size="sm" onClick={() => { setMemo(existingMemo.content); setIsEditing(false); }}>
                   キャンセル
                 </Button>
              )}
              <Button size="sm" className="bg-blue-600" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                軍師に託す
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-white p-3 rounded-lg border border-blue-100 text-sm text-slate-700 whitespace-pre-wrap min-h-[100px]">
              {existingMemo?.content}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-rose-600" onClick={handleDelete}>
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="text-blue-600 border-blue-200" onClick={() => setIsEditing(true)}>
                <Edit3 className="w-4 h-4 mr-1" />
                メモを追記・変更
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
