"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronLeft, Send, Users, Loader2, MessageCircleMore, AlertTriangle, History, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  previewLineCampaign,
  sendLineCampaign,
  getLineCampaignHistory,
  getLineCampaignCities,
  type LineCampaignHistoryRow,
} from "@/app/actions/line-campaign";
import {
  LINE_CAMPAIGN_PRESETS,
  type LineCampaignFilters,
  type LineCampaignPreview,
} from "@/types/line-campaign";

const EMPTY_FILTERS: LineCampaignFilters = {
  minDaysSinceVisit: null,
  maxDaysSinceVisit: null,
  minVisitCount: null,
  neverVisitedOnly: false,
  excludeWithUpcoming: true,
  gender: null,
  city: null,
  birthMonth: null,
};

function numOrNull(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export default function LineMessagePage() {
  const [filters, setFilters] = useState<LineCampaignFilters>(EMPTY_FILTERS);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<LineCampaignPreview | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [history, setHistory] = useState<LineCampaignHistoryRow[]>([]);
  const [isChecking, startChecking] = useTransition();
  const [isSending, startSending] = useTransition();

  useEffect(() => {
    getLineCampaignCities().then(setCities).catch(() => {});
    getLineCampaignHistory().then((r) => { if (r.success && r.rows) setHistory(r.rows); }).catch(() => {});
  }, []);

  // 条件を変えたら、前の対象者リストは無効にする（古い人数のまま送らせない）
  const patchFilters = (patch: Partial<LineCampaignFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPreview(null);
  };

  const handleCheck = () => {
    startChecking(async () => {
      const res = await previewLineCampaign(filters);
      if (res.success && res.preview) {
        setPreview(res.preview);
        if (res.preview.total === 0) toast.info("条件に合う方はいませんでした");
      } else {
        toast.error(res.error ?? "対象者の取得に失敗しました");
      }
    });
  };

  const handleSend = () => {
    if (!preview) { toast.error("先に「対象者を確認」を押してください"); return; }
    if (preview.total === 0) { toast.error("条件に合う配信先がいません"); return; }
    if (!message.trim()) { toast.error("文面を入力してください"); return; }
    const ok = confirm(
      `${preview.total}名にLINEを送ります。よろしいですか？\n\n`
      + `【文面】\n${message.slice(0, 200)}${message.length > 200 ? "…" : ""}\n\n`
      + `送信後は取り消せません。`,
    );
    if (!ok) return;
    startSending(async () => {
      const res = await sendLineCampaign({ title, message, filters });
      if (res.success) {
        toast.success(`${res.sent}件を送信しました${res.failed ? `（失敗 ${res.failed}件）` : ""}`);
        setPreview(null);
        const h = await getLineCampaignHistory();
        if (h.success && h.rows) setHistory(h.rows);
      } else {
        toast.error(res.error ?? "配信に失敗しました");
      }
    });
  };

  const previewText = message.replaceAll("{name}", "山田 太郎");

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <Link href="/admin/marketing" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-2">
          <ChevronLeft className="w-4 h-4" /> 集客ツールへ戻る
        </Link>
        <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <MessageCircleMore className="w-6 h-6 text-green-600" />
          LINEでお知らせ
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          条件で対象者をしぼって、自分で書いた文面を送れます。
          <br />
          送る前に必ず「対象者を確認」で人数とお名前を見てください。
        </p>
      </div>

      {/* 1. 条件 */}
      <section className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/10 p-5 space-y-4">
        <h2 className="font-black text-slate-800 dark:text-slate-100">1. 誰に送るか</h2>

        <div className="flex flex-wrap gap-2">
          {LINE_CAMPAIGN_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => { setFilters({ ...EMPTY_FILTERS, ...p.filters }); setPreview(null); }}
              title={p.description}
              className="px-3 py-2 rounded-xl text-sm font-bold border border-indigo-200 dark:border-indigo-700/50 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">最終来院から◯日以上あいている</Label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="例: 60"
              value={filters.minDaysSinceVisit ?? ""}
              onChange={(e) => patchFilters({ minDaysSinceVisit: numOrNull(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">◯日以内（上限。空欄なら制限なし）</Label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="例: 120"
              value={filters.maxDaysSinceVisit ?? ""}
              onChange={(e) => patchFilters({ maxDaysSinceVisit: numOrNull(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">来院回数がこの回数以上</Label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="例: 10"
              value={filters.minVisitCount ?? ""}
              onChange={(e) => patchFilters({ minVisitCount: numOrNull(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">お住まい</Label>
            <select
              value={filters.city ?? ""}
              onChange={(e) => patchFilters({ city: e.target.value || null })}
              className="w-full h-10 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">指定なし</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">性別</Label>
            <select
              value={filters.gender ?? ""}
              onChange={(e) => patchFilters({ gender: e.target.value || null })}
              className="w-full h-10 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">指定なし</option>
              <option value="female">女性</option>
              <option value="male">男性</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">誕生月</Label>
            <select
              value={filters.birthMonth ?? ""}
              onChange={(e) => patchFilters({ birthMonth: numOrNull(e.target.value) })}
              className="w-full h-10 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">指定なし</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}月</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={!!filters.excludeWithUpcoming}
              onChange={(e) => patchFilters({ excludeWithUpcoming: e.target.checked })}
              className="w-4 h-4"
            />
            次回予約が入っている方は除く
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={!!filters.neverVisitedOnly}
              onChange={(e) => patchFilters({ neverVisitedOnly: e.target.checked })}
              className="w-4 h-4"
            />
            一度も来院していない方だけ
          </label>
        </div>

        <Button onClick={handleCheck} disabled={isChecking} className="gap-2">
          {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          対象者を確認
        </Button>

        {preview && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20 p-4">
            <p className="font-black text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <Users className="w-4 h-4" />
              LINEが届くのは {preview.total} 名
            </p>
            {preview.noLineCount > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                条件には合うが LINE未連携で届かない方が {preview.noLineCount} 名います
              </p>
            )}
            {preview.targets.length > 0 && (
              <div className="mt-2 max-h-52 overflow-y-auto text-sm divide-y divide-emerald-100 dark:divide-emerald-900/40">
                {preview.targets.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 py-1">
                    <span className="font-medium text-slate-800 dark:text-slate-100 truncate">{t.name}</span>
                    <span className="text-xs text-slate-500 shrink-0">
                      {t.lastVisitDate ? `最終来院 ${t.lastVisitDate}（${t.daysSinceLastVisit}日前）` : "来院履歴なし"}・計{t.visitCount}回
                    </span>
                  </div>
                ))}
              </div>
            )}
            {preview.total > preview.targets.length && (
              <p className="text-xs text-slate-500 mt-1">※一覧は先頭{preview.targets.length}名まで表示しています</p>
            )}
          </div>
        )}
      </section>

      {/* 2. 文面 */}
      <section className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/10 p-5 space-y-4">
        <h2 className="font-black text-slate-800 dark:text-slate-100">2. 何を送るか</h2>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">タイトル（あとで見返す用・患者さんには届きません）</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 8月ごぶさたの方へのお声かけ" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
            文面（{"{name}"} と書くとお名前が入ります）
          </Label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            maxLength={900}
            placeholder={"{name}様\n\nお変わりありませんか？\nしばらくご来院がないようですので、お体の調子が気になりご連絡しました。\n\nご予約はこちらから承っております。"}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm leading-relaxed outline-none focus:border-indigo-400"
          />
          <p className="text-xs text-slate-500 text-right">{message.length} / 900文字</p>
        </div>

        {message.trim() && (
          <div className="rounded-xl bg-[#7da4cd] p-4">
            <p className="text-[11px] text-white/80 mb-2">届く見た目</p>
            <div className="bg-white rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-sm text-sm text-slate-800 whitespace-pre-wrap leading-relaxed shadow">
              {previewText}
            </div>
          </div>
        )}
      </section>

      {/* 3. 送信 */}
      <section className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/10 p-5 space-y-3">
        <h2 className="font-black text-slate-800 dark:text-slate-100">3. 送る</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          送信後は取り消せません。人数と文面をもう一度ご確認ください。
        </p>
        <Button
          onClick={handleSend}
          disabled={isSending || !preview || preview.total === 0 || !message.trim()}
          className="gap-2 bg-green-600 hover:bg-green-700"
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {preview ? `${preview.total}名に送信する` : "先に対象者を確認してください"}
        </Button>
      </section>

      {/* 履歴 */}
      {history.length > 0 && (
        <section className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/10 p-5">
          <h2 className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-3">
            <History className="w-4 h-4" /> 送信履歴
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.map((h) => (
              <div key={h.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{h.title}</span>
                  <span className="text-xs text-slate-500 shrink-0">
                    {new Date(h.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  送信 {h.sentCount}件{h.failedCount > 0 ? ` / 失敗 ${h.failedCount}件` : ""}（対象 {h.targetCount}名）
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 whitespace-pre-wrap">{h.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
