"use client";

/**
 * お客さま向け報告ページの本体（ログイン不要）。
 *
 * 本文は DB に入っている HTML をそのまま描く。本文の中に
 *   <div class="verdict" data-q="..." data-label="...">
 *     <input type="radio" value="ok|ng"> ... <textarea>
 * が並んでいるので、描いたあとに JS でつなぎこむ。
 *
 * ねらい（ぼーるくんの指示 2026-09-02）:
 *   コピー＆貼り付けをさせない。押したら届く。押したあとは同じURLで読める。
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { submitClientReportAnswers, type ReportAnswer } from "@/app/actions/client-report";

type Props = {
  token: string;
  respondent: string;
  bodyHtml: string;
  initialAnswers: ReportAnswer[] | null;
  initialAnsweredAt: string | null;
  isOpen: boolean;
};

/**
 * 報告本文。props が変わらないかぎり描き直さない。
 * ここを memo にしないと、送信バーの状態が変わるたびに本文が描き直され、
 * お客さまが選んだラジオボタンと書いた文章が消えてしまう（実機で確認ずみ）。
 */
const ReportBody = memo(function ReportBody({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
});

function jst(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo", month: "numeric", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ReportView({
  token, respondent, bodyHtml, initialAnswers, initialAnsweredAt, isOpen,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  /** 二重送信ガード。state だと連打時に古い値を見てしまうので ref で持つ。 */
  const sendingRef = useRef(false);
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [answeredAt, setAnsweredAt] = useState<string | null>(initialAnsweredAt);
  const [sent, setSent] = useState<ReportAnswer[] | null>(initialAnswers);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  /** 本文の中の確認欄を全部あつめる */
  /** 下書きの保存先。送信できなかったときに書いた内容を失わないため。 */
  const draftKey = `client-report-draft:${token}`;

  const blocks = useCallback((): HTMLElement[] => {
    const root = bodyRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(".verdict"));
  }, []);

  const collect = useCallback((): ReportAnswer[] => {
    return blocks().map((v) => {
      const picked = v.querySelector<HTMLInputElement>("input[type=radio]:checked");
      const memo = v.querySelector<HTMLTextAreaElement>("textarea");
      const raw = picked?.value;
      // 選んだ選択肢に添えてある言葉（<label><input>のとなりの<span>）をそのまま控える。
      // 「これでOK」だけで済まない選択肢（例:「30分に延ばしてほしい」）でも、
      // 送信後にご本人が押した内容と同じ言葉で確認できるようにするため。
      const pickedText = picked?.closest("label")?.querySelector("span")?.textContent?.trim() ?? "";
      return {
        id: v.getAttribute("data-q") ?? "",
        label: v.getAttribute("data-label") ?? "",
        v: raw === "ok" || raw === "ng" ? raw : "",
        m: memo ? memo.value.trim() : "",
        t: pickedText,
      };
    });
  }, [blocks]);

  const recount = useCallback(() => {
    setLeft(blocks().filter((v) => !v.querySelector("input[type=radio]:checked")).length);
  }, [blocks]);

  /** 選んだ内容・書いた文章をこの端末に控える（送信できなかったときの保険）。 */
  const saveDraft = useCallback(() => {
    try { localStorage.setItem(draftKey, JSON.stringify(collect())); } catch { /* 使えない端末は黙って諦める */ }
  }, [collect, draftKey]);

  /** answers の配列を画面に流し込む。 */
  const fill = useCallback((list: HTMLElement[], answers: ReportAnswer[]) => {
    for (const a of answers) {
      const v = list.find((el) => el.getAttribute("data-q") === a.id);
      if (!v) continue;
      if (a.v) {
        const r = v.querySelector<HTMLInputElement>(`input[type=radio][value="${a.v}"]`);
        if (r) r.checked = true;
      }
      const t = v.querySelector<HTMLTextAreaElement>("textarea");
      if (t && a.m) t.value = a.m;
    }
  }, []);

  // 開いたときに、送信ずみの内容 →（あれば）この端末の下書き の順で入れておく。
  // 下書きを後にするのは、送信できずに書き足したぶんを消さないため。
  useEffect(() => {
    const list = blocks();
    if (initialAnswers) fill(list, initialAnswers);
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw);
        if (Array.isArray(draft)) fill(list, draft as ReportAnswer[]);
      }
    } catch { /* 壊れていたら無視して送信ずみのぶんだけ使う */ }
    recount();
    const root = bodyRef.current;
    if (!root) return;
    const onInput = () => { recount(); saveDraft(); };
    root.addEventListener("change", onInput);
    root.addEventListener("input", onInput);
    return () => {
      root.removeEventListener("change", onInput);
      root.removeEventListener("input", onInput);
    };
  }, [blocks, draftKey, fill, initialAnswers, recount, saveDraft]);

  const send = async () => {
    if (sendingRef.current || !isOpen) return;

    const answers = collect();
    const blank = answers.filter((a) => !a.v).length;
    if (blank > 0) {
      // ダイアログを出せない端末（アプリ内ブラウザなど）では止めない。
      // 「押しても何も起きない」に見えるほうが困るので、送る側に倒す。
      let ok = true;
      try {
        ok = window.confirm(
          `まだ選んでいないところが${blank}件あります。
このまま送ってよろしいですか？`,
        );
      } catch {
        ok = true;
      }
      if (!ok) {
        setMsg({ text: `未回答が${blank}件あります。選んでから、もう一度押してください。`, bad: false });
        return;
      }
    }

    sendingRef.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const r = await submitClientReportAnswers(token, answers);
      if (r.success) {
        // サーバーが保存した中身を出す（画面が集めた値ではなく）
        setSent(r.saved ?? answers);
        setAnsweredAt(r.answeredAt ?? new Date().toISOString());
        setMsg({ text: "送信しました。ありがとうございます。", bad: false });
        try { localStorage.removeItem(draftKey); } catch { /* 消せなくても実害なし */ }
      } else {
        setMsg({ text: r.error ?? "送信できませんでした。もう一度お試しください。", bad: true });
      }
    } catch {
      // 電波が切れた・サーバーに届かなかった場合。ここを拾わないと
      // 「送信中...」のまま固まって、押した本人が送れたか分からなくなる。
      setMsg({
        text: "電波の状態で送れませんでした。書いた内容はこの端末に残っていますので、もう一度ボタンを押してください。",
        bad: true,
      });
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="wrap">
      {/* 本文（こちらで作ったHTML）。確認欄の読み書きは bodyRef の中を直接さわる。 */}
      <div ref={bodyRef}>
        <ReportBody html={bodyHtml} />
      </div>

      {/* 届いている回答 */}
      {sent && (
        <section>
          <h2>届いている回答</h2>
          <p className="lead">
            送信されたご回答です。平岩がこの画面を見て確認します。
          </p>
          <div className="card">
            <p className="note">
              {respondent} より {answeredAt ? jst(answeredAt) : ""} に送信されました。
            </p>
            <div className="answers">
              {sent.map((a, i) => (
                <div className="ans" key={`${a.id}-${i}`}>
                  <span className="q">{a.id}. {a.label}</span>
                  <span className={`a ${a.v === "ok" ? "ok" : a.v === "ng" ? "ng" : "non"}`}>
                    {a.t || (a.v === "ok" ? "これでOK" : a.v === "ng" ? "ちがう" : "未回答")}
                  </span>
                  {a.m && <span className="m">{a.m}</span>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 送信バー */}
      <div className="answerbar">
        <span className="count">
          {left === null ? "　" : left === 0 ? "すべて回答ずみ" : `未回答 ${left}件`}
        </span>
        <button type="button" onClick={send} disabled={busy || !isOpen}>
          {busy ? "送信中..." : answeredAt ? "回答を送りなおす" : "回答を送信する"}
        </button>
        <span className={`hint${msg?.bad ? " warn" : ""}`}>
          {msg
            ? msg.text
            : isOpen
              ? "「これでOK」「ちがう」を選んで、このボタンを押してください。それだけで届きます。"
              : "この報告は受付を終えています。"}
        </span>
      </div>
    </div>
  );
}
