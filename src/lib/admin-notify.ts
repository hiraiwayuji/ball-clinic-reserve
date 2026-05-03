import { createClient } from "@supabase/supabase-js";

const FALLBACK_EMAIL = "hiraiwayuji@gmail.com";

export async function getLineAccessToken(): Promise<string | null> {
  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelId || !channelSecret) {
    return process.env.LINE_CHANNEL_ACCESS_TOKEN ?? null;
  }
  try {
    const res = await fetch("https://api.line.me/v2/oauth/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=client_credentials&client_id=${channelId}&client_secret=${channelSecret}`,
    });
    const data = await res.json();
    return data.access_token ?? process.env.LINE_CHANNEL_ACCESS_TOKEN ?? null;
  } catch {
    return process.env.LINE_CHANNEL_ACCESS_TOKEN ?? null;
  }
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getOwnerLineTargets(clinicId: string): Promise<string[]> {
  const envFallback = process.env.OWNER_LINE_USER_ID;
  const sb = getServiceClient();
  if (!sb) {
    return envFallback ? [envFallback] : [];
  }
  try {
    const { data, error } = await sb
      .from("admin_notification_targets")
      .select("line_user_id")
      .eq("clinic_id", clinicId)
      .eq("enabled", true)
      .not("line_user_id", "is", null);
    if (error) {
      console.error("[admin-notify] failed to load LINE targets:", error.message);
    }
    const ids = (data ?? [])
      .map((r: { line_user_id: string | null }) => r.line_user_id)
      .filter((v): v is string => Boolean(v));
    if (ids.length > 0) return ids;
  } catch (err) {
    console.error("[admin-notify] LINE targets query error:", err);
  }
  return envFallback ? [envFallback] : [];
}

export async function getOwnerEmailTargets(clinicId: string): Promise<string[]> {
  const sb = getServiceClient();
  if (!sb) return [FALLBACK_EMAIL];
  try {
    const { data, error } = await sb
      .from("admin_notification_targets")
      .select("email")
      .eq("clinic_id", clinicId)
      .eq("enabled", true)
      .not("email", "is", null);
    if (error) {
      console.error("[admin-notify] failed to load email targets:", error.message);
    }
    const emails = (data ?? [])
      .map((r: { email: string | null }) => r.email)
      .filter((v): v is string => Boolean(v));
    if (emails.length > 0) return emails;
  } catch (err) {
    console.error("[admin-notify] email targets query error:", err);
  }
  return [FALLBACK_EMAIL];
}

export async function pushLineToOwners(clinicId: string, text: string): Promise<void> {
  const targets = await getOwnerLineTargets(clinicId);
  if (targets.length === 0) {
    console.log("[admin-notify] no LINE targets, skip push");
    return;
  }
  const token = await getLineAccessToken();
  if (!token) {
    console.error("[admin-notify] no LINE access token (env LINE_CHANNEL_ACCESS_TOKEN or LINE_CHANNEL_ID/SECRET missing)");
    return;
  }
  await Promise.all(
    targets.map(async (lineId) => {
      try {
        const res = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to: lineId, messages: [{ type: "text", text }] }),
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          console.error(`[admin-notify] LINE push failed (${res.status}) to=${lineId}: ${errBody}`);
        } else {
          console.log(`[admin-notify] LINE push success to=${lineId}`);
        }
      } catch (err) {
        console.error(`[admin-notify] LINE push error to=${lineId}:`, err);
      }
    })
  );
}

export async function pushLineToCustomer(lineUserId: string, text: string): Promise<void> {
  const token = await getLineAccessToken();
  if (!token) {
    console.error("[admin-notify] no LINE access token for customer push");
    return;
  }
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text }] }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[admin-notify] customer LINE push failed (${res.status}): ${errBody}`);
    }
  } catch (err) {
    console.error("[admin-notify] customer LINE push error:", err);
  }
}

export async function sendEmailToOwners(
  clinicId: string,
  subject: string,
  text: string,
  fromLabel: string = "ボール接骨院予約",
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  const targets = await getOwnerEmailTargets(clinicId);
  if (targets.length === 0) return;
  await Promise.all(
    targets.map(async (email) => {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: `${fromLabel} <onboarding@resend.dev>`,
            to: [email],
            subject,
            text,
          }),
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          console.error(`[admin-notify] email send failed (${res.status}) to=${email}: ${errBody}`);
        }
      } catch (err) {
        console.error(`[admin-notify] email send error to=${email}:`, err);
      }
    })
  );
}
