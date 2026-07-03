// 患者さんが入力した電話番号の正規化。
// スマホのキーボードや IME の状態によって「０９０−１２３４…」のように
// 全角数字・全角ハイフンで入ってくることがあるため、
// 全角→半角に直したうえで数字以外（ハイフン・スペース等）を取り除く。
// 患者入力を受け取る箇所（予約・アンケート・予約確認・キャンセル）は必ずこれを通すこと。
export function normalizePhone(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, "");
}
