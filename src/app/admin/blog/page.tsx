"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Pencil, Eye, EyeOff, FileText, X } from "lucide-react";
import { toast } from "sonner";
import {
  listBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  setBlogPostStatus,
  type BlogPost,
} from "@/app/actions/blog";

/** プレーンテキスト → 簡易HTML（段落・改行）。オーナーがHTMLを書かなくてよいように。 */
function textToHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${esc(para).replace(/\n/g, "<br>")}</p>`)
    .filter((p) => p !== "<p></p>")
    .join("\n");
}

/** 簡易HTML → プレーンテキスト（編集時にテキストエリアへ戻す） */
function htmlToText(html: string): string {
  return (html || "")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?p>/gi, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

type FormState = {
  id: string | null;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  cover_image_url: string;
  body: string; // プレーンテキスト
};

const EMPTY_FORM: FormState = {
  id: null,
  title: "",
  slug: "",
  category: "",
  excerpt: "",
  cover_image_url: "",
  body: "",
};

export default function BlogAdminPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setPosts(await listBlogPosts());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  };

  const openEdit = (p: BlogPost) => {
    setForm({
      id: p.id,
      title: p.title,
      slug: p.slug,
      category: p.category ?? "",
      excerpt: p.excerpt ?? "",
      cover_image_url: p.cover_image_url ?? "",
      body: htmlToText(p.content_html),
    });
    setEditorOpen(true);
  };

  const save = async (status: "draft" | "published") => {
    if (!form.title.trim()) {
      toast.error("タイトルを入力してください");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title,
      slug: form.slug,
      category: form.category,
      excerpt: form.excerpt,
      cover_image_url: form.cover_image_url,
      content_html: textToHtml(form.body),
      status,
    };
    const res = form.id
      ? await updateBlogPost(form.id, payload)
      : await createBlogPost(payload);
    setSaving(false);
    if (res.success) {
      toast.success(status === "published" ? "公開しました" : "下書きを保存しました");
      setEditorOpen(false);
      setForm(EMPTY_FORM);
      load();
    } else {
      toast.error(res.error || "保存に失敗しました");
    }
  };

  const togglePublish = async (p: BlogPost) => {
    const next = p.status === "published" ? "draft" : "published";
    const res = await setBlogPostStatus(p.id, next);
    if (res.success) {
      toast.success(next === "published" ? "公開しました" : "下書きに戻しました");
      load();
    } else {
      toast.error(res.error || "変更に失敗しました");
    }
  };

  const remove = async (p: BlogPost) => {
    if (!confirm(`「${p.title}」を削除しますか？`)) return;
    const res = await deleteBlogPost(p.id);
    if (res.success) {
      toast.success("削除しました");
      load();
    } else {
      toast.error(res.error || "削除に失敗しました");
    }
  };

  return (
    <div className="space-y-6 container mx-auto py-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 border-l-4 border-emerald-600 pl-3">
            ブログ
          </h1>
          <p className="text-muted-foreground mt-2">記事を書いて「公開」すると、HPに自動で表示されます</p>
        </div>
        <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2">
          <Plus className="w-5 h-5" /> 新しい記事
        </Button>
      </div>

      {/* エディタ */}
      {editorOpen && (
        <Card className="shadow-sm border-emerald-200 dark:border-white/10 dark:bg-slate-900/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                {form.id ? "記事を編集" : "新しい記事"}
              </CardTitle>
              <CardDescription>本文は普通に書いてOK。改行・段落はそのまま反映されます。</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setEditorOpen(false)} aria-label="閉じる">
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">タイトル</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="春のおすすめリンパケア"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">カテゴリ（任意）</Label>
                <Input
                  id="category"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="お知らせ / リンパ / カフェ"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">URL（任意・空なら自動）</Label>
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="spring-lymph-care"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cover">アイキャッチ画像URL（任意）</Label>
              <Input
                id="cover"
                value={form.cover_image_url}
                onChange={(e) => setForm((f) => ({ ...f, cover_image_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="excerpt">抜粋（一覧に出る短い説明・任意）</Label>
              <Input
                id="excerpt"
                value={form.excerpt}
                onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
                placeholder="むくみがすっきり。春におすすめのケアをご紹介します。"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">本文</Label>
              <textarea
                id="body"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={12}
                placeholder="ここに本文を書きます。&#10;&#10;空行で段落が分かれます。"
                className="w-full border border-slate-200 dark:border-slate-800 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 leading-relaxed"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                onClick={() => save("published")}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1 h-10"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                公開する
              </Button>
              <Button
                onClick={() => save("draft")}
                disabled={saving}
                variant="outline"
                className="flex-1 h-10 border-slate-300"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                下書き保存
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 記事一覧 */}
      <Card className="shadow-sm border-slate-200 dark:border-white/10 dark:bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">記事一覧</CardTitle>
          <CardDescription>{posts.length} 件の記事</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-40 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm mt-2">読み込み中...</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-slate-400">
              <FileText className="w-12 h-12 mb-2 opacity-20" />
              <p>まだ記事がありません。「新しい記事」から書いてみましょう。</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {posts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{p.title}</span>
                      {p.status === "published" ? (
                        <span className="shrink-0 text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">公開中</span>
                      ) : (
                        <span className="shrink-0 text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">下書き</span>
                      )}
                      {p.category && (
                        <span className="shrink-0 text-[10px] text-slate-400">#{p.category}</span>
                      )}
                    </div>
                    {p.excerpt && <p className="text-xs text-slate-400 mt-0.5 truncate">{p.excerpt}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-8 h-8 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full"
                      onClick={() => togglePublish(p)}
                      title={p.status === "published" ? "下書きに戻す" : "公開する"}
                    >
                      {p.status === "published" ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-8 h-8 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full"
                      onClick={() => openEdit(p)}
                      title="編集"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-8 h-8 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full"
                      onClick={() => remove(p)}
                      title="削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
