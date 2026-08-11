import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { BASE_EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { getCustomExpenseCategories } from "@/app/actions/settings";
import type { PassbookOcrRow, PassbookKind } from "@/lib/passbook";

const KINDS: PassbookKind[] = ["insurance", "expense", "income", "ignore"];

function toInt(v: unknown): number {
  if (typeof v === "number") return Math.round(v);
  if (typeof v !== "string") return 0;
  const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

/** AIが 2026-13-45 のような存在しない日付を返すことがあるので、実在する日付かまで見る */
function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY未設定" }, { status: 500 });

  const { base64, mimeType } = await req.json();
  if (!base64) return NextResponse.json({ error: "画像がありません" }, { status: 400 });

  const customCategories = await getCustomExpenseCategories().catch(() => []);
  const allCategories = [...BASE_EXPENSE_CATEGORIES, ...customCategories];

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const now = new Date();
  const year = now.getFullYear();
  const reiwa = year - 2018;

  const prompt = `これは日本の銀行の預金通帳（接骨院の事業用口座）を撮影した画像です。
印字されている明細行をすべて読み取り、JSONで返してください。見開きの場合は左ページ→右ページの順に、上の行から順番に。

各行のフィールド:
- entry_date: 取引日を yyyy-MM-dd 形式で。通帳の日付は和暦のことが多いので西暦に直してください（例「${reiwa}-08-11」や「R${reiwa}.8.11」は令和${reiwa}年＝${year}年 → "${year}-08-11"）。年が印字されていない行は直前の行と同じ年とみなし、それも不明なら ${year} 年としてください。
- description: 摘要欄の文字。カタカナはカタカナのまま、読み取れた通りに。
- deposit: お預入（入金）の金額。数値のみ、カンマなし。入金でなければ 0。
- withdrawal: お引出（出金）の金額。数値のみ、カンマなし。出金でなければ 0。
- balance: 差引残高の数値。読み取れなければ null。
- kind: 次の4つから1つ
  - "insurance" = 保険の療養費の入金。国保連合会(コクホレン)・社会保険診療報酬支払基金・協会けんぽ・後期高齢者医療広域連合・共済組合・労災(労働局)・自賠責(損保会社)などからの振込。
  - "expense" = 事業の支出。口座振替・引き落とし・振込手数料・家賃・水道光熱費・リース料・保険料など。
  - "income" = 保険以外の入金。現金入金・売上の入金など。
  - "ignore" = 判断できない行、繰越・取消など取引明細でない行。
- category: kind が "expense" のときだけ、次から最も近いもの1つ → ${allCategories.join("、")}
  それ以外は空文字 ""
- note: 補足があれば短く。なければ ""

読み取れない行・空行は含めないでください。
必ず {"rows":[...]} の形のJSONだけを返してください。説明文は不要です。
例: {"rows":[{"entry_date":"${year}-08-11","description":"フリコミ トクシマケンコクホレン","deposit":384520,"withdrawal":0,"balance":1250300,"kind":"insurance","category":"","note":""}]}`;

  const result = await model.generateContent([
    { inlineData: { mimeType: mimeType || "image/jpeg", data: base64 } },
    prompt,
  ]);

  const text = result.response.text().trim().replace(/```json|```/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "解析に失敗しました", raw: text }, { status: 422 });
  }

  const rawRows = Array.isArray(parsed) ? parsed : (parsed as { rows?: unknown[] })?.rows;
  if (!Array.isArray(rawRows)) {
    return NextResponse.json({ error: "明細を読み取れませんでした", raw: text }, { status: 422 });
  }

  const rows: PassbookOcrRow[] = rawRows
    .map((r): PassbookOcrRow => {
      const row = (r ?? {}) as Record<string, unknown>;
      const kind = KINDS.includes(row.kind as PassbookKind) ? (row.kind as PassbookKind) : "ignore";
      const category = typeof row.category === "string" && allCategories.includes(row.category)
        ? row.category
        : "";
      const balance = row.balance === null || row.balance === undefined || row.balance === ""
        ? null
        : toInt(row.balance);
      return {
        entry_date: typeof row.entry_date === "string" ? row.entry_date.slice(0, 10) : "",
        description: typeof row.description === "string" ? row.description.trim() : "",
        deposit: Math.max(0, toInt(row.deposit)),
        withdrawal: Math.max(0, toInt(row.withdrawal)),
        balance,
        kind,
        category,
        note: typeof row.note === "string" ? row.note.trim() : "",
      };
    })
    .filter((r) => isRealDate(r.entry_date) && (r.deposit > 0 || r.withdrawal > 0));

  if (rows.length === 0) {
    return NextResponse.json({ error: "明細を1件も読み取れませんでした。撮り直してみてください。" }, { status: 422 });
  }

  return NextResponse.json({ rows });
}
