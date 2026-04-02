import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const supabase = await createClient();

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as "recovery" | "email" | "signup" | "invite" | "magiclink" | "email_change",
    });
    if (!error && type === "recovery") {
      return NextResponse.redirect(`${origin}/auth/reset-password`);
    }
  }

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(`${origin}/admin`);
  }

  return NextResponse.redirect(`${origin}/admin-login`);
}
