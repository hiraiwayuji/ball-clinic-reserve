/**
 * LINE Messaging API の push 失敗を、受付スタッフが読んで意味が分かる日本語にする。
 *
 * 依存ゼロ（`@/` エイリアスも使わない）。node --test でそのまま読み込めるようにしてある。
 *
 * 背景（2026-09-11 からだ鍼灸整骨院）:
 *   LINE公式アカウントの無料プランは月200通まで。受付の操作ごとに院長へ通知が飛ぶ作りだったため
 *   9月上旬で200通を使い切り、患者さんへの予約確定LINEも院長への仮予約通知も
 *   すべて 429 "You have reached your monthly limit." で失敗した。
 *   画面には「送信に失敗しました」としか出ず、原因が誰にも分からなかった。
 */

export type LinePushFailureKind =
  | "monthly_limit"   // 429: 今月の送信上限
  | "rate_limit"      // 429: 短時間に送りすぎ
  | "auth"            // 401: トークン/チャネル設定の誤り
  | "not_friend"      // 403: 友だち追加していない／ブロック
  | "bad_recipient"   // 400: 宛先IDが不正
  | "bad_request"     // 400: その他
  | "other";

export type LinePushFailure = {
  kind: LinePushFailureKind;
  /** 画面に出す文（敬語・専門用語なし） */
  message: string;
  /** ログ向けの短い英字ラベル */
  code: string;
};

const MONTHLY_LIMIT_RE = /monthly limit/i;
const RECIPIENT_RE = /property,? ['"]?to['"]?/i;

/**
 * @param status LINE API の HTTP ステータス
 * @param body   レスポンス本文（JSON文字列 or オブジェクト or 空）
 */
export function describeLinePushFailure(status: number, body: unknown): LinePushFailure {
  const text = bodyToText(body);

  if (status === 429) {
    if (MONTHLY_LIMIT_RE.test(text)) {
      return {
        kind: "monthly_limit",
        code: "LINE_MONTHLY_LIMIT",
        message:
          "LINE公式アカウントの今月の送信できる通数（無料プランは200通）を使い切っているため送れません。" +
          "来月1日に回復します。今月中に送るには LINE公式アカウントのプラン変更（ライトプラン等）が必要です。",
      };
    }
    return {
      kind: "rate_limit",
      code: "LINE_RATE_LIMIT",
      message: "短い時間にLINEを送りすぎたため一時的に送れません。1〜2分おいてもう一度お試しください。",
    };
  }
  if (status === 401) {
    return {
      kind: "auth",
      code: "LINE_AUTH",
      message: "LINEの接続設定（チャネルID／シークレット）に誤りがあり送れません。サポートへご連絡ください。",
    };
  }
  if (status === 403) {
    return {
      kind: "not_friend",
      code: "LINE_NOT_FRIEND",
      message:
        "この患者さんはLINE公式アカウントを友だち追加していない、またはブロック中のため送れません。" +
        "友だち追加をご案内ください。",
    };
  }
  if (status === 400) {
    if (RECIPIENT_RE.test(text)) {
      return {
        kind: "bad_recipient",
        code: "LINE_BAD_RECIPIENT",
        message: "登録されているLINEの宛先IDが正しくないため送れません。LINE連携をやり直してください。",
      };
    }
    return {
      kind: "bad_request",
      code: "LINE_BAD_REQUEST",
      message: `LINEが受け付けませんでした（${text.slice(0, 80) || "内容不明"}）。`,
    };
  }
  return {
    kind: "other",
    code: `LINE_HTTP_${status}`,
    message: `LINE送信に失敗しました（HTTP ${status}${text ? `: ${text.slice(0, 80)}` : ""}）。`,
  };
}

function bodyToText(body: unknown): string {
  if (body == null) return "";
  if (typeof body === "string") {
    // JSON なら message を優先して読む
    try {
      const j = JSON.parse(body) as { message?: unknown };
      if (j && typeof j.message === "string") return j.message;
    } catch {
      /* 素のテキスト */
    }
    return body;
  }
  if (typeof body === "object") {
    const m = (body as { message?: unknown }).message;
    if (typeof m === "string") return m;
    try {
      return JSON.stringify(body);
    } catch {
      return "";
    }
  }
  return String(body);
}
