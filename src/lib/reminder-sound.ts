// Web Audio API で「ピンポン♪」風のチャイムを生成。
// アラート用なので、目立つ・短い・耳に優しい音を狙う。

let cachedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (cachedCtx) return cachedCtx;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    cachedCtx = new Ctx();
    return cachedCtx;
  } catch {
    return null;
  }
}

function playTone(ctx: AudioContext, frequency: number, startAt: number, duration: number, gain = 0.18) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, startAt);
  // 軽くアタックとリリースを付けて耳に優しく
  g.gain.setValueAtTime(0.0001, startAt);
  g.gain.exponentialRampToValueAtTime(gain, startAt + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

/** 短いチャイム1回分。ポップアップ発火時に呼ぶ。 */
export function playReminderChime() {
  const ctx = getAudioContext();
  if (!ctx) return;
  // モダンブラウザは初回ジェスチャ前は suspended なので resume を試みる
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const t0 = ctx.currentTime + 0.02;
  // ピン (高め) → ポン (やや下げて) のチャイム
  playTone(ctx, 988, t0, 0.18); // B5
  playTone(ctx, 740, t0 + 0.2, 0.28); // F#5
  // 0.7 秒後にもう一回鳴らして気付きやすく
  playTone(ctx, 988, t0 + 0.85, 0.14);
  playTone(ctx, 740, t0 + 1.02, 0.22);
}

/** ユーザージェスチャ後に AudioContext を warm up しておく */
export function warmupReminderAudio() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}
