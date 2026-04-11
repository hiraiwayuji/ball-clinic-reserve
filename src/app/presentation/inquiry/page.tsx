"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Building2, 
  User, 
  Phone, 
  Mail, 
  Send, 
  CheckCircle2, 
  ArrowRight,
  MessageCircle,
  Gift,
  ArrowLeft,
  Sparkles
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export default function InquiryPage() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  
  const [formData, setFormData] = useState({
    clinic_name: "",
    representative_name: "",
    contact_info: ""
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleNext = () => {
    if (step === 1 && !formData.clinic_name) {
      toast.error("院名を入力してください");
      return;
    }
    if (step === 2 && !formData.representative_name) {
      toast.error("担当者名を入力してください");
      return;
    }
    setStep(prev => prev + 1);
  };

  const handleSubmit = async () => {
    if (!formData.contact_info) {
      toast.error("連絡先を入力してください");
      return;
    }

    try {
      setSubmitting(true);
      const supabase = createClient();
      const { error } = await supabase.from("demo_inquiries").insert([formData]);
      
      if (error) throw error;
      
      setCompleted(true);
      toast.success("お問い合わせを送信しました！");
    } catch (error: any) {
      console.error("Inquiry error full object:", error);
      const errorMsg = error.message || "予期せぬエラーが発生しました";
      console.error("Detailed error message:", errorMsg);
      toast.error(`送信に失敗しました: ${errorMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (completed) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-2xl border-none ring-1 ring-slate-200 dark:ring-slate-800 dark:bg-slate-900/60 backdrop-blur-md overflow-hidden animate-in zoom-in duration-500">
          <CardHeader className="bg-gradient-to-br from-indigo-600 to-violet-700 text-white text-center py-10">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <CardTitle className="text-2xl font-black">送信完了しました！</CardTitle>
            <CardDescription className="text-indigo-100 font-medium">お問い合わせありがとうございます。</CardDescription>
          </CardHeader>
          <CardContent className="p-8 space-y-8 text-center">
            <div className="space-y-4">
               <div className="inline-block p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-900/30">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-black mb-2 justify-center">
                    <Gift className="w-5 h-5" />
                    <span>LINE限定特典プレゼント</span>
                  </div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300 leading-relaxed">
                    今すぐ公式LINEにご登録＆連携いただくと、<br />
                    <span className="text-rose-600 dark:text-rose-400 text-lg">500円分のクーポン</span> をプレゼント中！
                  </p>
               </div>
            </div>

            <Button className="w-full h-16 bg-[#06C755] hover:bg-[#05b34c] text-white rounded-2xl font-black text-lg shadow-xl shadow-[#06C755]/20 group transition-all" asChild>
              <a href="https://line.me/ti/p/%40shc8761q" target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-6 h-6 mr-2" />
                LINEでお得に登録・相談する
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
            
            <p className="text-[10px] text-slate-400 font-medium">
              ※LINE登録は任意です。ご入力いただいた情報は正常に送信されました。
            </p>

            <Link href="/" className="inline-block text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors">
              トップページに戻る
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-500">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 -z-10 w-[500px] h-[500px] bg-indigo-600/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-0 left-0 -z-10 w-[400px] h-[400px] bg-violet-600/10 blur-[100px] rounded-full" />

      <Card className="max-w-lg w-full shadow-2xl border-none ring-1 ring-slate-200 dark:ring-slate-800 dark:bg-white/80 dark:bg-slate-900/60 backdrop-blur-md overflow-hidden">
        <CardHeader className="text-center space-y-4 py-8 border-b dark:border-slate-800">
           <div className="flex items-center justify-center gap-2 mb-2">
             <div className="p-2 bg-violet-600 rounded-xl">
               <Sparkles className="w-5 h-5 text-white" />
             </div>
             <span className="font-black text-violet-600 uppercase tracking-widest text-sm">V-ARC Demo Application</span>
           </div>
           <div>
             <CardTitle className="text-3xl font-black text-slate-900 dark:text-white">導入相談・デモ予約</CardTitle>
             <CardDescription className="font-medium text-slate-500 mt-2">接骨院経営をAI秘書でもっとスマートに。まずはご相談ください。</CardDescription>
           </div>
           
           {/* Progress bar */}
           <div className="flex gap-2 max-w-[200px] mx-auto pt-2">
             {[1, 2, 3].map((s) => (
               <div key={s} className={cn(
                 "h-1.5 flex-1 rounded-full transition-all duration-500",
                 step >= s ? "bg-violet-600" : "bg-slate-200 dark:bg-slate-800"
               )} />
             ))}
           </div>
        </CardHeader>

        <CardContent className="p-8 pt-10">
          <div className="space-y-8 animate-in fade-in duration-500">
            {step === 1 && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="clinic_name" className="text-sm font-black text-slate-700 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wider">
                    <Building2 className="w-4 h-4 text-violet-500" /> 院名 / 屋号
                  </Label>
                  <Input 
                    id="clinic_name"
                    name="clinic_name"
                    placeholder="例：ボール接骨院" 
                    value={formData.clinic_name}
                    onChange={handleChange}
                    className="h-14 rounded-xl border-2 focus-visible:ring-violet-500 bg-white/50 dark:bg-slate-800/50 font-bold"
                  />
                </div>
                <Button className="w-full h-14 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black text-lg transition-all" onClick={handleNext}>
                  次へ進む
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="representative_name" className="text-sm font-black text-slate-700 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wider">
                    <User className="w-4 h-4 text-violet-500" /> ご担当者名
                  </Label>
                  <Input 
                    id="representative_name"
                    name="representative_name"
                    placeholder="例：平岩 太郎" 
                    value={formData.representative_name}
                    onChange={handleChange}
                    className="h-14 rounded-xl border-2 focus-visible:ring-violet-500 bg-white/50 dark:bg-slate-800/50 font-bold"
                  />
                </div>
                <div className="flex gap-4">
                  <Button variant="outline" className="h-14 w-20 rounded-xl border-2" onClick={() => setStep(1)}>
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <Button className="flex-1 h-14 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black text-lg transition-all" onClick={handleNext}>
                    次へ進む
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="contact_info" className="text-sm font-black text-slate-700 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wider">
                    <Phone className="w-4 h-4 text-violet-500" /> ご連絡先 (電話番号 / メールアドレス)
                  </Label>
                  <Input 
                    id="contact_info"
                    name="contact_info"
                    placeholder="例：090-0000-0000" 
                    value={formData.contact_info}
                    onChange={handleChange}
                    className="h-14 rounded-xl border-2 focus-visible:ring-violet-500 bg-white/50 dark:bg-slate-800/50 font-bold"
                  />
                </div>
                <div className="flex gap-4">
                  <Button variant="outline" className="h-14 w-20 rounded-xl border-2" onClick={() => setStep(2)} disabled={submitting}>
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <Button 
                    className="flex-1 h-14 bg-slate-900 dark:bg-violet-600 hover:scale-[1.02] text-white rounded-xl font-black text-lg transition-all flex items-center justify-center gap-2" 
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        送信中...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        この内容で送信する
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-12 pt-6 border-t dark:border-slate-800 text-center">
             <Link href="/presentation">
                <Button variant="ghost" className="text-[10px] md:text-xs font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest">
                  キャンセルしてプレゼン資料へ戻る
                </Button>
             </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
