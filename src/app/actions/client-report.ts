"use server";

/**
 * お客さま向け報告ページ（/report/c/<token>）のサーバー処理。
 *
 * ログイン不要で開ける公開ページなので、次の作りにしてある:
 *  - 取得も保存も **推測不可能な token 一致で1件だけ**。一覧・検索の口は作らない。
 *  - このデプロイ（院）のものだけを返す。他院のトークンを自院ドメインで開かせない。
 *  - client_reports は RLS が authenticated 限定なので、ここは service_role で読み書きする。
 */

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";

export type ReportAnswer = {
  id: string;
  label: string;
  /** "ok" = これでOK / "ng" = ちがう / "" = 未回答 */
  v: "ok" | "ng" | "";
  /** 自由記入。空文字なら書かれていない */
  m: string;
};

export type ClientReport = {
  title: string;
  respondent: string;
  bodyHtml: string;
  answers: ReportAnswer[] | null;
  answeredAt: string | null;
  isOpen: boolean;
};

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** 短すぎる／文字種がおかしいトークンは、DBに行く前に落とす。 */
function badToken(token: string): boolean {
  return !token || token.length < 16 || token.length > 128 || !/^[A-Za-z0-9_-]+$/.test(token);
}

/**
 * 本文HTMLから、確認欄の並び（data-q → data-label）を読み出す。
 * 見出しは画面から送られてきた値ではなく、こちらが書いた本文から引き直す。
 * URLを知っているだけの人に、好きな見出しを保存させないため。
 */
function itemsOf(bodyHtml: string): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const re = /data-q="([^"]{1,60})"\s+data-label="([^"]{0,200})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyHtml)) !== null) {
    if (!out.some((x) => x.id === m![1])) out.push({ id: m[1], label: m[2] });
  }
  return out;
}

/**
 * 送られてきた回答を、保存してよい形だけに削る（画面から来る値は信用しない）。
 * 本文にある確認欄だけを残し、見出しは本文側の文言で上書きする。
 */
function sanitize(input: unknown, items: { id: string; label: string }[]): ReportAnswer[] {
  if (!Array.isArray(input)) return [];
  const byId = new Map(items.map((i) => [i.id, i.label]));
  const seen = new Set<string>();
  const out: ReportAnswer[] = [];
  for (const raw of input.slice(0, 200)) {
    const a = (raw ?? {}) as Record<string, unknown>;
    const id = String(a.id ?? "").slice(0, 60);
    if (!byId.has(id) || seen.has(id)) continue;   // 本文に無い項目・重複は捨てる
    seen.add(id);
    const v: ReportAnswer["v"] = a.v === "ok" || a.v === "ng" ? a.v : "";
    out.push({ id, label: byId.get(id) ?? "", v, m: String(a.m ?? "").slice(0, 2000) });
  }
  return out;
}

/** トークンで報告を1件取る。無ければ null（存在しないのと読めないのを区別しない）。 */
export async function getClientReport(token: string): Promise<ClientReport | null> {
  if (badToken(token)) return null;
  // tenant-isolation-ignore: 公開ページは token（推測不可・一意）で1件を特定する。service_role 使用。
  //                          直後に clinic_id が自院かを必ず確かめている。
  const { data } = await admin()
    .from("client_reports")
    .select("clinic_id, title, respondent, body_html, answers, answered_at, is_open")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  if ((data.clinic_id as string) !== PUBLIC_CLINIC_ID) return null;

  return {
    title: data.title as string,
    respondent: data.respondent as string,
    bodyHtml: data.body_html as string,
    answers: (data.answers as ReportAnswer[] | null) ?? null,
    answeredAt: (data.answered_at as string | null) ?? null,
    isOpen: !!data.is_open,
  };
}

/** 回答を送信する（同じ報告に何度でも。最後の送信で上書き）。 */
export async function submitClientReportAnswers(
  token: string,
  answers: unknown,
): Promise<{ success: boolean; answeredAt?: string; saved?: ReportAnswer[]; error?: string }> {
  if (badToken(token)) return { success: false, error: "このページは開けませんでした。" };

  // tenant-isolation-ignore: token で1件を特定してから clinic_id を確かめている。service_role 使用。
  const { data: head } = await admin()
    .from("client_reports")
    .select("id, clinic_id, is_open, body_html")
    .eq("token", token)
    .maybeSingle();
  if (!head) return { success: false, error: "このページは開けませんでした。" };
  if ((head.clinic_id as string) !== PUBLIC_CLINIC_ID) {
    return { success: false, error: "このページは開けませんでした。" };
  }
  if (!head.is_open) return { success: false, error: "この報告は受付を終えています。" };

  const clean = sanitize(answers, itemsOf(head.body_html as string));
  if (clean.length === 0) return { success: false, error: "回答が空のようです。" };

  const answeredAt = new Date().toISOString();
  const { error } = await admin()
    .from("client_reports")
    .update({ answers: clean, answered_at: answeredAt })
    .eq("id", head.id as string)
    .eq("clinic_id", PUBLIC_CLINIC_ID);
  if (error) return { success: false, error: "保存できませんでした。もう一度お試しください。" };

  // 保存した中身をそのまま返す。画面の「届いている回答」は必ずこれを出す。
  // 画面が集めた値を出していると、本文の書き方しだいで「画面には出るのにDBには無い」ズレが起きる。
  return { success: true, answeredAt, saved: clean };
}
