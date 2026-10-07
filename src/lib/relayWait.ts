// 中継のジョブの【順番待ち】の決めごと（第1296便・2026-10-08）。★ 純粋関数だけ。DB を触るのは app/lib/media/relayQueue.ts。
//
// ★★★ 何を直すか（カッキーさん: 「待つのが手間なのはあります」）:
//   人が押した操作（削除・プロフィール更新・新規登録）が、同じ店・同じサイト・同じ枠で前の更新が動いている最中だと、
//   「少し待ってから、もう一度押してください」で断っていた（30日で、削除だけでも10回以上）。
//   → 断らずに「順番待ち」で受け付け、前の更新が終わったら自動で始める。
//
// ★ 決まり（カッキーさんの OK・10/8）:
//   ・対象は、人が押した【削除・プロフィール更新（1人／まとめて）・新規登録】だけ。
//     接続テスト・試し打ち・名簿の読み取りなど、画面で結果を待つ読み取りは今までどおり断る。
//     自動の周（出勤・即ヒメ・即セラ・写メ日記・新着情報）は今までどおり次の周へ（順番待ちにしない）。
//   ・待つのは 15分まで。過ぎたら【始めずに】取りやめて、記録に残す（中継が止まっていた間の操作を、何時間もあとで送らない）。
//   ・同じ店・サイト・枠で待てるのは 3件まで。4件目からは今までどおり断る。
//
// ★★ 気をつけること:
//   ・入口の検査（同意・切り替え・停止・「反映しない」）と、ログインの中身は【押した時点】のもの。繰り上がるときには見直さない。
//     だから待つ時間を短く区切ってある。上限を延ばすときは、ここを先に考えること。
//   ・順番待ちの行は、走っているジョブを1件に限る索引（media_relay_jobs_one_active）に【数えない】。
//     繰り上げ（waiting → queued）のときに、その索引が「まだ前の更新が動いている」を弾く＝取り合いにならない。

/** DB に入れる status の値。★ 追加SQL_第1296便 の check 制約と同じ綴りにすること（番人が見張る） */
export const WAIT_STATUS = 'waiting';

/** 待つ上限（分）。過ぎたら始めずに取りやめる */
export const WAIT_MAX_MINUTES = 15;

/** 同じ店・サイト・枠で待てる件数 */
export const WAIT_MAX_PER_SLOT = 3;

/**
 * 直前のジョブが閉じてから、この秒数は繰り上げない。
 *   ★ 流れの段と段のあいだ（結果を受け取って閉じる → 次の段を積む）は、枠が一瞬空く。
 *     中継（relay.sh）は結果を返し終えてから次を引き取るので、ふつうはこのすき間に引き取りは来ない。その上の念のため。
 *   ★ 長くしすぎない: relay.sh は、仕事をしたあとの空振りが2回（約5秒あけて）続くと抜ける。
 *     これより長いと、繰り上げが必ず次の分の周になる。
 */
export const WAIT_SETTLE_SECONDS = 5;

/** 1回の引き取りで見る順番待ちの行数（★ ふだんは0〜数件） */
export const WAIT_SCAN_LIMIT = 30;

/**
 * 順番待ちにしてよい流れ（intent）。★ ここに無い流れは、呼び出し側が頼んでも順番待ちにしない。
 *   girl_delete / cast_hide   … セラピストの削除（駅ちかは削除・エステ魂は非表示）
 *   girl_edit / cast_edit     … プロフィールの更新（1人／まとめて）
 *   girl_create / cast_create … セラピストの新規登録
 */
export const WAIT_INTENTS: readonly string[] = [
  'girl_delete', 'cast_hide',
  'girl_edit', 'cast_edit',
  'girl_create', 'cast_create',
];

export function canWaitIntent(intent: string): boolean {
  return WAIT_INTENTS.includes(intent);
}

/** 店舗様に見せる、操作の呼び名 */
export function waitIntentLabel(intent: string): string {
  if (intent === 'girl_delete' || intent === 'cast_hide') return 'セラピストの削除';
  if (intent === 'girl_edit' || intent === 'cast_edit') return 'プロフィールの更新';
  if (intent === 'girl_create' || intent === 'cast_create') return 'セラピストの登録';
  return '更新';
}

/**
 * 積むときの判断。
 *   'queue' … ふつうに積む（走っているジョブがあれば DB が弾く → そのとき呼び直す）
 *   'wait'  … 順番待ちで入れる
 *   'busy'  … 断る（今までどおり「少し待ってから…」）
 *
 * @param wantWait      呼び出し側が順番待ちを頼んだか
 * @param slotBusy      走っているジョブがあると分かっているか（積もうとして DB に弾かれた）
 * @param waitingCount  いま、その店・サイト・枠で待っている件数
 */
export function enqueueDecision(input: { wantWait: boolean; slotBusy: boolean; waitingCount: number }): 'queue' | 'wait' | 'busy' {
  const n = Number.isFinite(input.waitingCount) && input.waitingCount > 0 ? Math.floor(input.waitingCount) : 0;
  if (!input.wantWait) return input.slotBusy ? 'busy' : 'queue';
  if (n >= WAIT_MAX_PER_SLOT) return 'busy';
  // ★ 先に待っている操作があるなら、枠が空いていても後ろに並ぶ（押した順を守る）
  if (n > 0) return 'wait';
  return input.slotBusy ? 'wait' : 'queue';
}

export type WaitingRow = { id: string; salonId: number; provider: string; slot: number; createdAt: string };

export function waitKey(r: { salonId: number; provider: string; slot: number }): string {
  return r.salonId + '#' + r.provider + '#' + r.slot;
}

/** 待ちすぎたか。★ 時刻が読めない行は「待ちすぎた」（＝始めない側に倒す） */
export function isWaitExpired(createdAt: string, nowMs: number): boolean {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return true;
  return nowMs - t > WAIT_MAX_MINUTES * 60 * 1000;
}

/**
 * 順番待ちの行を、「取りやめるもの」と「繰り上げを試すもの」に分ける。
 *   ★ 取りやめを先に決める（中継が止まっていて、何時間も前の操作が残っていた → 動き出しても送らない）。
 *   ★ 繰り上げを試すのは、店・サイト・枠ごとに【いちばん古い1件】だけ（押した順）。
 */
export function planWaiting(rows: ReadonlyArray<WaitingRow>, nowMs: number): { expire: WaitingRow[]; promote: WaitingRow[] } {
  const sorted = [...rows].sort((a, b) => {
    const ta = Date.parse(a.createdAt), tb = Date.parse(b.createdAt);
    const va = Number.isFinite(ta) ? ta : 0, vb = Number.isFinite(tb) ? tb : 0;
    return va !== vb ? va - vb : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const expire: WaitingRow[] = [];
  const promote: WaitingRow[] = [];
  const seen = new Set<string>();
  for (const r of sorted) {
    if (isWaitExpired(r.createdAt, nowMs)) { expire.push(r); continue; }
    const k = waitKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    promote.push(r);
  }
  return { expire, promote };
}

/** 記録（salon_media_audit）の detail.reason に入れる値 */
export const WAIT_REASON_ACCEPTED = 'waiting';
export const WAIT_REASON_EXPIRED = 'wait_expired';

/**
 * この記録は、順番待ちの記録（受け付けた／取りやめた）か。
 *   ★ 記録の種類は足していない（flow_stalled のまま）。flow_stalled を自分の画面に出している場所
 *     （新着情報の「直近の記録」）は、これで順番待ちの行を外す＝関係のない操作の行を混ぜない。
 */
export function isWaitAuditReason(reason: unknown): boolean {
  return reason === WAIT_REASON_ACCEPTED || reason === WAIT_REASON_EXPIRED;
}

/** 記録の文: 順番待ちで受け付けた。★ 店舗様が読む文（「★」や内部の言葉を書かない） */
export function waitAcceptedSummary(target: string, intent: string): string {
  return `${target}で別の更新が動いているため、${waitIntentLabel(intent)}を順番待ちで受け付けました。前の更新が終わりしだい始めます`;
}

/** 記録の文: 待ちすぎたので取りやめた */
export function waitExpiredSummary(target: string, intent: string): string {
  const what = waitIntentLabel(intent);
  const tail = intent === 'girl_delete' || intent === 'cast_hide'
    ? 'その方は非公開のまま一覧に残っています。セラピスト一覧から、もう一度「削除」を押してください'
    : 'お手数ですが、もう一度お試しください';
  return `${target}の前の更新が${WAIT_MAX_MINUTES}分たっても終わらなかったため、順番待ちの${what}は始めずに取りやめました。${tail}`;
}

/** 画面の文: 順番待ちで受け付けたサイトがあるときに足す1文（★ 無ければ空） */
export function waitToastNote(labels: ReadonlyArray<string>): string {
  const ls = labels.filter((x) => x && x.length > 0);
  if (ls.length === 0) return '';
  return `${ls.join('・')}は別の更新が動いているため、終わりしだい順番に始めます（${WAIT_MAX_MINUTES}分たっても始まらないときは取りやめて「更新結果」に出します）`;
}
