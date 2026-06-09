"use client";

import { useState } from "react";
import { WAREKI_ERAS, isoToWareki, warekiToIso, formatWareki } from "@/lib/wareki";

interface Props {
  /** ISO 形式（YYYY-MM-DD）または空文字 */
  value: string;
  onChange: (iso: string) => void;
  /** admin = 管理画面（明色）, patient = 患者アンケート（黒基調） */
  variant?: "admin" | "patient";
}

const THEME = {
  admin: {
    field:
      "h-9 border border-slate-200 rounded-lg px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white",
    dateExtra: "px-3",
    tabOn: "bg-blue-600 text-white border-blue-500",
    tabOff: "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100",
    unit: "text-xs text-slate-500",
    note: "text-xs text-slate-500",
  },
  patient: {
    field:
      "h-12 border border-white/10 rounded-2xl px-2 text-sm text-white bg-white/5 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all [color-scheme:dark]",
    dateExtra: "px-4 h-14",
    tabOn: "bg-blue-600 text-white border-blue-500",
    tabOff: "bg-white/5 border-white/10 text-blue-100/70 hover:bg-white/10",
    unit: "text-xs text-blue-100/60",
    note: "text-xs text-blue-100/50",
  },
} as const;

/**
 * 生年月日の入力。西暦（カレンダー）と和暦（年号＋年月日）を切り替えられる。
 * 保存される値は常に西暦 ISO 形式（YYYY-MM-DD）。
 */
export function BirthDateInput({ value, onChange, variant = "admin" }: Props) {
  const t = THEME[variant];
  const [mode, setMode] = useState<"seireki" | "wareki">("seireki");

  // 和暦モードでの各フィールド（value から導出した初期値）
  const initWareki = isoToWareki(value);
  const [eraKey, setEraKey] = useState<string>(initWareki?.eraKey ?? "showa");
  const [wYear, setWYear] = useState<string>(initWareki ? String(initWareki.year) : "");
  const [wMonth, setWMonth] = useState<string>(initWareki ? String(initWareki.month) : "");
  const [wDay, setWDay] = useState<string>(initWareki ? String(initWareki.day) : "");

  const switchMode = (next: "seireki" | "wareki") => {
    if (next === mode) return;
    if (next === "wareki") {
      // 西暦 → 和暦に同期
      const w = isoToWareki(value);
      if (w) {
        setEraKey(w.eraKey);
        setWYear(String(w.year));
        setWMonth(String(w.month));
        setWDay(String(w.day));
      }
    }
    setMode(next);
  };

  const commitWareki = (next: { eraKey?: string; year?: string; month?: string; day?: string }) => {
    const iso = warekiToIso({
      eraKey: next.eraKey ?? eraKey,
      year: Number(next.year ?? wYear),
      month: Number(next.month ?? wMonth),
      day: Number(next.day ?? wDay),
    });
    onChange(iso ?? "");
  };

  return (
    <div className="space-y-2">
      {/* 切り替えタブ */}
      <div className="grid grid-cols-2 gap-2">
        {([
          { key: "seireki", label: "西暦" },
          { key: "wareki", label: "和暦（年号）" },
        ] as const).map(opt => (
          <button
            key={opt.key}
            type="button"
            onClick={() => switchMode(opt.key)}
            className={`h-9 rounded-lg text-xs font-bold transition-all border ${
              mode === opt.key ? t.tabOn : t.tabOff
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === "seireki" ? (
        <input
          type="date"
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`w-full ${t.field} ${t.dateExtra}`}
        />
      ) : (
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-1.5 items-center">
          <select
            value={eraKey}
            onChange={e => {
              setEraKey(e.target.value);
              commitWareki({ eraKey: e.target.value });
            }}
            className={t.field}
          >
            {WAREKI_ERAS.map(era => (
              <option key={era.key} value={era.key} className="text-black">
                {era.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-0.5">
            <input
              type="number"
              min={1}
              max={64}
              inputMode="numeric"
              value={wYear}
              onChange={e => {
                setWYear(e.target.value);
                commitWareki({ year: e.target.value });
              }}
              placeholder="年"
              className={`w-full ${t.field}`}
            />
            <span className={t.unit}>年</span>
          </div>
          <div className="flex items-center gap-0.5">
            <select
              value={wMonth}
              onChange={e => {
                setWMonth(e.target.value);
                commitWareki({ month: e.target.value });
              }}
              className={`w-full ${t.field}`}
            >
              <option value="" className="text-black"></option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m} className="text-black">
                  {m}
                </option>
              ))}
            </select>
            <span className={t.unit}>月</span>
          </div>
          <div className="flex items-center gap-0.5">
            <select
              value={wDay}
              onChange={e => {
                setWDay(e.target.value);
                commitWareki({ day: e.target.value });
              }}
              className={`w-full ${t.field}`}
            >
              <option value="" className="text-black"></option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d} className="text-black">
                  {d}
                </option>
              ))}
            </select>
            <span className={t.unit}>日</span>
          </div>
        </div>
      )}

      {/* 確認表示：選んだ生年月日を西暦・和暦の両方で示す */}
      {value && (
        <p className={t.note}>
          {value.replace(/-/g, "/")}
          {formatWareki(value) ? `（${formatWareki(value)}）` : ""}
        </p>
      )}
    </div>
  );
}
