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
      toast.success("AI遘俶嶌縺瑚ｨ倬鹸縺励∪縺励◆");
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
    if (!existingMemo?.id || !confirm("繝｡繝｢繧貞炎髯､縺励∪縺吶°・・)) return;
    const res = await deleteAIMemo(existingMemo.id);
    if (res.success) {
      toast.success("蜑企勁縺励∪縺励◆");
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
        <CardTitle className="text-sm font-black text-indigo-900 flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          AI遘俶嶌縺ｸ縺ｮ莨晁ｨ繝ｻ繝｡繝｢
        </CardTitle>
        <CardDescription className="text-[10px] font-bold text-indigo-600">謌ｦ逡･縺ｸ縺ｮ蜿肴丐繧БI縺ｸ縺ｮ謖・､ｺ繧偵Γ繝｢縺ｨ縺励※菫晏ｭ倥〒縺阪∪縺・/CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isEditing ? (
          <div className="space-y-2">
            <Textarea 
              placeholder="譛霑代・豌嶺ｻ倥″縲∵隼蝟・＠縺溘＞轤ｹ縲、I縺ｸ縺ｮ隕∵悍縺ｪ縺ｩ繧定・逕ｱ縺ｫ蜈･蜉帙＠縺ｦ縺上□縺輔＞..."
              className="min-h-[120px] text-sm bg-white"
              value={memo}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMemo(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              {existingMemo && (
                 <Button variant="ghost" size="sm" onClick={() => { setMemo(existingMemo.content); setIsEditing(false); }}>
                   繧ｭ繝｣繝ｳ繧ｻ繝ｫ
                 </Button>
              )}
              <Button size="sm" className="bg-blue-600" onClick={handleSave} disabled={isSaving}>
                <Save className="w-4 h-4 mr-1" />
                遘俶嶌縺ｫ險励☆
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
                繝｡繝｢繧定ｿｽ險倥・螟画峩
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 shadow-sm"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("open-ai-chat", {
                    detail: {
                      message: `縲植I遘俶嶌縺ｸ縺ｮ逶ｸ隲・曾n莉･荳九・繝｡繝｢蜀・ｮｹ縺ｫ縺､縺・※縲∝・菴鍋噪縺ｫ菴輔ｒ縺吶∋縺阪°繧｢繝峨ヰ繧､繧ｹ繧偵￥縺縺輔＞縲・n\n繝｡繝｢蜀・ｮｹ:\n${existingMemo?.content}`,
                      autoSend: true
                    }
                  }));
                }}
              >
                <Sparkles className="w-4 h-4 mr-1" />
                遘俶嶌縺ｨ逶ｸ隲・☆繧・              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

