/**
 * 「1つの予約を、担当の先生ごとにどの時間帯で受け持つか」に分ける共通ロジック。
 *
 * 接骨院では2人の先生が同時に1人の患者さんに入ることはなく、
 * 複数担当の予約は**前後に分けて**施術する（2026-08-22 ぼーるくん）。
 *   例) 三浦様 19:00-20:00（森川＋藤川）
 *       主メニュー   保険施術（再診）20分 → 森川 19:00-19:20
 *       追加メニュー 鍼灸3部位     40分 → 藤川 19:20-20:00
 *
 * これを「合計時間 ÷ 担当人数」で等分してしまうと、上の例は 30分ずつ（19:30 で交代）になり、
 * 実際の交代時刻と 10分ずれる。予約カレンダーの表示も、かぶり判定も、
 * このズレのせいで「空いているのに取れない／取れているのにかぶり扱い」が起きる。
 * だから**メニューの所要時間で分ける**のが正しい。
 *
 * この関数はサーバー（かぶり判定）とクライアント（カレンダー表示）の両方から使うので、
 * DB にも React にも依存しない純粋関数にしてある。
 */

export type SpanStaffRef = { staff_id: string; staff_name?: string | null };
export type SpanCourseRef = { course_id: string; course_name?: string | null };

export type StaffSpanInput = {
  /** 予約の開始（ISO文字列） */
  startTime: string;
  /** 予約の終了（ISO文字列）。null なら fallbackMinutes を使う */
  endTime: string | null;
  /** 主担当。null なら分割の対象外（空配列を返す） */
  staffId: string | null;
  /** 主メニューの所要時間（分）。不明なら null */
  mainMinutes: number | null;
  /** 主メニュー名（表示用） */
  mainCourseName?: string | null;
  /** 追加担当（2人目以降） */
  additionalStaff: SpanStaffRef[] | null | undefined;
  /** 追加メニュー（追加担当と同じ並び順で対応する） */
  additionalCourses: SpanCourseRef[] | null | undefined;
  /** 追加メニューの所要時間（分）。additionalCourses と同じ並び。不明な要素は null */
  additionalMinutes: (number | null)[] | null | undefined;
  /** 所要時間が分からないときに使う既定値（院の予約枠サイズ） */
  fallbackMinutes: number;
};

export type StaffSpan = {
  staffId: string;
  /** その先生が受け持つ開始・終了（ISO文字列） */
  startIso: string;
  endIso: string;
  /** その先生が担当するメニュー名（1人目＝主メニュー、2人目以降＝追加メニュー） */
  courseName: string | null;
  /** 何人目か（0始まり） */
  index: number;
  /** 担当の合計人数 */
  count: number;
};

/**
 * 予約1件を担当ごとの時間帯に分ける。
 *
 * - 担当が1人（またはゼロ）のときは、予約の時間まるごとをその先生の担当として返す
 * - 複数のときは、メニューの所要時間を先頭から積み上げる（20分 → 40分 …）
 * - 最後の1人が残り時間を吸収するので、通常は予約の終了時刻でぴったり終わる
 * - メニュー時間の合計が予約時間より長いデータ不整合のときは、はみ出させる。
 *   枠を崩してまで予約の枠内に押し込めない（はみ出しが「施術時間が足りない予約」の目印になる）
 *
 * 交代時刻は必ずメニューの所要時間で決める。所要時間は予約枠の倍数（20/40/60分…）なので、
 * これを積み上げるかぎり交代時刻も枠に乗る。残り時間を人数で等分すると
 * 6分・25分のような枠外の時刻が生まれ、20分単位が絶対ルールのからだ鍼灸整骨院で事故になる。
 */
export function buildStaffSpans(input: StaffSpanInput): StaffSpan[] {
  const startMs = new Date(input.startTime).getTime();
  if (!Number.isFinite(startMs)) return [];

  const fallback = input.fallbackMinutes > 0 ? input.fallbackMinutes : 30;
  const rawEndMs = input.endTime ? new Date(input.endTime).getTime() : startMs + fallback * 60000;
  // 終了時刻が壊れているデータでも落とさない（開始 + 既定の長さ で扱う）
  const endMs = Number.isFinite(rawEndMs) && rawEndMs > startMs ? rawEndMs : startMs + fallback * 60000;
  const actualMs = endMs - startMs;

  // 担当リスト（主担当 → 追加担当の順。重複は先勝ちで落とす）
  const staffIds: string[] = [];
  const courseNames: (string | null)[] = [];
  const minutes: number[] = [];

  if (input.staffId) {
    staffIds.push(input.staffId);
    courseNames.push(input.mainCourseName ?? null);
    minutes.push(input.mainMinutes && input.mainMinutes > 0 ? input.mainMinutes : fallback);
  }
  const addStaff = input.additionalStaff ?? [];
  const addCourses = input.additionalCourses ?? [];
  const addMinutes = input.additionalMinutes ?? [];
  addStaff.forEach((s, i) => {
    if (!s?.staff_id || staffIds.includes(s.staff_id)) return;
    staffIds.push(s.staff_id);
    courseNames.push(addCourses[i]?.course_name ?? null);
    const m = addMinutes[i];
    minutes.push(m && m > 0 ? m : fallback);
  });

  if (staffIds.length === 0) return [];

  const iso = (ms: number) => new Date(ms).toISOString();

  if (staffIds.length === 1) {
    return [{
      staffId: staffIds[0],
      startIso: iso(startMs),
      endIso: iso(endMs),
      courseName: courseNames[0],
      index: 0,
      count: 1,
    }];
  }

  // 交代時刻は必ず予約枠に乗せる。
  //
  // からだ鍼灸整骨院は予約枠20分単位が絶対ルールで、枠に乗らない時刻を作ってはいけない
  // （2026-08-22 ぼーるくん再確認）。メニューの所要時間は枠の倍数（20/40/60分…）なので、
  // それを積み上げるかぎり交代時刻も枠に乗る。「残り時間を人数で等分」すると
  // 6分・25分のような枠外の時刻が生まれるので、等分はしない。
  const unitMs = fallback * 60000;
  const totalMs = minutes.reduce((a, b) => a + b, 0) * 60000;

  // メニュー時間の合計が予約時間に収まらないデータ不整合のときは、
  // 予約時間のほうを枠単位で人数分に割り直す（例: 40分の予約に2人 → 20分ずつ）。
  // 枠数より人数が多いときだけ、1人1枠にして予約時間からはみ出させる
  // （20分の予約に3人など、そもそも施術時間が足りていない予約の目印になる）。
  const evenMinutes: number[] | null = (() => {
    if (totalMs <= actualMs) return null;
    const slots = Math.floor(actualMs / unitMs);
    if (slots < staffIds.length) return staffIds.map(() => fallback);
    const per = Math.floor(slots / staffIds.length) * fallback;
    return staffIds.map(() => per);
  })();

  const spans: StaffSpan[] = [];
  let cursor = startMs;
  for (let i = 0; i < staffIds.length; i++) {
    const isLast = i === staffIds.length - 1;
    const mins = evenMinutes ? evenMinutes[i] : minutes[i];
    const own = cursor + mins * 60000;
    // 最後の1人は予約の終わりまで受け持つ（予約のほうが長ければ残りを吸収）。
    // 枠数より人数が多い不整合のときだけ、自分のぶんを優先してはみ出す。
    const next = isLast ? Math.max(endMs, own) : own;
    const fixed = Math.max(next, cursor + unitMs);
    spans.push({
      staffId: staffIds[i],
      startIso: iso(cursor),
      endIso: iso(fixed),
      courseName: courseNames[i],
      index: i,
      count: staffIds.length,
    });
    cursor = fixed;
  }
  return spans;
}

/** 予約のうち、指定した先生が受け持つ時間帯だけを返す（担当していなければ null） */
export function staffSpanOf(input: StaffSpanInput, staffId: string): StaffSpan | null {
  return buildStaffSpans(input).find((s) => s.staffId === staffId) ?? null;
}
