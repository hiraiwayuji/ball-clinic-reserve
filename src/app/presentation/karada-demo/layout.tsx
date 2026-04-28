import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "karada鍼灸整骨院 体験デモ｜接骨院DXツール",
  description: "藤川先生の院に合わせたデモ環境です。スタッフ別色分けカレンダーと訪問治療スケジュールを体験できます。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function KaradaDemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
