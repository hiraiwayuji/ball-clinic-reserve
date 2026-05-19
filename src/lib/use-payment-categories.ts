"use client";

import { useEffect, useState } from "react";
import { listPaymentCategories, type PaymentCategoryRow } from "@/app/actions/payment-categories";

/**
 * 院ごとの支払区分マスタ（アクティブのみ）を取得する hook。
 * 初回 render は空配列、useEffect 後にロードされる。
 * 標準: 自賠責 / 労災 / はぐくみ医療 / 実費 / その他
 * 院独自: 鍼灸 / トレーニング 等（owner/admin が追加）
 */
export function usePaymentCategories(): {
  categories: PaymentCategoryRow[];
  loading: boolean;
  reload: () => Promise<void>;
} {
  const [categories, setCategories] = useState<PaymentCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    const r = await listPaymentCategories();
    if (r.success) setCategories(r.rows ?? []);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  return { categories, loading, reload };
}
