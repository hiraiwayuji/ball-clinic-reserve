/**
 * AI集客投稿アシスタント — 共通定数・型・ボール接骨院の既定プロファイル・医療広告ガイドラインの整形ロジック。
 *
 * サーバー専用 import を持たない（client / server 両方から読める）。
 * 将来の他院横展開: ai_marketing_profiles を院ごとに保存し、未設定時はここの BALL_DEFAULT_PROFILE にフォールバックする。
 */

// ── 選択肢（フォームUIとプロンプト生成で共有）─────────────────────────

export const POST_CATEGORIES = [
  "症例紹介",
  "オスグッド",
  "スポーツ障害",
  "水素吸入",
  "音叉療法",
  "トレーニング",
  "イベント告知",
  "お知らせ",
  "健康情報",
  "休診案内",
  "Google口コミ依頼",
] as const;

export const AUDIENCES = [
  "小学生",
  "中学生",
  "高校生",
  "大人",
  "高齢者",
  "アスリート",
  "保護者",
] as const;

export const SPORTS = [
  "サッカー",
  "野球",
  "バスケ",
  "バレー",
  "陸上",
  "バドミントン",
  "その他",
] as const;

export const TONES = [
  "やさしい",
  "専門的",
  "熱い",
  "親しみやすい",
  "保護者向け",
  "アスリート向け",
] as const;

export type PostCategory = (typeof POST_CATEGORIES)[number];
export type Audience = (typeof AUDIENCES)[number];
export type Sport = (typeof SPORTS)[number];
export type Tone = (typeof TONES)[number];

export type PostStatus = "draft" | "reviewed" | "posted" | "rejected";

export const STATUS_LABELS: Record<PostStatus, string> = {
  draft: "下書き",
  reviewed: "確認済み",
  posted: "投稿済み",
  rejected: "ボツ",
};

/** 再生成ボタン（モード）。チャンネルごとの文章を作り直すときの方向性。 */
export const REGEN_MODES = [
  { key: "shorter", label: "もっと短く" },
  { key: "friendlier", label: "もっと親しみやすく" },
  { key: "professional", label: "もっと専門的に" },
  { key: "for-parents", label: "保護者向けにする" },
  { key: "for-athletes", label: "アスリート向けにする" },
  { key: "seo-strong", label: "Google検索向けに強くする" },
  { key: "ig-readable", label: "Instagram向けに読みやすくする" },
] as const;

export type RegenMode = (typeof REGEN_MODES)[number]["key"];

const REGEN_INSTRUCTIONS: Record<RegenMode, string> = {
  shorter: "情報を絞り、より短く読みやすくしてください。冗長な表現を削ります。",
  friendlier: "もっと親しみやすく、やわらかい言葉づかいにしてください。",
  professional: "もっと専門的で信頼感のある言葉づかいにしてください（ただし難しすぎない範囲で）。",
  "for-parents": "スポーツを頑張る子どもの保護者に向けて、不安に寄り添う言葉づかいにしてください。",
  "for-athletes": "競技力向上やパフォーマンスを意識するアスリートに向けた言葉づかいにしてください。",
  "seo-strong": "Google検索に強くなるよう、地域名と症状キーワードを自然に増やしてください。",
  "ig-readable": "Instagram向けに、改行を活かして視覚的に読みやすくしてください。",
};

export function regenInstruction(mode: RegenMode): string {
  return REGEN_INSTRUCTIONS[mode] ?? "";
}

// ── 料金プラン（フリーミアム）─────────────────────────────────────

export type ClinicPlan = "free" | "premium";

/** premium かどうか */
export function isPremiumPlan(plan: ClinicPlan | string | null | undefined): boolean {
  return plan === "premium";
}

/**
 * プレミアム限定機能（無料プランでは使えない）。
 * 無料: 基本の文章生成（IG/ストーリー/Google/LINE/ブログ）・保存・履歴・コピー・再生成。
 * 上位: 画像・動画・生成AI画像まわり。
 */
export const PREMIUM_FEATURES = [
  "素材（写真・動画）のアップロード",
  "画像投稿用の案（テロップ・Canva指示・代替テキスト）",
  "リール動画用の構成案",
  "生成AI画像のプロンプト（Canva/Sora/Midjourney/ChatGPT）",
];

// ── 素材（画像・動画・生成AI画像）─────────────────────────────────

/** 素材アップロードの対応形式 */
export const ACCEPTED_IMAGE_EXT = ["jpg", "jpeg", "png", "webp"];
export const ACCEPTED_VIDEO_EXT = ["mp4", "mov", "webm"];
export const ACCEPTED_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];
export const MAX_MATERIALS = 10;
export const MAX_MATERIAL_BYTES = 100 * 1024 * 1024; // 100MB

/** 素材の分類 */
export const MATERIAL_KINDS = [
  "写真",
  "動画",
  "生成AI画像",
  "サムネイル",
  "Before/After画像",
  "院内素材",
  "イベント素材",
  "施術素材",
  "商品・機器素材",
  "その他",
] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

export type Material = {
  url: string;
  mime: string;
  category: "image" | "video";
  kind: MaterialKind;
  memo: string;
  name: string;
  size: number;
};

/** 制作モード（写真あり・動画あり・生成AI画像 など）。複数選択可。 */
export const MEDIA_MODES = [
  { key: "photo", label: "写真あり" },
  { key: "video", label: "動画あり" },
  { key: "ai-image", label: "生成AI画像を作りたい" },
  { key: "text-only", label: "素材なしで文章だけ作る" },
  { key: "canva", label: "Canvaで画像を作る前提" },
  { key: "reel", label: "リール動画を作る前提" },
  { key: "blog-eyecatch", label: "ブログ用アイキャッチを作る前提" },
] as const;
export type MediaMode = (typeof MEDIA_MODES)[number]["key"];

/** 画像投稿用パック */
export type ImagePack = {
  image_title: string;
  in_image_telop: string[];   // 画像内テロップ案
  design_direction: string;   // デザイン方向性
  canva_instructions: string; // Canva作成指示
  post_text: string;          // 投稿文
  hashtags: string[];         // 最大5個
  image_description: string;  // 画像説明文
  alt_text: string;           // 代替テキスト
  thumbnail_title: string;    // サムネイルタイトル案
  privacy_checklist: string[];// 注意すべき個人情報チェック項目
};

/** リール動画用パック */
export type ReelPack = {
  reel_title: string;
  hook: string;            // 冒頭3秒フック
  structure_15s: string[]; // 15秒構成
  structure_30s: string[]; // 30秒構成
  telops: string[];        // テロップ一覧
  narration: string;       // ナレーション案
  thumbnail_text: string;  // サムネイル文言
  post_text: string;       // 投稿文（キャプション）
  x_text: string;          // X投稿文
  cut_structure: string[]; // カット構成案
};

/** AI画像生成用プロンプトパック */
export type AiImagePack = {
  prompt: string;             // 基本の画像生成プロンプト
  prompt_portrait: string;    // 縦長
  prompt_square: string;      // 正方形
  prompt_blog_eyecatch: string; // ブログアイキャッチ
  in_image_text: string;      // 画像内文字案
  canva_prompt: string;       // Canva用
  sora_prompt: string;        // Sora用（動画）
  midjourney_prompt: string;  // Midjourney用
  chatgpt_prompt: string;     // ChatGPT画像生成用
  notes: string;              // 注意書き
};

/** 投稿の反応（手動記録） */
export type PostMetrics = {
  likes?: number;
  saves?: number;
  comments?: number;
  reach?: number;
  reservations?: number; // この投稿がきっかけの予約・相談の数
  memo?: string;
};

/** 反応の合計スコア（並べ替え・トップ判定用）。リーチは含めず、行動指標を重視。 */
export function metricsScore(m: PostMetrics | null | undefined): number {
  if (!m) return 0;
  return (m.likes || 0) + (m.saves || 0) * 2 + (m.comments || 0) * 2 + (m.reservations || 0) * 5;
}

/** 今日のネタ提案 */
export type PostIdea = {
  category: string;
  audience: string;
  theme: string;
  reason: string; // なぜ今これがおすすめか（季節・行事・院の強みなど）
};

/** ストーリー追加要素 */
export type StoryExtras = {
  survey: string;          // アンケート案
  question_sticker: string;// 質問スタンプ案
  reserve_cta: string;     // 予約導線文
};

/** 出力チャンネル（再生成・コピー対象）。 */
export const OUTPUT_CHANNELS = [
  { key: "instagram", label: "Instagram投稿文" },
  { key: "story", label: "Instagramストーリー文" },
  { key: "google", label: "Googleビジネス文" },
  { key: "line", label: "LINE配信文" },
  { key: "blog", label: "ブログ記事案" },
] as const;

export type OutputChannel = (typeof OUTPUT_CHANNELS)[number]["key"];

// ── 型 ─────────────────────────────────────────────────────────────

export type BlogDraft = {
  seo_title: string;
  headings: string[];
  body: string;
  meta_description: string;
  keywords: string[];
  cta: string;
};

export type GeneratedPost = {
  instagram_text: string;
  story_slides: string[]; // 3枚
  google_text: string;
  line_text: string;
  blog: BlogDraft;
  story_extras?: StoryExtras; // アンケート/質問スタンプ/予約導線
};

export type PostInput = {
  category: string;
  audience?: string;
  sport?: string;
  theme?: string;
  treatment?: string;
  message?: string;
  has_media: boolean;
  tone?: string;
  notes?: string;
  no_personal_info: boolean;
};

export type MarketingProfile = {
  clinic_name: string;
  area_name: string;
  address: string;
  strengths: string[];
  menus: string[];
  targets: string[];
  tone: string;
  banned_phrases: string[];
  recommended_keywords: string[];
  sns_accounts: Record<string, string>;
  line_link: string;
  reserve_url: string;
};

export type SavedPost = {
  id: string;
  clinic_id: string;
  category: string;
  audience: string | null;
  sport: string | null;
  theme: string | null;
  treatment: string | null;
  message: string | null;
  has_media: boolean;
  tone: string | null;
  notes: string | null;
  no_personal_info: boolean;
  instagram_text: string | null;
  story_slides: string[];
  google_text: string | null;
  line_text: string | null;
  blog: BlogDraft | null;
  status: PostStatus;
  memo: string | null;
  materials: Material[];
  media_modes: MediaMode[];
  video_context: string | null;
  image_pack: ImagePack | null;
  reel_pack: ReelPack | null;
  ai_image_pack: AiImagePack | null;
  story_extras: StoryExtras | null;
  scheduled_date: string | null;
  posted_date: string | null;
  metrics: PostMetrics | null;
  line_sent_at: string | null;
  line_sent_count: number | null;
  created_at: string;
  updated_at: string;
};

// ── ボール接骨院の既定プロファイル（初期設定）────────────────────────

export const BALL_DEFAULT_PROFILE: MarketingProfile = {
  clinic_name: "ボール接骨院",
  area_name: "藍住",
  address: "徳島県板野郡藍住町",
  strengths: [
    "オスグッド",
    "スポーツ障害",
    "サッカー少年少女のケア",
    "水素吸入",
    "音叉療法",
    "トレーニング指導",
    "成長期の身体ケア",
  ],
  menus: [
    "スポーツ障害の施術",
    "オスグッド・成長痛のケア",
    "水素吸入",
    "音叉療法",
    "トレーニング指導",
  ],
  targets: ["小学生", "中学生", "高校生", "保護者", "アスリート"],
  tone: "親しみやすく、保護者にも伝わりやすく、スポーツを頑張る子どもを応援する雰囲気",
  banned_phrases: [
    "必ず治る",
    "完全に治る",
    "たった1回で改善",
    "徳島No.1",
    "徳島ナンバーワン",
    "最高の治療",
    "絶対に良くなる",
    "効果を保証",
    "100%改善",
    "改善率100%",
  ],
  recommended_keywords: [
    "藍住 接骨院",
    "徳島 オスグッド",
    "藍住 スポーツ障害",
    "徳島 水素吸入",
    "成長痛 相談",
    "サッカー 少年 ケア",
  ],
  sns_accounts: {},
  line_link: "",
  reserve_url: "",
};

/** DB行（JSONB主体）→ 型付きプロファイル。未設定キーはボール既定値で補完。 */
export function profileFromRow(row: Record<string, unknown> | null): MarketingProfile {
  if (!row) return { ...BALL_DEFAULT_PROFILE };
  const arr = (v: unknown, fallback: string[]): string[] =>
    Array.isArray(v) && v.length ? (v as string[]) : fallback;
  const str = (v: unknown, fallback: string): string =>
    typeof v === "string" && v.trim() ? (v as string) : fallback;
  return {
    clinic_name: str(row.clinic_name, BALL_DEFAULT_PROFILE.clinic_name),
    area_name: str(row.area_name, BALL_DEFAULT_PROFILE.area_name),
    address: str(row.address, BALL_DEFAULT_PROFILE.address),
    strengths: arr(row.strengths, BALL_DEFAULT_PROFILE.strengths),
    menus: arr(row.menus, BALL_DEFAULT_PROFILE.menus),
    targets: arr(row.targets, BALL_DEFAULT_PROFILE.targets),
    tone: str(row.tone, BALL_DEFAULT_PROFILE.tone),
    banned_phrases: arr(row.banned_phrases, BALL_DEFAULT_PROFILE.banned_phrases),
    recommended_keywords: arr(row.recommended_keywords, BALL_DEFAULT_PROFILE.recommended_keywords),
    sns_accounts:
      row.sns_accounts && typeof row.sns_accounts === "object"
        ? (row.sns_accounts as Record<string, string>)
        : {},
    line_link: str(row.line_link, ""),
    reserve_url: str(row.reserve_url, ""),
  };
}

// ── 医療広告ガイドライン ─────────────────────────────────────────────

/** 既定で常に禁止する断定・優良誤認表現（プロファイルの banned_phrases に追加で適用）。 */
export const DEFAULT_BANNED_PHRASES = BALL_DEFAULT_PROFILE.banned_phrases;

/** 使ってよい表現（プロンプトに提示）。 */
export const ALLOWED_PHRASES = [
  "サポートします",
  "ご相談ください",
  "施術を行っています",
  "状態に合わせて対応します",
  "お悩みの方は一度ご相談ください",
  "個人差があります",
];

/**
 * 生成テキストに含まれる禁止表現を検出し、安全な表現へ置き換える。
 * 戻り値: { text: 整形後, hits: 検出した禁止表現 }
 */
export function sanitizeMedicalAd(
  text: string,
  bannedPhrases: string[] = DEFAULT_BANNED_PHRASES,
): { text: string; hits: string[] } {
  if (!text) return { text: text ?? "", hits: [] };
  let out = text;
  const hits: string[] = [];

  // 個別の言い換え（自然な日本語になるよう調整）
  const replacements: Array<[RegExp, string]> = [
    [/必ず治ります|必ず治る|完全に治る|完全に治ります/g, "改善をサポートします"],
    [/絶対に(良く|よく)なる|絶対に良くなります/g, "改善を目指していきます"],
    [/たった?1回で(改善|完治)|1回で完治/g, "状態に合わせて施術します"],
    [/改善率\s*100\s*%|100\s*%\s*改善|効果を保証(します)?/g, "個人差がありますが改善をサポートします"],
    [/徳島(No\.?1|ナンバーワン|一)|地域No\.?1/gi, "地域で親しまれている"],
    [/最高の治療|最強の施術/g, "一人ひとりに合わせた施術"],
  ];
  for (const [re, rep] of replacements) {
    if (re.test(out)) {
      const matched = out.match(re);
      if (matched) hits.push(...matched);
      out = out.replace(re, rep);
    }
  }

  // プロファイル由来の禁止語（残っていれば一般表現へ）
  for (const phrase of bannedPhrases) {
    if (!phrase) continue;
    if (out.includes(phrase)) {
      hits.push(phrase);
      out = out.split(phrase).join("改善をサポートします");
    }
  }

  // 置換でできやすい不自然な重複を軽く整える（backstop の見た目崩れ防止）
  out = out
    .replace(/(します){2,}/g, "します")
    .replace(/します(ます)+/g, "します")
    .replace(/ているの(?=[一-龠ぁ-ん])/g, "ており、")
    .replace(/。。+/g, "。");

  return { text: out, hits: Array.from(new Set(hits)) };
}

/** GeneratedPost 全体をサニタイズし、検出した禁止表現の一覧を返す。 */
export function sanitizeGeneratedPost(
  post: GeneratedPost,
  bannedPhrases?: string[],
): { post: GeneratedPost; warnings: string[] } {
  const allHits: string[] = [];
  const clean = (s: string) => {
    const r = sanitizeMedicalAd(s, bannedPhrases);
    allHits.push(...r.hits);
    return r.text;
  };
  const sanitized: GeneratedPost = {
    instagram_text: clean(post.instagram_text || ""),
    story_slides: (post.story_slides || []).map(clean),
    google_text: clean(post.google_text || ""),
    line_text: clean(post.line_text || ""),
    blog: post.blog
      ? {
          seo_title: clean(post.blog.seo_title || ""),
          headings: (post.blog.headings || []).map(clean),
          body: clean(post.blog.body || ""),
          meta_description: clean(post.blog.meta_description || ""),
          keywords: post.blog.keywords || [],
          cta: clean(post.blog.cta || ""),
        }
      : { seo_title: "", headings: [], body: "", meta_description: "", keywords: [], cta: "" },
    story_extras: post.story_extras
      ? {
          survey: clean(post.story_extras.survey || ""),
          question_sticker: clean(post.story_extras.question_sticker || ""),
          reserve_cta: clean(post.story_extras.reserve_cta || ""),
        }
      : undefined,
  };
  return { post: sanitized, warnings: Array.from(new Set(allHits)) };
}

/** ブログ案を1つのプレーンテキストにまとめる（コピー用）。 */
export function blogToPlainText(blog: BlogDraft | null): string {
  if (!blog) return "";
  const lines: string[] = [];
  if (blog.seo_title) lines.push(`【SEOタイトル】\n${blog.seo_title}`);
  if (blog.meta_description) lines.push(`【メタディスクリプション】\n${blog.meta_description}`);
  if (blog.keywords?.length) lines.push(`【想定キーワード】\n${blog.keywords.join(" / ")}`);
  if (blog.headings?.length) lines.push(`【見出し構成】\n${blog.headings.map((h) => `・${h}`).join("\n")}`);
  if (blog.body) lines.push(`【本文下書き】\n${blog.body}`);
  if (blog.cta) lines.push(`【CTA】\n${blog.cta}`);
  return lines.join("\n\n");
}

/** ストーリー3枚を1つのテキストにまとめる（コピー用）。 */
export function storyToPlainText(slides: string[]): string {
  return (slides || [])
    .map((s, i) => `【${i + 1}枚目】\n${s}`)
    .join("\n\n");
}

// ── 生成AI画像の安全ガイド（医療・健康系の誤解を招く表現を避ける）─────

export const AI_IMAGE_AVOID = [
  "劇的なBefore/After",
  "医療効果を断定する画像",
  "痛みが完全に消える表現",
  "過剰な筋肉・骨・神経の演出",
  "実在患者と誤認される人物画像",
];

export const AI_IMAGE_RECOMMEND = [
  "やさしいイラスト",
  "スポーツを頑張る子ども",
  "親子で相談する雰囲気",
  "院内の安心感",
  "健康的な生活イメージ",
  "水素吸入や音叉療法の説明イメージ",
];

const NL2 = "\n\n";

export function imagePackToPlainText(p: ImagePack | null): string {
  if (!p) return "";
  const L: string[] = [];
  if (p.image_title) L.push(`【画像タイトル】\n${p.image_title}`);
  if (p.in_image_telop?.length) L.push(`【画像内テロップ】\n${p.in_image_telop.map((t) => `・${t}`).join("\n")}`);
  if (p.design_direction) L.push(`【デザイン方向性】\n${p.design_direction}`);
  if (p.canva_instructions) L.push(`【Canva作成指示】\n${p.canva_instructions}`);
  if (p.thumbnail_title) L.push(`【サムネイルタイトル】\n${p.thumbnail_title}`);
  if (p.post_text) L.push(`【投稿文】\n${p.post_text}`);
  if (p.hashtags?.length) L.push(`【ハッシュタグ】\n${p.hashtags.join(" ")}`);
  if (p.image_description) L.push(`【画像説明文】\n${p.image_description}`);
  if (p.alt_text) L.push(`【代替テキスト】\n${p.alt_text}`);
  if (p.privacy_checklist?.length) L.push(`【個人情報チェック】\n${p.privacy_checklist.map((t) => `□ ${t}`).join("\n")}`);
  return L.join(NL2);
}

export function reelPackToPlainText(p: ReelPack | null): string {
  if (!p) return "";
  const L: string[] = [];
  if (p.reel_title) L.push(`【リールタイトル】\n${p.reel_title}`);
  if (p.hook) L.push(`【冒頭3秒フック】\n${p.hook}`);
  if (p.structure_15s?.length) L.push(`【15秒構成】\n${p.structure_15s.map((t, i) => `${i + 1}. ${t}`).join("\n")}`);
  if (p.structure_30s?.length) L.push(`【30秒構成】\n${p.structure_30s.map((t, i) => `${i + 1}. ${t}`).join("\n")}`);
  if (p.cut_structure?.length) L.push(`【カット構成案】\n${p.cut_structure.map((t, i) => `${i + 1}. ${t}`).join("\n")}`);
  if (p.telops?.length) L.push(`【テロップ一覧】\n${p.telops.map((t) => `・${t}`).join("\n")}`);
  if (p.narration) L.push(`【ナレーション案】\n${p.narration}`);
  if (p.thumbnail_text) L.push(`【サムネイル文言】\n${p.thumbnail_text}`);
  if (p.post_text) L.push(`【投稿文（キャプション）】\n${p.post_text}`);
  if (p.x_text) L.push(`【X投稿文】\n${p.x_text}`);
  return L.join(NL2);
}

export function aiImagePackToPlainText(p: AiImagePack | null): string {
  if (!p) return "";
  const L: string[] = [];
  if (p.prompt) L.push(`【画像生成プロンプト】\n${p.prompt}`);
  if (p.prompt_portrait) L.push(`【縦長画像用】\n${p.prompt_portrait}`);
  if (p.prompt_square) L.push(`【正方形画像用】\n${p.prompt_square}`);
  if (p.prompt_blog_eyecatch) L.push(`【ブログアイキャッチ用】\n${p.prompt_blog_eyecatch}`);
  if (p.in_image_text) L.push(`【画像内文字案】\n${p.in_image_text}`);
  if (p.canva_prompt) L.push(`【Canva用】\n${p.canva_prompt}`);
  if (p.sora_prompt) L.push(`【Sora用（動画）】\n${p.sora_prompt}`);
  if (p.midjourney_prompt) L.push(`【Midjourney用】\n${p.midjourney_prompt}`);
  if (p.chatgpt_prompt) L.push(`【ChatGPT画像生成用】\n${p.chatgpt_prompt}`);
  if (p.notes) L.push(`【注意書き】\n${p.notes}`);
  return L.join(NL2);
}

export function storyExtrasToPlainText(p: StoryExtras | null): string {
  if (!p) return "";
  const L: string[] = [];
  if (p.survey) L.push(`【アンケート案】\n${p.survey}`);
  if (p.question_sticker) L.push(`【質問スタンプ案】\n${p.question_sticker}`);
  if (p.reserve_cta) L.push(`【予約導線文】\n${p.reserve_cta}`);
  return L.join(NL2);
}
