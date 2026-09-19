// 「この人は誰か」の判定（pickCustomerByNameAndPhone）の確認。
// 実行: npx tsx scripts/test-customer-pick.mts
//
// 2026-09-19 ボール接骨院: 兄 17:00 を予約 → 弟 17:30 を親の電話で予約すると
// 兄のカルテに当たり「同じ日にすでにご予約」で弾かれ、兄のカルテ名も弟に書き換わっていた。
// 「取り違えない」と「本人は今までどおり見つかる（見つからなければ本人に確かめる）」の両方向を確かめる。
import { pickCustomerByNameAndPhone, normalizeNameForMatch, isSameNameAs } from "../src/lib/booking-customer";

type Row = { id: string; name: string; phone: string | null };
const rows: Row[] = [
  { id: "ani", name: "田中 一郎", phone: "09011112222" },          // 兄（親の電話で登録）
  { id: "otouto080", name: "田中 次郎", phone: "080" },            // 弟（仮番号のまま登録）
  { id: "kana_ani", name: "スズキ タロウ", phone: "09012340000" },  // カナで登録された兄
  { id: "higashi", name: "東村 美結", phone: "09033334444" },      // 漢字カルテ
  { id: "takahashi", name: "髙橋 翔", phone: "09044445555" },      // 旧字のカルテ
  { id: "yamada1", name: "山田 太郎", phone: "080" },
  { id: "yamada2", name: "山田 太郎", phone: "09055556666" },
  { id: "sato", name: "佐藤 花子", phone: "09077778888" },
  { id: "watanabe_a", name: "渡邉 早紀", phone: "080" },           // 同じ人の重複カルテ（字違い）
  { id: "watanabe_b", name: "渡邊 早紀", phone: "080" },
];

let fail = 0;
function expect(label: string, input: { name: string; phone: string }, want: string) {
  const r = pickCustomerByNameAndPhone(rows, input);
  const got = r.kind === "match" ? r.customer.id : r.kind === "phone_only" ? `phone_only:${r.customer.id}` : r.kind;
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "NG  "} ${label} → ${got}${ok ? "" : `（期待: ${want}）`}`);
}

// ── 取り違えないこと（今回の不具合）: 兄に「黙って」決めない ──
expect("弟を親の電話で予約（弟は仮番号で登録済み）", { name: "田中次郎", phone: "090-1111-2222" }, "otouto080");
expect("未登録の弟を漢字で・親の電話 → 本人か家族か確認", { name: "田中 三郎", phone: "09011112222" }, "phone_only:ani");
expect("未登録の弟をカナで・親の電話 → 本人か家族か確認", { name: "タナカ サブロウ", phone: "09011112222" }, "phone_only:ani");
expect("カナの兄がいて、弟もカナで → 本人か家族か確認", { name: "スズキ ジロウ", phone: "09012340000" }, "phone_only:kana_ani");

// ── 本人は見つかること（逆方向） ──
expect("兄本人（電話＋名前）", { name: "田中 一郎", phone: "09011112222" }, "ani");
expect("兄本人（空白ゆれ・全角電話）", { name: "田中一郎", phone: "０９０１１１１２２２２" }, "ani");
expect("兄本人（電話なし・名前だけ）", { name: "田中一郎", phone: "" }, "ani");
expect("カナ登録の兄をひらがなで入力", { name: "すずき たろう", phone: "09012340000" }, "kana_ani");
expect("旧字カルテ「髙橋」を「高橋」で入力", { name: "高橋翔", phone: "09044445555" }, "takahashi");
expect("旧字カルテを電話なしで", { name: "高橋 翔", phone: "" }, "takahashi");
expect("電話を変えた本人（名前で見つかる）", { name: "佐藤花子", phone: "09000000000" }, "sato");
expect("同姓同名は電話で特定", { name: "山田太郎", phone: "09055556666" }, "yamada2");

expect("字違いの重複カルテ → 入力どおりの字の方", { name: "渡邊早紀", phone: "" }, "watanabe_b");
expect("字違いの重複カルテを普通の字で → 絞れないので止める", { name: "渡辺早紀", phone: "" }, "ambiguous_name");

// ── 文字だけでは決められないもの → 黙って新しいカルテにせず本人に確かめる ──
expect("漢字カルテにカナで入力（本人かも）", { name: "ヒガシムラ ミユ", phone: "09033334444" }, "phone_only:higashi");
expect("変換ミス（本人かも）", { name: "東村 美緒", phone: "09033334444" }, "phone_only:higashi");

// ── 止める／初めて ──
expect("同姓同名で電話なし → 止める", { name: "山田太郎", phone: "" }, "ambiguous_name");
expect("まったくの初めて → アンケート", { name: "新規 太郎", phone: "09099999999" }, "none");

// 正規化そのもの
const norm: [string, string][] = [
  ["タナカ イチロウ", "たなかいちろう"],
  ["髙﨑 邊", "高崎辺"],
  ["松浦拓登(タクト)", "松浦拓登"],
];
for (const [a, want] of norm) {
  const got = normalizeNameForMatch(a);
  if (got !== want) fail++;
  console.log(`${got === want ? "OK  " : "NG  "} 正規化 ${a} → ${got}`);
}

// LINE家族選択: 名前を書き換えたら紐づけ先を使わない
const fam = [
  ["田中 一郎", true],
  ["田中一郎", true],
  ["田中 次郎", false],
  ["タナカ ジロウ", false],
  ["いちろー", true],
] as const;
for (const [typed, want] of fam) {
  const got = isSameNameAs({ name: "田中 一郎", display_name: "いちろー" }, typed);
  if (got !== want) fail++;
  console.log(`${got === want ? "OK  " : "NG  "} 家族選択 兄のまま「${typed}」→ ${got ? "兄で予約" : "兄を使わない"}`);
}

if (fail) {
  console.error(`\n${fail} 件 NG`);
  process.exit(1);
}
console.log("\nすべて OK");
