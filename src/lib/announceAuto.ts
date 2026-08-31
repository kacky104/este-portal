// お知らせの自動配信と、押し直しの判定（第67便・設計メモ 追記37 §191〜§193）。
//
// ★★★ このファイルは通信もDBも触らない。**時刻すら引数で受ける**（now）。
//   mediaLinkStall.ts / workPlan.ts と同じ理由:【判断は、固定して見返せる形に置く】。
//   ★ Date.now() をこの中で呼ぶと、点検で「朝5:59」「朝6:00」を作れなくなる。
//
// ★★★ 何を守るための判定か（§191）
//   フクエスは駅ちかと違い **TOPページに新着情報ブロックがある**。ここが埋まると弱点になる。
//     守り1  新着情報ブロックは 1店舗1件      → salonNews.ts（この判定の外）
//     守り2  自動は1日1回だけ                → shouldAutoPost（このファイル）
//     守り3  押し直しは最短30分に1回          → judgeManualPost（このファイル）
//
//   ★ 守り3は【押し直しにだけ】掛かる。新しく書いたものは即出す。
//     書いたものが出ないのは、オーナー様から見て「壊れている」。そこに待ち時間は置かない。

// ─────────────────────────────────────────────────────────
// 1日の区切り
// ─────────────────────────────────────────────────────────

/**
 * 1日の始まり（JST）。★ 0時ではなく朝6時。
 *   0時で切ると営業中に日付が変わる。メンズエステは深夜営業なので
 *   朝5時の手動が「昨日ぶん」になるほうが感覚に合う（§192）。
 *
 * ★★ この6は salon_bump（20260728_salon_bump.sql）の
 *   `((now() at time zone 'Asia/Tokyo') - interval '6 hours')::date` と同じ切り方。
 *   ★ 上位表示の回数リセットと区切りがずれると、オーナー様に説明が2つ要る。
 */
export const DAY_START_HOUR_JST = 6;

/** 押し直しでフクエスTOPの並びが動く最短の間隔（分）。★ 仮の数字。1か所に置く（§191 守り3）。 */
export const BUMP_COOLDOWN_MINUTES = 30;

const JST_OFFSET_MS = 9 * 3_600_000;
const DAY_MS = 24 * 3_600_000;

/**
 * その時刻が属する「区切りの日」を YYYY-MM-DD で返す。
 * ★ 朝5:59 は前日、朝6:00 は当日。
 */
export function dayKeyJST(now: Date): string | null {
  const t = now.getTime();
  if (!Number.isFinite(t)) return null;              // ★ 読めない時刻を推測で埋めない
  const shifted = t + JST_OFFSET_MS - DAY_START_HOUR_JST * 3_600_000;
  return new Date(shifted).toISOString().slice(0, 10);
}

/** その「区切りの日」が始まった瞬間（＝JST 朝6:00）のミリ秒。 */
export function dayStartMs(dayKey: string): number | null {
  const t = Date.parse(dayKey + 'T00:00:00Z');
  if (!Number.isFinite(t)) return null;
  return t - JST_OFFSET_MS + DAY_START_HOUR_JST * 3_600_000;
}

// ─────────────────────────────────────────────────────────
// 自動配信の時刻（店舗IDから割り当てる）
// ─────────────────────────────────────────────────────────

/**
 * 店舗ごとの自動配信の時刻を、区切り（朝6:00）からの分で返す（0〜1439）。
 *
 * ★★★ なぜ保存しないのか（§193 からの意図的なずらし）
 *   §193 は「店舗側：自動配信の時刻」を項目として挙げていたが、
 *   §192 で決めたのは **「店舗IDから割り当て・オーナー様には選ばせない」**。
 *   選ばせないものを列に持つと、
 *     ・列の値と計算の値がずれた店が作れてしまう（どちらが本当か分からなくなる）
 *     ・「選べるのでは」と読める設定項目が1つ増える
 *   ★ **決め方が1つしかないものは、決め方だけを置く。** 保存はしない。
 *   ★ 割り当て方を変えたくなったら、この関数1か所を直せば全店に効く。
 *
 * ★ 337 は素数で 1440 を割らない。→ ID が1つ違う店は 337分（約5時間37分）離れる。
 *   連番で登録された店が同じ時間帯に固まらない。
 */
export function autoPostMinuteOfDay(salonId: number): number | null {
  if (!Number.isFinite(salonId)) return null;
  const id = Math.trunc(salonId);
  const m = (id * 337) % 1440;
  return m < 0 ? m + 1440 : m;
}

/** 「14:20ごろ」の形。★ 画面で店舗に見せるためだけ（設定ではない）。 */
export function autoPostTimeLabel(salonId: number): string | null {
  const m = autoPostMinuteOfDay(salonId);
  if (m === null) return null;
  const total = (DAY_START_HOUR_JST * 60 + m) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return hh + ':' + mm;
}

// ─────────────────────────────────────────────────────────
// 本文の指紋
// ─────────────────────────────────────────────────────────

/**
 * お知らせ本文の指紋。★ 「押し直しか、新しく書いたか」の判別にだけ使う（§191 守り3）。
 * ★ 中身を復元できる必要は無いので、短い数字でよい（FNV-1a 32bit ＋ 長さ）。
 *   長さを足すのは、当たりにくくするためだけ。
 */
export function announceFingerprint(title: string | null, content: string | null): string {
  const s = (title ?? '') + '\n' + (content ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + ':' + s.length;
}

// ─────────────────────────────────────────────────────────
// 守り2 —— 自動配信を出すか
// ─────────────────────────────────────────────────────────

export type AutoSkipReason =
  | 'unknown'          // ★ 材料が読めていない。**0件と混ぜない**（作法3-5）
  | 'no_targets'       // 「自動で回す」に印の付いたお知らせが0件
  | 'not_yet'          // まだこの店の時刻になっていない
  | 'done_today'       // 今日ぶんの自動はもう出した
  | 'manual_today';    // 今日の区切り内に手動があった → 出さない・順番も進めない

export type AutoPostInput = {
  now: Date;
  salonId: number;
  /**
   * 「自動で回す」に印の付いたお知らせの本数。
   * ★ null は【数えられていない】。0（1本も無い）と区別する。
   */
  autoTargetCount: number | null;
  /** 最終自動配信日（区切りの日・YYYY-MM-DD）。まだ無ければ null */
  lastAutoDay: string | null;
  /** 最終手動配信日時（ISO）。まだ無ければ null */
  lastManualAt: string | null;
  /** ローテの現在位置。まだ無ければ null（→ 次は0本目） */
  rotationIndex: number | null;
};

export type AutoPostResult =
  | { post: false; reason: AutoSkipReason; dayKey: string | null; index: null; dueAtISO: string | null }
  | { post: true;  reason: null;           dayKey: string;        index: number; dueAtISO: string };

/**
 * この瞬間に自動配信を出すべきかを判定する。
 *
 * ★★ 判定の順は「材料が無い → 出す物が無い → もう出した → まだ時刻でない → 手動があった」。
 *   ★ 材料が読めていないときに「0件だから出さない」と言わない。
 *     設計メモ §26・§202・§209・§210 と同じ罠（0件と分からないを混ぜない）。
 */
export function shouldAutoPost(input: AutoPostInput): AutoPostResult {
  const NO = (reason: AutoSkipReason, dayKey: string | null, dueAtISO: string | null): AutoPostResult =>
    ({ post: false, reason, dayKey, index: null, dueAtISO });

  const dayKey = dayKeyJST(input.now);
  const minute = autoPostMinuteOfDay(input.salonId);
  if (dayKey === null || minute === null) return NO('unknown', dayKey, null);

  const start = dayStartMs(dayKey);
  if (start === null) return NO('unknown', dayKey, null);
  const dueMs = start + minute * 60_000;
  const dueAtISO = new Date(dueMs).toISOString();

  // ★ 材料が読めていない。0件ではない
  if (input.autoTargetCount === null || !Number.isFinite(input.autoTargetCount)) {
    return NO('unknown', dayKey, dueAtISO);
  }
  // ★ 「自動で回す」に印の付いたものが1本も無い。これは0件だと言い切れる
  if (input.autoTargetCount <= 0) return NO('no_targets', dayKey, dueAtISO);

  // 守り2：1日1回
  if (input.lastAutoDay === dayKey) return NO('done_today', dayKey, dueAtISO);

  const now = input.now.getTime();
  if (now < dueMs) return NO('not_yet', dayKey, dueAtISO);

  // ★ この区切りの中に手動が1回でもあったら、その日の自動は出さない・順番も進めない（§192）
  const manual = input.lastManualAt ? Date.parse(input.lastManualAt) : NaN;
  if (Number.isFinite(manual) && manual >= start && manual <= now) {
    return NO('manual_today', dayKey, dueAtISO);
  }

  return { post: true, reason: null, dayKey, index: nextRotationIndex(input.rotationIndex, input.autoTargetCount), dueAtISO };
}

/**
 * 次に出す1本の位置。★ 出すたびに1つ進む（§192「次の1本を出す・順番を1つ進める」）。
 * ★ まだ位置が無ければ0本目から。本数が減っていても必ず範囲に収める。
 */
export function nextRotationIndex(current: number | null, count: number): number {
  if (count <= 0) return 0;
  const c = current === null || !Number.isFinite(current) ? -1 : Math.trunc(current);
  const n = (c + 1) % count;
  return n < 0 ? n + count : n;
}

/** 出さなかった理由を、店舗が読んで分かる1行にする。★ 出したときは null。 */
export function autoSkipMessage(result: AutoPostResult): string | null {
  if (result.post) return null;
  switch (result.reason) {
    case 'unknown':
      return 'お知らせの本数を数えられていないため、自動配信の判定をしていません';
    case 'no_targets':
      return '「自動で回す」に印を付けたお知らせが1本もありません';
    case 'not_yet':
      return '今日の自動配信は、まだ時刻になっていません';
    case 'done_today':
      return '今日の自動配信はもう出しました（次は翌朝6時以降）';
    case 'manual_today':
      return '今日は手動で出したので、自動配信はお休みします（順番も進めません）';
  }
}

// ─────────────────────────────────────────────────────────
// 守り3 —— 手動で押したとき
// ─────────────────────────────────────────────────────────

export type ManualPostInput = {
  now: Date;
  /** これから出すお知らせの指紋（announceFingerprint） */
  fingerprint: string;
  /** 前回フクエスTOPの並びを動かしたお知らせの指紋。まだ無ければ null */
  lastFingerprint: string | null;
  /** 前回フクエスTOPの並びを動かした時刻（ISO）。まだ無ければ null */
  lastBumpAt: string | null;
  /** 既定 BUMP_COOLDOWN_MINUTES。点検で短くするためだけに開けてある */
  cooldownMinutes?: number;
};

export type ManualPostResult = {
  /** フクエスTOPの並びを動かすか */
  bumpFukues: boolean;
  /** 動かさないとき、あと何分待てば動くか（動かすときは0） */
  waitMinutes: number;
  /** ★ 駅ちかへは常に送る。待たせない（§191） */
  sendToEkichika: true;
  /** 'new'（新しく書いた）/ 'repost'（押し直し） */
  kind: 'new' | 'repost';
};

/**
 * 手動で押したときに何が起きるかを決める。
 *
 * ★★★ 待たせるのは【同じ本文を押し直したとき】だけ。
 *   Aを書いた → すぐBを書いた   → Bがすぐ出る（待ち時間なし）
 *   同じAをもう一度押した        → フクエスTOPは前回から30分動かない
 *   ★ どちらの場合も駅ちかへは即送る。
 */
export function judgeManualPost(input: ManualPostInput): ManualPostResult {
  const kind: 'new' | 'repost' =
    input.lastFingerprint !== null && input.lastFingerprint === input.fingerprint ? 'repost' : 'new';

  // ★ 新しく書いたものは即出す
  if (kind === 'new') return { bumpFukues: true, waitMinutes: 0, sendToEkichika: true, kind };

  const last = input.lastBumpAt ? Date.parse(input.lastBumpAt) : NaN;
  const now = input.now.getTime();
  // ★ 前回の時刻が読めない＝いつ動かしたか分からない。**止める根拠が無いので出す**
  if (!Number.isFinite(last) || !Number.isFinite(now)) {
    return { bumpFukues: true, waitMinutes: 0, sendToEkichika: true, kind };
  }

  const cooldown = (input.cooldownMinutes ?? BUMP_COOLDOWN_MINUTES) * 60_000;
  const elapsed = now - last;
  // ★ 未来の時刻（時計のずれ）は「経ってない」ではなく「経った」に倒す。押した人を待たせない
  if (elapsed < 0) return { bumpFukues: true, waitMinutes: 0, sendToEkichika: true, kind };
  if (elapsed >= cooldown) return { bumpFukues: true, waitMinutes: 0, sendToEkichika: true, kind };

  // ★ 切り上げ（「あと0分」と言って上がらないのが最悪）
  const waitMinutes = Math.ceil((cooldown - elapsed) / 60_000);
  return { bumpFukues: false, waitMinutes, sendToEkichika: true, kind };
}

/**
 * 駅ちかへどうなったか。
 *   'ok'   … 送れた
 *   'ng'   … 送ろうとして送れなかった      ★ できなかったことも言う（作法3-7）
 *   'none' … そもそも送る先になっていない  ★ ★ 送っていないのに「送れませんでした」と言わない
 */
export type EkichikaOutcome = 'ok' | 'ng' | 'none';

/**
 * 押したあとに画面へ出す文。★★ 黙って何も起きないのが最悪なので、**結果を必ず言葉にする**（§191）。
 *
 * ★★★ 'none' の行を出さないのは、嘘をつかないため。
 *   お知らせの駅ちか書き込み（§195 の5）はまだ無い。そこで毎回
 *   「駅ちかへは送れませんでした」と出すと、**壊れているように見える**。
 *   ★ 起きていないことを、失敗として書かない。§202・§210 と同じ（0件と分からないを混ぜない）。
 */
export function manualPostMessage(result: ManualPostResult, ekichika: EkichikaOutcome): string {
  const tail = result.bumpFukues
    ? 'フクエスの新着にも出ました。'
    : 'フクエスの新着は、あと' + result.waitMinutes + '分で上がります。';
  if (ekichika === 'none') return tail;
  const head = ekichika === 'ok'
    ? '駅ちかへ送りました。'
    : '駅ちかへは送れませんでした（連携の記録をご確認ください）。';
  return head + '\n' + tail;
}

// ─────────────────────────────────────────────────────────
// 守り1 —— 新着情報ブロックは1店舗1件
// ─────────────────────────────────────────────────────────

/**
 * 1店舗1件に間引く。★ 入ってくる並びは【新しい順】であること（この関数は並べ替えない）。
 *
 * ★★★ なぜ間引くのか（§191）
 *   TOPが1店で埋まるのは、次の2つが同時に成り立つときだけ:
 *     ・同じ店舗が何枠でも取れる
 *     ・並びが「更新時刻」だけ  → 押すほど上に来る＝更新競争
 *   ★ 犯人は自動更新ではない。手作業でも同じことは起きる。
 *   → 1店舗1件にすれば **構造的に埋まらない**。回数の制限より先に、これを置く。
 *
 * ★ 並べ替えない。新しい順のまま、2件目以降を落とすだけ（追記40 §206 と同じ作法）。
 */
export function pickOnePerSalon<T extends { salonId: number }>(items: T[], limit: number): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const it of items) {
    if (out.length >= limit) break;
    if (seen.has(it.salonId)) continue;
    seen.add(it.salonId);
    out.push(it);
  }
  return out;
}

/**
 * 1店舗1件に間引く前に、何件読んでおくか。
 * ★ 5枠ぶん取るのに5件しか読まないと、1店が5件続いていたとき1件しか出せない。
 * ★ 何倍読んでも「全店が1件ずつ」は保証できない（読んだ範囲が全部同じ店なら埋まらない）。
 *   → 足りなければ **枠を空けたまま出す**。数を合わせるために古い記事を混ぜない
 *     （§210 と同じ：読んだ範囲を、総数のように見せない）。
 */
export const ONE_PER_SALON_FETCH_MULTIPLIER = 8;
