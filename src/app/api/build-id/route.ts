// いま動いているサーバーのバージョンを返すだけの小さなAPI。
// クライアントに焼き込んだ NEXT_PUBLIC_BUILD_ID と突き合わせて、
// 「デプロイ前から開きっぱなしの画面」を検知するために使う。
// （古い画面のまま操作するとサーバー側の内部IDと噛み合わず「通信エラー」になる）
import { NextResponse } from "next/server";

// 静的にキャッシュされると古い値を返してしまうので必ず都度実行する
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // 🚨 next.config.ts の NEXT_PUBLIC_BUILD_ID と必ず同じ1種類の変数を見ること。
  //    別の変数を混ぜると、ビルド時と実行時で違う値になり永久に食い違い扱いになる。
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA || "dev";
  return NextResponse.json(
    { buildId },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
