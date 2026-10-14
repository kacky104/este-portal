// 写メ日記の転送の記録（diary_forward_log.status）を、店舗様が読める1行にする（第1496便・2026-10-15・カッキーさん・純粋関数）。
//
// ★★ なぜ要るか: 10/14 の「新人の写メ日記が駅ちかに載らない」は、記録には 'skipped:no_address' と残るのに、
//   それを見る画面がどこにも無かった（店舗様に言われて初めて分かった）。
// ★ status の値は src/app/lib/diary/forwardDiary.ts が書くもの。★ ここに無い値は、そのまま出す（黙って「その他」にしない）。
// ★ このファイルは通信も DB も触らない。

export type DiaryForwardTone = 'ok' | 'wait' | 'ng' | 'skip';

export type DiaryForwardLabel = { text: string; tone: DiaryForwardTone };

export function diaryForwardLabel(status: string): DiaryForwardLabel {
  const s = String(status ?? '').trim();
  if (s === 'sent') return { text: '送信しました', tone: 'ok' };
  if (s === 'retrying') return { text: '送信中', tone: 'wait' };
  if (s === 'waiting_address') return { text: '投稿用アドレスの読み込み待ち（数分〜十数分）', tone: 'wait' };
  if (s === 'failed') return { text: '送れませんでした（自動で送り直します）', tone: 'ng' };
  if (s === 'skipped:no_address') return { text: '投稿用アドレスが無いため送っていません（サイトとの連携をご確認ください）', tone: 'ng' };
  if (s === 'skipped:disabled') return { text: 'この宛先は「送らない」にしています', tone: 'skip' };
  if (s === 'skipped:empty') return { text: '中身が空のため送っていません', tone: 'skip' };
  if (s === 'skipped:set_plan_off') return { text: 'ご契約が確認できないため送っていません', tone: 'skip' };
  if (s === 'skipped:diary_gone') return { text: '日記が消されていたため送っていません', tone: 'skip' };
  if (s === 'skipped:taken') return { text: '別の周が送っています', tone: 'wait' };
  if (s.startsWith('skipped:source_is_')) return { text: '写メ日記の入口がフクエスではないため送っていません', tone: 'skip' };
  if (s.startsWith('skipped:link_mode_is_')) return { text: 'このサイトへは「フクエスから反映」していないため送っていません', tone: 'skip' };
  if (s.startsWith('failed:')) return { text: '送れませんでした（' + s.slice('failed:'.length) + '）', tone: 'ng' };
  return { text: s, tone: 'skip' };
}

/** 一覧で目立たせる行か（★ 店舗様が何かをしたほうがよい行） */
export function diaryForwardNeedsAttention(status: string): boolean {
  return diaryForwardLabel(status).tone === 'ng';
}
