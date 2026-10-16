// ★ 第1524便: 「1行に収まるまでフォントを段階的に下げる」計測を、ページ全体でまとめて行う。
//
// なぜ要るか（PageSpeed・2026-10-17「強制リフロー」）
//   AutoFitAreaBadges（店舗カードごと）や AutoFitName（新着情報の行ごと）が、
//   「fontSize を 0.5px 下げる → scrollWidth を読む」を同期ループで回していた。
//   書く→読むを交互にやると、読むたびにブラウザがレイアウトをやり直す（強制リフロー）。
//   カード 1 枚につき最大 10 回以上 × カード数ぶん、初期描画のメインスレッドを食っていた。
//
// どう直すか
//   1. 同じフレームに来た全部の要求を集めて、「全部読む → 全部書く」の 2 段で処理する（レイアウトはフレームに 1 回）。
//   2. 文字幅はフォントサイズにほぼ比例するので、1 回測ったら「収まるサイズ」を割り算で出し、1 発で書く。
//      次のフレームで 1 回だけ確かめ、まだ溢れていれば step ずつ下げる（最大 FIT_MAX_ROUNDS 回）。
//   見た目の結果（最終的なフォントサイズ）は従来の「max から step ずつ下げて最初に収まるサイズ」と同じになる。
//
// 使い方（クライアントのみ）
//   const cancel = fitFontBatched({ container, text, max, min, step, start, onDone });
//   onDone(size, overflowAtMin) … 確定したサイズと「min でも溢れた」かどうか。
//   戻り値の cancel() を unmount / 依存変更時に呼ぶ。

type Pass = { read: () => void; write: () => void };

const queue: Pass[] = [];
let scheduled = false;

function flush() {
  scheduled = false;
  const jobs = queue.splice(0);
  for (const j of jobs) j.read();
  for (const j of jobs) j.write();
}

/** 読む→書く を同じフレームの他の要求とまとめる */
export function batchLayout(p: Pass): void {
  queue.push(p);
  if (!scheduled) {
    scheduled = true;
    // ★ rAF が止まる場面（裏タブ・画面外の埋め込み・プリレンダー）でも必ず進むよう、短い setTimeout を保険に付ける。
    //   先に来た方が flush し、もう一方は何もしない（scheduled=false で queue も空）。
    let fired = false;
    const once = () => { if (fired) return; fired = true; flush(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(once);
    setTimeout(once, 60);
  }
}

const FIT_MAX_ROUNDS = 6;

export type FitFontArgs = {
  /** 収める幅を持つ要素（clientWidth を読む） */
  container: HTMLElement;
  /** fontSize を書く要素（scrollWidth を読む）。container と同じでもよい */
  text: HTMLElement;
  max: number;
  min: number;
  step: number;
  /** いま当たっているサイズ（state の値）。最初の計測はこのサイズで行う */
  start: number;
  /** 幅に対してどれだけ余裕を見るか（0.98＝2%）。割り算の誤差で 1px 溢れるのを防ぐ */
  margin?: number;
  onDone: (size: number, overflowAtMin: boolean) => void;
};

function snapDown(v: number, step: number, min: number, max: number): number {
  const s = Math.floor(v / step) * step;
  return Math.min(max, Math.max(min, s));
}

export function fitFontBatched(args: FitFontArgs): () => void {
  const { container, text, max, min, step, start, margin = 0.98, onDone } = args;
  let cancelled = false;
  let size = start;
  let round = 0;

  // 1 回目: いまのサイズで測って、比例で「収まるサイズ」を出す
  const measure = (first: boolean) => {
    let cw = 0;
    let sw = 0;
    batchLayout({
      read: () => {
        if (cancelled) return;
        cw = container.clientWidth;
        sw = text.scrollWidth;
      },
      write: () => {
        if (cancelled) return;
        if (cw <= 0 || sw <= 0) { onDone(size, false); return; }
        const fits = sw <= cw;
        if (first) {
          // 比例で見積もる（収まっているなら max まで戻す候補にもなる）
          const est = fits && size >= max ? max : snapDown((size * cw * margin) / sw, step, min, max);
          if (est === size && fits) { onDone(size, false); return; }
          size = est;
          text.style.fontSize = `${size}px`;
          round += 1;
          measure(false); // 次のフレームで確かめる
          return;
        }
        if (fits || size <= min || round >= FIT_MAX_ROUNDS) {
          onDone(size, !fits && size <= min);
          return;
        }
        size = Math.max(min, size - step);
        text.style.fontSize = `${size}px`;
        round += 1;
        measure(false);
      },
    });
  };
  measure(true);
  return () => { cancelled = true; };
}
