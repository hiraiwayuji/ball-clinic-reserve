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
 * - 複数のときは、メニューの所要時間を先頭から積み上げる（20分 → 40分 …）。
 *   最後の1人が残り時間を吸収するので、必ず予約の終了時刻でぴったり終わる
 * - メニュー時間の合計が予約時間に収まらないデータ不整合のときだけ、人数で等分する
 *
 * 交代時刻は必ず「分」単位にする。比率で按分すると 10:06:40 のような
 * 枠外・秒つきの時刻が生まれ、20分刻みの院では現場が混乱するため。
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

  // 交代時刻は必ず「分」単位。予約枠は10分・20分刻みなので、
  // 比率で按分して 10:06:40 のような枠外・秒つきの時刻を作ってはいけない。
  const totalMinutes = minutes.reduce((a, b) => a + b, 0);
  const fitsInside = totalMinutes > 0 && totalMinutes * 60000 <= actualMs;

  const spans: StaffSpan[] = [];
  let cursor = startMs;
  for (let i = 0; i < staffIds.length; i++) {
    const isLast = i === staffIds.length - 1;
    let next: number;
    if (isLast) {
      // 最後の1人が残り時間を全部受け持つ（予約の終了時刻でぴったり終わらせる）
      next = endMs;
    } else if (fitsInside) {
      // メニューの所要時間をそのまま積み上げる（例: 20分 → 40分）
      next = cursor + minutes[i] * 60000;
    } else {
      // メニュー時間の合計が予約時間に収まらない（データ不整合）ときだけ、
      // 従来どおり人数で等分する。
      // このときも交代時刻は院の予約枠サイズ（20分など）の倍数に丸める。
      // 50分を2人で25分ずつにすると 10:25 という枠外の時刻が現場に出てしまうため。
      const unitMs = fallback * 60000;
      const evenMs = actualMs / staffIds.length;
      let perMs = Math.max(unitMs, Math.round(evenMs / unitMs) * unitMs);
      // 枠サイズに丸めた結果が全員ぶん収まらないときは丸めをやめ、分単位で均等に割る。
      // ここで丸めを優先すると最後の方の先生が「0分」になり、
      // その先生がかぶり判定から丸ごと消えてしまう（2026-08-22 検品指摘）。
      if (perMs * staffIds.length > actualMs) {
        perMs = Math.max(60000, Math.floor(evenMs / 60000) * 60000);
      }
      next = cursor + perMs;
    }
    next = Math.min(Math.max(next, cursor), endMs);
    spans.push({
      staffId: staffIds[i],
      startIso: iso(cursor),
      endIso: iso(next),
      courseName: courseNames[i],
      index: i,
      count: staffIds.length,
    });
    cursor = next;
  }
  return spans;
}

/** 予約のうち、指定した先生が受け持つ時間帯だけを返す（担当していなければ null） */
export function staffSpanOf(input: StaffSpanInput, staffId: string): StaffSpan | null {
  return buildStaffSpans(input).find((s) => s.staffId === staffId) ?? null;
}
