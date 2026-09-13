"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";

/**
 * 患者さん向けレポートを「PDFで保存・印刷」する。
 *
 * ブラウザの印刷画面を開くだけ（印刷先で「PDFに保存」を選ぶとファイルになる）。
 * サーバーでPDFを作らないので、レポートの中身と見た目がいつも同じになる。
 * LINEアプリの中のブラウザは印刷画面が出ないことがあるため、押したあとに案内を出す。
 * 印刷するときはこのボタン自体を隠す（print:hidden）。
 */
export default function PrintButton() {
  const [showHint, setShowHint] = useState(false);

  const handlePrint = () => {
    setShowHint(true);
    try {
      window.print();
    } catch {
      // 印刷できない環境（LINEアプリ内など）。下の案内で「ブラウザで開く」をお願いする。
    }
  };

  return (
    <div className="print:hidden text-center space-y-2 pt-2">
      <button
        type="button"
        onClick={handlePrint}
        className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-emerald-600 text-white text-sm font-bold shadow-sm hover:bg-emerald-700 active:bg-emerald-800"
      >
        <FileDown className="w-4 h-4" aria-hidden />
        PDFで保存・印刷する
      </button>
      {showHint && (
        <p className="text-[11px] text-slate-500 leading-relaxed" role="status">
          印刷の画面で「PDFに保存」を選ぶと、ファイルとして残せます。
          <br />
          LINEの中で開いていて印刷の画面が出ないときは、右上のメニューから
          「ブラウザで開く」を選んでから、もう一度押してください。
        </p>
      )}
    </div>
  );
}
