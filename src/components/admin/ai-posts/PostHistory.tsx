"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Search, Trash2, Instagram, MapPin, MessageCircle, FileText, Images, Eye, Paperclip, BarChart3, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import CopyButton from "./CopyButton";
import OpenInstagramButton from "./OpenInstagramButton";
import { ImagePackCard, ReelPackCard, AiImagePackCard, StoryExtrasCard } from "./PackCards";
import {
  POST_CATEGORIES,
  OUTPUT_CHANNELS,
  STATUS_LABELS,
  blogToPlainText,
  storyToPlainText,
  type SavedPost,
  type PostStatus,
  type OutputChannel,
  type PostMetrics,
} from "@/lib/ai-marketing";
import {
  listMarketingPosts,
  updateMarketingPostStatus,
  updateMarketingPostMemo,
  updateMarketingPostDates,
  updateMarketingPostMetrics,
  deleteMarketingPost,
  getLineBroadcastInfo,
  broadcastPostLineText,
  type ListFilters,
} from "@/app/actions/ai-marketing";

const ALL = "__all__";

const STATUS_BADGE: Record<PostStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  reviewed: "bg-blue-100 text-blue-700",
  posted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
};

type Props = { refreshKey?: number };

export default function PostHistory({ refreshKey }: Props) {
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SavedPost | null>(null);

  // フィルタ
  const [fCategory, setFCategory] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);
  const [fChannel, setFChannel] = useState(ALL);
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fKeyword, setFKeyword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters: ListFilters = {};
      if (fCategory !== ALL) filters.category = fCategory;
      if (fStatus !== ALL) filters.status = fStatus as PostStatus;
      if (fChannel !== ALL) filters.channel = fChannel as OutputChannel;
      if (fFrom) filters.dateFrom = fFrom;
      if (fTo) filters.dateTo = fTo;
      if (fKeyword.trim()) filters.keyword = fKeyword.trim();
      setPosts(await listMarketingPosts(filters));
    } finally {
      setLoading(false);
    }
  }, [fCategory, fStatus, fChannel, fFrom, fTo, fKeyword]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function handleStatus(id: string, status: PostStatus) {
    const res = await updateMarketingPostStatus(id, status);
    if (!res.success) { toast.error(res.error || "更新に失敗しました"); return; }
    setPosts((p) => p.map((x) => (x.id === id ? { ...x, status } : x)));
    setDetail((d) => (d && d.id === id ? { ...d, status } : d));
    toast.success("ステータスを更新しました");
  }

  async function handleDelete(id: string) {
    if (!confirm("この投稿案を削除しますか？")) return;
    const res = await deleteMarketingPost(id);
    if (!res.success) { toast.error(res.error || "削除に失敗しました"); return; }
    setPosts((p) => p.filter((x) => x.id !== id));
    setDetail((d) => (d && d.id === id ? null : d));
    toast.success("削除しました");
  }

  function resetFilters() {
    setFCategory(ALL); setFStatus(ALL); setFChannel(ALL); setFFrom(""); setFTo(""); setFKeyword("");
  }

  return (
    <div className="space-y-4">
      {/* 絞り込み */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">カテゴリ</Label>
              <Select value={fCategory} onValueChange={(v) => setFCategory(v ?? ALL)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>すべて</SelectItem>
                  {POST_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ステータス</Label>
              <Select value={fStatus} onValueChange={(v) => setFStatus(v ?? ALL)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>すべて</SelectItem>
                  {(Object.keys(STATUS_LABELS) as PostStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">投稿媒体</Label>
              <Select value={fChannel} onValueChange={(v) => setFChannel(v ?? ALL)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>すべて</SelectItem>
                  {OUTPUT_CHANNELS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">日付（から）</Label>
              <Input type="date" className="h-8" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">日付（まで）</Label>
              <Input type="date" className="h-8" value={fTo} onChange={(e) => setFTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">キーワード</Label>
              <Input className="h-8" placeholder="本文・テーマを検索" value={fKeyword} onChange={(e) => setFKeyword(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              絞り込む
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { resetFilters(); }}>クリア</Button>
          </div>
        </CardContent>
      </Card>

      {/* 一覧 */}
      {loading ? (
        <div className="py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
      ) : posts.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-sm">投稿案がありません。「AI投稿作成」から作ってみましょう。</div>
      ) : (
        <div className="space-y-2">
          {posts.map((p) => (
            <Card key={p.id} className="hover:border-blue-200 transition-colors">
              <CardContent className="py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{p.category}</Badge>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                    {p.scheduled_date && !p.posted_date && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        予定 {new Date(`${p.scheduled_date}T00:00:00`).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
                      </span>
                    )}
                    {p.line_sent_at && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        LINE配信済み
                      </span>
                    )}
                    {p.audience && <span className="text-xs text-slate-400">{p.audience}</span>}
                  </div>
                  <div className="text-sm text-slate-700 truncate mt-1">
                    {p.theme || p.message || p.blog?.seo_title || "（テーマ未設定）"}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {new Date(p.created_at).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setDetail(p)}>
                  <Eye className="w-3.5 h-3.5" /> 詳細
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 詳細確認 */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Badge variant="outline">{detail.category}</Badge>
                  <span className="text-sm font-normal text-slate-500">
                    {new Date(detail.created_at).toLocaleDateString("ja-JP")}
                  </span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* ステータス変更 */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-slate-500">ステータス</Label>
                  <Select value={detail.status} onValueChange={(v) => v && handleStatus(detail.id, v as PostStatus)}>
                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABELS) as PostStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {detail.instagram_text && (
                  <div className="space-y-2">
                    <DetailBlock icon={<Instagram className="w-4 h-4 text-pink-600" />} title="Instagram投稿文" text={detail.instagram_text} />
                    <OpenInstagramButton text={detail.instagram_text} />
                  </div>
                )}
                {detail.story_slides?.some(Boolean) && (
                  <DetailBlock icon={<Images className="w-4 h-4 text-purple-600" />} title="ストーリー文" text={storyToPlainText(detail.story_slides)} />
                )}
                {detail.google_text && (
                  <DetailBlock icon={<MapPin className="w-4 h-4 text-green-600" />} title="Googleビジネス文" text={detail.google_text} />
                )}
                {detail.line_text && (
                  <div className="space-y-2">
                    <DetailBlock icon={<MessageCircle className="w-4 h-4 text-emerald-600" />} title="LINE配信文" text={detail.line_text} />
                    <LineBroadcastSection
                      post={detail}
                      onSent={(sentAt, count) => {
                        setDetail((d) => (d ? { ...d, line_sent_at: sentAt, line_sent_count: count } : d));
                        setPosts((p) => p.map((x) => (x.id === detail.id ? { ...x, line_sent_at: sentAt, line_sent_count: count } : x)));
                      }}
                    />
                  </div>
                )}
                {detail.blog?.body && (
                  <DetailBlock icon={<FileText className="w-4 h-4 text-orange-600" />} title="ブログ案" text={blogToPlainText(detail.blog)} />
                )}

                {/* 素材プレビュー */}
                {detail.materials?.length > 0 && (
                  <div className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium mb-2">
                      <Paperclip className="w-4 h-4 text-slate-500" /> 素材（{detail.materials.length}点）
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {detail.materials.map((m, i) => (
                        <a key={i} href={m.url} target="_blank" rel="noreferrer" className="block">
                          {m.category === "video" ? (
                            <video src={m.url} className="w-full h-20 object-cover rounded bg-black" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.url} alt={m.name} className="w-full h-20 object-cover rounded bg-slate-100" />
                          )}
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">{m.kind}{m.memo ? `・${m.memo}` : ""}</div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* 画像・リール・AI画像パック */}
                {detail.story_extras && <StoryExtrasCard pack={detail.story_extras} />}
                {detail.image_pack && <ImagePackCard pack={detail.image_pack} />}
                {detail.reel_pack && <ReelPackCard pack={detail.reel_pack} />}
                {detail.ai_image_pack && <AiImagePackCard pack={detail.ai_image_pack} />}

                {/* 投稿予定日・実投稿日 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">投稿予定日</Label>
                    <Input
                      type="date"
                      className="h-8"
                      defaultValue={detail.scheduled_date || ""}
                      onChange={async (e) => {
                        const res = await updateMarketingPostDates(detail.id, { scheduled_date: e.target.value || null });
                        if (res.success) setDetail((d) => d ? { ...d, scheduled_date: e.target.value || null } : d);
                        else toast.error(res.error || "保存に失敗しました");
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">実際に投稿した日</Label>
                    <Input
                      type="date"
                      className="h-8"
                      defaultValue={detail.posted_date || ""}
                      onChange={async (e) => {
                        const res = await updateMarketingPostDates(detail.id, { posted_date: e.target.value || null });
                        if (res.success) setDetail((d) => d ? { ...d, posted_date: e.target.value || null } : d);
                        else toast.error(res.error || "保存に失敗しました");
                      }}
                    />
                  </div>
                </div>

                {/* 反応の記録 */}
                <MetricsEditor key={detail.id} post={detail} onSaved={(m) => setDetail((d) => d ? { ...d, metrics: m } : d)} />

                {/* メモ */}
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">メモ</Label>
                  <Textarea
                    defaultValue={detail.memo || ""}
                    rows={2}
                    onBlur={async (e) => {
                      const v = e.target.value;
                      if (v === (detail.memo || "")) return;
                      const res = await updateMarketingPostMemo(detail.id, v);
                      if (res.success) { toast.success("メモを保存しました"); setDetail((d) => d ? { ...d, memo: v } : d); }
                      else toast.error(res.error || "メモの保存に失敗しました");
                    }}
                  />
                </div>

                <div className="flex justify-between pt-2 border-t">
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDelete(detail.id)}>
                    <Trash2 className="w-3.5 h-3.5" /> 削除
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricsEditor({ post, onSaved }: { post: SavedPost; onSaved: (m: PostMetrics) => void }) {
  const [m, setM] = useState<PostMetrics>({
    likes: post.metrics?.likes ?? 0,
    saves: post.metrics?.saves ?? 0,
    comments: post.metrics?.comments ?? 0,
    reach: post.metrics?.reach ?? 0,
    reservations: post.metrics?.reservations ?? 0,
    memo: post.metrics?.memo ?? "",
  });
  const [saving, setSaving] = useState(false);

  const fields: { key: keyof PostMetrics; label: string }[] = [
    { key: "likes", label: "いいね" },
    { key: "saves", label: "保存" },
    { key: "comments", label: "コメント" },
    { key: "reach", label: "リーチ/閲覧" },
    { key: "reservations", label: "予約・相談につながった" },
  ];

  async function save() {
    setSaving(true);
    try {
      const res = await updateMarketingPostMetrics(post.id, m);
      if (!res.success) { toast.error(res.error || "保存に失敗しました"); return; }
      onSaved(m);
      toast.success("反応を記録しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
        <BarChart3 className="w-4 h-4" /> 反応の記録（投稿後に入力）
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {fields.map((f) => (
          <div key={f.key} className="space-y-0.5">
            <Label className="text-[11px] text-slate-500">{f.label}</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              className="h-8"
              value={String(m[f.key] ?? 0)}
              onChange={(e) => setM((prev) => ({ ...prev, [f.key]: Math.max(0, Number(e.target.value) || 0) }))}
            />
          </div>
        ))}
      </div>
      <Input
        className="h-8"
        placeholder="ひとことメモ（例：保護者からの反応が多かった）"
        value={m.memo ?? ""}
        onChange={(e) => setM((prev) => ({ ...prev, memo: e.target.value }))}
      />
      <Button size="sm" onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart3 className="w-3.5 h-3.5" />}
        反応を記録
      </Button>
    </div>
  );
}

/** LINE配信文をコピペなしでそのまま患者へ一斉配信するセクション（試し送り→本番配信の2段階） */
function LineBroadcastSection({ post, onSent }: { post: SavedPost; onSent: (sentAt: string, count: number) => void }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCount(null);
    getLineBroadcastInfo().then((r) => setCount(r.success ? r.count : 0));
  }, [open]);

  async function handleTest() {
    setTesting(true);
    try {
      const res = await broadcastPostLineText(post.id, { test: true });
      if (res.success) toast.success("管理者のLINEに試し送りしました。スマホでご確認ください");
      else toast.error(res.error || "試し送りに失敗しました");
    } finally {
      setTesting(false);
    }
  }

  async function handleSend() {
    setSending(true);
    try {
      const res = await broadcastPostLineText(post.id);
      if (res.success) {
        toast.success(`${res.sent}名の患者さんへ配信しました`);
        if (res.sentAt) onSent(res.sentAt, res.sent);
        setOpen(false);
      } else {
        toast.error(res.error || "配信に失敗しました");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setOpen(true)}>
          <Send className="w-3.5 h-3.5" /> LINEで一斉配信
        </Button>
        {post.line_sent_at && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            配信済み {new Date(post.line_sent_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
            {post.line_sent_count != null && `・${post.line_sent_count}名`}
          </span>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Send className="w-4 h-4 text-emerald-600" /> LINEで一斉配信
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 max-h-48 overflow-y-auto">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{post.line_text}</p>
            </div>
            <div className="text-sm text-slate-600">
              配信先: LINE連携済みの患者さん{" "}
              {count === null ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
              ) : (
                <span className="font-bold text-slate-900">{count}名</span>
              )}
            </div>
            {post.line_sent_at && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                この投稿は既に配信済みです。もう一度配信すると同じ方に再度届きます。
              </p>
            )}
            <p className="text-xs text-slate-500">
              まずは「自分に試し送り」でスマホでの見え方を確認するのがおすすめです。
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || sending}>
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                自分に試し送り
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleSend}
                disabled={sending || testing || count === null || count === 0}
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {count ? `${count}名に配信する` : "配信する"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailBlock({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 text-sm font-medium">{icon}{title}</div>
        <CopyButton text={text} />
      </div>
      <p className="text-sm text-slate-700 whitespace-pre-wrap">{text}</p>
    </div>
  );
}
