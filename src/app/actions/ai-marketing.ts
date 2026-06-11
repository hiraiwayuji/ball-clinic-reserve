"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/app/actions/auth";
import { getLineAccessToken, getOwnerLineTargets } from "@/lib/admin-notify";
import { revalidatePath } from "next/cache";
import {
  profileFromRow,
  sanitizeGeneratedPost,
  sanitizeMedicalAd,
  regenInstruction,
  ALLOWED_PHRASES,
  DEFAULT_BANNED_PHRASES,
  AI_IMAGE_AVOID,
  AI_IMAGE_RECOMMEND,
  POST_CATEGORIES,
  AUDIENCES,
  SPORTS,
  type MarketingProfile,
  type GeneratedPost,
  type PostInput,
  type SavedPost,
  type PostStatus,
  type BlogDraft,
  type OutputChannel,
  type RegenMode,
  type Material,
  type MediaMode,
  type ImagePack,
  type ReelPack,
  type AiImagePack,
  type StoryExtras,
  type PostIdea,
  type PostMetrics,
  metricsScore,
} from "@/lib/ai-marketing";

const GEMINI_MODEL = "gemini-2.5-flash";

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

// ── 料金プラン（フリーミアム）────────────────────────────────────────

/** clinic の現在のプラン（free / premium）を取得。 */
async function getPlan(clinicId: string): Promise<"free" | "premium"> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clinic_settings")
    .select("plan")
    .eq("id", clinicId)
    .maybeSingle();
  return data?.plan === "premium" ? "premium" : "free";
}

/** UI 用：自院のプランと、プレミアム機能が使えるかを返す。 */
export async function getMarketingAccess(): Promise<{ plan: "free" | "premium"; isPremium: boolean }> {
  const { clinicId } = await checkAdminAuth();
  const plan = await getPlan(clinicId);
  return { plan, isPremium: plan === "premium" };
}

const PREMIUM_REQUIRED_MSG = "この機能はプレミアムプラン限定です。アップグレードでご利用いただけます。";

// ── LINE販促キャンペーンの相談（SNS・LINE・販促の「内容・使い方を相談」ボタン）──
// 「どんな内容が配信されるのか」「どんな内容を配信していいのか」を
// PC・販促に不慣れな先生がそのまま聞ける窓口。プラン制限なし（標準機能のガイドのため）。
export async function consultCampaign(input: {
  campaignTitle: string;
  campaignContext: string;
  question: string;
  history?: { role: "user" | "ai"; text: string }[];
}): Promise<{ success: boolean; answer?: string; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const genAI = getGenAI();
  if (!genAI) return { success: false, error: "AI設定（GEMINI_API_KEY）が見つかりません" };

  const question = (input.question ?? "").trim().slice(0, 1000);
  if (!question) return { success: false, error: "質問を入力してください" };

  try {
    const supabase = await createClient();
    const { data: cs } = await supabase
      .from("clinic_settings")
      .select("clinic_name")
      .eq("id", clinicId)
      .maybeSingle();
    const clinicName = (cs?.clinic_name as string | undefined)?.trim() || "当院";

    const historyBlock = (input.history ?? [])
      .slice(-6)
      .map((h) => `${h.role === "user" ? "先生" : "アドバイザー"}: ${h.text}`)
      .join("\n");

    const prompt = `あなたは接骨院・整体院のLINE販促にくわしい、やさしいアドバイザーです。
相手はPCや販促に不慣れな院長先生です。専門用語を避けて、短く具体的に答えてください。

【院名】${clinicName}
【相談対象の配信機能】${input.campaignTitle}
【この機能の仕組みと、実際に患者さんに届く文面】
${input.campaignContext.slice(0, 4000)}

${historyBlock ? `【これまでのやり取り】\n${historyBlock}\n` : ""}
【先生からの質問】
${question}

回答ルール:
- 3〜6文くらいで、やさしい言葉で
- 配信文面の提案を求められたら、そのままコピペで使える文面を1つ「---」で囲んで提示する
- 「いつ・誰に・どのくらいの頻度で送るといいか」も聞かれたら具体的に
- 医療広告で問題になる表現（治る保証・誇大な効果・ビフォーアフターの断定など）は提案しない`;

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    const answer = result.response.text().trim();
    if (!answer) return { success: false, error: "回答を生成できませんでした。もう一度お試しください" };
    return { success: true, answer };
  } catch (e: any) {
    console.error("consultCampaign failed", e);
    return { success: false, error: "AIへの相談でエラーが発生しました。時間をおいてお試しください" };
  }
}

// ── プロファイル（院設定）────────────────────────────────────────────

export async function getMarketingProfile(): Promise<MarketingProfile> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_marketing_profiles")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  return profileFromRow(data as Record<string, unknown> | null);
}

export async function saveMarketingProfile(
  input: MarketingProfile,
): Promise<{ success: boolean; error?: string }> {
  const { clinicId, role } = await checkAdminAuth();
  if (role !== "owner") return { success: false, error: "オーナーのみ設定を変更できます" };
  const supabase = await createClient();

  const { error } = await supabase.from("ai_marketing_profiles").upsert(
    {
      clinic_id: clinicId,
      clinic_name: input.clinic_name?.trim() || null,
      area_name: input.area_name?.trim() || null,
      address: input.address?.trim() || null,
      strengths: input.strengths ?? [],
      menus: input.menus ?? [],
      targets: input.targets ?? [],
      tone: input.tone?.trim() || null,
      banned_phrases: input.banned_phrases ?? [],
      recommended_keywords: input.recommended_keywords ?? [],
      sns_accounts: input.sns_accounts ?? {},
      line_link: input.line_link?.trim() || null,
      reserve_url: input.reserve_url?.trim() || null,
      reference_style: input.reference_style?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "clinic_id" },
  );

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/marketing/ai-posts");
  return { success: true };
}

// ── プロンプト構築 ──────────────────────────────────────────────────

function profileBlock(p: MarketingProfile): string {
  const banned = Array.from(new Set([...DEFAULT_BANNED_PHRASES, ...p.banned_phrases]));
  return `【院の情報】
院名: ${p.clinic_name}
地域: ${p.area_name}（${p.address}）
強み: ${p.strengths.join("、")}
メニュー: ${p.menus.join("、")}
主なターゲット: ${p.targets.join("、")}
文章の雰囲気: ${p.tone}
推奨キーワード: ${p.recommended_keywords.join("、")}
${p.reserve_url ? `予約URL: ${p.reserve_url}` : ""}
${p.line_link ? `LINE導線: ${p.line_link}` : ""}

【医療広告ガイドライン（必ず守る）】
- 次の断定・優良誤認表現は絶対に使わない: ${banned.join("、")}
- 使ってよい表現の例: ${ALLOWED_PHRASES.join("、")}
- 効果には個人差がある前提で書く。治療効果を保証・断定しない。
- 症例紹介でも患者名・学校名・顔がわかる情報・特定できる個人情報は出さない。`;
}

/** 参考にしたい雰囲気・作風（院の既定＋今回の参考）。丸写し防止の注意つき。 */
function referenceBlock(profile: MarketingProfile, reference?: string): string {
  const ownStyle = profile.reference_style?.trim();
  const thisTime = reference?.trim();
  if (!ownStyle && !thisTime) return "";
  return `【参考にしたい雰囲気・作風】
${ownStyle ? `・院のお手本の雰囲気: ${ownStyle}` : ""}
${thisTime ? `・今回の参考（投稿の文章や、参考画像から読み取った特徴）:\n${thisTime}` : ""}
※あくまで「雰囲気・構成・テンション」の参考です。文章はオリジナルで作り、丸写しや特定アカウントの模倣はしないでください。医療広告ガイドラインは引き続き厳守。`;
}

function inputBlock(input: PostInput): string {
  return `【今回の投稿内容】
投稿カテゴリ: ${input.category}
対象: ${input.audience || "指定なし"}
スポーツ種別: ${input.sport || "指定なし"}
症状・テーマ: ${input.theme || "指定なし"}
施術内容: ${input.treatment || "指定なし"}
伝えたいこと: ${input.message || "指定なし"}
写真や動画: ${input.has_media ? "あり" : "なし"}
投稿の雰囲気: ${input.tone || "院の既定の雰囲気"}
注意事項: ${input.notes || "特になし"}
個人情報を含めない: ${input.no_personal_info ? "はい（必ず守る）" : "（できる限り配慮）"}`;
}

const OUTPUT_RULES = `【出力ルール】
1. Instagram投稿文: 冒頭に目を引く一文 → 本文 → 来院・相談につながる自然な導線。ハッシュタグは最大5個まで。絵文字は使いすぎない。
2. Instagramストーリー文: 1枚目・2枚目・3枚目の短い文。最後は予約や相談につながる短い文章。
3. Googleビジネス文: 300文字前後。地域名（${"${area}"}・徳島）を自然に含める。過度な宣伝にならず検索に強い文章。
4. LINE配信文: 既存患者さん向け。やさしく読みやすく、長すぎない。予約・相談・体験案内につなげる。
5. ブログ記事案: SEOタイトル / 見出し構成 / 本文下書き / メタディスクリプション / 想定キーワード / CTA文。`;

const JSON_SCHEMA_HINT = `必ず次のJSON形式のみで返してください（前置き・説明・コードフェンス不要）:
{
  "instagram_text": "string",
  "story_slides": ["1枚目", "2枚目", "3枚目"],
  "google_text": "string",
  "line_text": "string",
  "blog": {
    "seo_title": "string",
    "headings": ["見出し1", "見出し2"],
    "body": "string",
    "meta_description": "string",
    "keywords": ["キーワード1", "キーワード2"],
    "cta": "string"
  },
  "story_extras": {
    "survey": "ストーリーのアンケートスタンプ案（2択など）",
    "question_sticker": "質問スタンプ案",
    "reserve_cta": "予約・相談につながる短い導線文"
  }
}`;

function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("AI応答の形式が不正です");
  }
}

function normalizeGenerated(raw: unknown): GeneratedPost {
  const o = (raw ?? {}) as Record<string, unknown>;
  const blogRaw = (o.blog ?? {}) as Record<string, unknown>;
  const asStrArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  const blog: BlogDraft = {
    seo_title: String(blogRaw.seo_title ?? ""),
    headings: asStrArr(blogRaw.headings),
    body: String(blogRaw.body ?? ""),
    meta_description: String(blogRaw.meta_description ?? ""),
    keywords: asStrArr(blogRaw.keywords),
    cta: String(blogRaw.cta ?? ""),
  };
  const slides = asStrArr(o.story_slides).slice(0, 3);
  while (slides.length < 3) slides.push("");
  const se = (o.story_extras ?? {}) as Record<string, unknown>;
  return {
    instagram_text: String(o.instagram_text ?? ""),
    story_slides: slides,
    google_text: String(o.google_text ?? ""),
    line_text: String(o.line_text ?? ""),
    blog,
    story_extras: {
      survey: String(se.survey ?? ""),
      question_sticker: String(se.question_sticker ?? ""),
      reserve_cta: String(se.reserve_cta ?? ""),
    },
  };
}

/** clinic のプロファイルを読み込む（DB → ボール既定値フォールバック）。 */
async function loadProfile(clinicId: string): Promise<MarketingProfile> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_marketing_profiles")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  return profileFromRow(data as Record<string, unknown> | null);
}

const asStrArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)).filter((s) => s.trim()) : [];

/** 素材情報をプロンプト用テキストに整形 */
function materialsBlock(materials: Material[]): string {
  if (!materials?.length) return "素材: なし（文章のみ）";
  return `素材（${materials.length}点）:\n${materials
    .map((m, i) => `${i + 1}. [${m.category === "video" ? "動画" : "画像"}/${m.kind}]${m.memo ? ` メモ:${m.memo}` : ""}`)
    .join("\n")}`;
}

/**
 * 効果学習: 過去に反応が良かった投稿（metricsScore 上位）の傾向をプロンプトに渡す。
 * 反応の記録がない院では空文字（プロンプトに何も足さない）。
 */
async function topPostsBlock(clinicId: string): Promise<string> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("ai_marketing_posts")
      .select("category, theme, instagram_text, metrics")
      .eq("clinic_id", clinicId)
      .not("metrics", "is", null)
      .order("created_at", { ascending: false })
      .limit(30);
    const scored = (data ?? [])
      .map((r) => ({
        row: r as { category: string; theme: string | null; instagram_text: string | null; metrics: PostMetrics | null },
        score: metricsScore((r as { metrics: PostMetrics | null }).metrics),
      }))
      .filter((x) => x.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (scored.length === 0) return "";
    const lines = scored.map(({ row, score }, i) => {
      const m = row.metrics ?? {};
      const head = (row.instagram_text ?? "").replace(/\s+/g, " ").slice(0, 60);
      return `${i + 1}. カテゴリ:${row.category}／テーマ:${row.theme || "－"}（スコア${score}: いいね${m.likes || 0}・保存${m.saves || 0}・コメント${m.comments || 0}・予約${m.reservations || 0}）${head ? `\n   書き出し例:「${head}…」` : ""}`;
    });
    return `【この院で過去に反応が良かった投稿（雰囲気・切り口の参考にする。丸写しはしない）】\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

// ── 生成 ────────────────────────────────────────────────────────────

export async function generateMarketingPost(
  input: PostInput,
  reference?: string,
): Promise<{ success: boolean; post?: GeneratedPost; warnings?: string[]; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const genAI = getGenAI();
  if (!genAI) return { success: false, error: "AIのAPIキーが未設定です（GEMINI_API_KEY）" };

  const supabase = await createClient();
  const { data: profileRow } = await supabase
    .from("ai_marketing_profiles")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  const profile = profileFromRow(profileRow as Record<string, unknown> | null);
  const learning = await topPostsBlock(clinicId);

  const prompt = `あなたは接骨院の集客に強いSNSライターです。下記の院の情報と投稿内容をもとに、各SNS媒体向けの文章を日本語で作成してください。

${profileBlock(profile)}

${inputBlock(input)}

${referenceBlock(profile, reference)}

${learning}

${OUTPUT_RULES.replace("${area}", profile.area_name)}

${JSON_SCHEMA_HINT}`;

  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: "application/json" },
    });
    const result = await model.generateContent(prompt);
    const raw = normalizeGenerated(parseJsonLoose(result.response.text()));
    const banned = Array.from(new Set([...DEFAULT_BANNED_PHRASES, ...profile.banned_phrases]));
    const { post, warnings } = sanitizeGeneratedPost(raw, banned);
    return { success: true, post, warnings };
  } catch (err) {
    console.error("[ai-marketing] generate error:", err);
    return { success: false, error: "生成に失敗しました。少し時間をおいて再度お試しください。" };
  }
}

// ── 再生成（チャンネル単位）─────────────────────────────────────────

export async function regenerateChannel(
  channel: OutputChannel,
  currentText: string,
  mode: RegenMode,
  input: PostInput,
): Promise<{ success: boolean; text?: string; story?: string[]; blog?: BlogDraft; warnings?: string[]; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const genAI = getGenAI();
  if (!genAI) return { success: false, error: "AIのAPIキーが未設定です（GEMINI_API_KEY）" };

  const supabase = await createClient();
  const { data: profileRow } = await supabase
    .from("ai_marketing_profiles")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  const profile = profileFromRow(profileRow as Record<string, unknown> | null);
  const banned = Array.from(new Set([...DEFAULT_BANNED_PHRASES, ...profile.banned_phrases]));

  const channelLabel: Record<OutputChannel, string> = {
    instagram: "Instagram投稿文",
    story: "Instagramストーリー文（1枚目・2枚目・3枚目）",
    google: "Googleビジネスプロフィール投稿文（300文字前後・地域名を含める）",
    line: "LINE配信用文章（既存患者向け・やさしく）",
    blog: "ブログ記事案（SEOタイトル/見出し/本文/メタ/キーワード/CTA）",
  };

  const isStructured = channel === "story" || channel === "blog";
  const formatHint =
    channel === "story"
      ? `JSON形式: {"story_slides": ["1枚目","2枚目","3枚目"]}`
      : channel === "blog"
        ? `JSON形式: {"blog": {"seo_title","headings":[],"body","meta_description","keywords":[],"cta"}}`
        : `JSON形式: {"text": "..."}`;

  const prompt = `あなたは接骨院の集客に強いSNSライターです。次の「${channelLabel[channel]}」を、指示に従って作り直してください。

${profileBlock(profile)}

${inputBlock(input)}

【今の文章】
${currentText || "（まだありません。新しく作成してください）"}

【作り直しの指示】
${regenInstruction(mode)}
医療広告ガイドラインは引き続き厳守してください。

${formatHint}（前置き・コードフェンス不要）`;

  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: "application/json" },
    });
    const result = await model.generateContent(prompt);
    const parsed = parseJsonLoose(result.response.text()) as Record<string, unknown>;

    if (channel === "story") {
      const slidesRaw = Array.isArray(parsed.story_slides) ? (parsed.story_slides as unknown[]) : [];
      const slides = slidesRaw.map((x) => String(x)).slice(0, 3);
      while (slides.length < 3) slides.push("");
      const warnings: string[] = [];
      const clean = slides.map((s) => {
        const r = sanitizeMedicalAd(s, banned);
        warnings.push(...r.hits);
        return r.text;
      });
      return { success: true, story: clean, warnings: Array.from(new Set(warnings)) };
    }
    if (channel === "blog") {
      const norm = normalizeGenerated({ blog: parsed.blog ?? parsed });
      const { post, warnings } = sanitizeGeneratedPost(norm, banned);
      return { success: true, blog: post.blog, warnings };
    }
    const text = String(parsed.text ?? parsed.instagram_text ?? parsed.google_text ?? parsed.line_text ?? "");
    const r = sanitizeMedicalAd(text, banned);
    return { success: true, text: r.text, warnings: r.hits };
  } catch (err) {
    console.error("[ai-marketing] regenerate error:", err);
    return { success: false, error: "再生成に失敗しました。少し時間をおいて再度お試しください。" };
  }
}

// ── 画像・動画・生成AI画像 パック生成 ──────────────────────────────

async function runJson(prompt: string): Promise<Record<string, unknown>> {
  const genAI = getGenAI();
  if (!genAI) throw new Error("AIのAPIキーが未設定です（GEMINI_API_KEY）");
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { responseMimeType: "application/json" },
  });
  const result = await model.generateContent(prompt);
  return parseJsonLoose(result.response.text()) as Record<string, unknown>;
}

/** パック内のテキストフィールドをサニタイズし、警告を集約 */
function sanitizeStrings<T extends Record<string, unknown>>(
  obj: T,
  textKeys: (keyof T)[],
  arrayKeys: (keyof T)[],
  banned: string[],
): { warnings: string[] } {
  const warnings: string[] = [];
  for (const k of textKeys) {
    const v = obj[k];
    if (typeof v === "string") {
      const r = sanitizeMedicalAd(v, banned);
      warnings.push(...r.hits);
      (obj as Record<string, unknown>)[k as string] = r.text;
    }
  }
  for (const k of arrayKeys) {
    const v = obj[k];
    if (Array.isArray(v)) {
      (obj as Record<string, unknown>)[k as string] = v.map((s) => {
        const r = sanitizeMedicalAd(String(s), banned);
        warnings.push(...r.hits);
        return r.text;
      });
    }
  }
  return { warnings: Array.from(new Set(warnings)) };
}

/** 画像投稿用パック生成 */
export async function generateImagePack(
  input: PostInput,
  materials: Material[] = [],
): Promise<{ success: boolean; pack?: ImagePack; warnings?: string[]; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  if (await getPlan(clinicId) !== "premium") return { success: false, error: PREMIUM_REQUIRED_MSG };
  try {
    const profile = await loadProfile(clinicId);
    const banned = Array.from(new Set([...DEFAULT_BANNED_PHRASES, ...profile.banned_phrases]));
    const prompt = `あなたは接骨院の集客に強いSNS・画像デザインのプロです。下記をもとに「画像投稿用」の素材案を作成してください。

${profileBlock(profile)}

${inputBlock(input)}

${materialsBlock(materials)}

【守ること】医療広告ガイドラインを厳守。画像内テロップでも断定・優良誤認表現は使わない。個人情報（患者名・学校名・顔がわかる素材・カルテ）は出さない前提でチェック項目を作る。

必ず次のJSON形式のみで返してください（前置き・コードフェンス不要）:
{
  "image_title": "画像のタイトル",
  "in_image_telop": ["画像に入れる短いテロップ1", "テロップ2"],
  "design_direction": "デザインの方向性（色・雰囲気・構図）",
  "canva_instructions": "Canvaでの作成手順・指示（具体的に）",
  "thumbnail_title": "サムネイルタイトル案",
  "post_text": "投稿文",
  "hashtags": ["#タグ"],
  "image_description": "画像説明文",
  "alt_text": "代替テキスト（alt）",
  "privacy_checklist": ["写り込んだ顔はぼかす 等の確認項目"]
}`;
    const raw = await runJson(prompt);
    const pack: ImagePack = {
      image_title: String(raw.image_title ?? ""),
      in_image_telop: asStrArr(raw.in_image_telop),
      design_direction: String(raw.design_direction ?? ""),
      canva_instructions: String(raw.canva_instructions ?? ""),
      thumbnail_title: String(raw.thumbnail_title ?? ""),
      post_text: String(raw.post_text ?? ""),
      hashtags: asStrArr(raw.hashtags).slice(0, 5),
      image_description: String(raw.image_description ?? ""),
      alt_text: String(raw.alt_text ?? ""),
      privacy_checklist: asStrArr(raw.privacy_checklist),
    };
    const { warnings } = sanitizeStrings(
      pack as unknown as Record<string, unknown>,
      ["image_title", "design_direction", "canva_instructions", "thumbnail_title", "post_text", "image_description", "alt_text"],
      ["in_image_telop"],
      banned,
    );
    return { success: true, pack, warnings };
  } catch (err) {
    console.error("[ai-marketing] image pack error:", err);
    return { success: false, error: "画像投稿用の生成に失敗しました" };
  }
}

/** リール動画用パック生成（MVP: 動画内容は video_context のテキストから） */
export async function generateReelPack(
  input: PostInput,
  videoContext: string,
  materials: Material[] = [],
): Promise<{ success: boolean; pack?: ReelPack; warnings?: string[]; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  if (await getPlan(clinicId) !== "premium") return { success: false, error: PREMIUM_REQUIRED_MSG };
  try {
    const profile = await loadProfile(clinicId);
    const banned = Array.from(new Set([...DEFAULT_BANNED_PHRASES, ...profile.banned_phrases]));
    const prompt = `あなたは接骨院の集客に強いショート動画（リール）の構成作家です。下記をもとに「リール動画用」の案を作成してください。

${profileBlock(profile)}

${inputBlock(input)}

${materialsBlock(materials)}

【動画の内容（ユーザー入力）】
${videoContext || "（未入力。テーマと施術内容から想像して構成してください）"}

【守ること】医療広告ガイドラインを厳守。テロップ・ナレーションでも断定表現は使わない。個人が特定される情報は出さない。

必ず次のJSON形式のみで返してください（前置き・コードフェンス不要）:
{
  "reel_title": "リールのタイトル",
  "hook": "冒頭3秒のフック文",
  "structure_15s": ["0-3秒: ...", "3-8秒: ...", "8-15秒: ..."],
  "structure_30s": ["0-3秒: ...", "..."],
  "cut_structure": ["カット1: ...", "カット2: ..."],
  "telops": ["テロップ1", "テロップ2"],
  "narration": "ナレーション案（全体）",
  "thumbnail_text": "サムネイル文言",
  "post_text": "投稿文（キャプション）",
  "x_text": "X(旧Twitter)投稿文（140字程度）"
}`;
    const raw = await runJson(prompt);
    const pack: ReelPack = {
      reel_title: String(raw.reel_title ?? ""),
      hook: String(raw.hook ?? ""),
      structure_15s: asStrArr(raw.structure_15s),
      structure_30s: asStrArr(raw.structure_30s),
      cut_structure: asStrArr(raw.cut_structure),
      telops: asStrArr(raw.telops),
      narration: String(raw.narration ?? ""),
      thumbnail_text: String(raw.thumbnail_text ?? ""),
      post_text: String(raw.post_text ?? ""),
      x_text: String(raw.x_text ?? ""),
    };
    const { warnings } = sanitizeStrings(
      pack as unknown as Record<string, unknown>,
      ["reel_title", "hook", "narration", "thumbnail_text", "post_text", "x_text"],
      ["structure_15s", "structure_30s", "cut_structure", "telops"],
      banned,
    );
    return { success: true, pack, warnings };
  } catch (err) {
    console.error("[ai-marketing] reel pack error:", err);
    return { success: false, error: "リール動画用の生成に失敗しました" };
  }
}

/** 生成AI画像用プロンプトパック生成 */
export async function generateAiImagePack(
  input: PostInput,
): Promise<{ success: boolean; pack?: AiImagePack; warnings?: string[]; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  if (await getPlan(clinicId) !== "premium") return { success: false, error: PREMIUM_REQUIRED_MSG };
  try {
    const profile = await loadProfile(clinicId);
    const banned = Array.from(new Set([...DEFAULT_BANNED_PHRASES, ...profile.banned_phrases]));
    const prompt = `あなたは画像生成AIのプロンプト設計のプロです。接骨院の投稿に使う「生成AI画像」のプロンプトを作成してください。

${profileBlock(profile)}

${inputBlock(input)}

【医療・健康系の画像で避ける表現（必ず避ける）】
${AI_IMAGE_AVOID.map((s) => `- ${s}`).join("\n")}

【推奨する表現】
${AI_IMAGE_RECOMMEND.map((s) => `- ${s}`).join("\n")}

各ツール向けのプロンプトは、そのツールの作法に合わせて書いてください（Midjourneyは英語＋パラメータ可、ChatGPT/Canvaは日本語の自然文、Soraは動画の動き・時間を含む）。

必ず次のJSON形式のみで返してください（前置き・コードフェンス不要）:
{
  "prompt": "基本の画像生成プロンプト（日本語）",
  "prompt_portrait": "縦長(9:16)用プロンプト",
  "prompt_square": "正方形(1:1)用プロンプト",
  "prompt_blog_eyecatch": "ブログアイキャッチ(16:9)用プロンプト",
  "in_image_text": "画像に入れる文字案",
  "canva_prompt": "Canvaのマジック生成用プロンプト",
  "sora_prompt": "Sora用の動画生成プロンプト",
  "midjourney_prompt": "Midjourney用プロンプト（英語+パラメータ可）",
  "chatgpt_prompt": "ChatGPT画像生成用プロンプト",
  "notes": "この画像を使うときの注意書き（誤解を招かないための一言）"
}`;
    const raw = await runJson(prompt);
    const pack: AiImagePack = {
      prompt: String(raw.prompt ?? ""),
      prompt_portrait: String(raw.prompt_portrait ?? ""),
      prompt_square: String(raw.prompt_square ?? ""),
      prompt_blog_eyecatch: String(raw.prompt_blog_eyecatch ?? ""),
      in_image_text: String(raw.in_image_text ?? ""),
      canva_prompt: String(raw.canva_prompt ?? ""),
      sora_prompt: String(raw.sora_prompt ?? ""),
      midjourney_prompt: String(raw.midjourney_prompt ?? ""),
      chatgpt_prompt: String(raw.chatgpt_prompt ?? ""),
      notes: String(raw.notes ?? ""),
    };
    // プロンプト本文は言い換えると壊れるため、日本語の表示系(notes/in_image_text)のみサニタイズ
    const { warnings } = sanitizeStrings(
      pack as unknown as Record<string, unknown>,
      ["in_image_text", "notes"],
      [],
      banned,
    );
    return { success: true, pack, warnings };
  } catch (err) {
    console.error("[ai-marketing] ai-image pack error:", err);
    return { success: false, error: "生成AI画像プロンプトの作成に失敗しました" };
  }
}

// ── 今日のネタ提案 ──────────────────────────────────────────────────

/** 季節・行事・院の強み・最近の傾向から、今投稿すると良いネタを提案する。基本機能（無料）。 */
export async function suggestPostIdeas(
  todayStr: string,
  count = 3,
): Promise<{ success: boolean; ideas?: PostIdea[]; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const genAI = getGenAI();
  if (!genAI) return { success: false, error: "AIのAPIキーが未設定です（GEMINI_API_KEY）" };
  try {
    const supabase = await createClient();
    const profile = await loadProfile(clinicId);
    // 直近の投稿カテゴリ（偏り回避のため）
    const { data: recent } = await supabase
      .from("ai_marketing_posts")
      .select("category")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(15);
    const recentCats = (recent ?? []).map((r) => (r as { category: string }).category);
    const recentLine = recentCats.length ? `最近よく作ったカテゴリ（偏らないよう別の切り口も）: ${recentCats.join("、")}` : "";

    // 時事ネタ・天気（external_health_signals: 県単位の共通データ。取れなくても提案は続行）
    let signalsLine = "";
    try {
      const { data: signals } = await supabase
        .from("external_health_signals")
        .select("signal_type, summary, observed_for")
        .order("observed_for", { ascending: false })
        .limit(8);
      const seenTypes = new Set<string>();
      const picked = (signals ?? [])
        .filter((s) => {
          const t = (s as { signal_type: string }).signal_type;
          if (seenTypes.has(t)) return false;
          seenTypes.add(t);
          return true;
        })
        .slice(0, 4)
        .map((s) => (s as { summary: string | null }).summary)
        .filter(Boolean);
      if (picked.length) {
        signalsLine = `今日の天気・時事（体調や運動と絡めてネタに活かす）:\n${picked.map((s) => `・${s}`).join("\n")}`;
      }
    } catch {
      // 時事ネタの取得失敗は無視
    }

    // 効果学習（反応が良かった投稿の傾向に寄せたネタも混ぜる）
    const learning = await topPostsBlock(clinicId);

    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: "application/json" },
    });
    const prompt = `あなたは接骨院のSNS集客プランナーです。今日の日付と院の情報をもとに、今投稿すると効果的なSNSネタを${count}個、日本語で提案してください。

${profileBlock(profile)}

今日の日付: ${todayStr}
${recentLine}
${signalsLine}
${learning}

【守ること】季節・行事・天気・新学期や大会シーズンなど時季性も意識する。院の強みを活かす。医療広告ガイドラインを守る。category は次から選ぶ: ${POST_CATEGORIES.join("、")}。audience は次から（不要なら空）: ${AUDIENCES.join("、")}。

必ず次のJSON配列のみで返してください（前置き・コードフェンス不要）:
[{"category":"","audience":"","theme":"投稿テーマ（具体的に）","reason":"なぜ今これがおすすめか（30字程度）"}]`;
    const result = await model.generateContent(prompt);
    const raw = parseJsonLoose(result.response.text());
    const arr = Array.isArray(raw) ? raw : Array.isArray((raw as { ideas?: unknown }).ideas) ? (raw as { ideas: unknown[] }).ideas : [];
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const ideas: PostIdea[] = (arr as Record<string, unknown>[]).slice(0, count).map((o) => ({
      category: POST_CATEGORIES.includes(str(o.category) as never) ? str(o.category) : "健康情報",
      audience: AUDIENCES.includes(str(o.audience) as never) ? str(o.audience) : "",
      theme: str(o.theme),
      reason: str(o.reason),
    }));
    return { success: true, ideas };
  } catch (err) {
    console.error("[ai-marketing] suggestPostIdeas error:", err);
    return { success: false, error: "ネタの提案に失敗しました" };
  }
}

// ── 写真から下書き（画像解析）・音声入力 ────────────────────────────

export type PhotoSuggestion = {
  category: string;
  audience: string;
  sport: string;
  theme: string;
  treatment: string;
  message: string;
  privacy_warnings: string[];
};

/** 写真を解析して、投稿フォームの下書き（カテゴリ・テーマ等）を推測。プレミアム限定。 */
export async function analyzePhoto(
  imageUrl: string,
): Promise<{ success: boolean; suggestion?: PhotoSuggestion; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  if (await getPlan(clinicId) !== "premium") return { success: false, error: PREMIUM_REQUIRED_MSG };
  const genAI = getGenAI();
  if (!genAI) return { success: false, error: "AIのAPIキーが未設定です（GEMINI_API_KEY）" };
  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) return { success: false, error: "画像の取得に失敗しました" };
    const mime = resp.headers.get("content-type") || "image/jpeg";
    if (!mime.startsWith("image/")) return { success: false, error: "画像ファイルではありません（動画は解析できません）" };
    const base64 = Buffer.from(await resp.arrayBuffer()).toString("base64");

    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: "application/json" },
    });
    const prompt = `この写真は接骨院のSNS投稿に使う素材です。写真をよく見て、投稿の下書きに使う情報を日本語で推測してください。わからない項目は空文字にしてください。
- category: 次から最も近いもの1つ → ${POST_CATEGORIES.join("、")}
- audience: 次から（不明なら空） → ${AUDIENCES.join("、")}
- sport: 次から（関係なければ空） → ${SPORTS.join("、")}
- theme: 写真から読み取れる症状・テーマ
- treatment: 写っている施術・機器（例: 音叉療法 / 水素吸入 / トレーニング指導 / 姿勢チェック）
- message: この写真で伝えられそうなこと（短く1〜2文）
- privacy_warnings: 患者の顔・名札・カルテ・住所・電話番号など個人が特定できる写り込みがあれば、その内容を配列で。なければ空配列。

必ず次のJSONのみ: {"category":"","audience":"","sport":"","theme":"","treatment":"","message":"","privacy_warnings":[]}`;
    const result = await model.generateContent([{ inlineData: { mimeType: mime, data: base64 } }, prompt]);
    const raw = parseJsonLoose(result.response.text()) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    // category/audience/sport は選択肢に存在する値のみ採用
    const pick = (v: unknown, allowed: readonly string[]) => (allowed.includes(str(v)) ? str(v) : "");
    const suggestion: PhotoSuggestion = {
      category: pick(raw.category, POST_CATEGORIES) || "お知らせ",
      audience: pick(raw.audience, AUDIENCES),
      sport: pick(raw.sport, SPORTS),
      theme: str(raw.theme),
      treatment: str(raw.treatment),
      message: str(raw.message),
      privacy_warnings: asStrArr(raw.privacy_warnings),
    };
    return { success: true, suggestion };
  } catch (err) {
    console.error("[ai-marketing] analyzePhoto error:", err);
    return { success: false, error: "写真の解析に失敗しました" };
  }
}

const IMAGE_MODEL = "gemini-2.5-flash-image";

/** 生成AI画像を“実物”として生成。プレミアム限定。data URL（image/png）を返す。 */
export async function generateAiImage(
  prompt: string,
  aspect: "square" | "portrait" | "landscape" = "square",
): Promise<{ success: boolean; dataUrl?: string; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  if (await getPlan(clinicId) !== "premium") return { success: false, error: PREMIUM_REQUIRED_MSG };
  const genAI = getGenAI();
  if (!genAI) return { success: false, error: "AIのAPIキーが未設定です（GEMINI_API_KEY）" };
  if (!prompt?.trim()) return { success: false, error: "画像の指示文がありません" };
  const aspectHint =
    aspect === "portrait"
      ? "縦長（9:16、スマホのストーリー向き）の構図で。"
      : aspect === "landscape"
        ? "横長（16:9、ブログのアイキャッチ向き）の構図で。"
        : "正方形（1:1）の構図で。";
  try {
    const model = genAI.getGenerativeModel({
      model: IMAGE_MODEL,
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] } as unknown as Record<string, unknown>,
    });
    const result = await model.generateContent(
      `${prompt}\n${aspectHint}\n医療効果を断定する表現や、実在患者と誤認される人物は避け、安心感のある健康的な雰囲気で。画像内に文字は入れないでください。`,
    );
    const parts = result.response.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find((p) => (p as { inlineData?: unknown }).inlineData) as
      | { inlineData?: { data: string; mimeType: string } }
      | undefined;
    if (!img?.inlineData?.data) return { success: false, error: "画像を生成できませんでした。指示文を変えてお試しください。" };
    const mime = img.inlineData.mimeType || "image/png";
    return { success: true, dataUrl: `data:${mime};base64,${img.inlineData.data}` };
  } catch (err) {
    console.error("[ai-marketing] generateAiImage error:", err);
    return { success: false, error: "画像の生成に失敗しました。少し時間をおいて再度お試しください。" };
  }
}

/** 参考にしたい投稿のスクショから、文体・構成・雰囲気の特徴を読み取る。プレミアム限定。 */
export async function analyzeReferenceStyle(
  imageUrl: string,
): Promise<{ success: boolean; style?: string; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  if (await getPlan(clinicId) !== "premium") return { success: false, error: PREMIUM_REQUIRED_MSG };
  const genAI = getGenAI();
  if (!genAI) return { success: false, error: "AIのAPIキーが未設定です（GEMINI_API_KEY）" };
  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) return { success: false, error: "画像の取得に失敗しました" };
    const mime = resp.headers.get("content-type") || "image/jpeg";
    if (!mime.startsWith("image/")) return { success: false, error: "画像ファイルではありません" };
    const base64 = Buffer.from(await resp.arrayBuffer()).toString("base64");
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const prompt = `これは「参考にしたいSNS投稿」のスクリーンショットです。この投稿の【雰囲気・文体・構成】の特徴を、箇条書きで日本語でまとめてください（後で別の投稿を作るときの“参考メモ”にします）。
観点の例: テンション（やさしい/熱い等）、語り口（です・ます/フランク）、絵文字の量、文の長さ、構成（フック→本文→締め 等）、ハッシュタグの付け方。
※具体的な本文の丸写しはせず、あくまで「作風の特徴」だけを書いてください。前置き不要、箇条書きのみ。`;
    const result = await model.generateContent([{ inlineData: { mimeType: mime, data: base64 } }, prompt]);
    const style = result.response.text().trim();
    return { success: true, style };
  } catch (err) {
    console.error("[ai-marketing] analyzeReferenceStyle error:", err);
    return { success: false, error: "参考画像の読み取りに失敗しました" };
  }
}

/** 音声を文字起こし（フォーム入力の補助）。基本機能なので無料プランでも利用可。 */
export async function transcribeVoice(
  base64: string,
  mime: string,
): Promise<{ success: boolean; text?: string; error?: string }> {
  await checkAdminAuth();
  const genAI = getGenAI();
  if (!genAI) return { success: false, error: "AIのAPIキーが未設定です（GEMINI_API_KEY）" };
  if (!base64) return { success: false, error: "音声がありません" };
  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent([
      { inlineData: { mimeType: mime || "audio/webm", data: base64 } },
      "この音声を日本語で文字起こししてください。話し言葉のまま、適切に句読点を付けてください。前置きや説明・かぎ括弧は不要で、文字起こしした本文のみを返してください。",
    ]);
    return { success: true, text: result.response.text().trim() };
  } catch (err) {
    console.error("[ai-marketing] transcribeVoice error:", err);
    return { success: false, error: "音声の文字起こしに失敗しました" };
  }
}

// ── 保存・一覧・更新・削除 ──────────────────────────────────────────

export type SavePostInput = PostInput & {
  instagram_text: string;
  story_slides: string[];
  google_text: string;
  line_text: string;
  blog: BlogDraft | null;
  status?: PostStatus;
  memo?: string;
  // 画像・動画・生成AI画像
  materials?: Material[];
  media_modes?: MediaMode[];
  video_context?: string;
  image_pack?: ImagePack | null;
  reel_pack?: ReelPack | null;
  ai_image_pack?: AiImagePack | null;
  story_extras?: StoryExtras | null;
  scheduled_date?: string | null;
  posted_date?: string | null;
};

export async function saveMarketingPost(
  input: SavePostInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_marketing_posts")
    .insert({
      clinic_id: clinicId,
      category: input.category,
      audience: input.audience || null,
      sport: input.sport || null,
      theme: input.theme || null,
      treatment: input.treatment || null,
      message: input.message || null,
      has_media: !!input.has_media,
      tone: input.tone || null,
      notes: input.notes || null,
      no_personal_info: input.no_personal_info !== false,
      instagram_text: input.instagram_text || null,
      story_slides: input.story_slides ?? [],
      google_text: input.google_text || null,
      line_text: input.line_text || null,
      blog: input.blog ?? null,
      status: input.status ?? "draft",
      memo: input.memo || null,
      materials: input.materials ?? [],
      media_modes: input.media_modes ?? [],
      video_context: input.video_context || null,
      image_pack: input.image_pack ?? null,
      reel_pack: input.reel_pack ?? null,
      ai_image_pack: input.ai_image_pack ?? null,
      story_extras: input.story_extras ?? null,
      scheduled_date: input.scheduled_date || null,
      posted_date: input.posted_date || null,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/marketing/ai-posts");
  return { success: true, id: data.id };
}

export type ListFilters = {
  category?: string;
  status?: PostStatus;
  channel?: OutputChannel; // 指定媒体の文章が入っているものだけ
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  keyword?: string;
};

export async function listMarketingPosts(filters: ListFilters = {}): Promise<SavedPost[]> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();

  let q = supabase
    .from("ai_marketing_posts")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });

  if (filters.category) q = q.eq("category", filters.category);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.dateFrom) q = q.gte("created_at", `${filters.dateFrom}T00:00:00`);
  if (filters.dateTo) q = q.lte("created_at", `${filters.dateTo}T23:59:59`);

  const { data, error } = await q;
  if (error) {
    console.error("[ai-marketing] list error:", error.message);
    return [];
  }

  let rows = (data ?? []) as unknown as SavedPost[];

  // 媒体フィルタ（その媒体の文章が入っているもの）
  if (filters.channel) {
    rows = rows.filter((r) => {
      switch (filters.channel) {
        case "instagram":
          return !!r.instagram_text;
        case "story":
          return Array.isArray(r.story_slides) && r.story_slides.some(Boolean);
        case "google":
          return !!r.google_text;
        case "line":
          return !!r.line_text;
        case "blog":
          return !!r.blog && !!r.blog.body;
        default:
          return true;
      }
    });
  }

  // キーワード検索（テーマ・本文系を横断）
  if (filters.keyword?.trim()) {
    const kw = filters.keyword.trim().toLowerCase();
    rows = rows.filter((r) => {
      const hay = [
        r.theme,
        r.message,
        r.treatment,
        r.instagram_text,
        r.google_text,
        r.line_text,
        r.blog?.seo_title,
        r.blog?.body,
        ...(r.story_slides ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(kw);
    });
  }

  return rows;
}

export async function getMarketingPost(id: string): Promise<SavedPost | null> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_marketing_posts")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as SavedPost;
}

export async function updateMarketingPostStatus(
  id: string,
  status: PostStatus,
): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_marketing_posts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("clinic_id", clinicId)
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/marketing/ai-posts");
  return { success: true };
}

export async function updateMarketingPostMemo(
  id: string,
  memo: string,
): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_marketing_posts")
    .update({ memo: memo || null, updated_at: new Date().toISOString() })
    .eq("clinic_id", clinicId)
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/marketing/ai-posts");
  return { success: true };
}

export async function updateMarketingPostDates(
  id: string,
  dates: { scheduled_date?: string | null; posted_date?: string | null },
): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("scheduled_date" in dates) patch.scheduled_date = dates.scheduled_date || null;
  if ("posted_date" in dates) patch.posted_date = dates.posted_date || null;
  const { error } = await supabase
    .from("ai_marketing_posts")
    .update(patch)
    .eq("clinic_id", clinicId)
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/marketing/ai-posts");
  return { success: true };
}

export async function updateMarketingPostMetrics(
  id: string,
  metrics: PostMetrics,
): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();
  // 0 や空メモだけの実体ない記録は null に寄せず、入力された数値はそのまま保存
  const clean: PostMetrics = {
    likes: Number(metrics.likes) || 0,
    saves: Number(metrics.saves) || 0,
    comments: Number(metrics.comments) || 0,
    reach: Number(metrics.reach) || 0,
    reservations: Number(metrics.reservations) || 0,
    memo: metrics.memo?.trim() || "",
  };
  const { error } = await supabase
    .from("ai_marketing_posts")
    .update({ metrics: clean, updated_at: new Date().toISOString() })
    .eq("clinic_id", clinicId)
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/marketing/ai-posts");
  return { success: true };
}

// ── 効果サマリー・月次レポート ──────────────────────────────────────

export type EffectSummary = {
  monthLabel: string;
  totalPosts: number;
  statusCounts: Record<string, number>;
  totals: { likes: number; saves: number; comments: number; reach: number; reservations: number };
  byCategory: { category: string; count: number; score: number }[];
  top: { id: string; category: string; theme: string; score: number; metrics: PostMetrics | null }[];
};

/** 指定月（YYYY-MM）の効果サマリーを集計（投稿予定日→なければ作成日で月を判定）。 */
export async function getEffectSummary(monthStr: string): Promise<EffectSummary> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_marketing_posts")
    .select("*")
    .eq("clinic_id", clinicId);
  const rows = ((data ?? []) as unknown as SavedPost[]).filter((p) => {
    const key = (p.scheduled_date || p.created_at || "").slice(0, 7);
    return key === monthStr;
  });

  const totals = { likes: 0, saves: 0, comments: 0, reach: 0, reservations: 0 };
  const statusCounts: Record<string, number> = {};
  const catMap: Record<string, { count: number; score: number }> = {};
  for (const p of rows) {
    statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
    const m = p.metrics;
    if (m) {
      totals.likes += m.likes || 0;
      totals.saves += m.saves || 0;
      totals.comments += m.comments || 0;
      totals.reach += m.reach || 0;
      totals.reservations += m.reservations || 0;
    }
    const c = (catMap[p.category] ||= { count: 0, score: 0 });
    c.count += 1;
    c.score += metricsScore(m);
  }
  const byCategory = Object.entries(catMap)
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.score - a.score || b.count - a.count);
  const top = [...rows]
    .map((p) => ({
      id: p.id,
      category: p.category,
      theme: p.theme || p.blog?.seo_title || "（テーマ未設定）",
      score: metricsScore(p.metrics),
      metrics: p.metrics,
    }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const [y, m] = monthStr.split("-");
  return {
    monthLabel: `${y}年${Number(m)}月`,
    totalPosts: rows.length,
    statusCounts,
    totals,
    byCategory,
    top,
  };
}

/** 院長向けの月次レポート文（やさしい言葉）をAIで生成。コピーしてLINE等で送れる。基本機能（無料）。 */
export async function generateMonthlyReport(
  monthStr: string,
): Promise<{ success: boolean; text?: string; summary?: EffectSummary; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const genAI = getGenAI();
  if (!genAI) return { success: false, error: "AIのAPIキーが未設定です（GEMINI_API_KEY）" };
  try {
    const summary = await getEffectSummary(monthStr);
    const profile = await loadProfile(clinicId);
    const topLine = summary.top.length
      ? summary.top.map((t, i) => `${i + 1}位: [${t.category}] ${t.theme}（反応スコア${t.score}）`).join(" / ")
      : "まだ反応の記録がありません";
    const catLine = summary.byCategory.length
      ? summary.byCategory.map((c) => `${c.category}:${c.count}本`).join("、")
      : "なし";

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const prompt = `あなたは接骨院の集客サポートAIです。下記の今月のSNS投稿データをもとに、院長先生への月次レポートを、やさしく前向きな言葉で書いてください。PCが苦手な先生にも伝わるように、専門用語を避けて、短めに。

院名: ${profile.clinic_name}（${profile.area_name}）
対象月: ${summary.monthLabel}
投稿数: ${summary.totalPosts}本（${Object.entries(summary.statusCounts).map(([k, v]) => `${k}:${v}`).join("、") || "なし"}）
反応の合計: いいね${summary.totals.likes} / 保存${summary.totals.saves} / コメント${summary.totals.comments} / 予約や相談につながった数${summary.totals.reservations}
カテゴリ別の本数: ${catLine}
反応が良かった投稿: ${topLine}

構成:
1. 今月のがんばりをねぎらう一言
2. 数字のかんたんなふりかえり（良かった点）
3. 反応が良かった投稿から分かること
4. 来月やってみると良いこと（具体的に1〜2個）

300〜400字程度。見出しや記号で読みやすく。最後は前向きに締める。`;
    const result = await model.generateContent(prompt);
    return { success: true, text: result.response.text().trim(), summary };
  } catch (err) {
    console.error("[ai-marketing] monthly report error:", err);
    return { success: false, error: "レポートの作成に失敗しました" };
  }
}

export async function deleteMarketingPost(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_marketing_posts")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/marketing/ai-posts");
  return { success: true };
}

// ── LINE一斉配信（生成した LINE 配信文をコピペなしでそのまま患者へ）──────

async function pushLineText(token: string, to: string, text: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[ai-marketing] LINE push failed (${res.status}): ${body}`);
    }
    return res.ok;
  } catch (err) {
    console.error("[ai-marketing] LINE push error:", err);
    return false;
  }
}

/** 配信先（LINE連携済みの患者）の人数。配信前の確認ダイアログで表示する。 */
export async function getLineBroadcastInfo(): Promise<{ success: boolean; count: number; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .not("line_user_id", "is", null);
  if (error) return { success: false, count: 0, error: error.message };
  return { success: true, count: count ?? 0 };
}

/**
 * 保存済み投稿の LINE 配信文を一斉配信する。
 * test=true なら管理者（admin_notification_targets）の LINE にだけ試し送り。
 */
export async function broadcastPostLineText(
  postId: string,
  options: { test?: boolean } = {},
): Promise<{ success: boolean; sent: number; sentAt?: string; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();

  const { data: post } = await supabase
    .from("ai_marketing_posts")
    .select("id, line_text")
    .eq("clinic_id", clinicId)
    .eq("id", postId)
    .maybeSingle();
  const text = ((post as { line_text: string | null } | null)?.line_text ?? "").trim();
  if (!text) return { success: false, sent: 0, error: "LINE配信文がありません" };

  const token = await getLineAccessToken();
  if (!token) {
    return { success: false, sent: 0, error: "LINEトークンが取得できません。LINE設定（Channel ID/Secret）を確認してください。" };
  }

  // 試し送り: 管理者のLINEにだけ送る（患者には届かない）
  if (options.test) {
    const owners = await getOwnerLineTargets(clinicId);
    if (owners.length === 0) {
      return { success: false, sent: 0, error: "試し送り先（管理者のLINE）が登録されていません" };
    }
    let sent = 0;
    for (const to of owners) {
      if (await pushLineText(token, to, `【テスト送信・患者さんには届いていません】\n\n${text}`)) sent++;
    }
    if (sent === 0) return { success: false, sent: 0, error: "テスト送信に失敗しました" };
    return { success: true, sent };
  }

  const { data: customers, error } = await supabase
    .from("customers")
    .select("name, line_user_id")
    .eq("clinic_id", clinicId)
    .not("line_user_id", "is", null);
  if (error) return { success: false, sent: 0, error: "配信先の取得に失敗しました" };

  const targets = (customers ?? []) as { name: string | null; line_user_id: string }[];
  let sent = 0;
  if (text.includes("{name}")) {
    // 名前差し込みあり: 1人ずつ送る
    for (const c of targets) {
      if (await pushLineText(token, c.line_user_id, text.replace(/{name}/g, c.name ?? ""))) sent++;
    }
  } else {
    // 全員同文: multicast（最大500人/回）でまとめて送る（タイムアウト回避）
    const ids = Array.from(new Set(targets.map((c) => c.line_user_id)));
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      try {
        const res = await fetch("https://api.line.me/v2/bot/message/multicast", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to: chunk, messages: [{ type: "text", text }] }),
        });
        if (res.ok) {
          sent += chunk.length;
        } else {
          const body = await res.text().catch(() => "");
          console.error(`[ai-marketing] LINE multicast failed (${res.status}): ${body}`);
        }
      } catch (err) {
        console.error("[ai-marketing] LINE multicast error:", err);
      }
    }
  }

  const sentAt = new Date().toISOString();
  await supabase
    .from("ai_marketing_posts")
    .update({ line_sent_at: sentAt, line_sent_count: sent, updated_at: sentAt })
    .eq("clinic_id", clinicId)
    .eq("id", postId);

  revalidatePath("/admin/marketing/ai-posts");
  return { success: true, sent, sentAt };
}
