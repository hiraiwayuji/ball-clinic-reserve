/**
 * 公開ブログ一覧 API（認証不要）
 *   GET /api/public/blog/[clinicId]?limit=20&category=お知らせ
 *
 * 外部HP（からだ・アイラス等）が clinic_id を指定して
 * 「公開済み」記事の一覧を取得する。CORS 許可済み。
 *
 * テナント分離: clinic_id で必ず .eq。status='published' のみ返す。
 */

import { NextRequest, NextResponse } from "next/server";
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
  request: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> },
) {
  const { clinicId } = await params;
  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 20;
  const category = request.nextUrl.searchParams.get("category");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, error: "env missing" }, { status: 500, headers: CORS_HEADERS });
  }

  const sb = createClient(url, anonKey, { auth: { persistSession: false } });

  let query = sb
    .from("clinic_blog_posts")
    .select("id, title, slug, excerpt, cover_image_url, category, published_at")
    .eq("clinic_id", clinicId)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: CORS_HEADERS });
  }

  return NextResponse.json(
    { ok: true, posts: data ?? [] },
    {
      status: 200,
      headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=60, s-maxage=300" },
    },
  );
}
