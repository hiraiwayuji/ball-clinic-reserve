"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { HeartHandshake, Plus, Trash2, Loader2, Save, Info } from "lucide-react";
import {
  getMedicalAidRules,
  updateMedicalAidRules,
  updateMedicalAidAddressAlert,
} from "@/app/actions/settings";
import {
  SCHOOL_STAGES,
  SCHOOL_STAGE_LABEL,
  type MedicalAidRules,
  type MedicalAidCityRule,
  type SchoolStage,
} from "@/lib/medical-aid";

// 子ども医療費助成の市町村×学年ステージ別 窓口自己負担(0円/月600円等)を編集する。
// 会計画面で「医療助成」ボタンの色分け（0円/上限額）に使われる。年度替わりで変わるため
// 編集できるようにし、AI秘書が4月に見直しを促す。
export default function MedicalAidRulesEditor() {
  const [rules, setRules] = useState<MedicalAidRules | null>(null);
  const [isDefault, setIsDefault] = useState(true);
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // 住所未登録アラートの ON/OFF（医療助成を選んだのに住所が無い時に注意を出すか）
  const [addressAlert, setAddressAlert] = useState(true);
  const [savingAlert, setSavingAlert] = useState(false);

  useEffect(() => {
    getMedicalAidRules()
      .then((r) => {
        setRules(r.rules);
        setIsDefault(r.isDefault);
        setReviewedAt(r.reviewedAt);
        setAddressAlert(r.addressAlert);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleAddressAlert = async () => {
    const next = !addressAlert;
    setAddressAlert(next); // 楽観的に反映
    setSavingAlert(true);
    try {
      const res = await updateMedicalAidAddressAlert(next);
      if (res.success) {
        toast.success(next ? "住所未登録アラートをONにしました" : "住所未登録アラートをOFFにしました");
      } else {
        setAddressAlert(!next); // 失敗したら戻す
        toast.error(res.error ?? "保存に失敗しました");
      }
    } finally {
      setSavingAlert(false);
    }
  };

  const setCity = (idx: number, patch: Partial<MedicalAidCityRule>) => {
    setRules((prev) => {
      if (!prev) return prev;
      const cities = prev.cities.map((c, i) => (i === idx ? { ...c, ...patch } : c));
      return { ...prev, cities };
    });
  };

  const setBurden = (idx: number, stage: SchoolStage, value: string) => {
    const n = value === "" ? undefined : Math.max(0, parseInt(value.replace(/\D/g, ""), 10) || 0);
    setRules((prev) => {
      if (!prev) return prev;
      const cities = prev.cities.map((c, i) => {
        if (i !== idx) return c;
        const burdens = { ...c.burdens };
        if (n === undefined) delete burdens[stage];
        else burdens[stage] = n;
        return { ...c, burdens };
      });
      return { ...prev, cities };
    });
  };

  const addCity = () => {
    setRules((prev) => {
      const base = prev ?? { cities: [] };
      return {
        ...base,
        cities: [...base.cities, { city: "", burdens: {} }],
      };
    });
  };

  const removeCity = (idx: number) => {
    setRules((prev) => (prev ? { ...prev, cities: prev.cities.filter((_, i) => i !== idx) } : prev));
  };

  const handleSave = async () => {
    if (!rules) return;
    const cleaned: MedicalAidRules = {
      ...rules,
      cities: rules.cities.filter((c) => c.city.trim()),
    };
    setSaving(true);
    try {
      const res = await updateMedicalAidRules(cleaned);
      if (res.success) {
        toast.success("医療費助成ルールを保存しました");
        setIsDefault(false);
        const today = new Date();
        setReviewedAt(
          `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
        );
      } else {
        toast.error(res.error ?? "保存に失敗しました");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-emerald-200 shadow-sm">
      <CardHeader className="bg-emerald-50 border-b">
        <CardTitle className="text-lg flex items-center gap-2 text-emerald-800">
          <HeartHandshake className="w-5 h-5" /> 子ども医療費助成（窓口負担）
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
          <div className="space-y-1">
            <p>
              市町村と学年ごとに、子ども医療費助成の窓口自己負担（0円＝無料／600円＝1医療機関 月600円 など）を設定します。
              会計画面で患者の市町村＋年齢から自動判定し、「医療助成」ボタンを色分けします。
            </p>
            <p className="text-slate-400">
              ※ 制度は年度替わりで変わることがあります。4月にAI秘書が見直しを促します。
              {reviewedAt ? `（最終見直し: ${reviewedAt}）` : "（まだ確認されていません）"}
              {isDefault && " ／ 現在は徳島デフォルト値を表示中（保存すると院の設定になります）"}
            </p>
          </div>
        </div>

        {/* 住所未登録アラートの ON/OFF */}
        <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
          <div className="text-xs text-slate-600">
            <p className="font-bold text-amber-700">住所が未登録のときに注意を出す</p>
            <p className="text-slate-500 mt-0.5">
              会計で「医療助成」を選んだのに患者さんの住所（市町村）が未登録だと、
              一覧で注意マークを表示します（保存はそのままできます）。
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={addressAlert}
            onClick={toggleAddressAlert}
            disabled={savingAlert}
            className={`relative shrink-0 mt-0.5 inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
              addressAlert ? "bg-amber-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                addressAlert ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {loading || !rules ? (
          <div className="flex items-center justify-center h-24 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> 読み込み中...
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500">
                    <th className="px-2 py-2 text-left font-bold min-w-[7rem]">市町村</th>
                    {SCHOOL_STAGES.map((s) => (
                      <th key={s} className="px-1 py-2 text-center font-bold whitespace-nowrap">
                        {SCHOOL_STAGE_LABEL[s]}
                      </th>
                    ))}
                    <th className="px-1 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.cities.map((c, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">
                        <Input
                          value={c.city}
                          onChange={(e) => setCity(idx, { city: e.target.value })}
                          placeholder="〇〇町"
                          className="h-8 text-sm font-bold"
                        />
                      </td>
                      {SCHOOL_STAGES.map((s) => (
                        <td key={s} className="px-1 py-1.5">
                          <input
                            type="number"
                            min={0}
                            step={100}
                            value={c.burdens[s] ?? ""}
                            onChange={(e) => setBurden(idx, s, e.target.value)}
                            placeholder="—"
                            className="w-16 h-8 text-right text-sm border border-slate-200 rounded px-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                        </td>
                      ))}
                      <td className="px-1 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeCity(idx)}
                          className="p-1 text-rose-400 hover:text-rose-600"
                          aria-label="この市町村を削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400">
              数値＝1医療機関あたりの月の窓口自己負担（円）。0＝窓口無料。空欄＝対象外（ハイライトしません）。
            </p>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Button type="button" variant="outline" size="sm" onClick={addCity} className="font-bold">
                <Plus className="w-4 h-4 mr-1" /> 市町村を追加
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                保存して「確認済み」にする
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
