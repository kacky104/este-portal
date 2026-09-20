// フクエスCRM：予約アラームの音（第559便・2026-09-20）。★ ブラウザの中だけで鳴らす（音のファイルは使わない・Web Audio で作る）。
// ★ ブラウザは、画面を一度押すまで音を出させない。unlockAlarmAudio() は「アラームをONにする」ボタンの中で呼ぶ。

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** ボタンを押したときに呼ぶ。鳴らせる状態になったら true */
export async function unlockAlarmAudio(): Promise<boolean> {
  const c = getCtx();
  if (!c) return false;
  try { await c.resume(); } catch { /* 何もしない */ }
  return c.state === 'running';
}

export function alarmAudioReady(): boolean {
  return !!ctx && ctx.state === 'running';
}

function tone(c: AudioContext, at: number, freq: number, len: number, type: OscillatorType = 'sine') {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + len + 0.05);
}

/** 音を1回ぶん鳴らす（約1秒）。sound は 1〜4 */
export function playAlarmOnce(sound: number): void {
  const c = getCtx();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime + 0.02;
  switch (sound) {
    case 1: // ピッ（短く1回）
      tone(c, t, 880, 0.25);
      break;
    case 2: // ピピッ（2回）
      tone(c, t, 1046, 0.15);
      tone(c, t + 0.22, 1046, 0.15);
      break;
    case 3: // ピロリン（上がる3音）
      tone(c, t, 784, 0.14, 'triangle');
      tone(c, t + 0.16, 988, 0.14, 'triangle');
      tone(c, t + 0.32, 1318, 0.3, 'triangle');
      break;
    default: // 4: ピピピピ（速く4回・低め）
      for (let i = 0; i < 4; i++) tone(c, t + i * 0.16, 660, 0.1, 'square');
  }
}
