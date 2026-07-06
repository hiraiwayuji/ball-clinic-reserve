"use client";

// LINE連携必須ゲート（clinic_settings.require_line_link が ON の院で表示）。
// 仮予約・キャンセル待ちの確定前に「友だち追加 → 電話番号下4桁を送信」を済ませてもらい、
// 連携が確認できたら onLinked() で同じ内容の予約を自動再送信する。
// 予約ページ / アンケート完了後 / キャンセル待ちフォームの3か所で共通利用。

import { useEffect, useRef, useState } from "react";
import { MessageCircle, CheckCircle2, RefreshCw, Phone } from "lucide-react";
import { getLineLinkStatus } from "@/app/actions/reserve";
import { getPublicClinicSettings } from "@/app/actions/publicSettings";
import { CLINIC_CONFIG } from "@/lib/clinic-config";

const LINE_URL_FALLBACK =
  process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL ?? "https://line.me/R/ti/p/%40shc8761q";

// 連携確認のポーリング間隔。タブ非表示中は止める（無駄な連打を避ける）
const POLL_INTERVAL_MS = 4000;

type Props = {
  /** LINEのトークで送ってもらう電話番号の下4桁（サーバが返した登録電話ベース） */
  phone4: string | null;
  /** 顧客特定用（ポーリングで連携済みかを照合する） */
  name: string;
  phone: string;
  /** 連携が確認できたら呼ばれる。親はここで予約を自動再送信する */
  onLinked: () => void | Promise<void>;
  /** 「仮予約」「キャンセル待ち」など、完了する操作の呼び名 */
  actionLabel?: string;
};

export default function LineLinkGate({ phone4, name, phone, onLinked, actionLabel = "仮予約" }: Props) {
  const [lineUrl, setLineUrl] = useState<string>(LINE_URL_FALLBACK);
  const [clinicPhone, setClinicPhone] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [linkedConfirmed, setLinkedConfirmed] = useState(false);
  // onLinked（予約の再送信）を二重に走らせないためのガード
  const firedRef = useRef(false);

  useEffect(() => {
    getPublicClinicSettings()
      .then((s) => {
        if (s?.line_official_account_url) setLineUrl(s.line_official_account_url);
        if (s?.phone_number) setClinicPhone(s.phone_number);
      })
      .catch(() => {});
  }, []);

  const fireLinked = async () => {
    if (firedRef.current) return;
    firedRef.current = true;
    setLinkedConfirmed(true);
    await onLinked();
  };

  const checkNow = async (opts?: { silent?: boolean }) => {
    if (firedRef.current) return;
    if (!opts?.silent) setChecking(true);
    try {
      const res = await getLineLinkStatus({ name, phone });
      if (res.linked) await fireLinked();
    } catch {
      // ネットワーク一時失敗は次のポーリングに任せる
    } finally {
      if (!opts?.silent) setChecking(false);
    }
  };

  // 自動ポーリング（LINEアプリから戻ってきたら押さなくても進むように）
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void checkNow({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, phone]);

  if (linkedConfirmed) {
    return (
      <div className="w-full max-w-sm mx-auto bg-white rounded-3xl shadow-2xl p-6 text-center">
        <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/30">
          <CheckCircle2 className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-800 mb-2">LINE連携を確認しました！</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          そのまま{actionLabel}を完了しています。<br />
          少しだけお待ちください…
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto bg-white rounded-3xl shadow-2xl p-6 text-center">
      <div className="w-14 h-14 bg-[#06C755] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#06C755]/30">
        <MessageCircle className="w-8 h-8 text-white" />
      </div>
      <h2 className="text-lg font-extrabold text-slate-800 mb-1">
        あと1ステップ！LINE連携のお願い
      </h2>
      <p className="text-[13px] text-slate-600 leading-relaxed mb-4">
        {actionLabel}の内容にお返事するため、<br />
        LINEの連携をお願いしています。<br />
        （確認・変更のご連絡もLINEに届きます）
      </p>

      <div className="text-left space-y-3 mb-4">
        <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
          <span className="w-6 h-6 rounded-full bg-[#06C755] text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">1</span>
          <p className="text-sm text-slate-700 leading-relaxed">
            下のボタンから{CLINIC_CONFIG.nameShort}の<br />
            LINEを<strong>友だち追加</strong>する
          </p>
        </div>
        <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
          <span className="w-6 h-6 rounded-full bg-[#06C755] text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">2</span>
          <div className="flex-1">
            <p className="text-sm text-slate-700 leading-relaxed mb-1.5">
              トークで<strong>電話番号の下4桁</strong>を送る
            </p>
            {phone4 && (
              <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-center">
                <p className="text-[11px] text-slate-500 mb-0.5">LINEに送る数字</p>
                <p className="text-2xl font-mono font-black tracking-[0.3em] text-slate-800">{phone4}</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
          <span className="w-6 h-6 rounded-full bg-[#06C755] text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">3</span>
          <p className="text-sm text-slate-700 leading-relaxed">
            この画面に戻ると、自動で{actionLabel}が<br />
            完了します
          </p>
        </div>
      </div>

      <a
        href={lineUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-full items-center justify-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-4 px-4 rounded-2xl transition-all shadow-lg shadow-[#06C755]/20 gap-2"
      >
        <MessageCircle className="w-5 h-5" />
        LINEを開いて下4桁を送る
      </a>

      <button
        type="button"
        onClick={() => checkNow()}
        disabled={checking}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-2xl transition-all text-sm disabled:opacity-60"
      >
        <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
        {checking ? "確認しています…" : "連携できたか確認する"}
      </button>

      <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
        「同じ末尾の番号が複数…」と返ってきた場合は、<br />
        下6桁を送ってお試しください。
      </p>

      {clinicPhone && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500 leading-relaxed mb-2">
            LINEをお使いでない方は、<br />
            お手数ですがお電話にてご予約ください。
          </p>
          <a
            href={`tel:${clinicPhone.replace(/[^\d+]/g, "")}`}
            className="inline-flex items-center justify-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-700"
          >
            <Phone className="w-4 h-4" />
            {clinicPhone}
          </a>
        </div>
      )}
    </div>
  );
}
