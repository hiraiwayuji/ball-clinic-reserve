"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sparkles, Loader2, BookOpen, RefreshCw, Send, ChevronRight } from "lucide-react";
import { getWeeklyBlogProposals, generateWeeklyBlogProposal } from "@/app/actions/ai-secretary";
import { toast } from "sonner";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface BlogProposalProps {
  clinicContext: string;
}

export default function BlogProposal({ clinicContext }: BlogProposalProps) {
  const [proposal, setProposal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const fetchProposal = async () => {
    setLoading(true);
    const res = await getWeeklyBlogProposals();
    if (res.success && res.data && res.data.length > 0) {
      setProposal(res.data[0]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProposal();
  }, []);

  const handleGenerate = () => {
    startTransition(async () => {
      const res = await generateWeeklyBlogProposal(clinicContext);
      if (res.success) {
        toast.success("譁ｰ縺励＞繝悶Ο繧ｰ險倅ｺ区｡医ｒ逕滓・縺励∪縺励◆");
        setProposal(res.data);
      } else {
        toast.error(res.error);
      }
    });
  };

  if (loading) return <div className="p-4 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-300" /></div>;

  return (
    <Card className="shadow-sm border-rose-100 bg-rose-50/10 h-full flex flex-col">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center text-sm font-bold text-rose-700">
            <Sparkles className="w-4 h-4 mr-2" />
            莉企ｱ縺ｮnote蝓ｷ遲・署譯茨ｼ・I遘俶嶌・・          </CardTitle>
          <CardDescription className="text-[10px]">騾ｱ縺ｫ1蝗槭∵怙譁ｰ縺ｮ邨悟霧迥ｶ豕√°繧峨後ヰ繧ｺ繧九崎ｨ倅ｺ九ｒ遘俶嶌縺梧署譯医＠縺ｾ縺・/CardDescription>
        </div>
        {!proposal && (
          <Button size="sm" variant="outline" className="h-7 text-[10px] border-rose-200 text-rose-700" onClick={handleGenerate} disabled={isPending}>
            {isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            逕滓・
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {proposal ? (
          <div className="space-y-3 flex-1 flex flex-col">
            <div className="bg-white p-3 rounded-lg border border-rose-100 shadow-sm flex-1">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Title</span>
                <h5 className="font-bold text-sm text-slate-800 leading-snug">{proposal.title}</h5>
              </div>
              
              <div className="flex flex-wrap gap-1 mb-3">
                {proposal.keywords?.map((k: string) => (
                  <span key={k} className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                    #{k}
                  </span>
                ))}
              </div>

              <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap line-clamp-4 overflow-hidden border-t border-dashed border-rose-50 pt-2 italic">
                {proposal.content_draft}
              </div>
            </div>

            <div className="flex justify-between items-center mt-auto">
              <span className="text-[9px] text-slate-400">譯井ｽ懈・譌･: {format(new Date(proposal.created_at), "M/d")}</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-[10px] h-7 text-slate-400" onClick={handleGenerate} disabled={isPending}>
                  {isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                  蜀咲函謌・                </Button>
                <Button size="sm" className="h-7 text-[10px] bg-rose-500 hover:bg-rose-600">
                  <BookOpen className="w-3 h-3 mr-1" />
                  蜈ｨ譁・ｒ遒ｺ隱阪＠縺ｦ讒区・繧剃ｽ懊ｋ
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-6 text-center space-y-3 border border-dashed border-rose-100 rounded-xl">
             <div className="w-10 h-10 bg-rose-50 rounded-full flex items-center justify-center text-rose-300">
                <Send className="w-5 h-5" />
             </div>
             <p className="text-[11px] text-slate-400 leading-relaxed px-4">
               莉企ｱ縺ｮ繝・・繧ｿ縺悟・譫仙庄閭ｽ縺ｧ縺吶・br/>
               蜿ｳ荳翫・逕滓・繝懊ち繝ｳ縺九ｉ繝悶Ο繧ｰ譯医ｒ菴懈・縺励※縺上□縺輔＞縲・             </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

