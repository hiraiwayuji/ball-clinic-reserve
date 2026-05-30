/**
 * 公開ブログ記事詳細 API（認証不要）
 *   GET /api/public/blog/[clinicId]/[slug]
 *
 * 外部HPが個別記事を取得する。CORS 許可済み。
 * テナント分離: clinic_id × slug で .eq。status='published' のみ返す。
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clinicId: string; slug: string }> },
) {
  const { clinicId, slug } = await params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, error: "env missing" }, { status: 500, headers: CORS_HEADERS });
  }

  const sb = createClient(url, anonKey, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("clinic_blog_posts")
    .select("id, title, slug, content_html, excerpt, cover_image_url, category, published_at")
    .eq("clinic_id", clinicId)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404, headers: CORS_HEADERS });
  }

  return NextResponse.json(
    { ok: true, post: data },
    {
      status: 200,
      headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=60, s-maxage=300" },
    },
  );
}
