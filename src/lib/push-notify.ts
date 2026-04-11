/**
 * サーバーサイド専用: Web Push 通知送信ユーティリティ
 * 使用場所: Server Actions / Route Handlers のみ
 */

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  member_name: string | null;
  notify_others: boolean;
}

export async function sendPushToCalendar(
  calendarId: string,
  payload: PushPayload,
  fromMember?: string | null
): Promise<{ sent: number; failed: number }> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@ball-clinic.jp";

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("[Push] VAPID keys not configured");
    return { sent: 0, failed: 0 };
  }

  // サービスロールで購読情報を取得
  const { createClient } = await import("@supabase/supabase-js");
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: allSubs, error } = await serviceClient
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, member_name, notify_others")
    .eq("calendar_id", calendarId);

  if (error || !allSubs || allSubs.length === 0) {
    return { sent: 0, failed: 0 };
  }

  // 「他の人の予定は通知しない」設定のデバイスをフィルタ
  const subs = allSubs.filter((sub: Subscription) => {
    if (sub.notify_others) return true; // 全員通知 → 送る
    if (!fromMember) return true;       // 送信者不明 → 送る
    // 自分の予定なら通知する（member_name が一致 or 未設定）
    return !sub.member_name || sub.member_name === fromMember;
  });

  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  let sent = 0;
  let failed = 0;
  const staleEndpoints: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub: Subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            url: payload.url || `/family`,
            tag: payload.tag || "family-calendar",
          })
        );
        sent++;
      } catch (err: any) {
        failed++;
        // 410 Gone / 404 = 購読が無効 → 自動削除
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          staleEndpoints.push(sub.endpoint);
        } else {
          console.error("[Push] send error:", err?.statusCode, err?.message);
        }
      }
    })
  );

  // 無効な購読を一括削除
  if (staleEndpoints.length > 0) {
    await serviceClient
      .from("push_subscriptions")
      .delete()
      .in("endpoint", staleEndpoints);
  }

  return { sent, failed };
}
