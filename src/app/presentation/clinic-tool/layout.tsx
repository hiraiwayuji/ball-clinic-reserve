import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "karada鍼灸整骨院 藤川先生へ｜接骨院DXツールご紹介",
  description: "予約・LINE・売上・AIをひとつにする接骨院DXツールのご紹介資料です。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1e40af",
};

export default function ClinicToolPresentationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
