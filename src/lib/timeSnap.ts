// 出勤時刻を、媒体の刻みに合わせて【内側に寄せる】（第73便・純粋関数）。
//
// ★★★ なぜ要るか
//   フクエスの入力は15分刻み（TimeRangePicker）。媒体はどちらも30分刻みだった:
//     駅ちか      00:00〜29:30（30分刻み・実機で確定・§157）
//     エステラブ  600〜3000＝6:00〜翌6:00（30分刻み・追記48 §259）
//   → 20:15 のような時刻は、どちらにも無い。
//
// ★★★ 2026-08-31 カッキー様の決定 —— **両方とも「内側に寄せる」に揃える**
//   ★ これは §157 の決定（「丸めない。送らない。理由をつけて画面に出す」）を**変えるもの**。
//     変えた理由: エステラブを足すときに「寄せる／送らない」が媒体ごとに違うと、
//     同じ出勤が **駅ちかには出ないのにエステラブには出る** ことになり、店舗に説明できない。
//     ★ 揃えるなら、出勤が出ないより出るほうがよい（＝寄せる）。
//
// ★★★ なぜ「内側」か（外側ではなく）
//   開始は遅いほうへ、終了は早いほうへ寄せる。★ 実際より長く出さない。
//   外側に寄せると「まだ居ない時間／もう帰った時間」に掲載が出て、
//   ★ 客様が来て「いない」が起きる。**間違えたときに人が困らないほうへ倒す。**
//
// ★★ 寄せたことは【必ず数えて画面に出す】。黙って時刻を書き換えない（§14-3）。

/** 媒体側の刻み（分）。★ 駅ちか・エステラブとも30分（実機で確定）。 */
export const SNAP_STEP_MINUTES = 30;

export type SnapResult =
  | { ok: true; startMin: number; endMin: number; snapped: boolean }
  | { ok: false; reason: string };

/** 分を「H:MM」に（24時超え表記のまま。27:30 など）。★ 画面に理由を出すためだけ。 */
export function minutesLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h + ':' + String(m).padStart(2, '0');
}

/**
 * 開始と終了を、刻みの【内側】へ寄せる。
 *
 * @param startMin 開始（分・0起点）
 * @param endMin   終了（分・★ 24時超え表記。呼び出し側で開始より後にしておくこと）
 *
 * ★ 寄せた結果、勤務が0分以下になったら送らない（ok:false）。
 *   例 20:15〜20:30 → 20:30〜20:30。★ ここで「30分にしておく」と、
 *     店舗が入れていない時間を勝手に足すことになる。**足さない。**
 */
export function snapInward(startMin: number, endMin: number, step = SNAP_STEP_MINUTES): SnapResult {
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) {
    return { ok: false, reason: '時刻を読み取れません' };
  }
  if (!Number.isFinite(step) || step <= 0) return { ok: false, reason: '刻みの指定が不正です' };
  if (endMin <= startMin) {
    return { ok: false, reason: '終了が開始より後になっていません（' + minutesLabel(startMin) + '〜' + minutesLabel(endMin) + '）' };
  }

  const s = Math.ceil(startMin / step) * step;   // ★ 開始は遅いほうへ
  const e = Math.floor(endMin / step) * step;    // ★ 終了は早いほうへ
  if (e <= s) {
    return {
      ok: false,
      reason:
        '刻みに合わせると勤務時間が無くなります（' +
        minutesLabel(startMin) + '〜' + minutesLabel(endMin) + ' → ' +
        minutesLabel(s) + '〜' + minutesLabel(e) + '）',
    };
  }
  return { ok: true, startMin: s, endMin: e, snapped: s !== startMin || e !== endMin };
}

/** 寄せた1件を、店舗が読んで分かる形にする。★ 寄せていなければ null。 */
export function snapNote(
  beforeStart: number, beforeEnd: number, after: { startMin: number; endMin: number; snapped: boolean },
): string | null {
  if (!after.snapped) return null;
  return (
    minutesLabel(beforeStart) + '〜' + minutesLabel(beforeEnd) + ' → ' +
    minutesLabel(after.startMin) + '〜' + minutesLabel(after.endMin)
  );
}
