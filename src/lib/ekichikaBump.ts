// 駅ちかの「上位表示する」をコネックエフから押す（第1305便・2026-10-08・カッキーさんの決定）。★ 純粋関数だけ（通信も DB も触らない）。
//
// ★★★ 駅ちかのボタンが送っているもの（2026-10-08 にラビリンス様の管理画面で実測・許可を得て1回押した）:
//   管理画面トップ（https://ranking-deli.jp/admin）の「上位表示する」＝ assets/js/admin/top.js
//     confirm() → $.ajax({ url: '/admin/bulktop/create.json', type: 'POST', dataType: 'json',
//                          data: 'id=' + $('.userid').val() + '&key=' + $('.unit_type').val() + '&shop_id=' + $('#hide_shop_id').val() })
//   ★ .userid と .unit_type はトップに無い要素なので、実際には 'id=undefined&key=undefined&shop_id=<店舗番号>' が飛ぶ。★ そのとおりに送る。
//   ★ shop_id を付けずに送ると 204（何も起きない・回数も減らない）だった。
//   ★ 応答（JSON）: all_display_num（残り回数）・disp_num_time（最終更新日時）・text（だめだったときの文）。
//   ★ CSRF の鍵は無い（ログインのセッションだけ）。
//   トップに出ている値: span.remaining_disp_num（残り）/ span.bulk_top_num（1日の回数・ラビリンス様は40）/
//                       li.last_disp_date（最終更新日 '2026年10月08日 12:37:21'）/ input#hide_shop_id（店舗番号）
//
// ★★ 決まり（カッキーさん・10/8）:
//   ・店舗様がコネックエフで ON/OFF・時間帯・間隔（10/15/20/30/60分）を決める（フクエスの自動上位表示と同じ形・lib/bumpAuto.ts）。
//   ・コネックエフに「今すぐ上位表示」のボタンも付ける（手で押した分も、自動の間隔の数えに入る）。
//   ・ラビリンス様は 10:00〜23:00・20分ごと（1日40回ちょうど）から。
//
// ★★ 自動の押し方（このファイルの shouldBumpNow）:
//   時間帯の始まりから「間隔ごとの区切り」を作り、いまの区切りでまだ上位表示されていなければ押す。
//   ・最後の上位表示（bump_last_at）は【駅ちかの最終更新日】＝店舗様が駅ちかで手で押した分も入る。
//   ・ただし前回から間隔の半分も経っていなければ押さない（手で押した直後に自動が重なって、回数を2つ使うのを防ぐ）。
//   ・残り0回なら押さない。★ 第1311便（カッキーさんの決定）: 0回を読んだら、次の【時間帯のはじめ】（ラビリンス様は朝10:00）まで見に行かない。
//     ★ それまでは「60分ごとに見に行く」だった（駅ちかの回数が戻る時刻が分からないため）。駅ちかへのログインを減らすために変えた。
//   ・回数・時刻が読めていないときは押さない側に倒す（「0回」と「読めていない」を混ぜない）。

import { BUMP_AUTO_INTERVALS, isValidBumpInterval, isValidMinuteOfDay, minuteOfDayJST, bumpWindowLength } from './bumpAuto';

export const EKICHIKA_ADMIN_TOP_URL = 'https://ranking-deli.jp/admin';
export const EKICHIKA_BUMP_URL = 'https://ranking-deli.jp/admin/bulktop/create.json';

/** 既定の設定（列の default と同じ）。★ 10:00〜23:00 を20分ごと＝40回 */
export const EKICHIKA_BUMP_DEFAULT_START_MIN = 600;
export const EKICHIKA_BUMP_DEFAULT_END_MIN = 1380;
export const EKICHIKA_BUMP_DEFAULT_INTERVAL_MIN = 20;
export { BUMP_AUTO_INTERVALS as EKICHIKA_BUMP_INTERVALS };
/**
 * ★ 第1802便（カッキーさん「B」・2026-11-09）: エステ魂の集客アピールは1日の回数が少ないので、長い間隔も選べる。
 *   ベンリーは時刻指定で2時間前後おきに1日中押していた → 10:00〜翌4:00 を120分ごと、のように合わせる。
 *   ★ 駅ちかは今までどおり BUMP_AUTO_INTERVALS（10〜60分）だけ（受け口で分ける）。DB の決まりは追加SQL_第1802便で広げる。
 */
export const ESUTAMA_BUMP_INTERVALS = [10, 15, 20, 30, 60, 90, 120, 180] as const;
/** 自動の判断・回数の計算で使ってよい間隔（どのサイトでも）。★ 保存できる間隔はサイトごとに intervalsFor で絞る */
function isKnownInterval(v: unknown): boolean {
  return typeof v === 'number' && ((ESUTAMA_BUMP_INTERVALS as readonly number[]).includes(v) || isValidBumpInterval(v) || isCustomBumpInterval(v));
}
/**
 * ★ 第1925便（2026-11-11・カッキーさん「ベンリーみたいに好きな分数を」）: 駅ちかのタイマー更新は、選択肢のほかに好きな分数（10〜240分の整数）も入れられる。
 *   ★ DB の決まり（salon_import_sources_bump_range）は 追加SQL_第1925便 で 10〜240 に広げる
 */
export const BUMP_CUSTOM_INTERVAL_MIN = 10;
export const BUMP_CUSTOM_INTERVAL_MAX = 240;
export function isCustomBumpInterval(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= BUMP_CUSTOM_INTERVAL_MIN && v <= BUMP_CUSTOM_INTERVAL_MAX;
}
/** 駅ちかのタイマー更新の選択肢（ベンリーに近い並び）。これ以外は「入力…」で入れる */
export const EKICHIKA_BUMP_INTERVAL_CHOICES = [10, 15, 20, 30, 45, 60, 90] as const;
export function bumpIntervalsFor(provider: string): readonly number[] {
  return provider === 'esutama' ? ESUTAMA_BUMP_INTERVALS : BUMP_AUTO_INTERVALS;
}

/**
 * ★★★ 第1407便（2026-10-12・カッキーさんが確かめた）: サイトの「1日の回数が戻る時刻」（日本時間・0時からの分）。
 *   駅ちか … 午前0時（ラビリンス様の管理画面で 0時すぎに 40/40 に戻っていた）／エステ魂 … 午前6時（エステ魂の画面の注記）。
 *   ★ これまでは戻る時刻が分からなかったので、0回を読んだら「次の時間帯のはじめ」まで待っていた（第1311便）。
 *     日をまたぐ時間帯（ラビリンス様 12:00〜翌1:00）だと、0時に回数が戻っても 0:00〜1:00 の分を押さず、
 *     画面も昨夜の「0回」のまま手動のボタンまで押せなかった。
 */
export const BUMP_RESET_MIN: Readonly<Record<'ekichika' | 'esutama', number>> = { ekichika: 0, esutama: 360 };

/** サイトの回数が戻る時刻（分）。★ 知らないサイトは null（＝今までどおり時間帯のはじめで待つ） */
export function bumpResetMinOf(provider: string): number | null {
  return provider === 'ekichika' || provider === 'esutama' ? BUMP_RESET_MIN[provider] : null;
}

/** at のあとで、最初に「日本時間の minOfDay」になる時刻（ISO）。★ ちょうどその分なら翌日。読めなければ null */
function nextMinuteOfDayAfter(at: string | null, minOfDay: number): string | null {
  const ms = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(ms) || !isValidMinuteOfDay(minOfDay)) return null;
  let delta = (minOfDay - minuteOfDayJST(new Date(ms)) + 1440) % 1440;
  if (delta === 0) delta = 1440;
  return new Date(ms - (ms % 60000) + delta * 60000).toISOString();
}

/**
 * 読んだ残り回数が、もう古いか（読んだあとにサイトの回数が戻る時刻を過ぎたか）。第1407便。
 *   ★ 古いときは、サイトの側では1日の回数に戻っている。★ 読んだ時刻・戻る時刻が分からなければ false（今までどおり）
 */
export function bumpCountStale(readAt: string | null, resetMin: number | null | undefined, now: Date): boolean {
  if (resetMin == null) return false;
  const next = nextMinuteOfDayAfter(readAt, resetMin);
  return next !== null && now.getTime() >= Date.parse(next);
}

/**
 * 残り0回を読んだあと、次に見に行ってよい時刻（ISO）＝読んだあとの【時間帯のはじめ】（第1311便）。
 *   ★ 第1407便: サイトの回数が戻る時刻（resetMin）が分かっていれば、そちらが先ならそちらまで（駅ちか 0:00・エステ魂 6:00）。
 *     戻る時刻が時間帯の外なら、周は out_of_window で押さないので、余計なログインは増えない。
 *   例: 10:00〜23:00 の店が 21:20 に0回を読んだ → 翌朝 10:00。★ 9:00 に0回を読んだ → 同じ日の 10:00。
 *   ★ 読んだ時刻が読めないときは null（＝待たせない。「読めていない」と「0回」を混ぜない）。
 */
export function bumpZeroResumeAt(readAt: string | null, startMin: number, resetMin?: number | null): string | null {
  // ★ ちょうど 10:00 に読んだ0回 → 翌日の 10:00
  const atStart = nextMinuteOfDayAfter(readAt, startMin);
  if (atStart === null) return null;
  const atReset = resetMin == null ? null : nextMinuteOfDayAfter(readAt, resetMin);
  return atReset !== null && Date.parse(atReset) < Date.parse(atStart) ? atReset : atStart;
}
/** 周が流れを始めてから、同じ枠で次を始めない時間（分）。★ 中継が引き取って押し終えるまでの余裕 */
export const EKICHIKA_BUMP_RUNNING_MIN = 4;

export type EkichikaBumpTop = {
  remaining: number | null;
  quota: number | null;
  /** 最終更新日（ISO・日本時間で読んで UTC に直したもの） */
  lastAt: string | null;
  shopId: string | null;
  problems: string[];
};

/** '2026年10月08日 12:37:21'（日本時間）→ ISO。読めなければ null */
export function parseEkichikaBumpTime(text: string): string | null {
  const m = /(\d{4})\s*[年/-]\s*(\d{1,2})\s*[月/-]\s*(\d{1,2})\s*日?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(text ?? ''));
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h - 9, mi, s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function textOf(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  if (!m) return null;
  return m[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/** 管理画面トップを読む */
export function parseEkichikaBumpTop(html: string): EkichikaBumpTop {
  const src = String(html ?? '');
  const problems: string[] = [];
  const num = (re: RegExp, name: string): number | null => {
    const t = textOf(src, re);
    if (t === null) { problems.push(name + 'が見つからない'); return null; }
    const n = Number(t.replace(/[^\d]/g, ''));
    if (t.replace(/[^\d]/g, '') === '' || !Number.isFinite(n)) { problems.push(name + 'が数字でない'); return null; }
    return n;
  };
  const remaining = num(/<span[^>]*class=["'][^"']*\bremaining_disp_num\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i, '残り回数');
  const quota = num(/<span[^>]*class=["'][^"']*\bbulk_top_num\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i, '1日の回数');
  const lastText = textOf(src, /<li[^>]*class=["'][^"']*\blast_disp_date\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/i);
  // ★ 一度も押していない店は空のことがある（＝null。問題にはしない）
  const lastAt = lastText ? parseEkichikaBumpTime(lastText) : null;
  if (lastText && !lastAt && /\d/.test(lastText)) problems.push('最終更新日が読めない');
  const tag = /<input\b[^>]*\bid=["']hide_shop_id["'][^>]*>/i.exec(src)?.[0] ?? '';
  const shopId = /\bvalue=["'](\d{1,12})["']/i.exec(tag)?.[1] ?? null;
  if (!shopId) problems.push('店舗番号（hide_shop_id）が見つからない');
  return { remaining, quota, lastAt, shopId, problems };
}

/** トップとして使えるか（押す材料がそろっているか） */
export function bumpTopUsable(t: EkichikaBumpTop): boolean {
  return t.remaining !== null && t.shopId !== null;
}

/** 送る本文。★ 駅ちかの画面が送るのと一字一句同じ（.userid / .unit_type は無いので undefined） */
export function buildEkichikaBumpBody(shopId: string): string {
  return 'id=undefined&key=undefined&shop_id=' + encodeURIComponent(String(shopId));
}

export type EkichikaBumpResult = { ok: boolean; remaining: number | null; lastAt: string | null; message: string | null };

/** 押したあとの応答（JSON）を読む */
export function parseEkichikaBumpResult(status: number, body: string): EkichikaBumpResult {
  if (status === 204) return { ok: false, remaining: null, lastAt: null, message: '応答が空でした（204）' };
  if (status < 200 || status >= 300) return { ok: false, remaining: null, lastAt: null, message: 'HTTP ' + status };
  let j: unknown = null;
  try { j = JSON.parse(String(body ?? '')); } catch { /* 下で扱う */ }
  if (!j || typeof j !== 'object') return { ok: false, remaining: null, lastAt: null, message: '応答を読み取れませんでした' };
  const o = j as Record<string, unknown>;
  const rawNum = o['all_display_num'];
  const remaining = typeof rawNum === 'number' ? rawNum : (typeof rawNum === 'string' && /^\d+$/.test(rawNum.trim()) ? Number(rawNum.trim()) : null);
  const lastAt = typeof o['disp_num_time'] === 'string' ? parseEkichikaBumpTime(o['disp_num_time']) : null;
  const rawText = typeof o['text'] === 'string' ? o['text'] : null;
  // ★ 相手の文は短く切って、宛先（URL）は落とす（記録に出すため）
  const message = rawText ? rawText.replace(/https?:\/\/\S+/g, '').replace(/<[^>]*>/g, '').trim().slice(0, 80) || null : null;
  return { ok: remaining !== null, remaining, lastAt, message };
}

export type BumpSetting = {
  enabled: boolean; startMin: number; endMin: number; intervalMin: number;
  /**
   * ★ 第1922便（2026-11-11・オイルクエスト様「ベンリーと同じに」）: 時刻指定（0時からの分）。
   *   1つ以上あれば、時間帯と間隔ではなくこの時刻で押す（ベンリーの「時刻指定更新」と同じ）。無い・空なら今までどおり間隔で押す
   */
  times?: number[] | null;
};

/** 時刻指定は1日40個まで（駅ちかの1日の回数） */
export const BUMP_TIMES_MAX = 40;
/** 時刻指定で、その時刻を過ぎてから何分までなら押しに行くか（押し損ねた古い時刻をあとから押さない） */
export const BUMP_TIMES_STALE_MIN = 30;

/** 時刻指定の値をそろえる（0〜1439 の整数・重複なし・時刻順）。1つも無ければ null */
export function normalizeBumpTimes(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const set = new Set<number>();
  for (const x of v) {
    const n = typeof x === 'string' ? Number(x) : x;
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 1439) set.add(n);
  }
  const out = [...set].sort((a, b) => a - b);
  return out.length > 0 ? out : null;
}

/** 「09:32 10:08、23:05」のような文から時刻指定を読む（全角・改行・読点も可）。読めなかったものは bad に入れる */
export function parseBumpTimesText(text: string): { times: number[]; bad: string[] } {
  const half = String(text ?? '').replace(/[０-９：]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const bad: string[] = [];
  const mins: number[] = [];
  for (const tok of half.split(/[\s,、，]+/).filter(Boolean)) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(tok);
    const h = m ? Number(m[1]) : NaN;
    const mi = m ? Number(m[2]) : NaN;
    if (!m || h > 23 || mi > 59) { bad.push(tok); continue; }
    mins.push(h * 60 + mi);
  }
  return { times: normalizeBumpTimes(mins) ?? [], bad };
}

function hasBumpTimes(s: { times?: number[] | null }): s is { times: number[] } {
  return Array.isArray(s.times) && s.times.length > 0;
}

/**
 * 時刻指定で、いま押しに行く回（ISO）。
 *   過ぎてから BUMP_TIMES_STALE_MIN 分以内の時刻のうち、まだ押しに行っていない（doneAt より後の）いちばん早いもの。
 *   ★ 近い時刻（22:44 と 22:45）も、見回りごとに1つずつ押す。★ 押し損ねた古い時刻をあとから押さない
 */
export function nextDueBumpTime(now: Date, times: number[] | null | undefined, doneAt: string | null | undefined): string | null {
  if (!Array.isArray(times) || times.length === 0) return null;
  const nowMin = minuteOfDayJST(now);
  const base = now.getTime() - now.getUTCSeconds() * 1000 - now.getUTCMilliseconds();
  const done = doneAt ? Date.parse(doneAt) : NaN;
  let best: number | null = null;
  for (const t of times) {
    const ago = (nowMin - t + 1440) % 1440;
    if (ago > BUMP_TIMES_STALE_MIN) continue;
    const at = base - ago * 60000;
    if (Number.isFinite(done) && at <= done) continue;
    if (best === null || at < best) best = at;
  }
  return best === null ? null : new Date(best).toISOString();
}
export type BumpState = {
  lastAt: string | null; remaining: number | null; readAt: string | null; autoAt: string | null;
  /** ★ 第1922便: 時刻指定で、自動で押しに行った最後の時刻（その日の何時の回か＝ISO）。salon_import_sources.bump_times_done_at */
  timesDoneAt?: string | null;
};

export type BumpReason = 'ok' | 'off' | 'bad_setting' | 'out_of_window' | 'already_this_slot' | 'too_soon' | 'no_quota' | 'running' | 'unknown';

export function isValidBumpSetting(s: BumpSetting): boolean {
  if (hasBumpTimes(s)) return s.times.length <= BUMP_TIMES_MAX && s.times.every((t) => isValidMinuteOfDay(t));
  return isValidMinuteOfDay(s.startMin) && isValidMinuteOfDay(s.endMin) && isKnownInterval(s.intervalMin);
}

/** その時間帯・間隔で、1日に自動で押す最大の回数（開始ちょうどに1回、あとは間隔ごと） */
export function bumpSlotsPerDay(s: Pick<BumpSetting, 'startMin' | 'endMin' | 'intervalMin' | 'times'>): number {
  if (hasBumpTimes(s)) return s.times.length;
  if (!isValidMinuteOfDay(s.startMin) || !isValidMinuteOfDay(s.endMin) || !isKnownInterval(s.intervalMin)) return 0;
  return Math.floor(bumpWindowLength(s.startMin, s.endMin) / s.intervalMin) + 1;
}

/**
 * 時間帯のおわりの区切り（例: 23:00）を、おわりのあと何分まで押してよいか。
 * ★ 周は5分ごと（区切りの4分後）に回る。★ これが無いと、おわりちょうどの区切りが時間帯の外になって押せない（40回のはずが39回）。
 */
export const EKICHIKA_BUMP_END_GRACE_MIN = 9;

/** いまの区切りの始まり（ISO）。時間帯の外なら null */
export function currentBumpSlotAt(now: Date, s: Pick<BumpSetting, 'startMin' | 'endMin' | 'intervalMin' | 'times'>): string | null {
  if (hasBumpTimes(s)) {
    // ★ 時刻指定: いちばん近い「過ぎた時刻」。過ぎてから BUMP_TIMES_STALE_MIN 分より前のものは押さない
    const nowMin = minuteOfDayJST(now);
    let ago = Infinity;
    for (const t of s.times) ago = Math.min(ago, (nowMin - t + 1440) % 1440);
    if (!Number.isFinite(ago) || ago > BUMP_TIMES_STALE_MIN) return null;
    const ms = now.getTime() - ago * 60000 - now.getUTCSeconds() * 1000 - now.getUTCMilliseconds();
    return new Date(ms).toISOString();
  }
  if (!isValidMinuteOfDay(s.startMin) || !isValidMinuteOfDay(s.endMin) || !isKnownInterval(s.intervalMin)) return null;
  const nowMin = minuteOfDayJST(now);
  const len = bumpWindowLength(s.startMin, s.endMin);
  const since = (nowMin - s.startMin + 1440) % 1440;           // 時間帯の始まりからの分
  if (since > len + EKICHIKA_BUMP_END_GRACE_MIN) return null;   // 時間帯の外（おわりの少しあとまでは中）
  const slotSince = Math.floor(since / s.intervalMin) * s.intervalMin;
  if (slotSince > len) return null;                             // おわりより後に区切りは作らない
  const offsetMin = since - slotSince;                          // いまの区切りに入ってからの分
  const slotMs = now.getTime() - offsetMin * 60000 - now.getUTCSeconds() * 1000 - now.getUTCMilliseconds();
  return new Date(slotMs).toISOString();
}

/**
 * いま自動で押すか。
 *   周（中継を始める前）では state に DB の写し、流れの中（トップを読んだあと）では読んだばかりの値を渡す。
 */
export function shouldBumpNow(input: {
  now: Date; setting: BumpSetting; state: BumpState; atRead?: boolean;
  /** ★ 第1407便: サイトの回数が戻る時刻（bumpResetMinOf）。周から渡す。★ 無ければ今までどおり時間帯のはじめまで待つ */
  resetMin?: number | null;
}): { bump: boolean; reason: BumpReason } {
  const { now, setting: s, state } = input;
  const no = (reason: BumpReason) => ({ bump: false, reason });
  if (!s.enabled) return no('off');
  if (!isValidBumpSetting(s)) return no('bad_setting');
  if (hasBumpTimes(s)) {
    // ★ 第1922便: 時刻指定。どの回を押すかは周が決めて bump_times_done_at に書く（駅ちかの最終更新日では、近い時刻を見分けられない）
    //   ★ 流れの中（読んだあと）は、残り回数だけ見る（周がもう回を決めている）
    if (state.remaining !== null && state.remaining <= 0) {
      if (input.atRead) return no('no_quota');
      const resume = bumpZeroResumeAt(state.readAt, s.startMin, input.resetMin);
      if (resume && now.getTime() < Date.parse(resume)) return no('no_quota');
    }
    if (input.atRead) return { bump: true, reason: 'ok' };
    if (state.autoAt) {
      const a = Date.parse(state.autoAt);
      if (!Number.isFinite(a)) return no('unknown');
      if (now.getTime() - a < EKICHIKA_BUMP_RUNNING_MIN * 60000) return no('running');
    }
    return nextDueBumpTime(now, s.times, state.timesDoneAt) ? { bump: true, reason: 'ok' } : no('out_of_window');
  }
  const slotAt = currentBumpSlotAt(now, s);
  if (!slotAt) return no('out_of_window');

  // 残り0回（★ 周のときは「次の時間帯のはじめ（第1407便: かサイトの回数が戻る時刻の早いほう）まで見に行かない」第1311便。読んだ直後は、その値で決める）
  if (state.remaining !== null && state.remaining <= 0) {
    if (input.atRead) return no('no_quota');
    const resume = bumpZeroResumeAt(state.readAt, s.startMin, input.resetMin);
    if (resume && now.getTime() < Date.parse(resume)) return no('no_quota');
  }
  // 流れを始めたばかり（周のときだけ）
  if (!input.atRead && state.autoAt) {
    const a = Date.parse(state.autoAt);
    if (!Number.isFinite(a)) return no('unknown');
    if (now.getTime() - a < EKICHIKA_BUMP_RUNNING_MIN * 60000) return no('running');
  }
  if (state.lastAt) {
    const last = Date.parse(state.lastAt);
    if (!Number.isFinite(last)) return no('unknown');
    if (last >= Date.parse(slotAt)) return no('already_this_slot');
    if (now.getTime() - last < (s.intervalMin / 2) * 60000) return no('too_soon');
  }
  return { bump: true, reason: 'ok' };
}

/** 押さなかった理由を、店舗様の言葉で（記録の1行） */
export function bumpSkipLabel(reason: BumpReason): string {
  switch (reason) {
    case 'no_quota': return '本日の上位表示の残り回数がありません';
    case 'already_this_slot': return 'この時間はすでに上位表示されています';
    case 'too_soon': return '前回の上位表示から間がないため、今回は押しませんでした';
    case 'out_of_window': return '自動で押す時間帯の外です';
    case 'off': return '自動の上位表示は止めています';
    case 'bad_setting': return '自動の上位表示の設定を読み取れませんでした';
    case 'running': return '上位表示の処理中です';
    case 'unknown': return '前回の上位表示の時刻を読み取れませんでした';
    default: return '';
  }
}
