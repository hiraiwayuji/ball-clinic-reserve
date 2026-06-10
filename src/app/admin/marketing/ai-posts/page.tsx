"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, History, Settings2, Lightbulb, BarChart3 } from "lucide-react";
import AiPostStudio, { type PrefillData } from "@/components/admin/ai-posts/AiPostStudio";
import PostHistory from "@/components/admin/ai-posts/PostHistory";
import ProfileEditor from "@/components/admin/ai-posts/ProfileEditor";
import IdeasCalendar from "@/components/admin/ai-posts/IdeasCalendar";
import ReportDashboard from "@/components/admin/ai-posts/ReportDashboard";

type Tab = "create" | "ideas" | "history" | "report";

export default function AiPostsPage() {
  const [tab, setTab] = useState<Tab>("create");
  const [profileOpen, setProfileOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [prefill, setPrefill] = useState<PrefillData | null>(null);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            AI集客投稿アシスタント
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            投稿のもとになる情報を入れると、各SNS向けの文章をまとめて作成します。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setProfileOpen(true)}>
          <Settings2 className="w-4 h-4" /> 院の設定
        </Button>
      </div>

      {/* タブ */}
      <div className="flex gap-1 border-b border-slate-200">
        <TabButton active={tab === "create"} onClick={() => setTab("create")} icon={<Sparkles className="w-4 h-4" />}>
          AI投稿作成
        </TabButton>
        <TabButton active={tab === "ideas"} onClick={() => setTab("ideas")} icon={<Lightbulb className="w-4 h-4" />}>
          ネタ・カレンダー
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")} icon={<History className="w-4 h-4" />}>
          投稿履歴
        </TabButton>
        <TabButton active={tab === "report"} onClick={() => setTab("report")} icon={<BarChart3 className="w-4 h-4" />}>
          効果
        </TabButton>
      </div>

      {tab === "create" && (
        <AiPostStudio
          prefill={prefill}
          onSaved={() => {
            setRefreshKey((k) => k + 1);
            setTab("history");
          }}
        />
      )}
      {tab === "ideas" && (
        <IdeasCalendar
          refreshKey={refreshKey}
          onUseIdea={(pf) => {
            setPrefill(pf);
            setTab("create");
          }}
        />
      )}
      {tab === "history" && <PostHistory refreshKey={refreshKey} />}
      {tab === "report" && <ReportDashboard refreshKey={refreshKey} />}

      <ProfileEditor open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-blue-700 border-b-2 border-blue-600 -mb-px"
          : "flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"
      }
    >
      {icon}
      {children}
    </button>
  );
}
