"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  TrendingUp, Users, Target, MessageSquare, 
  CheckCircle2, AlertCircle, Calendar, Sparkles, Star,
  Award, ArrowUpRight, Loader2, Save
} from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { getMonthlyEvaluation, saveEvaluationTargets, saveAiSuggestion } from "@/app/actions/evaluation";
import { getBusinessContext } from "@/app/actions/sales";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// --- Radar Chart Component (SVG based) ---
const RadarChart = ({ data }: { data: { label: string, value: number, max: number }[] }) => {
  const size = 300;
  const center = size / 2;
  const radius = size * 0.35;
  const angleStep = (Math.PI * 2) / data.length;

  const points = data.map((d, i) => {
    const angle = i * angleStep - Math.PI / 2;
    // maxが0の場合は0にする
    const safeMax = d.max === 0 ? 1 : d.max;
    // valueがmaxを超えないようにする（最大100%の表示）
    const r = (Math.min(d.value, safeMax) / safeMax) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
      labelX: center + (radius + 35) * Math.cos(angle),
      labelY: center + (radius + 20) * Math.sin(angle),
    };
  });

  const pathData = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')} Z`;

  // Grid levels
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1];

  return (
    <div className="relative w-full aspect-square max-w-[400px] mx-auto flex items-center justify-center">
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {/* Grids */}
        {gridLevels.map((level, idx) => (
          <polygon
            key={idx}
            points={data.map((_, i) => {
              const angle = i * angleStep - Math.PI / 2;
              const r = radius * level;
              return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
            }).join(' ')}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="1"
          />
        ))}

        {/* Axis Lines */}
        {data.map((_, i) => {
          const angle = i * angleStep - Math.PI / 2;
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={center + radius * Math.cos(angle)}
              y2={center + radius * Math.sin(angle)}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          );
        })}

        {/* Data Area */}
        {points.length > 0 && (
          <polygon
            points={points.map(p => `${p.x},${p.y}`).join(' ')}
            fill="rgba(16, 185, 129, 0.2)"
            stroke="#10b981"
            strokeWidth="3"
            className="transition-all duration-1000"
          />
        )}

        {/* Labels */}
        {data.map((d, i) => (
          <text
            key={i}
            x={points[i].labelX}
            y={points[i].labelY}
            textAnchor="middle"
            className="text-[10px] font-bold fill-slate-500"
          >
            {d.label}
          </text>
        ))}

        {/* Data Points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="#10b981" />
        ))}
      </svg>
    </div>
  );
};

export default function EvaluationPage() {
  const [activeYear, setActiveYear] = useState(new Date().getFullYear());
  const [activeMonth, setActiveMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Month selector options
  const monthOptions = useMemo(() => {
    const opts = [];
    const current = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(current.getFullYear(), current.getMonth() - i, 1);
      opts.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }
    return opts;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await getMonthlyEvaluation(activeYear, activeMonth);
    if (result.success) {
      setData(result.data);
    } else {
      toast.error(result.error || "データ取得に失敗しました");
    }
    setLoading(false);
  }, [activeYear, activeMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveMetrics = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.append("month", `${activeYear}-${activeMonth.toString().padStart(2, '0')}-01`);

    const res = await saveEvaluationTargets(formData);
    if (res.success) {
      toast.success("目標と評価を保存しました");
      setIsEditModalOpen(false);
      fetchData();
    } else {
      toast.error(res.error);
    }
  };

  const handleGenerateAi = async () => {
    setIsGeneratingAi(true);
    try {
      // Get full context
      const contextRes = await getBusinessContext();
      if (!contextRes.success) throw new Error("コンテキストの取得に失敗");

      const prompt = `
あなたは治療院コンサルタント「経営軍師AI」です。
以下のデータに基づき、${activeMonth}月の月間経営評価と来月への戦略を2〜3つの具体的なアクションプラン（短文箇条書き）を含む、150文字程度の短い形式で提案してください。

${contextRes.context}
`;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!response.ok) throw new Error("APIレスポンスエラー");
      
      const responseData = await response.json();
      const aiText = responseData.response || "提案を生成できませんでした。";

      // Save to DB
      const monthStr = `${activeYear}-${activeMonth.toString().padStart(2, "0")}-01`;
      await saveAiSuggestion(monthStr, aiText);
      toast.success("AI提案を生成しました");
      fetchData();

    } catch (error) {
      console.error(error);
      toast.error("AI提案の生成に失敗しました");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const { targets, evalData, metrics } = data || {};

  // Construct radar data from metrics
  // Map internal metrics to Radar metrics conceptually
  const radarData = [
    { label: "売上", value: metrics?.[1]?.score || 0, max: 100 },
    { label: "集客", value: metrics?.[0]?.score || 0, max: 100 },
    { label: "新規", value: metrics?.[3]?.score || 0, max: 100 },
    { label: "口コミ", value: evalData?.google_review_count ? Math.min((evalData.google_review_count / (targets?.target_patients * 0.1 || 1)) * 100, 100) : 0, max: 100 },
    { label: "SNS", value: metrics?.[2]?.score || 0, max: 100 },
    { label: "自己評価", value: evalData?.self_evaluation ? 90 : 30, max: 100 },
  ];

  const totalScore = Math.round(radarData.reduce((acc, curr) => acc + curr.value, 0) / radarData.length);

  // Icon mapping helper
  const renderIcon = (index: number) => {
    if (index === 0) return <Users className="w-5 h-5 text-blue-600" />;
    if (index === 1) return <TrendingUp className="w-5 h-5 text-emerald-600" />;
    if (index === 2) return <MessageSquare className="w-5 h-5 text-rose-600" />;
    if (index === 3) return <Target className="w-5 h-5 text-amber-600" />;
    return <Award className="w-5 h-5" />;
  };

  const getMetricColor = (index: number) => {
    if (index === 0) return "text-blue-600";
    if (index === 1) return "text-emerald-600";
    if (index === 2) return "text-rose-600";
    if (index === 3) return "text-amber-600";
    return "";
  };

  const getMetricBg = (index: number) => {
    if (index === 0) return "bg-blue-500";
    if (index === 1) return "bg-emerald-500";
    if (index === 2) return "bg-rose-500";
    if (index === 3) return "bg-amber-500";
    return "bg-slate-500";
  };


  return (
    <div className="space-y-8 animate-in fade-in pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 border-l-4 border-emerald-600 pl-3">
            月間経営評価レポート
          </h1>
          <p className="text-muted-foreground mt-2">
            視覚的分析によるクリニックの健康診断
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select 
            className="bg-white border rounded-md px-3 py-2 text-sm"
            value={`${activeYear}-${activeMonth}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-');
              setActiveYear(parseInt(y));
              setActiveMonth(parseInt(m));
            }}
          >
            {monthOptions.map(opt => (
              <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                {opt.year}年{opt.month}月
              </option>
            ))}
          </select>
          
          <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
            <DialogTrigger>
              <Button variant="outline" type="button"><Star className="w-4 h-4 mr-2" />手動指標・目標の編集</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{activeMonth}月の目標・評価設定</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSaveMetrics} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>来院数目標</Label>
                    <Input type="number" name="target_patients" defaultValue={targets?.target_patients} />
                  </div>
                  <div className="space-y-2">
                    <Label>売上目標 (円)</Label>
                    <Input type="number" name="target_income" defaultValue={targets?.target_income} />
                  </div>
                  <div className="space-y-2">
                    <Label>SNSタスク目標 (件)</Label>
                    <Input type="number" name="target_sns_tasks" defaultValue={targets?.target_sns_tasks} />
                  </div>
                  <div className="space-y-2">
                    <Label>新規患者目標</Label>
                    <Input type="number" name="target_new_patients" defaultValue={targets?.target_new_patients} />
                  </div>
                  <div className="space-y-2">
                    <Label>Google口コミ数 (月間)</Label>
                    <Input type="number" name="google_review_count" defaultValue={evalData?.google_review_count} />
                  </div>
                  <div className="space-y-2">
                    <Label>Google平均評価</Label>
                    <Input type="number" step="0.1" name="google_rating" defaultValue={evalData?.google_rating} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>自己評価・振り返りコメント</Label>
                  <textarea 
                    name="self_evaluation" 
                    defaultValue={evalData?.self_evaluation} 
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">保存する</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* --- Left: Score Cards --- */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Main Score & Radar */}
          <Card className="shadow-lg border-emerald-100 overflow-hidden bg-gradient-to-br from-white to-emerald-50/30">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="p-8 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-emerald-100">
                <span className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Total Monthly Score</span>
                <div className="relative flex items-center justify-center">
                  <svg className="w-48 h-48">
                    <circle cx="96" cy="96" r="88" fill="none" stroke="#f1f5f9" strokeWidth="12" />
                    <circle 
                      cx="96" cy="96" r="88" fill="none" stroke={totalScore >= 80 ? "#10b981" : totalScore >= 60 ? "#f59e0b" : "#ef4444"}
                      strokeWidth="12" strokeDasharray={2 * Math.PI * 88} 
                      strokeDashoffset={2 * Math.PI * 88 * (1 - totalScore/100)}
                      strokeLinecap="round"
                      className="transition-all duration-1000 ease-out rotate-[-90deg] origin-center"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-6xl font-black text-slate-900 leading-none">{totalScore}</span>
                    <span className="text-xl font-bold text-slate-500 mt-2">/ 100点</span>
                  </div>
                </div>
                <div className="mt-6 flex items-center gap-2 text-emerald-600 font-bold">
                  <Award className="w-5 h-5" />
                  <span>{totalScore >= 80 ? "Excellent Progress" : totalScore >= 60 ? "Good" : "Needs Improvement"}</span>
                </div>
              </div>

              <div className="p-8 h-full flex items-center justify-center min-h-[400px]">
                <RadarChart data={radarData} />
              </div>
            </div>
          </Card>

          {/* Individual Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(metrics || []).map((m: any, i: number) => (
              <Card key={i} className="shadow-sm border-slate-200">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div className="flex gap-3 items-center">
                      <div className={`p-2 rounded-lg bg-slate-50 ${getMetricColor(i)}`}>
                        {renderIcon(i)}
                      </div>
                      <span className="font-bold text-slate-700">{m.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-black text-slate-900">{m.score}%</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                      <span>実数: {m.actual.toLocaleString()} {m.unit}</span>
                      <span>目標: {m.target.toLocaleString()} {m.unit}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-1000 ${getMetricBg(i)}`} 
                        style={{ width: `${m.score}%` }}
                      ></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* --- Right: Reports & Actions --- */}
        <div className="space-y-6">
          <Card className="shadow-md border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-900 text-white pb-6">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                  Google 口コミ評価
                </CardTitle>
                <ArrowUpRight className="w-5 h-5 text-emerald-400" />
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4 mb-6">
                <h2 className="text-5xl font-black text-slate-900 tracking-tighter">{evalData?.google_rating || "0.0"}</h2>
                <div className="space-y-1">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(s => <Star key={s} className={`w-4 h-4 ${s <= (evalData?.google_rating || 0) ? "text-amber-400 fill-amber-400" : "text-slate-300"}`} />)}
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase">{evalData?.google_review_count || 0} NEW REVIEWS THIS MONTH</p>
                </div>
              </div>
              <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl text-xs font-medium border border-emerald-100">
                口コミ数は「手動入力」から更新できます。
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100 mb-4 bg-slate-50">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-600" />
                  AI Strategy Plan
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg border-l-4 border-emerald-500 whitespace-pre-wrap text-sm text-slate-700">
                {evalData?.ai_suggestions ? (
                  evalData.ai_suggestions
                ) : (
                  <p className="text-slate-500 italic">まだAI提案が生成されていません。</p>
                )}
              </div>
              
              <Button 
                onClick={handleGenerateAi}
                disabled={isGeneratingAi}
                className="w-full bg-slate-900 hover:bg-slate-800 mt-2"
              >
                {isGeneratingAi && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {evalData?.ai_suggestions ? "AI提案を再生成する" : "AIに戦略を提案させる"}
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">自己評価コメント (自動保存有)</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveMetrics}>
                {/* 隠しフィールド */}
                <input type="hidden" name="target_patients" value={targets?.target_patients || 0} />
                <input type="hidden" name="target_income" value={targets?.target_income || 0} />
                <input type="hidden" name="target_sns_tasks" value={targets?.target_sns_tasks || 0} />
                <input type="hidden" name="target_new_patients" value={targets?.target_new_patients || 0} />
                <input type="hidden" name="google_review_count" value={evalData?.google_review_count || 0} />
                <input type="hidden" name="google_rating" value={evalData?.google_rating || 0} />
                
                <textarea 
                  name="self_evaluation"
                  className="w-full min-h-[100px] p-3 text-xs border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-slate-50 mb-2"
                  placeholder="院長としての振り返りを記入..."
                  defaultValue={evalData?.self_evaluation}
                />
                <Button size="sm" type="submit" variant="secondary" className="w-full"><Save className="w-4 h-4 mr-2"/>自己評価を保存</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
