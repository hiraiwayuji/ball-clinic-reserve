"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/app/actions/auth";
import { revalidatePath } from "next/cache";

// ブログ記事（管理画面用）。テナント分離: 全クエリで .eq("clinic_id", clinicId)

export type BlogPost = {
  id: string;
  clinic_id: string;
  title: string;
  slug: string;
  content_html: string;
  excerpt: string | null;
  cover_image_url: string | null;
  category: string | null;
  status: "draft" | "published" | "archived";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BlogPostInput = {
  title: string;
  slug?: string;
  content_html: string;
  excerpt?: string;
  cover_image_url?: string;
  category?: string;
  status?: "draft" | "published" | "archived";
};

/** タイトル等から URL 用 slug を生成（英数字以外は除去。空なら時刻ベース） */
function toSlug(raw: string): string {
  const base = (raw || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `post-${Date.now()}`;
}

export async function listBlogPosts(): Promise<BlogPost[]> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinic_blog_posts")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[blog] listBlogPosts error:", error.message);
    return [];
  }
  return (data ?? []) as BlogPost[];
}

export async function createBlogPost(input: BlogPostInput) {
  const { clinicId } = await checkAdminAuth();
  if (!input.title?.trim()) return { success: false, error: "タイトルを入力してください" };
  const supabase = await createClient();

  const status = input.status ?? "draft";
  const slug = toSlug(input.slug?.trim() || input.title);

  const { data, error } = await supabase
    .from("clinic_blog_posts")
    .insert({
      clinic_id: clinicId,
      title: input.title.trim(),
      slug,
      content_html: input.content_html ?? "",
      excerpt: input.excerpt?.trim() || null,
      cover_image_url: input.cover_image_url?.trim() || null,
      category: input.category?.trim() || null,
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) {
    // slug 重複（UNIQUE(clinic_id, slug)）の救済
    if (error.code === "23505") return { success: false, error: "同じURL（slug）の記事が既にあります。slug を変えてください。" };
    return { success: false, error: error.message };
  }
  revalidatePath("/admin/blog");
  return { success: true, id: data.id };
}

export async function updateBlogPost(id: string, input: BlogPostInput) {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();

  // 現状を取得（published_at を保つため）
  const { data: existing } = await supabase
    .from("clinic_blog_posts")
    .select("status, published_at")
    .eq("clinic_id", clinicId)
    .eq("id", id)
    .single();

  const nextStatus = input.status ?? existing?.status ?? "draft";
  // draft→published で初めて公開日時を打つ。一度公開した記事は下書き/アーカイブに戻しても日時を保持。
  let publishedAt = existing?.published_at ?? null;
  if (nextStatus === "published" && !publishedAt) publishedAt = new Date().toISOString();

  const patch: Record<string, unknown> = {
    title: input.title.trim(),
    content_html: input.content_html ?? "",
    excerpt: input.excerpt?.trim() || null,
    cover_image_url: input.cover_image_url?.trim() || null,
    category: input.category?.trim() || null,
    status: nextStatus,
    published_at: publishedAt,
    updated_at: new Date().toISOString(),
  };
  if (input.slug?.trim()) patch.slug = toSlug(input.slug.trim());

  const { error } = await supabase
    .from("clinic_blog_posts")
    .update(patch)
    .eq("clinic_id", clinicId)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") return { success: false, error: "同じURL（slug）の記事が既にあります。slug を変えてください。" };
    return { success: false, error: error.message };
  }
  revalidatePath("/admin/blog");
  return { success: true };
}

export async function deleteBlogPost(id: string) {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();
  const { error } = await supabase
    .from("clinic_blog_posts")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/blog");
  return { success: true };
}

/** 公開/下書きの切り替え（ワンクリック） */
export async function setBlogPostStatus(id: string, status: "draft" | "published" | "archived") {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("clinic_blog_posts")
    .select("published_at")
    .eq("clinic_id", clinicId)
    .eq("id", id)
    .single();

  const publishedAt =
    status === "published" ? existing?.published_at ?? new Date().toISOString() : existing?.published_at ?? null;

  const { error } = await supabase
    .from("clinic_blog_posts")
    .update({ status, published_at: publishedAt, updated_at: new Date().toISOString() })
    .eq("clinic_id", clinicId)
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/blog");
  return { success: true };
}
