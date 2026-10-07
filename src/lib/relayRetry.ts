// 中継のジョブを【送り直してよいか】の決めごと（第1278便・2026-10-07）。★ 純粋関数だけ。
//
// ★★★ 何が起きていたか（コネックエフ全体の調査で見つかった）:
//   相手サイトが30秒以内に返事をしないと、VPS の relay.sh は status 0 で結果を報告する。
//   受け口（/api/relay/result）は「HTTP ステータスとして読めない」と 400 で断っていたので、ジョブが閉じなかった。
//   → 2分後に【同じ要求】がもう一度送られる（3回まで）。段の種類を見ていなかったので、
//     出勤の保存・セラピストの登録・写メ日記の投稿も、そのまま送り直していた。
//     相手が1回目を受け取っていれば、同じ日記が2〜3本載る／同じ方が二重に登録される。
//   → 3回とも返事が無いと「送っている途中」のまま残り、掃除の周（6時間ごと）まで、
//     その店・そのサイトの更新がすべて「別の更新が動いています」になる。
//
// ★ 決まり（カッキーさんの OK・10/7）:
//   ・読むだけの段とログインは、返事が無ければ送り直してよい（3回まで・今までどおり）。
//   ・相手を【書き換える】段は、送り直さない。返事が無かったら1回で打ち切り、「届いたか確認できませんでした」と残す。
//     ★ 「二重に載る」より「止まって知らせる」。
//   ・★★ どちらにも入っていない段（新しく足して、ここに書き忘れた段）は【書き換える段として扱う】＝送り直さない。
//     番人（scripts/relayretry-selftest.js）が、relayQueue.ts の段の名前がすべてここに分類されているかを見張る。

/** 返事が無ければ送り直してよい段（読むだけ・ログイン・代理ログインの出入り）。 */
export const RETRY_SAFE_PURPOSES: readonly string[] = [
  // ── ログイン ──
  'login', 'esulove_login', 'esutama_login_page', 'esutama_login',
  // ── 駅ちか: 読むだけ ──
  'read_work', 'verify_work',
  'read_girls', 'read_sokuhime', 'read_maillist',
  'read_diary_list', 'read_diary_detail',
  'read_photo_page',
  'girl_create_form', 'girl_create_msg', 'girl_edit_form',
  'article_list', 'article_read', 'article_verify',
  // ── エステラブ: 読むだけ ──
  'esulove_therapists',
  // ── エステ魂: 読むだけ ──
  'esutama_roster', 'esutama_cast_list', 'esutama_cast_form',
  'esutama_photo_form', 'esutama_edit_form',
  'esutama_work_read', 'esutama_work_verify',
  'esutama_therapist_list',
  // ── エステ魂: 代理ログインの出入り（中身を書き換えない）──
  //   ★ *_end は「本人のセッションを残さない」ための段。返事が無ければ、もう一度閉じに行く
  'esutama_diary_token', 'esutama_diary_proxy', 'esutama_diary_page', 'esutama_diary_end',
  'esutama_sokusera_token', 'esutama_sokusera_proxy', 'esutama_sokusera_page', 'esutama_sokusera_verify', 'esutama_sokusera_end',
  // ── 疎通確認 ──
  'selftest',
];

/** 相手を書き換える段。★ 返事が無くても送り直さない。 */
export const NO_RETRY_PURPOSES: readonly string[] = [
  // ── 駅ちか ──
  'write_work',
  'girl_create', 'girl_edit', 'girl_delete',
  'upload_photo', 'crop_photo', 'delete_photo',
  'article_image', 'article_crop', 'article_save',
  // ★ sokuhime_check は「確かめる」段だが POST。中身が読み取りだけと言い切れないので、送り直さない側に置く（次の周が10分後に来る）
  'sokuhime_check', 'sokuhime_set', 'sokuhime_del',
  // ── エステ魂 ──
  'esutama_work_save',
  'esutama_cast_hide', 'esutama_cast_create',
  'esutama_photo_tmp', 'esutama_photo_save',
  'esutama_edit_save',
  'esutama_diary_post',
  'esutama_sokusera_start',
];

/** この段は、返事が無かったときに送り直してよいか。★ 知らない段は false（送り直さない）。 */
export function isRetrySafePurpose(purpose: string): boolean {
  return RETRY_SAFE_PURPOSES.includes(purpose);
}

/**
 * VPS が「返事が無かった」（status 0）と報告してきたとき、どうするか。
 *   'retry'      … 読むだけの段。まだ回数が残っている → 積み直す
 *   'give_up'    … 読むだけの段。回数を使い切った → 諦める（「接続に続けて失敗」）
 *   'stop_write' … 書き換える段 → 1回で打ち切る（「届いたか確認できませんでした」）
 */
export function noResponseAction(input: { purpose: string; attempts: number; maxAttempts: number }): 'retry' | 'give_up' | 'stop_write' {
  if (!isRetrySafePurpose(input.purpose)) return 'stop_write';
  return input.attempts >= input.maxAttempts ? 'give_up' : 'retry';
}

/**
 * VPS が掴んだまま戻らなかったジョブ（結果の報告が来ないまま期限が切れた）を、もう一度渡してよいか。
 *   ★ 送った直後に VPS が落ちた、という場合がある。書き換える段をもう一度渡すと二度送りになる。
 *   'resend'     … 読むだけの段 → 今までどおり渡す
 *   'stop_write' … 書き換える段 → 渡さずに打ち切る
 */
export function reLeaseAction(purpose: string): 'resend' | 'stop_write' {
  return isRetrySafePurpose(purpose) ? 'resend' : 'stop_write';
}

/** 「片づけ忘れ」の掃除を、引き取りのついでにやる間隔（分）。★ 毎分はやらない（DB への問い合わせを増やしすぎない） */
export const STUCK_SWEEP_EVERY_MIN = 5;

/** いまの「分」は、掃除をやる分か。 */
export function isStuckSweepMinute(nowMs: number): boolean {
  const m = new Date(nowMs).getUTCMinutes();
  return m % STUCK_SWEEP_EVERY_MIN === 0;
}
