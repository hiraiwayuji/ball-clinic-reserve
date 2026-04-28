export const KARADA_CLINIC = {
  name: "からだ鍼灸整骨院",
  address: "徳島市川内町鈴江南 43-1",
  phone: "088-679-1239",
  hoursWeekday: "10:00〜20:00",
  closedDays: ["水", "日", "祝"],
  parkingSpaces: 7,
};

export type StaffRole = "doctor" | "visit" | "trainer" | "reception";

export type Staff = {
  id: string;
  name: string;
  role: StaffRole;
  title: string;
  qualifications: string[];
  color: string;
  bgColor: string;
  borderColor: string;
};

export const KARADA_STAFF: Staff[] = [
  {
    id: "fujikawa",
    name: "藤川 雅之",
    role: "doctor",
    title: "院長 / 鍼灸メディカルトレーナー",
    qualifications: ["柔道整復師", "鍼灸師", "WFAピリオダイゼーション"],
    color: "text-blue-700",
    bgColor: "bg-blue-100 dark:bg-blue-950/50",
    borderColor: "border-blue-400",
  },
  {
    id: "shimada",
    name: "島田 卓也",
    role: "visit",
    title: "訪問施術管理者",
    qualifications: ["柔道整復師", "鍼灸師", "按摩マッサージ指圧師", "認知症サポーター"],
    color: "text-emerald-700",
    bgColor: "bg-emerald-100 dark:bg-emerald-950/50",
    borderColor: "border-emerald-400",
  },
  {
    id: "ohashi",
    name: "大橋 悠介",
    role: "trainer",
    title: "スポーツトレーナー",
    qualifications: ["柔道整復師"],
    color: "text-amber-700",
    bgColor: "bg-amber-100 dark:bg-amber-950/50",
    borderColor: "border-amber-400",
  },
  {
    id: "kawahara",
    name: "河原 史恵",
    role: "reception",
    title: "受付",
    qualifications: ["医療事務", "ヘルパー2級", "ガイドヘルパー", "県簿記1級"],
    color: "text-pink-700",
    bgColor: "bg-pink-100 dark:bg-pink-950/50",
    borderColor: "border-pink-400",
  },
];

export type Course = {
  id: string;
  name: string;
  category: "保険" | "鍼灸" | "整体" | "マッサージ" | "テーピング" | "訪問" | "その他";
  durationMin: number;
  priceYen: number | null;
  description: string;
};

export const KARADA_COURSES: Course[] = [
  { id: "hoken", name: "保険診療", category: "保険", durationMin: 20, priceYen: null, description: "外傷・肩こり・腰痛・膝痛など。月初+200円。" },
  { id: "shinkyu", name: "鍼・灸", category: "鍼灸", durationMin: 30, priceYen: 4400, description: "深層筋・関節へのアプローチ、不定愁訴・内科疾患にも。" },
  { id: "karada-seitai", name: "からだ式整体", category: "整体", durationMin: 30, priceYen: 4400, description: "肩甲骨・骨盤を軸にバランスを整える独自手技。" },
  { id: "massage", name: "マッサージ", category: "マッサージ", durationMin: 40, priceYen: 4900, description: "慢性化した症状や疲労ケアに。" },
  { id: "spiral-tape", name: "スパイラルテーピング", category: "テーピング", durationMin: 15, priceYen: 1100, description: "筋・関節の補助、持続性のあるサポート。" },
  { id: "kenko-hagashi", name: "肩甲骨はがし", category: "整体", durationMin: 10, priceYen: 1100, description: "肩こり・四十肩の動きを改善。" },
  { id: "foot-massage", name: "フットマッサージ", category: "マッサージ", durationMin: 20, priceYen: 2200, description: "足つぼ＋リンパで冷え・むくみ改善。" },
  { id: "visit", name: "訪問治療", category: "訪問", durationMin: 30, priceYen: null, description: "10:00〜16:00で応相談、健康保険適用。" },
  { id: "kotsuban", name: "産後骨盤矯正", category: "整体", durationMin: 30, priceYen: 4400, description: "産後の骨盤バランスを整える。" },
];

export type Room = {
  id: string;
  name: string;
  type: "private" | "shared-bed";
  capacity: number;
};

export const KARADA_ROOMS: Room[] = [
  { id: "private-1", name: "個室", type: "private", capacity: 1 },
  { id: "bed-1", name: "大部屋ベッド①", type: "shared-bed", capacity: 1 },
  { id: "bed-2", name: "大部屋ベッド②", type: "shared-bed", capacity: 1 },
  { id: "bed-3", name: "大部屋ベッド③", type: "shared-bed", capacity: 1 },
  { id: "bed-4", name: "大部屋ベッド④", type: "shared-bed", capacity: 1 },
];

export type DemoAppointment = {
  id: string;
  startMin: number;
  durationMin: number;
  staffId: string;
  customerName: string;
  courseId: string;
  roomId: string | null;
  type: "clinic" | "visit";
  visitAddress?: string;
  isFirstVisit?: boolean;
  athlete?: { sport: string; team?: string };
  memo?: string;
};

const HHMM = (h: number, m: number) => h * 60 + m;

export const KARADA_DEMO_APPOINTMENTS: DemoAppointment[] = [
  { id: "a1", startMin: HHMM(10, 0), durationMin: 30, staffId: "fujikawa", customerName: "山本 健太郎", courseId: "shinkyu", roomId: "private-1", type: "clinic", athlete: { sport: "サッカー", team: "徳島FC U-18" } },
  { id: "a2", startMin: HHMM(10, 0), durationMin: 20, staffId: "ohashi", customerName: "田中 美咲", courseId: "hoken", roomId: "bed-1", type: "clinic" },
  { id: "a3", startMin: HHMM(10, 30), durationMin: 30, staffId: "fujikawa", customerName: "高橋 良子", courseId: "karada-seitai", roomId: "private-1", type: "clinic" },
  { id: "a4", startMin: HHMM(10, 30), durationMin: 40, staffId: "ohashi", customerName: "鈴木 翔太", courseId: "massage", roomId: "bed-2", type: "clinic", athlete: { sport: "陸上", team: "県高校" } },

  { id: "v1", startMin: HHMM(10, 30), durationMin: 60, staffId: "shimada", customerName: "佐々木 トキ さん", courseId: "visit", roomId: null, type: "visit", visitAddress: "川内町鈴江北" },

  { id: "a5", startMin: HHMM(11, 0), durationMin: 30, staffId: "fujikawa", customerName: "中村 隆", courseId: "shinkyu", roomId: "private-1", type: "clinic" },
  { id: "a6", startMin: HHMM(11, 0), durationMin: 20, staffId: "ohashi", customerName: "小林 ひかり", courseId: "hoken", roomId: "bed-3", type: "clinic", isFirstVisit: true },
  { id: "a7", startMin: HHMM(11, 30), durationMin: 30, staffId: "fujikawa", customerName: "斎藤 一郎", courseId: "kotsuban", roomId: "private-1", type: "clinic" },

  { id: "v2", startMin: HHMM(12, 0), durationMin: 60, staffId: "shimada", customerName: "西村 けいこ さん", courseId: "visit", roomId: null, type: "visit", visitAddress: "応神町古川" },

  { id: "a8", startMin: HHMM(12, 30), durationMin: 30, staffId: "fujikawa", customerName: "松本 涼介", courseId: "karada-seitai", roomId: "private-1", type: "clinic", athlete: { sport: "フットサル" } },
  { id: "a9", startMin: HHMM(13, 0), durationMin: 40, staffId: "ohashi", customerName: "井上 大輝", courseId: "massage", roomId: "bed-1", type: "clinic" },

  { id: "v3", startMin: HHMM(13, 30), durationMin: 60, staffId: "shimada", customerName: "吉田 まさお さん", courseId: "visit", roomId: null, type: "visit", visitAddress: "応神町西貞方" },

  { id: "a10", startMin: HHMM(14, 0), durationMin: 30, staffId: "fujikawa", customerName: "森 千鶴", courseId: "shinkyu", roomId: "private-1", type: "clinic" },
  { id: "a11", startMin: HHMM(14, 30), durationMin: 20, staffId: "ohashi", customerName: "石川 翼", courseId: "spiral-tape", roomId: "bed-2", type: "clinic", athlete: { sport: "野球", team: "市内中学" } },

  { id: "v4", startMin: HHMM(15, 0), durationMin: 60, staffId: "shimada", customerName: "藤本 とし子 さん", courseId: "visit", roomId: null, type: "visit", visitAddress: "国府町府中" },

  { id: "a12", startMin: HHMM(15, 0), durationMin: 30, staffId: "fujikawa", customerName: "渡辺 真由美", courseId: "karada-seitai", roomId: "private-1", type: "clinic" },
  { id: "a13", startMin: HHMM(15, 30), durationMin: 30, staffId: "ohashi", customerName: "加藤 拓海", courseId: "shinkyu", roomId: "bed-3", type: "clinic", isFirstVisit: true },

  { id: "a14", startMin: HHMM(16, 30), durationMin: 30, staffId: "fujikawa", customerName: "山田 浩二", courseId: "kenko-hagashi", roomId: "private-1", type: "clinic" },
  { id: "a15", startMin: HHMM(17, 0), durationMin: 40, staffId: "ohashi", customerName: "原田 さおり", courseId: "massage", roomId: "bed-1", type: "clinic" },
  { id: "a16", startMin: HHMM(17, 30), durationMin: 30, staffId: "fujikawa", customerName: "岡本 大樹", courseId: "shinkyu", roomId: "private-1", type: "clinic", athlete: { sport: "サッカー", team: "社会人" } },
  { id: "a17", startMin: HHMM(18, 0), durationMin: 30, staffId: "fujikawa", customerName: "村上 美智子", courseId: "karada-seitai", roomId: "private-1", type: "clinic" },
  { id: "a18", startMin: HHMM(18, 30), durationMin: 30, staffId: "ohashi", customerName: "後藤 翔平", courseId: "shinkyu", roomId: "bed-2", type: "clinic" },
  { id: "a19", startMin: HHMM(19, 0), durationMin: 30, staffId: "fujikawa", customerName: "近藤 由美", courseId: "kotsuban", roomId: "private-1", type: "clinic" },
];

export const KARADA_TIME_SLOTS = (() => {
  const slots: number[] = [];
  for (let h = 10; h < 20; h++) {
    slots.push(HHMM(h, 0));
    slots.push(HHMM(h, 30));
  }
  return slots;
})();

export const KARADA_VISIT_SLOTS = (() => {
  const slots: number[] = [];
  for (let h = 10; h < 16; h++) {
    slots.push(HHMM(h, 0));
    slots.push(HHMM(h, 30));
  }
  return slots;
})();

export const formatMin = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
