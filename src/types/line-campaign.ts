// "use server" ファイルからは型を export できないので、条件配信の型はここに置く。

export type LineCampaignFilters = {
  /** 最終来院からこの日数以上あいている人（例: 60） */
  minDaysSinceVisit?: number | null;
  /** 最終来院からこの日数以内の人（例: 直近30日以内に来た人へのお知らせ） */
  maxDaysSinceVisit?: number | null;
  /** 来院回数がこの回数以上 */
  minVisitCount?: number | null;
  /** 一度も来院していない人だけ */
  neverVisitedOnly?: boolean;
  /** 次回予約がすでに入っている人を除く（予約済みの人に「そろそろどうですか」を送らない） */
  excludeWithUpcoming?: boolean;
  gender?: string | null;
  city?: string | null;
  /** 誕生月（1〜12） */
  birthMonth?: number | null;
};

export type LineCampaignTarget = {
  id: string;
  name: string;
  lastVisitDate: string | null;
  daysSinceLastVisit: number | null;
  visitCount: number;
  lineUserIds: string[];
};

export type LineCampaignPreview = {
  total: number;
  /** 条件には合うが LINE 未連携で届かない人数 */
  noLineCount: number;
  targets: LineCampaignTarget[];
};

/** よく使う条件のプリセット */
export const LINE_CAMPAIGN_PRESETS: { key: string; label: string; description: string; filters: LineCampaignFilters }[] = [
  {
    key: "lapsed60",
    label: "60日以上ごぶさたの方",
    description: "最終来院から60日以上あいていて、次回予約が入っていない方",
    filters: { minDaysSinceVisit: 60, excludeWithUpcoming: true },
  },
  {
    key: "lapsed90",
    label: "90日以上ごぶさたの方",
    description: "しばらく間があいている方の掘り起こし",
    filters: { minDaysSinceVisit: 90, excludeWithUpcoming: true },
  },
  {
    key: "lapsed30",
    label: "30〜59日あいている方",
    description: "間があきかけている方への早めの声かけ",
    filters: { minDaysSinceVisit: 30, maxDaysSinceVisit: 59, excludeWithUpcoming: true },
  },
  {
    key: "regular",
    label: "10回以上来られている常連さん",
    description: "お得な案内や紹介のお願いに",
    filters: { minVisitCount: 10 },
  },
  {
    key: "never",
    label: "LINE登録だけで未来院の方",
    description: "登録はしたが一度も来院していない方",
    filters: { neverVisitedOnly: true },
  },
];
