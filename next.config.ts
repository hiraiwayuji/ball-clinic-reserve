import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // デプロイすると Next.js のサーバー側の内部ID（Server Action ID）が作り直されるため、
  // 「デプロイ前から開きっぱなしの画面」はサーバーと噛み合わなくなり、
  // 保存・検索が全部「通信エラー」になる（2026-08-28 受付で実際に発生）。
  // ここでビルド時のバージョンをクライアントに焼き込み、/api/build-id（実行中の
  // サーバーのバージョン）と食い違ったら画面に「開き直してください」と出す。
  // 🚨 参照する環境変数は1種類だけにする。ビルド時と実行時で別の変数が採用されると
  //    永久に食い違い扱いになり、「開き直しても消えない案内」が出続けてしまう。
  //    片方でも欠けたら "dev" になり、その場合この仕組みは黙って無効になる（安全側）。
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || "dev",
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'uatmzcnoumafeuzprkdo.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
