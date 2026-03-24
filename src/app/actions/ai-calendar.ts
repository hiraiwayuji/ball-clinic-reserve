"use server";

import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { revalidatePath } from "next/cache";

async function getSupabase() {
  return await createClient();
}

const DEFAULT_CLINIC_ID = '00000000-0000-0000-0000-000000000001';

export async function extractEventsFromImage(base64Image: string, calendarId: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "AI APIキーが設定されていません" };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 画像データ（base64）の整形
    // data:image/png;base64,xxxx -> xxxx
    const base64Data = base64Image.split(",")[1] || base64Image;

    const prompt = `
      この画像はサッカーの練習や試合のスケジュール表です。
      内容を詳細に読み取り、カレンダーに登録可能なイベントのリスト（JSON形式）を抽出してください。
      
      【ルール】
      - 日付、開始時間、終了時間、イベント名（タイトル）、場所や詳細（説明）を抽出してください。
      - 2026年のスケジュールとして扱ってください（明記がない場合）。
      - 時刻が不明な場合は 00:00 〜 23:59 (終日) として扱ってください。
      - 出力は純粋なJSON配列のみにしてください。
      
      [{
        "title": "練習",
        "start_time": "2026-03-25T15:00:00+09:00",
        "end_time": "2026-03-25T17:00:00+09:00",
        "description": "グラウンドA",
        "is_all_day": false
      }]
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: "image/jpeg", // 実際には動的に判定可能だが、一旦jpeg想定
        },
      },
    ]);

    const responseText = result.response.text();
    // JSON部分のみ抽出
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("Failed to parse JSON from Gemini response:", responseText);
      return { success: false, error: "スケジュール情報の抽出に失敗しました" };
    }

    const events = JSON.parse(jsonMatch[0]);
    const supabase = await getSupabase();

    const appointmentsToInsert = events.map((ev: any) => ({
      calendar_id: calendarId,
      clinic_id: DEFAULT_CLINIC_ID,
      title: ev.title,
      description: ev.description,
      start_time: ev.start_time,
      end_time: ev.end_time,
      is_all_day: ev.is_all_day || false,
      color: "#3B82F6", // デフォルト：ブルー
    }));

    const { error } = await supabase
      .from("calendar_events")
      .insert(appointmentsToInsert);

    if (error) throw error;

    revalidatePath(`/calendar/${calendarId}`);
    return { success: true, count: events.length };

  } catch (error) {
    console.error("Error in extractEventsFromImage:", error);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}
