// 子ども医療費助成（徳島県「子どもはぐくみ医療費助成」など）の窓口負担判定。
//
// 接骨院の保険施術（柔道整復・療養費）はこの助成の対象で、患者の「居住市町村 ×
// 学年ステージ」によって窓口の自己負担が「0円」または「1医療機関あたり月600円」に
// 分かれる。会計画面で支払区分ボタンを色分けし、受給者証の確認を促すために使う。
//
// ルールは clinic_settings.medical_aid_rules（JSONB）で院ごとに編集可能。未設定なら
// この DEFAULT_MEDICAL_AID_RULES（2026年度・徳島県調べ）をフォールバックに使う。
// 制度は年度替わりで変わるため、AI秘書が4月に見直しを促す（medical_aid_reviewed_at）。

export type SchoolStage =
  | "infant_0_2"   // 乳児（0〜2歳）
  | "preschool_3"  // 未就学児（3歳〜）
  | "elementary"   // 小学生
  | "junior_high"  // 中学生
  | "high_school"; // 高校生世代

export const SCHOOL_STAGES: SchoolStage[] = [
  "infant_0_2",
  "preschool_3",
  "elementary",
  "junior_high",
  "high_school",
];

export const SCHOOL_STAGE_LABEL: Record<SchoolStage, string> = {
  infant_0_2: "乳児（0〜2歳）",
  preschool_3: "未就学児（3歳〜）",
  elementary: "小学生",
  junior_high: "中学生",
  high_school: "高校生世代",
};

// 市町村ごとの、学年ステージ → 月あたり窓口自己負担（円）。
export type MedicalAidCityRule = {
  city: string;
  burdens: Partial<Record<SchoolStage, number>>; // 0 = 窓口無料 / 600 = 1医療機関 月600円
  note?: string;
};

export type MedicalAidRules = {
  cities: MedicalAidCityRule[];
  // 対象年齢の上限（共通の注記）。徳島県は「18歳到達後最初の3/31まで」。
  ageUpperLimitNote?: string;
};

// 県標準: 0〜2歳は無料、3歳〜高校生世代は1医療機関あたり月600円。
const STANDARD: Partial<Record<SchoolStage, number>> = {
  infant_0_2: 0,
  preschool_3: 600,
  elementary: 600,
  junior_high: 600,
  high_school: 600,
};

// 中学生まで無料・高校生世代から月600円（板野町・上板町タイプ）。
const FREE_UNTIL_JH: Partial<Record<SchoolStage, number>> = {
  infant_0_2: 0,
  preschool_3: 0,
  elementary: 0,
  junior_high: 0,
  high_school: 600,
};

// 完全無料（松茂町タイプ）。
const FREE_ALL: Partial<Record<SchoolStage, number>> = {
  infant_0_2: 0,
  preschool_3: 0,
  elementary: 0,
  junior_high: 0,
  high_school: 0,
};

// 2026年度・徳島県調べ（公式・支払基金資料ベース）。所得制限なし／県内は現物給付。
// ※制度は年度で変わるため、院側で編集できる前提の初期値。石井町・阿波市は県標準を仮置き（要確認）。
export const DEFAULT_MEDICAL_AID_RULES: MedicalAidRules = {
  ageUpperLimitNote: "18歳到達後最初の3/31まで（所得制限なし・県内は受給者証提示で現物給付）",
  cities: [
    { city: "藍住町", burdens: STANDARD, note: "0〜2歳無料、3歳〜高校生世代は月600円（県標準）" },
    { city: "北島町", burdens: STANDARD },
    { city: "板野町", burdens: FREE_UNTIL_JH, note: "中学校修了まで無料、高校生世代は月600円" },
    { city: "松茂町", burdens: FREE_ALL, note: "2024年度から完全無料化" },
    { city: "上板町", burdens: FREE_UNTIL_JH, note: "中学校修了まで無料、高校生世代は月600円" },
    { city: "徳島市", burdens: STANDARD },
    { city: "鳴門市", burdens: STANDARD },
    { city: "石井町", burdens: STANDARD, note: "県標準を仮設定（要確認）" },
    { city: "吉野川市", burdens: STANDARD },
    { city: "阿波市", burdens: STANDARD, note: "県標準を仮設定（要確認）" },
  ],
};

// 年度年齢（直近の4/1時点の満年齢）。学年ステージ判定に使う。
function fiscalAgeAtApril1(birth: Date, today: Date): number {
  const fyStartYear = today.getMonth() + 1 >= 4 ? today.getFullYear() : today.getFullYear() - 1;
  const ref = new Date(fyStartYear, 3, 1); // 4/1（月は0始まりなので3）
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  return age;
}

// 生年月日 → 学年ステージ。18歳到達年度を過ぎていれば null（対象外＝一般）。
export function schoolStageFromBirthDate(
  birthDateStr: string | null | undefined,
  today: Date = new Date(),
): SchoolStage | null {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return null;
  const a = fiscalAgeAtApril1(birth, today);
  if (a < 0) return null;
  if (a <= 2) return "infant_0_2";
  if (a <= 5) return "preschool_3";
  if (a <= 11) return "elementary";
  if (a <= 14) return "junior_high";
  if (a <= 17) return "high_school";
  return null; // 18歳年度以降 = 一般（助成対象外）
}

// 市町村名のゆるい一致（"板野郡藍住町" や住所文字列にも対応）。
function cityMatches(customerCity: string, ruleCity: string): boolean {
  const norm = (s: string) => s.replace(/[\s　]/g, "");
  const c = norm(customerCity);
  const r = norm(ruleCity);
  if (!c || !r) return false;
  return c.includes(r) || r.includes(c);
}

export type MedicalAidStatus = {
  // 助成対象として表示すべきか（市町村ルールがあり、対象年齢の場合）
  applicable: boolean;
  stage: SchoolStage | null;
  stageLabel: string | null;
  city: string | null;
  monthlyBurdenYen: number | null; // 0 / 600 / null（判定不可）
  // 生年月日が無くて学年判定できない等、情報不足を表す
  needsMoreInfo: boolean;
  message: string | null;
};

const NONE: MedicalAidStatus = {
  applicable: false,
  stage: null,
  stageLabel: null,
  city: null,
  monthlyBurdenYen: null,
  needsMoreInfo: false,
  message: null,
};

// 患者の居住市町村＋生年月日から、子ども医療費助成の窓口負担を判定する。
export function evaluateMedicalAid(opts: {
  birthDate?: string | null;
  cityName?: string | null;
  rules?: MedicalAidRules | null;
  today?: Date;
}): MedicalAidStatus {
  const today = opts.today ?? new Date();
  const rules = opts.rules && opts.rules.cities?.length ? opts.rules : DEFAULT_MEDICAL_AID_RULES;
  const city = opts.cityName?.trim() || null;
  if (!city) return NONE;

  const rule = rules.cities.find((r) => cityMatches(city, r.city));
  if (!rule) return NONE; // ルール未登録の市町村 → ハイライトしない

  const stage = schoolStageFromBirthDate(opts.birthDate, today);
  if (!stage) {
    // 市町村は助成のある町だが、生年月日が無く学年判定ができない
    if (!opts.birthDate) {
      return {
        ...NONE,
        city: rule.city,
        needsMoreInfo: true,
        message: `${rule.city}は子ども医療費助成あり。生年月日が未登録のため対象か判定できません`,
      };
    }
    return NONE; // 生年月日はあるが18歳超 = 対象外
  }

  const burden = rule.burdens[stage];
  if (burden == null) return NONE;

  const stageLabel = SCHOOL_STAGE_LABEL[stage];
  const message =
    burden === 0
      ? `${rule.city}・${stageLabel}は子ども医療費助成で窓口0円の対象です。受給者証をご確認ください`
      : `${rule.city}・${stageLabel}は子ども医療費助成の対象（窓口上限 1医療機関 月${burden.toLocaleString()}円）。受給者証をご確認ください`;

  return {
    applicable: true,
    stage,
    stageLabel,
    city: rule.city,
    monthlyBurdenYen: burden,
    needsMoreInfo: false,
    message,
  };
}
