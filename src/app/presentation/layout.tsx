import React from "react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "V-ARC - 次世代接骨院マネジメントシステム紹介資料",
  description: "現場の課題をAIとLINEで解決する次世代接骨院DXツール「V-ARC」のご紹介資料です。",
};

export default function PresentationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-white selection:bg-violet-500/30 overflow-x-hidden">
      {/* 印刷用スタイル */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .slide-container { break-inside: avoid !important; }
          .slide-page { 
            height: 100vh !important; 
            width: 100vw !important; 
            break-after: page !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            align-items: center !important;
            background: white !important;
            border: none !important;
            padding: 2rem !important;
          }
          /* A4横向きに固定 */
          @page {
            size: A4 landscape;
            margin: 0;
          }
        }
      `}} />
      <main>{children}</main>
    </div>
  );
}
