import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { pushLineToOwners, pushLineToStaff, sendEmailTo } from "@/lib/admin-notify";

// 出勤希望アンケートの自動運用（Vercel Cron: 毎日 9:00 JST = 0:00 UTC）。
// ▼ 募集ラウンド（shift_request_rounds）が登録されている院：
//    - link_send_date に「提出リンク」を各自へ配信（連携済み=LINE / 未連携=メール）＋院長LINE
//    - 締切の 3日前・前日・当日に、未提出者へ催促（LINE/メール）＋院長LINE
// ▼ ラウンド未登録の院：従来どおり「毎月1日に翌月分」を案内＋2週間前締切で催促（他院無影響）。
// クリニック識別はビルド時 env（各院デプロイが自院だけ処理）。clinic_settings.shift_request_enabled=true の院のみ。
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLINIC_ID = process.env.NEXT_PUBLIC_CLINIC_ID ?? "00000000-0000-0000-0000-000000000001";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret") === secret;
}

function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
// YYYY-MM-DD の日数加減（カレンダー日付のみ・JST想定でTZズレ無し）
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ymd(new Date(Date.UTC(y, m - 1, d + days)));
}
// "YYYY-MM-DD" → "M/D"
function fmtMd(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}/${d}`;
}

type Staff = { id: string; name: string; email: string | null; line_user_id: string | null };
// Supabase クライアントの型引数差異を避けるため、ヘルパー内では緩く扱う
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** リンク/催促を各自へ配信：連携済み=LINE、未連携=メール。件数を返す。 */
async function notifyStaff(
  targets: Staff[],
  lineText: string,
  emailSubject: string,
  emailBody: string,
  clinicName: string,
): Promise<{ line: number; mail: number }> {
  const linked = targets.filter((s) => s.line_user_id);
  const unlinked = targets.filter((s) => !s.line_user_id);
  let line = 0;
  await Promise.all(
    linked.map(async (s) => {
      const ok = await pushLineToStaff(s.line_user_id as string, lineText);
      if (ok) line += 1;
    }),
  );
  const emails = unlinked.map((s) => s.email).filter((e): e is string => !!e);
  const mail = await sendEmailTo(emails, emailSubject, emailBody, clinicName);
  return { line, mail: mail.attempted };
}

/** ラウンドの対象期間に希望を提出済みのスタッフID集合を返す。 */
async function submittedForRound(
  db: Db,
  clinicId: string,
  periodStart: string,
  periodEnd: string,
): Promise<Set<string>> {
  const months = Array.from(new Set([periodStart.slice(0, 7), periodEnd.slice(0, 7)]));
  const { data } = await db
    .from("staff_shift_requests")
    .select("staff_id, days, submitted_at")
    .eq("clinic_id", clinicId)
    .in("month", months);
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ staff_id: string; days: Record<string, unknown> | null; submitted_at: string | null }>) {
    if (!r.submitted_at) continue;
    const days = (r.days as Record<string, unknown> | null) ?? {};
    // 対象期間内の日付が1つでも入力されていれば「提出済み」とみなす
    const hasInRange = Object.keys(days).some((k) => k >= periodStart && k <= periodEnd);
    if (hasInRange) set.add(r.staff_id as string);
  }
  return set;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "supabase env missing" }, { status: 500 });
  const db = createAdminClient(url, key, { auth: { persistSession: false } });

  // この院で出勤アンケート運用がONか
  const { data: settings } = await db
    .from("clinic_settings").select("shift_request_enabled, clinic_name")
    .eq("id", CLINIC_ID).maybeSingle();
  if (!settings?.shift_request_enabled) {
    return NextResponse.json({ ok: true, clinic: CLINIC_ID, skipped: "shift_request_disabled" });
  }
  const clinicName = (settings.clinic_name as string) || "当院";

  const today = todayJST();
  const link = `${baseUrl()}/shift-request`;
  const adminUrl = `${baseUrl()}/admin/shift-reminders`;
  const actions: string[] = [];

  // アクティブスタッフ（LINE連携状況込み）
  const { data: staffRows } = await db
    .from("reservation_staff").select("id, name, email, line_user_id")
    .eq("clinic_id", CLINIC_ID).eq("is_active", true);
  const staff = (staffRows ?? []) as Staff[];

  // ── 募集ラウンド運用（登録があればこちらを使う） ─────────────
  const { data: roundRows } = await db
    .from("shift_request_rounds")
    .select("id, label, period_start, period_end, deadline, link_send_date, status, sent")
    .eq("clinic_id", CLINIC_ID)
    .eq("status", "open");
  const rounds = roundRows ?? [];

  if (rounds.length > 0) {
    for (const r of rounds) {
      const label = (r.label as string | null) || `${fmtMd(r.period_start as string)}〜${fmtMd(r.period_end as string)}`;
      const periodStart = r.period_start as string;
      const periodEnd = r.period_end as string;
      const deadline = r.deadline as string;
      const linkSendDate = r.link_send_date as string;
      const sent: Record<string, boolean> = { ...((r.sent as Record<string, boolean> | null) ?? {}) };
      let changed = false;

      // ① リンク配信日：全員へ提出リンクを配信
      if (today === linkSendDate && !sent.link) {
        const res = await notifyStaff(
          staff,
          `🗓️【出勤希望のお願い】\n${label}（${fmtMd(periodStart)}〜${fmtMd(periodEnd)}）の出勤希望を提出してください。\n締切：${fmtMd(deadline)}まで\n\n▼こちらから（お名前を選んで入力）\n${link}`,
          `【${clinicName}】出勤希望の提出のお願い（${label}）`,
          `お疲れさまです。\n${label}（${fmtMd(periodStart)}〜${fmtMd(periodEnd)}）の出勤希望の提出をお願いします。\n\n▼こちらから提出してください（お名前を選んで入力）\n${link}\n\n締切：${fmtMd(deadline)} まで`,
          clinicName,
        );
        await pushLineToOwners(
          CLINIC_ID,
          `🗓️ 「${label}」の出勤希望リンクを配信しました\n対象：${fmtMd(periodStart)}〜${fmtMd(periodEnd)} / 締切：${fmtMd(deadline)}\n配信：LINE ${res.line}名・メール ${res.mail}名\n提出状況はこちら👇\n${adminUrl}`,
        );
        sent.link = true; changed = true;
        actions.push(`round=${r.id} link sent line=${res.line} mail=${res.mail}`);
      }

      // ② 催促：締切の3日前・前日・当日、未提出者へ
      const remindMap: Record<string, string> = {
        d3: addDays(deadline, -3),
        d1: addDays(deadline, -1),
        d0: deadline,
      };
      for (const [flag, when] of Object.entries(remindMap)) {
        if (today !== when || sent[flag]) continue;
        const submitted = await submittedForRound(db, CLINIC_ID, periodStart, periodEnd);
        const unsub = staff.filter((s) => !submitted.has(s.id));
        const isLast = flag === "d0";
        if (unsub.length > 0) {
          const res = await notifyStaff(
            unsub,
            `⏰【出勤希望・未提出のお知らせ】\n${label}（${fmtMd(periodStart)}〜${fmtMd(periodEnd)}）の出勤希望がまだ未提出です。\n${isLast ? "本日が締切です。" : `締切は ${fmtMd(deadline)} です。`}\n\n▼提出はこちら\n${link}`,
            `【${clinicName}】出勤希望 ${isLast ? "本日締切" : "締切間近"}のお願い（${label}）`,
            `お疲れさまです。\n${label} の出勤希望がまだ未提出です。${isLast ? "本日が締切です。" : `締切は ${fmtMd(deadline)} です。`}\n\n▼こちらから提出してください\n${link}`,
            clinicName,
          );
          const names = unsub.map((s) => s.name).join("・");
          await pushLineToOwners(
            CLINIC_ID,
            `⏰ 「${label}」の出勤希望 ${isLast ? "本日が締切" : "締切が近づいています"}（締切 ${fmtMd(deadline)}）\n未提出 ${unsub.length}名：${names}\n配信：LINE ${res.line}名・メール ${res.mail}名`,
          );
          actions.push(`round=${r.id} ${flag} unsub=${unsub.length} line=${res.line} mail=${res.mail}`);
        } else {
          actions.push(`round=${r.id} ${flag} all-submitted`);
        }
        sent[flag] = true; changed = true;
      }

      // 締切を過ぎたラウンドは閉じる（cron空振りを減らす）
      let nextStatus = r.status as string;
      if (today > deadline) { nextStatus = "closed"; changed = true; }

      if (changed) {
        await db.from("shift_request_rounds").update({ sent, status: nextStatus }).eq("id", r.id).eq("clinic_id", CLINIC_ID);
      }
    }
    return NextResponse.json({ ok: true, clinic: CLINIC_ID, mode: "rounds", today, rounds: rounds.length, actions });
  }

  // ── 従来運用（ラウンド未登録の院）：毎月1日に翌月分＋2週間前締切 ─────
  const [y, m] = today.split("-").map(Number);
  const d = Number(today.split("-")[2]);
  const ty = m === 12 ? y + 1 : y;
  const tm = m === 12 ? 1 : m + 1;
  const targetMonth = `${ty}-${String(tm).padStart(2, "0")}`;
  const targetStart = `${targetMonth}-01`;
  const deadline = addDays(targetStart, -14); // 2週間前
  const adminMy = `${baseUrl()}/admin/my-schedule`;

  // ① 開始：毎月1日に翌月分を案内（LINE連携済み=LINE、未連携=メール）
  if (d === 1) {
    const res = await notifyStaff(
      staff,
      `🗓️【出勤希望のお願い】\n${tm}月の出勤希望（出勤できる日・時間）の提出をお願いします。\n締切：${deadline}\n\n▼こちらから（お名前を選んで入力）\n${link}`,
      `【${clinicName}】${tm}月の出勤希望の提出のお願い`,
      `お疲れさまです。\n${tm}月の出勤希望（出勤できる日・時間）の提出をお願いします。\n\n▼こちらから提出してください（お名前を選んで入力）\n${link}\n\n締切：${deadline} まで`,
      clinicName,
    );
    await pushLineToOwners(
      CLINIC_ID,
      `🗓️ ${tm}月の出勤希望アンケートを開始しました\n配信：LINE ${res.line}名・メール ${res.mail}名\n締切：${deadline}（2週間前）\n提出状況は「出勤調整」で確認できます。\n${adminMy}`,
    );
    actions.push(`opened target=${targetMonth} line=${res.line} mail=${res.mail}`);
  }

  // ② リマインド：締切の 7/3/1日前・当日、未提出者がいれば
  const remindDays = [addDays(deadline, -7), addDays(deadline, -3), addDays(deadline, -1), deadline];
  if (remindDays.includes(today)) {
    const { data: reqRows } = await db
      .from("staff_shift_requests").select("staff_id, submitted_at")
      .eq("clinic_id", CLINIC_ID).eq("month", targetMonth);
    const submitted = new Set((reqRows ?? []).filter((r) => r.submitted_at).map((r) => r.staff_id as string));
    const unsub = staff.filter((s) => !submitted.has(s.id));
    if (unsub.length > 0) {
      const isLast = today === deadline;
      const names = unsub.map((s) => s.name).join("・");
      const res = await notifyStaff(
        unsub,
        `⏰【出勤希望・未提出のお知らせ】\n${tm}月の出勤希望がまだ未提出です。\n${isLast ? "本日が締切です。" : `締切は ${deadline} です。`}\n\n▼提出はこちら\n${link}`,
        `【${clinicName}】${tm}月の出勤希望 ${isLast ? "本日締切" : "締切間近"}のお願い`,
        `お疲れさまです。\n${tm}月の出勤希望がまだ未提出です。${isLast ? "本日が締切です。" : `締切は ${deadline} です。`}\n\n▼こちらから提出してください\n${link}`,
        clinicName,
      );
      await pushLineToOwners(
        CLINIC_ID,
        `⏰ ${tm}月の出勤希望 ${isLast ? "本日が締切" : "締切が近づいています"}（締切 ${deadline}）\n未提出 ${unsub.length}名：${names}\n配信：LINE ${res.line}名・メール ${res.mail}名`,
      );
      actions.push(`remind target=${targetMonth} unsubmitted=${unsub.length} line=${res.line} mail=${res.mail}`);
    } else {
      actions.push(`remind target=${targetMonth} all-submitted`);
    }
  }

  return NextResponse.json({ ok: true, clinic: CLINIC_ID, mode: "legacy", today, targetMonth, deadline, actions });
}
