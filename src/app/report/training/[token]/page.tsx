/**
 * 患者（保護者）向け トレーニング結果レポート（公開ページ・ログイン不要）。
 *
 * セキュリティ方針（runbook_supabase_rls_exposure 準拠）:
 *  - training_* は RLS 有効・authenticated 限定ポリシーのままにする（anon から直接は読めない）。
 *  - このページは**サーバー側で service_role** を使い、**推測不可能な report_token 一致**でだけ1件を取得する。
 *  - トークンを知っている人だけが自分のレポートを見られる。一覧・検索はできない。
 *  - 検索エンジンには載せない（noindex）。
 */
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import {
  AXES, REGIONS, axisAverages, overallAverage, asymmetries, regionAverages,
  scoreColor, diffLevel, growth, gradeOf,
  type Assessment, type Measurement, type RegionKey, type AxisKey, type Side,
} from "@/lib/training-catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "トレーニング結果レポート",
  robots: { index: false, follow: false },
};

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type LoadResult = {
  clinicName: string;
  customerName: string;
  current: Assessment;
  prev: Assessment | null;
} | null;

async function load(token: string): Promise<LoadResult> {
  if (!token || token.length < 16) return null;
  const supabase = admin();

  // tenant-isolation-ignore: 公開レポートは report_token（推測不可・一意）で1件を特定する。service_role 使用。
  const { data: head } = await supabase
    .from("training_assessments")
    .select("id, clinic_id, customer_id, assessed_on, assessor_name, overall_memo, next_goal, homework")
    .eq("report_token", token)
    .maybeSingle();
  if (!head) return null;

  const clinicId = (head as any).clinic_id as string;
  const customerId = (head as any).customer_id as string;

  const [{ data: customer }, { data: settings }, { data: prevHead }] = await Promise.all([
    supabase.from("customers").select("name").eq("id", customerId).eq("clinic_id", clinicId).maybeSingle(),
    supabase.from("clinic_settings").select("clinic_name").eq("id", clinicId).maybeSingle(),
    supabase
      .from("training_assessments")
      .select("id, customer_id, assessed_on, assessor_name, overall_memo, next_goal, homework")
      .eq("clinic_id", clinicId)
      .eq("customer_id", customerId)
      .lt("assessed_on", (head as any).assessed_on)
      .order("assessed_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const ids = [(head as any).id, (prevHead as any)?.id].filter(Boolean) as string[];
  const { data: ms } = await supabase
    .from("training_measurements")
    .select("assessment_id, item_key, axis, side, score")
    .eq("clinic_id", clinicId)
    .in("assessment_id", ids);

  const pick = (aid: string): Measurement[] =>
    (ms ?? [])
      .filter((m: any) => m.assessment_id === aid)
      .map((m: any) => ({ item_key: m.item_key as RegionKey, axis: m.axis as AxisKey, side: m.side as Side, score: m.score }));

  const toAssessment = (h: any): Assessment => ({
    id: h.id, customer_id: h.customer_id, assessed_on: h.assessed_on,
    assessor_name: h.assessor_name ?? null, overall_memo: h.overall_memo ?? null,
    next_goal: h.next_goal ?? null, homework: h.homework ?? null,
    measurements: pick(h.id),
  });

  return {
    clinicName: (settings as any)?.clinic_name ?? "当院",
    customerName: (customer as any)?.name ?? "",
    current: toAssessment(head),
    prev: prevHead ? toAssessment(prevHead) : null,
  };
}

// 部位別レーダー（SVG）
function Radar({ data }: { data: { label: string; value: number }[] }) {
  const size = 260, c = size / 2, radius = size * 0.3, n = data.length;
  if (n < 3) return null;
  const step = (Math.PI * 2) / n;
  const pts = data.map((d, i) => {
    const a = i * step - Math.PI / 2, r = (Math.min(d.value, 10) / 10) * radius;
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a), lx: c + (radius + 24) * Math.cos(a), ly: c + (radius + 14) * Math.sin(a) };
  });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[300px] mx-auto overflow-visible">
      {[0.25, 0.5, 0.75, 1].map((lv, i) => (
        <polygon key={i} fill="none" stroke="#e2e8f0"
          points={data.map((_, j) => { const a = j * step - Math.PI / 2, r = radius * lv; return `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`; }).join(" ")} />
      ))}
      <polygon points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(16,185,129,.2)" stroke="#10b981" strokeWidth="2.5" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#10b981" />)}
      {data.map((d, i) => (
        <text key={i} x={pts[i].lx} y={pts[i].ly} textAnchor="middle" fontSize="10" fontWeight="700" fill="#64748b">{d.label}</text>
      ))}
    </svg>
  );
}

export default async function TrainingReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await load(token);

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="text-center">
          <h1 className="text-lg font-bold text-slate-700">レポートが見つかりません</h1>
          <p className="text-sm text-slate-500 mt-2">リンクが正しいかご確認ください。<br />ご不明な場合は院までお問い合わせください。</p>
        </div>
      </main>
    );
  }

  const { clinicName, customerName, current, prev } = data;
  const aa = axisAverages(current.measurements);
  const overall = overallAverage(current.measurements);
  const g = prev ? growth(prev, current) : null;
  const asym = asymmetries(current.measurements).filter((x) => x.diff >= 2).slice(0, 4);
  const radar = regionAverages(current.measurements).filter((r) => r.value != null).map((r) => ({ label: r.label, value: r.value as number }));
  const grade = gradeOf(overall);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 py-6 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* ヘッダー */}
        <div className="text-center">
          <p className="text-xs text-slate-500">{clinicName}</p>
          <h1 className="text-xl font-bold mt-1">{customerName}さん トレーニング結果</h1>
          <p className="text-sm text-slate-500 mt-0.5">{current.assessed_on}{current.assessor_name ? `・担当 ${current.assessor_name}` : ""}</p>
        </div>

        {/* 総合 */}
        <div className="bg-white rounded-2xl border p-5 text-center">
          <div className="flex items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black text-white" style={{ background: grade.color }}>{grade.label}</div>
            <div className="text-left">
              <div className="text-xs text-slate-500">総合点</div>
              <div className="text-3xl font-black leading-none" style={{ color: overall != null ? scoreColor(overall) : "#cbd5e1" }}>
                {overall != null ? overall.toFixed(1) : "–"}<span className="text-sm text-slate-400 font-normal"> / 10</span>
              </div>
              {g?.overall != null && Math.abs(g.overall) >= 0.05 && (
                <div className="text-xs font-bold mt-1" style={{ color: g.overall > 0 ? "#059669" : "#dc2626" }}>
                  前回から {g.overall > 0 ? "+" : ""}{g.overall.toFixed(1)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4軸 */}
        <div className="grid grid-cols-2 gap-2">
          {AXES.map((ax) => {
            const v = aa[ax.key];
            const d = g?.axes[ax.key] ?? null;
            return (
              <div key={ax.key} className="bg-white rounded-xl border p-3 text-center">
                <div className="text-xs text-slate-500">{ax.label}</div>
                <div className="text-2xl font-black" style={{ color: v != null ? scoreColor(v) : "#cbd5e1" }}>{v != null ? v.toFixed(1) : "–"}</div>
                {d != null && Math.abs(d) >= 0.05 && (
                  <div className="text-[10px] font-bold" style={{ color: d > 0 ? "#059669" : "#dc2626" }}>{d > 0 ? "+" : ""}{d.toFixed(1)}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* レーダー */}
        {radar.length >= 3 && (
          <div className="bg-white rounded-2xl border p-4">
            <h2 className="text-sm font-bold mb-2 text-center">体の部位バランス</h2>
            <Radar data={radar} />
          </div>
        )}

        {/* 左右差 */}
        {asym.length > 0 && (
          <div className="bg-white rounded-2xl border p-4">
            <h2 className="text-sm font-bold mb-2">⚖️ 左右差のチェック</h2>
            <div className="space-y-2.5">
              {asym.map((a, i) => {
                const lvl = diffLevel(a.diff);
                const col = lvl === "bad" ? "#ef4444" : lvl === "warn" ? "#f59e0b" : "#10b981";
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span>{a.label}・{a.axisLabel}</span>
                      <span className="font-bold" style={{ color: col }}>差 {a.diff}（{a.higher === "left" ? "右" : "左"}がひくめ）</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span className="w-4">左</span>
                      <div className="flex-1 h-2 bg-slate-100 rounded"><div className="h-full rounded" style={{ width: `${a.left * 10}%`, background: scoreColor(a.left) }} /></div>
                      <span className="w-4 text-right">{a.left}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                      <span className="w-4">右</span>
                      <div className="flex-1 h-2 bg-slate-100 rounded"><div className="h-full rounded" style={{ width: `${a.right * 10}%`, background: scoreColor(a.right) }} /></div>
                      <span className="w-4 text-right">{a.right}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* メモ・目標・宿題 */}
        {current.overall_memo && (
          <div className="bg-white rounded-2xl border p-4">
            <h2 className="text-sm font-bold mb-1">✅ 今日できたこと</h2>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{current.overall_memo}</p>
          </div>
        )}
        {current.next_goal && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <h2 className="text-sm font-bold mb-1 text-emerald-700">🎯 次回の目標</h2>
            <p className="text-sm text-emerald-900 whitespace-pre-wrap">{current.next_goal}</p>
          </div>
        )}
        {current.homework && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <h2 className="text-sm font-bold mb-1 text-amber-700">📓 今週の宿題</h2>
            <p className="text-sm text-amber-900 whitespace-pre-wrap">{current.homework}</p>
          </div>
        )}

        <p className="text-center text-[11px] text-slate-400 pt-2">
          このページはあなた専用のリンクです。<br />{clinicName}
        </p>
      </div>
    </main>
  );
}
