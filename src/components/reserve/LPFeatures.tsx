"use client";

import { Sparkles, Activity, Heart, Award, ShieldCheck, Smile, Zap, Stethoscope, AlertCircle } from "lucide-react";
import type { LPFeature, ThemeColor } from "@/app/actions/publicSettings";
import { getThemeClasses } from "@/lib/lp-theme";

interface Props {
  features: LPFeature[] | null;
  problems: string[] | null;
  themeColor: ThemeColor;
}

const ICON_MAP = {
  sparkles: Sparkles,
  activity: Activity,
  heart: Heart,
  award: Award,
  shield: ShieldCheck,
  smile: Smile,
  zap: Zap,
  stethoscope: Stethoscope,
} as const;

function resolveIcon(name?: string) {
  if (!name) return Sparkles;
  return ICON_MAP[name as keyof typeof ICON_MAP] ?? Sparkles;
}

export default function LPFeatures({ features, problems, themeColor }: Props) {
  const theme = getThemeClasses(themeColor);
  const hasProblems = problems && problems.length > 0;
  const hasFeatures = features && features.length > 0;

  if (!hasProblems && !hasFeatures) return null;

  return (
    <div className="max-w-3xl mx-auto px-5 py-8 space-y-8">
      {/* お悩みリスト */}
      {hasProblems && (
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/40 mb-3">
            こんなお悩みありませんか？
          </h2>
          <div className="space-y-2">
            {problems!.map((p, i) => (
              <div
                key={i}
                className={`flex items-start gap-2.5 ${theme.accentBgSoft} ${theme.accentBorderSoft} border rounded-xl p-3.5`}
              >
                <AlertCircle className={`w-4 h-4 ${theme.accentText} shrink-0 mt-0.5`} />
                <p className="text-sm text-white/90 leading-relaxed font-bold">{p}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 強み */}
      {hasFeatures && (
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/40 mb-3">
            当院の強み
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {features!.map((f, i) => {
              const Icon = resolveIcon(f.icon);
              return (
                <div
                  key={i}
                  className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl ${theme.accentBgSoft} ${theme.accentBorderSoft} border flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 ${theme.accentText}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-black text-white leading-tight">{f.title}</h3>
                      {f.description && (
                        <p className="text-xs text-white/60 mt-1.5 leading-relaxed">
                          {f.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
