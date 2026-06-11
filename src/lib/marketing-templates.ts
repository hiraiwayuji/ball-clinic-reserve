// LINE販促の配信テンプレート（全院共通）。
// 院名は必ず引数で差し込む（「ボール接骨院」ベタ書き禁止＝他院で配信すると他院名で届く事故になる）。
// line-marketing.ts（実際の配信）と「内容・使い方を相談」ダイアログのプレビューの両方で使い、
// 「プレビューに出た文面＝実際に届く文面」を保証する。

export type CampaignKey =
  | "questionnaire"
  | "reminder"
  | "birthday"
  | "lottery"
  | "women"
  | "area";

export type CampaignInfo = {
  title: string;
  /** だれに届くか */
  who: string;
  /** いつ・どう動くか */
  how: string;
  /** 押す前に知っておきたい注意・コツ */
  tips: string;
};

export const CAMPAIGN_INFO: Record<CampaignKey, CampaignInfo> = {
  questionnaire: {
    title: "初診アンケート",
    who: "LINE連携済みの患者さん（新しい方から最大50名）",
    how: "ボタンを押すと、カルテ作成用アンケートのお願いがLINEで届きます。",
    tips: "新規の方が増えたタイミングで月1回程度の配信がおすすめです。",
  },
  reminder: {
    title: "当日リマインド",
    who: "今日ご予約がある患者さん全員",
    how: "ボタンを押すと、予約時間入りの「本日お待ちしています」LINEが届きます。自動配信をONにすると毎朝自動で送られます。",
    tips: "無断キャンセル防止に効果的。自動配信ONにしておけば押し忘れがありません。",
  },
  birthday: {
    title: "誕生日クーポン",
    who: "選んだ月が誕生月の患者さん（LINE連携済み）",
    how: "ボタンを押すと、施術料金500円OFFのクーポンメッセージが届きます。患者さんは来院時にこのLINE画面を見せて使います。",
    tips: "毎月1日ごろに当月分を配信するのがおすすめ。クーポンの有効期限は「今月末まで」と文面に入ります。",
  },
  lottery: {
    title: "来院者限定抽選会",
    who: "来院実績があり、LINE連携済みの患者さん全員",
    how: "ボタンを押すと自動で抽選が行われ、約10%の方に「500円引き当選」、それ以外の方に「ハズレ（また来月）」のLINEが届きます。当選者が0人の場合は1名が自動で当選になります。",
    tips: "全員に結果LINEが届くので、月1回のお楽しみイベントとして使うと再来院のきっかけになります。",
  },
  women: {
    title: "女性限定施策",
    who: "性別が「女性」で登録されている患者さん（LINE連携済み）",
    how: "入力したメッセージがそのまま届きます。空欄の場合は下のデフォルト文面が届きます。{name} と書くと患者さんのお名前に置き換わります。",
    tips: "「美容鍼はじめました」「産後ケアの空き枠あります」など、女性向けメニューの案内に向いています。",
  },
  area: {
    title: "エリア限定配信",
    who: "選んだ市町村にお住まいの患者さん（LINE連携済み）",
    how: "入力したメッセージがそのまま届きます。{name} と書くと患者さんのお名前に置き換わります。",
    tips: "「◯◯町にお住まいの方へ：近隣イベント出店のお知らせ」など、地域ネタと組み合わせると反応が良いです。",
  },
};

// ── 実際の配信文面 ──────────────────────────────────────────────

export function reminderMessage(clinicName: string, customerName: string, time: string): string {
  return `${customerName}様\n\nこんにちは！${clinicName}です。\n本日 ${time} から予約を頂いております。\nお気を付けてお越しください！`;
}

export function birthdayMessage(clinicName: string, customerName: string): string {
  return (
    `🎂 ${customerName}様、お誕生月おめでとうございます！\n\n` +
    `いつも${clinicName}をご利用いただきありがとうございます😊\n\n` +
    `今月のお誕生月にちなんで\n` +
    `━━━━━━━━━━\n` +
    `　誕生月割引クーポン 💝\n` +
    `　　施術料金 500円OFF\n` +
    `━━━━━━━━━━\n` +
    `をプレゼントします！\n\n` +
    `有効期限：今月末まで\n` +
    `ご来院時にスタッフへこのメッセージをご提示ください📱\n\n` +
    `素敵な誕生月をお過ごしください🌸\n${clinicName}`
  );
}

export function lotteryWinMessage(clinicName: string): string {
  return (
    `🎉 やったー！当たり！！\n\n` +
    `いつも${clinicName}をご利用いただきありがとうございます😊\n\n` +
    `今月の来院者限定抽選で【当選】しました🎊\n\n` +
    `次回ご来院時に施術料金から\n` +
    `━━━━━━━━━━\n` +
    `　　500円引き 🙌\n` +
    `━━━━━━━━━━\n` +
    `させていただきます！\n\n` +
    `有効期限は今月末まで。\n` +
    `スタッフにこのメッセージを見せてください📱\n\n` +
    `また身体のメンテナンス、お待ちしてます💪\n${clinicName}`
  );
}

export function lotteryLoseMessage(clinicName: string): string {
  return (
    `いつも${clinicName}へのご来院ありがとうございます！\n\n` +
    `今月の来院者限定抽選の結果は…\n\n` +
    `残念、今回はハズレでした😭\n\n` +
    `でも来月またチャレンジできますよ！\n` +
    `身体のケア、引き続き一緒に頑張りましょう💪\n\n` +
    `またのご来院をお待ちしています🙏\n${clinicName}`
  );
}

export function womenDefaultMessage(clinicName: string, customerName: string): string {
  return `${customerName}様\n\n女性限定キャンペーンのお知らせです！\n\n${clinicName}では女性患者様限定の特別キャンペーンを実施中です✨\n\n詳しくはスタッフまでお気軽にお問い合わせください😊\n${clinicName}`;
}

export function questionnaireMessage(clinicName: string): string {
  return (
    `ご来院ありがとうございます！${clinicName}です🌱\n\n` +
    `カルテ作成のため、簡単なアンケートにご協力をお願いします。\n\n` +
    `▼ お答えいただける方はこちらから\n` +
    `（スタッフが次回ご来院時にご案内します）\n\n` +
    `・お名前\n・生年月日\n・ご住所（市区町村まで）\n・性別\n\n` +
    `お手数をおかけしますが、よろしくお願いします🙏\n${clinicName}`
  );
}

/** 相談ダイアログ用：そのキャンペーンで実際に届く文面のサンプル一覧を作る */
export function buildCampaignSamples(key: CampaignKey, clinicName: string): { label: string; text: string }[] {
  const sample = "山田 花子";
  switch (key) {
    case "questionnaire":
      return [{ label: "届く文面", text: questionnaireMessage(clinicName) }];
    case "reminder":
      return [{ label: "届く文面（例）", text: reminderMessage(clinicName, sample, "15:00") }];
    case "birthday":
      return [{ label: "届く文面（例）", text: birthdayMessage(clinicName, sample) }];
    case "lottery":
      return [
        { label: "当選した方（約10%）", text: lotteryWinMessage(clinicName) },
        { label: "ハズレの方", text: lotteryLoseMessage(clinicName) },
      ];
    case "women":
      return [{ label: "デフォルト文面（例・自由に書き換え可）", text: womenDefaultMessage(clinicName, sample) }];
    case "area":
      return [{ label: "文面は自由入力です（例）", text: `${sample}様\n\n◯◯町にお住まいの患者様へ\n期間限定のお知らせです✨\n\n（ここに入力した内容がそのまま届きます）` }];
  }
}
