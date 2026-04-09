"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Globe, Search, ArrowLeft, Lightbulb } from "lucide-react";
import Link from "next/link";
import { generateSEOMeoAdvice } from "@/app/actions/ai-secretary";
import { getClinicSettings, ClinicSettings } from "@/app/actions/settings";

export default function SeoDiagnosisPage() {
  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ClinicSettings | null>(null);

  useEffect(() => {
    async function loadSettings() {
      const s = await getClinicSettings();
      setSettings(s);
    }
    loadSettings();
  }, []);

  const handleDiagnosis = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateSEOMeoAdvice();
      if (result.success && result.advice) {
        setAdvice(result.advice);
      } else {
        setError(result.error || "險ｺ譁ｭ縺ｫ螟ｱ謨励＠縺ｾ縺励◆");
      }
    } catch (e: any) {
      setError(e.message || "莠域悄縺帙〓繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex items-center gap-4">
        <Link href="/admin/marketing">
          <Button variant="ghost" size="sm" className="text-slate-500">
            <ArrowLeft className="w-4 h-4 mr-2" />
            雋ｩ菫・ム繝・す繝･繝懊・繝峨∈謌ｻ繧・          </Button>
        </Link>
      </div>

      <div className="space-y-2">
        <h1 className="text-4xl font-black tracking-tight text-slate-900 flex items-center gap-3">
          <Globe className="w-10 h-10 text-indigo-600" />
          SEO / MEO AIAI遘俶嶌險ｺ譁ｭ
        </h1>
        <p className="text-slate-500 text-lg">
          Google縺ｮ隕也せ縺九ｉ縺ゅ↑縺溘・髯｢繧貞・譫舌よ､懃ｴ｢鬆・ｽ阪→繝槭ャ繝励・髴ｲ蜃ｺ繧呈怙螟ｧ蛹悶＠縺ｾ縺吶・        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 border-indigo-100 bg-indigo-50/30">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center">
              <Lightbulb className="w-4 h-4 mr-2 text-amber-500" />
              迴ｾ蝨ｨ縺ｮ蛻・梵繧ｳ繝ｳ繝・く繧ｹ繝・            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">髯｢蜷・/p>
              <p className="font-medium text-slate-700">{settings?.clinic_name || "隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ..."}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">繧ｨ繝ｪ繧｢</p>
              <p className="font-medium text-slate-700">{settings?.area_name || settings?.address || "險ｭ螳壹↑縺・}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">HP URL</p>
              <p className="font-medium text-slate-700 truncate">{settings?.hp_url || "險ｭ螳壹↑縺・}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">驥咲せ繧ｭ繝ｼ繝ｯ繝ｼ繝・/p>
              <div className="flex flex-wrap gap-1 mt-1">
                {settings?.analysis_keywords?.map(k => (
                  <Badge key={k} variant="outline" className="text-[10px] bg-white">{k}</Badge>
                )) || <p className="text-slate-400 italic">譛ｪ險ｭ螳・/p>}
              </div>
            </div>
            <Link href="/admin/settings">
              <Button variant="link" size="sm" className="px-0 text-indigo-600 text-[11px]">
                險ｭ螳壹ｒ螟画峩縺吶ｋ
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-xl border-2 border-indigo-600 ring-4 ring-indigo-50 overflow-hidden">
          <div className="bg-indigo-600 p-6 text-white">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              AI險ｺ譁ｭ繧帝幕蟋九☆繧・            </h2>
            <p className="text-indigo-100 text-sm mt-1">譛譁ｰ縺ｮGoogle繧｢繝ｫ繧ｴ繝ｪ繧ｺ繝縺ｫ蝓ｺ縺･縺阪・寔螳｢繧呈怙螟ｧ蛹悶☆繧九い繝峨ヰ繧､繧ｹ繧堤函謌舌＠縺ｾ縺吶・/p>
          </div>
          <CardContent className="p-8 flex flex-col items-center justify-center min-h-[200px] bg-white">
             {!advice && !loading && (
               <div className="text-center space-y-6">
                 <div className="flex justify-center flex-wrap gap-3">
                   <Badge variant="outline" className="text-indigo-600 border-indigo-200">繝帙・繝繝壹・繧ｸ謾ｹ蝟・/Badge>
                   <Badge variant="outline" className="text-indigo-600 border-indigo-200">Google繝槭ャ繝怜ｯｾ遲・/Badge>
                   <Badge variant="outline" className="text-indigo-600 border-indigo-200">遶ｶ蜷亥・譫・/Badge>
                 </div>
                 <Button 
                   size="lg" 
                   className="bg-indigo-600 hover:bg-indigo-700 text-white h-16 px-12 text-xl font-black shadow-2xl hover:scale-105 transition-transform"
                   onClick={handleDiagnosis}
                 >
                   <Search className="w-6 h-6 mr-3" />
                   險ｺ譁ｭ繧貞ｮ溯｡後☆繧・                 </Button>
               </div>
             )}

             {loading && (
               <div className="text-center space-y-4 py-8">
                 <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto" />
                 <p className="text-slate-600 font-bold animate-pulse text-lg">Google縺ｮ隕也せ縺ｧ縺ゅ↑縺溘・髯｢繧貞・譫蝉ｸｭ...</p>
                 <p className="text-slate-400 text-xs text-center max-w-xs mx-auto">
                   遶ｶ蜷医し繧､繝医・蛯ｾ蜷代√お繝ｪ繧｢繧ｭ繝ｼ繝ｯ繝ｼ繝峨・髴隕√；oogle繝薙ず繝阪せ繝励Ο繝輔ぅ繝ｼ繝ｫ縺ｮ譛驕ｩ蛹也憾豕√ｒ繝√ぉ繝・け縺励※縺・∪縺吶・                 </p>
               </div>
             )}

             {advice && (
               <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4">
                 <div className="prose prose-slate max-w-none text-slate-700 whitespace-pre-wrap leading-relaxed">
                   {advice}
                 </div>
                 <div className="flex justify-center pt-6 border-t">
                   <Button variant="outline" onClick={handleDiagnosis} className="text-slate-500">
                     <Sparkles className="w-4 h-4 mr-2" />
                     繧ゅ≧荳蠎ｦ險ｺ譁ｭ縺吶ｋ
                   </Button>
                 </div>
               </div>
             )}

             {error && (
               <div className="bg-rose-50 border border-rose-200 p-6 rounded-lg text-center space-y-4">
                 <p className="text-rose-700 font-bold">險ｺ譁ｭ縺ｫ螟ｱ謨励＠縺ｾ縺励◆</p>
                 <p className="text-rose-500 text-sm">{error}</p>
                 <Button variant="outline" onClick={handleDiagnosis} className="border-rose-200 text-rose-700 hover:bg-rose-100">
                   蜀崎ｩｦ陦後☆繧・                 </Button>
               </div>
             )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

