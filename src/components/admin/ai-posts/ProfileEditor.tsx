"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Save, Building2 } from "lucide-react";
import { toast } from "sonner";
import type { MarketingProfile } from "@/lib/ai-marketing";
import { getMarketingProfile, saveMarketingProfile } from "@/app/actions/ai-marketing";

const toLines = (arr: string[]) => (arr || []).join("\n");
const fromLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
};

/** 院ごとのAI投稿プロファイル編集。将来の他院横展開のための設定。 */
export default function ProfileEditor({ open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [p, setP] = useState<MarketingProfile | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getMarketingProfile()
      .then(setP)
      .finally(() => setLoading(false));
  }, [open]);

  function set<K extends keyof MarketingProfile>(key: K, value: MarketingProfile[K]) {
    setP((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!p) return;
    setSaving(true);
    try {
      const res = await saveMarketingProfile(p);
      if (!res.success) { toast.error(res.error || "保存に失敗しました"); return; }
      toast.success("院設定を保存しました");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Building2 className="w-4 h-4 text-blue-600" /> 院の設定（AIに渡す情報）
          </DialogTitle>
          <DialogDescription>
            ここで設定した内容をもとにAIが文章を作成します。他院でも、この設定を変えるだけで使えます。
          </DialogDescription>
        </DialogHeader>

        {loading || !p ? (
          <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="院名"><Input value={p.clinic_name} onChange={(e) => set("clinic_name", e.target.value)} /></Field>
              <Field label="地域名（例：藍住）"><Input value={p.area_name} onChange={(e) => set("area_name", e.target.value)} /></Field>
            </div>
            <Field label="住所"><Input value={p.address} onChange={(e) => set("address", e.target.value)} /></Field>

            <Field label="強み（1行に1つ）">
              <Textarea value={toLines(p.strengths)} onChange={(e) => set("strengths", fromLines(e.target.value))} rows={4} />
            </Field>
            <Field label="メニュー（1行に1つ）">
              <Textarea value={toLines(p.menus)} onChange={(e) => set("menus", fromLines(e.target.value))} rows={3} />
            </Field>
            <Field label="ターゲット（1行に1つ）">
              <Textarea value={toLines(p.targets)} onChange={(e) => set("targets", fromLines(e.target.value))} rows={3} />
            </Field>
            <Field label="文章の雰囲気">
              <Textarea value={p.tone} onChange={(e) => set("tone", e.target.value)} rows={2} />
            </Field>
            <Field label="禁止表現（1行に1つ。既定の断定表現は自動でも防ぎます）">
              <Textarea value={toLines(p.banned_phrases)} onChange={(e) => set("banned_phrases", fromLines(e.target.value))} rows={3} />
            </Field>
            <Field label="推奨キーワード（1行に1つ）">
              <Textarea value={toLines(p.recommended_keywords)} onChange={(e) => set("recommended_keywords", fromLines(e.target.value))} rows={3} />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="予約URL"><Input value={p.reserve_url} onChange={(e) => set("reserve_url", e.target.value)} placeholder="https://..." /></Field>
              <Field label="LINE導線（URLや案内文）"><Input value={p.line_link} onChange={(e) => set("line_link", e.target.value)} /></Field>
            </div>
            <Field label="Instagramアカウント">
              <Input
                value={p.sns_accounts.instagram || ""}
                onChange={(e) => set("sns_accounts", { ...p.sns_accounts, instagram: e.target.value })}
                placeholder="@account など"
              />
            </Field>

            <div className="flex justify-end pt-2 border-t">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                保存
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-600">{label}</Label>
      {children}
    </div>
  );
}
