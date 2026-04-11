import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST /api/push/subscribe  → 購読を登録
export async function POST(req: NextRequest) {
  try {
    const { calendarId, subscription, memberName, notifyOthers } = await req.json();

    if (!calendarId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const serviceClient = getServiceClient();

    // UPSERT: 同じ endpoint があれば更新
    const { error } = await serviceClient.from("push_subscriptions").upsert(
      {
        calendar_id: calendarId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: req.headers.get("user-agent") || null,
        member_name: memberName ?? null,
        notify_others: notifyOthers !== false, // デフォルトtrue
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      console.error("[Push Subscribe] DB error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Push Subscribe] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/push/subscribe  → 通知設定だけ更新（再購読なし）
export async function PATCH(req: NextRequest) {
  try {
    const { endpoint, memberName, notifyOthers } = await req.json();
    if (!endpoint) {
      return NextResponse.json({ error: "endpoint required" }, { status: 400 });
    }
    const serviceClient = getServiceClient();
    const { error } = await serviceClient
      .from("push_subscriptions")
      .update({ member_name: memberName ?? null, notify_others: notifyOthers !== false })
      .eq("endpoint", endpoint);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/push/subscribe  → 購読を解除
export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json();
    if (!endpoint) {
      return NextResponse.json({ error: "endpoint required" }, { status: 400 });
    }

    const serviceClient = getServiceClient();
    const { error } = await serviceClient
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Push Unsubscribe] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
