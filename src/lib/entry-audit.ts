/**
 * 記帳チェック（収入と経費を取り違えていないか、などの自動点検）
 *
 * 2026-08-29、ボール接骨院の記帳から「子ども医療療養費 13,160円（板野町）」と
 * 「診療報酬 15,203円（徳島県国保連）」の入金通知が、経費として登録されているのが見つかった。
 * どちらも入ってきたお金なので、経費に入れると利益が実際より悪く見える（この2件で56,726円ぶん）。
 * 人が毎回目で探すのは無理なので、見つけ方を規則にしてここに置く。
 *
 * 2026-08-30、画面が「経費に入った収入」しか見ていない片方向だったため、
 * 「収入に入った経費」（逆方向の取り違え）も見るようにした。あわせて、
 * 見つけた記帳が「今どちらで登録されているか」を必ず結果に持たせる
 * （画面側で「経費／収入のどちらの話か分からない」という声があったため）。
 *
 * ここは DB にも React にも依存しない純粋な関数にしてある。
 * 他のツール（BMR・ガードワークなど）でも同じ規則を使い回せるようにするため。
 */

import { BASE_EXPENSE_CATEGORIES } from "./expense-categories";

export type AuditEntry = {
  id: string;
  expense_date: string;
  category: string | null;
  description: string | null;
  amount: number;
  memo: string | null;
  entry_type: string | null;
};

export type AuditRule = "income_as_expense" | "expense_as_income" | "card_bulk" | "duplicate" | "odd_date";

export type AuditFinding = {
  entry: AuditEntry;
  rule: AuditRule;
  /** high = ほぼ確実におかしい／medium = 目で見て決めてほしい */
  level: "high" | "medium";
  title: string;
  reason: string;
  /** 今どちらで登録されているか。画面で必ず見せる（分かりにくさの元だったため）。 */
  currentType: "expense" | "income";
  /** to_income = 収入に直す／to_expense = 経費に直す／review = 中身を見て直す */
  action: "to_income" | "to_expense" | "review";
};

/** 「見たうえで、これで正しい」と判断した記帳につける印。memo に足して次回から除外する。 */
export const CHECKED_MARK = "【記帳チェック済】";

/** 収入に直したときに使う区分。経費記帳ページの収入カテゴリと合わせている。 */
export const INCOME_FIX_CATEGORY = "その他収入";

/** 経費に直したときに使う区分。中身が分からない場合の受け皿。 */
export const EXPENSE_FIX_CATEGORY = "その他";

/** これが出てきたら、まず入ってきたお金（入金通知・支給決定）とみてよい言葉。 */
const INCOME_WORDS_HIGH =
  /(支給決定|支払額決定|決定通知|振込通知|入金通知|医療報酬|診療報酬|報酬等支払|助成金|給付金|補助金|還付金|支援金|協力金)/;

/** 収入のことが多いが、支出のこともある言葉。目で見て決めてもらう。 */
const INCOME_WORDS_MEDIUM =
  /(子ども医療|こども医療|はぐくみ医療|療養費|保険金|返戻|雑収入|物販売上|売上金)/;

/** 明細ではなく請求まるごとを記帳している疑い。カード明細と二重に数えやすい。 */
const CARD_BULK_WORDS =
  /(カード請求|カード支払|カードお支払|クレジット請求|クレジットカード請求|カード引き落と|イオンカード|PayPayカード|ペイペイカード)/;

/** 収入に登録されているのに、これが出てきたら買い物・支払いとみてよい言葉。 */
const EXPENSE_WORDS =
  /(コンビニ|ドラッグストア|ホームセンター|ガソリン|ガソリンスタンド|レギュラー|コーナン|セブン|ローソン|ファミリーマート|消耗品|備品|購入|支払い|お支払い)/;

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
const EXPENSE_CATEGORY_SET = new Set<string>(BASE_EXPENSE_CATEGORIES as readonly string[]);

/** 「これで正しい」と印をつけた記帳か。 */
export function isChecked(entry: AuditEntry): boolean {
  return norm(entry.memo).includes(norm(CHECKED_MARK));
}

/**
 * 記帳を点検して、あやしいものだけ返す。経費・収入の両方を見る
 * （「経費が収入に紛れている」「収入が経費に紛れている」の両方向）。
 * @param entries clinic_expenses の行
 * @param today 判定に使う日（テストしやすいように差し込めるようにしてある）
 */
export function auditEntries(entries: AuditEntry[], today = new Date()): AuditFinding[] {
  const targets = entries.filter((e) => !isChecked(e));
  const expenseRows = targets.filter((e) => (e.entry_type ?? "expense") === "expense");
  const incomeRows = targets.filter((e) => e.entry_type === "income");

  // 重複の判定に使う「日付＋金額＋品名」の出現回数。経費どうしで数える。
  const seen = new Map<string, number>();
  for (const e of expenseRows) {
    const key = `${e.expense_date}|${e.amount}|${norm(e.description)}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  const todayStr = toDateString(today);
  const twoYearsAgo = new Date(today);
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const twoYearsAgoStr = toDateString(twoYearsAgo);

  const findings: AuditFinding[] = [];

  // ① 経費として登録されている行 → 「本当は収入では？」「カードまるごとでは？」「重複では？」「日付は正しい？」
  for (const entry of expenseRows) {
    const text = `${norm(entry.description)} ${norm(entry.memo)} ${norm(entry.category)}`;

    if (INCOME_WORDS_HIGH.test(text)) {
      findings.push({
        entry,
        rule: "income_as_expense",
        level: "high",
        currentType: "expense",
        title: "今は経費。でも、入ってきたお金かもしれません",
        reason: `品名に「${(text.match(INCOME_WORDS_HIGH) ?? [""])[0]}」が入っています。入金の通知は経費ではなく収入です。`,
        action: "to_income",
      });
    } else if (INCOME_WORDS_MEDIUM.test(text)) {
      findings.push({
        entry,
        rule: "income_as_expense",
        level: "medium",
        currentType: "expense",
        title: "今は経費。入ってきたお金かもしれません",
        reason: `品名に「${(text.match(INCOME_WORDS_MEDIUM) ?? [""])[0]}」が入っています。助成金や療養費の入金なら収入です（自分が窓口で払ったぶんなら、このままで正しいです）。`,
        action: "to_income",
      });
    }

    if (CARD_BULK_WORDS.test(text)) {
      findings.push({
        entry,
        rule: "card_bulk",
        level: "medium",
        currentType: "expense",
        title: "今は経費。カードの請求をまるごと記帳しているかもしれません",
        reason:
          "カードの請求額をそのまま入れると、1件ずつ入れた領収書と二重に数えてしまいます。中身（何を買ったか）で入れ直してください。",
        action: "review",
      });
    }

    const key = `${entry.expense_date}|${entry.amount}|${norm(entry.description)}`;
    if ((seen.get(key) ?? 0) > 1) {
      findings.push({
        entry,
        rule: "duplicate",
        level: "medium",
        currentType: "expense",
        title: "今は経費。同じ内容が2件以上あります",
        reason: "日付・金額・品名がまったく同じ記帳が複数あります。同じ領収書を2回入れていないか確かめてください。",
        action: "review",
      });
    }

    if (entry.expense_date > todayStr) {
      findings.push({
        entry,
        rule: "odd_date",
        level: "medium",
        currentType: "expense",
        title: "今は経費。日付が未来になっています",
        reason: "領収書の日付の読み取り違いが多いところです。",
        action: "review",
      });
    } else if (entry.expense_date < twoYearsAgoStr) {
      findings.push({
        entry,
        rule: "odd_date",
        level: "medium",
        currentType: "expense",
        title: "今は経費。日付が2年より前になっています",
        reason: "「令和8年」を「2014年」と読むような読み取り違いが起きていないか確かめてください。",
        action: "review",
      });
    }
  }

  // ② 収入として登録されている行 → 「本当は経費では？」
  for (const entry of incomeRows) {
    const text = `${norm(entry.description)} ${norm(entry.memo)}`;
    const category = (entry.category ?? "").trim();
    const categoryIsExpenseKind = EXPENSE_CATEGORY_SET.has(category);

    if (categoryIsExpenseKind) {
      // 区分が経費のカテゴリのまま＝収入登録の画面で選び直していない可能性が高い
      findings.push({
        entry,
        rule: "expense_as_income",
        level: "high",
        currentType: "income",
        title: "今は収入。でも区分が経費のままです",
        reason: `区分が「${category}」（経費のカテゴリ）のままです。収入なら「物販」「雑収入」などに直すはずなので、経費の記帳を収入に登録し間違えていないか確かめてください。`,
        action: "to_expense",
      });
    } else if (EXPENSE_WORDS.test(text)) {
      // 区分は収入カテゴリのままでも、品名が明らかに買い物なら見落とさない
      // （「その他収入」に何でも放り込んでしまうケースを拾うため）。
      findings.push({
        entry,
        rule: "expense_as_income",
        level: "medium",
        currentType: "income",
        title: "今は収入。買い物や支払いに見えます",
        reason: `品名に「${(text.match(EXPENSE_WORDS) ?? [""])[0]}」が入っています。お店での買い物なら、収入ではなく経費のはずです。`,
        action: "to_expense",
      });
    }
  }

  // 直してほしい順（確実なもの→金額が大きいもの）に並べる。
  const levelOrder = { high: 0, medium: 1 } as const;
  return findings.sort(
    (a, b) => levelOrder[a.level] - levelOrder[b.level] || b.entry.amount - a.entry.amount,
  );
}

/** ローカル時間の YYYY-MM-DD。toISOString だと日本時間の朝に前日へずれるため使わない。 */
function toDateString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
