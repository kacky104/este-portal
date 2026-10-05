// ★★ 第1211便（2026-10-06・カッキーさん）: セラピストページ（/cast）の「スケジュール」タブのバッジ用。
//   「まだ見ていない新しい予約」を数えるための、【見た】の印の置き場所。
//
// ★ 印は【スマホ（ブラウザ）ごと】に覚える（localStorage）。カッキーさん決定＝まずスマホごと・DB の変更なし。
//   ★ スマホを変えた／別のブラウザで開いたときは、見た予約がもう一度「新しい」と出る（運営からのお知らせのバッジと同じ弱点）。
// ★ 印の中身は「予約の id＋開始時刻」。時間が変わった予約は別の値になるので、もう一度「新しい」として数える。
// ★ 覚えるのは【いま先に残っている予約】のぶんだけ（終わった予約の印は捨てる＝増え続けない）。
// ★ 保存できない端末（プライベートモードなど）では、毎回ぜんぶ「新しい」になる。画面は止めない。

const key = (therapistId: string) => `fukues.cast.seenBookings.${therapistId}`;

export function readSeenBookings(therapistId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key(therapistId));
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export function writeSeenBookings(therapistId: string, sigs: string[]): void {
  try {
    window.localStorage.setItem(key(therapistId), JSON.stringify([...new Set(sigs)].slice(0, 500)));
  } catch {
    /* 保存できなくても画面は動かす */
  }
}
