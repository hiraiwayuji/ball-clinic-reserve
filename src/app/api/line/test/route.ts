import { NextResponse } from "next/server";
import * as line from "@line/bot-sdk";

export async function POST(req: Request) {
  try {
    const { userId, accessToken } = await req.json();
    if (!userId || !accessToken) {
      return NextResponse.json({ error: "IDまたはトークンが空です" }, { status: 400 });
    }
    const client = new line.messagingApi.MessagingApiClient({ channelAccessToken: accessToken });
    await client.pushMessage({
      to: userId,
      messages: [{ type: "text", text: "ぼーるくん、LINEテスト送信成功！⚽️" }]
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
