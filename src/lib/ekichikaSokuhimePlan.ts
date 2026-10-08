// フクエスの「今すぐ」→ 駅ちかの「即ヒメ」を、誰に・どの枠へ押すか（第214便・2026-09-08・純粋関数）。
//
// ★★★ 設計は `設計メモ_今すぐを駅ちかの即ヒメへ_2026-09-07.md` §2-1。★ このファイルは通信もDBも時計も持たない。
//
// ★★★ 決めごと
//   ・書く元は【オーナー枠＋キャスト枠】だけ。★ 取り込み枠（駅ちかから読んだ即ヒメ）は絶対に書き戻さない
//     （自分が読んだものを書き戻す輪＝エコーバック・第3弾メモ §9）。★ 第40便で3枠に分けたのはこのため。
//   ・★★★ 第327便（2026-09-13）: 1周で ON にするのは【最大6人】（それまでは1人だけ）。
//     ★ 理由: 駅ちかの即ヒメ枠は店舗によって15枠まで増やせる。1周1人・5分ごとでは
//       45分の「今すぐ」の間に9人しか通せず、枠が埋まらないまま終わっていた。
//     ★ 代わりに【周を10分に延ばす】（駅ちかへのログイン回数を12回/時 → 6回/時に減らす）。
//     ★ 6人ぶん「確認→設定」を続けて送り、【最後に1回だけ】画面を読み直して6人まとめて照合する。
//   ・空いている枠が無ければ送らない。★ 誰かを勝手に外して入れ替えない（§14-2・相手の挙動に賭けない）。
//   ・出勤中でない人は送らない（駅ちかの一覧は「出勤中女の子一覧」。押しても相手が is_working=false で断る）。
//   ・駅ちかの即ヒメは押してから45分で消える。★ フクエスの「今すぐ」がまだ生きていて、駅ちか側が切れていれば押し直す（§12-2）。
//   ・フクエスで「今すぐ」が終わった人が駅ちかの枠に残っていれば消す（★ 消せると実物で確かめた・§1-3）。
//     ★★ ただし消すのは【フクエスが押した枠】だけ。★ 店舗様が駅ちかで直接押した子（フクエスの記録に無い）は触らない。
//     ★★★ 第1282便: 「フクエスが押した枠」＝押してから45分以内の記録（sokuhimeOwnedSinceISO）。
//       呼び出し側が pushedByFukues をその範囲で渡す（それより古い記録の方は、いま枠に居ても人が入れたもの）。
//   ・名簿の結び（castId）が無い人は送れない → blocked 'unlinked'（セラピスト一覧の「結びつける」へ）。

/**
 * ★★★ 1周で触れる人数の上限（第327便）。★ ON も OFF も同じ数。
 *   ★ ここを増やすと1回のログインが長くなる（1人につき POST 2回）。★ 増やすなら周も延ばすこと。
 */
export const SOKUHIME_MAX_PER_ROUND = 6;

/**
 * ★★★ 第1282便（2026-10-07）: 駅ちかの即ヒメが続く時間（分）。★ 押してから45分で消える。
 *   ★ 記録でも確かめた（ラビリンス様 10/6〜10/7）: 同じ方の押し直しが 49〜51分おき（周は10分ごと）。
 */
export const SOKUHIME_LIFETIME_MIN = 45;

/**
 * ★★★ 第1282便: 「フクエスが押した枠」と数えてよい記録の、いちばん古い時刻（ISO）。
 *   ＝ 押してから SOKUHIME_LIFETIME_MIN 分以内の記録だけが、いま駅ちかの枠に生きている「フクエスの即ヒメ」。
 *
 * ★ それまでは「過去24時間に押した記録（removed_at が空）」を全部数えていた。
 *   記録を閉じる（removed_at を入れる）のは【フクエスが自分で外して確かめたとき】だけなので、
 *   45分たって自然に切れた記録は、24時間「まだ生きている」扱いのまま残る。そのせいで:
 *   ① 店舗様（やベンリー）が駅ちかで直接入れた即ヒメを、フクエスが外す。
 *      ★ 実際に起きた（ラビリンス様・10/6）: 15:59 に2名を押す（～16:44 迄）→ 16:49・16:59 も枠は 2/5 のまま
 *        （＝だれかが入れ直した。計画は「駅ちかで即ヒメ中です」と譲っていた）→ 17:09 にフクエスの今すぐが終わり、
 *        その2枠を「フクエスが押した枠」とみなして外した。
 *   ② 外す仕事が無いのに、開いた記録が残っている間（最長24時間）10分ごとに駅ちかへログインする。
 * ★ 切れる時刻そのもの（expires_at）は使えない: 記録の expires_at・sokuiku_id は実物では全部 NULL
 *   （駅ちかの画面から読めていない・10/7 に確認）。だから押した時刻から数える。
 * ★ 倒れる向き: 短く見積もると「自分で押した枠を外しそびれる」だけ（数分で自然に切れる）。
 *   長く見積もると「人が入れた枠を外す」。★ だから余裕を足さない。
 */
export function sokuhimeOwnedSinceISO(nowMs: number): string {
  return new Date(nowMs - SOKUHIME_LIFETIME_MIN * 60 * 1000).toISOString();
}

export type SokuhimePerson = {
  therapistId: number;
  name: string;
  /** 駅ちかの castId（名簿の結び）。★ 無ければ null */
  castId: string | null;
  /** ★ オーナー枠かキャスト枠で「今すぐ」が生きているか（★ 取り込み枠は数えない） */
  imasuguByFukues: boolean;
  /** ★ フクエス側の「今すぐ」の終了時刻（unix 秒）。★ 生きていなければ null */
  imasuguUntilUnix: number | null;
};

export type SokuhimeBoxState = {
  index: number;
  girlId: string | null;
  sokuikuId: string | null;
  expiresAtUnix: number | null;
};

export type SokuhimePlanInput = {
  people: ReadonlyArray<SokuhimePerson>;
  /** 駅ちかの枠（読んだばかりの写し） */
  boxes: ReadonlyArray<SokuhimeBoxState>;
  /** 駅ちかの「出勤中女の子一覧」の castId */
  workingCastIds: ReadonlyArray<string>;
  /** ★★ フクエスが押した枠の castId（こちらの記録）。★ 消してよいのはここに居る子だけ */
  pushedByFukues: ReadonlyArray<string>;
  /** 回数制のプランで残り0回なら送らない。★ 回数制でなければ null */
  remainingCount: number | null;
  nowUnix: number;
  /** ★ 1周で ON にする上限。★ 既定 1（運営／店舗の「1人だけ試す」がこれ） */
  maxSet?: number;
  /** ★ 1周で OFF にする上限。★ 既定 1 */
  maxDel?: number;
};

export type SokuhimeBlockReason =
  | 'not_imasugu' | 'unlinked' | 'not_working' | 'already_on' | 'no_free_slot' | 'no_remaining_count';

export type SokuhimeSet = { therapistId: number; name: string; castId: string; slotIndex: number; oldGirlId: string | null; oldSokuikuId: string | null };
export type SokuhimeDel = { castId: string; slotIndex: number; sokuikuId: string | null; expiresAtUnix: number | null };

export type SokuhimePlan = {
  /** ★ 押す人（先頭から順に送る）。★ 最大 maxSet 人。★ 無ければ空 */
  sets: SokuhimeSet[];
  /** ★ 消す枠（フクエスの今すぐが終わった・フクエスが押した枠だけ）。★ 最大 maxDel 件 */
  dels: SokuhimeDel[];
  /** 送らなかった人と理由（店舗様に見せる） */
  blocked: Array<{ therapistId: number; name: string; reason: SokuhimeBlockReason; message: string }>;
  /** 待っている人（枠はあるが今周の上限を超えた）。★ 次の周で拾う */
  waiting: Array<{ therapistId: number; name: string }>;
};

const MSG: Record<SokuhimeBlockReason, (name: string) => string> = {
  not_imasugu: (n) => `${n}さんはフクエスの「今すぐ」が入っていません`,
  // ★ 第338便: 画面の名前を実物に合わせた（セラピスト一覧 → セラピスト設定・第298便で改名）。★ 言葉も「連携」に揃えた
  unlinked: (n) => `${n}さんは駅ちかと連携していないため即ヒメにできません（「セラピスト設定」で連携してください）`,
  not_working: (n) => `${n}さんは駅ちかで出勤中になっていないため、即ヒメにできません`,
  already_on: (n) => `${n}さんは駅ちかで即ヒメ中です`,
  no_free_slot: (n) => `${n}さんは、駅ちかの即ヒメ枠が空いていないため送れません`,
  no_remaining_count: (n) => `${n}さんは、今日の即ヒメの残り回数が0のため送れません`,
};

/**
 * ★★★ 計画を立てる。★ 順番に意味がある（決めごとの並び）。
 *   ① フクエスの今すぐ（オーナー枠＋キャスト枠）が生きている人だけ
 *   ② 結び（castId）
 *   ③ 駅ちかで出勤中
 *   ④ 駅ちかの枠に【生きて】居る → already_on（★ 切れている枠に居る＝押し直しの対象。空きと同じに扱う）
 *   ⑤ 回数制で残り0 → 送らない
 *   ⑥ 空き枠（切れた枠も空きとみなす。★ 切れた枠に押すときは oldGirlId / oldSokuikuId を渡す＝入れ替え）
 *   → 先頭から maxSet 人までを sets。枠はあるが上限を超えた人は waiting（次の周）。
 * ★ dels: 駅ちかの枠に居て、フクエスが押した子で、フクエスの今すぐが終わっている → maxDel 件まで。
 */
export function planSokuhime(input: SokuhimePlanInput): SokuhimePlan {
  const { people, boxes, workingCastIds, pushedByFukues, remainingCount, nowUnix } = input;
  const maxSetRaw = Math.max(0, Math.floor(input.maxSet ?? 1));
  const maxDel = Math.max(0, Math.floor(input.maxDel ?? 1));
  // ★ 回数制なら残り回数を超えて押さない（★ 1周で複数押すので、ここで頭を打っておく）
  const maxSet = remainingCount === null ? maxSetRaw : Math.min(maxSetRaw, Math.max(0, remainingCount));
  const blocked: SokuhimePlan['blocked'] = [];
  const waiting: SokuhimePlan['waiting'] = [];
  const working = new Set(workingCastIds);
  const liveBoxByGirl = new Map<string, SokuhimeBoxState>();
  for (const b of boxes) {
    if (b.girlId && (b.expiresAtUnix === null || b.expiresAtUnix > nowUnix)) liveBoxByGirl.set(b.girlId, b);
  }
  // ★ 空き＝girlId が無い枠、または切れている枠（小さい番号から）
  const free = boxes
    .filter((b) => b.girlId === null || (b.expiresAtUnix !== null && b.expiresAtUnix <= nowUnix))
    .sort((a, b) => a.index - b.index);

  const sets: SokuhimeSet[] = [];
  let usedFree = 0;

  for (const p of people) {
    const push = (reason: SokuhimeBlockReason) => blocked.push({ therapistId: p.therapistId, name: p.name, reason, message: MSG[reason](p.name) });
    if (!p.imasuguByFukues) continue;   // ★ 用が無い人は blocked にも入れない（画面が長くなるだけ）
    if (!p.castId) { push('unlinked'); continue; }
    if (!working.has(p.castId)) { push('not_working'); continue; }
    if (liveBoxByGirl.has(p.castId)) { push('already_on'); continue; }
    if (remainingCount !== null && remainingCount <= 0) { push('no_remaining_count'); continue; }
    const slot = free[usedFree];
    if (!slot) { push('no_free_slot'); continue; }
    if (sets.length < maxSet) {
      sets.push({ therapistId: p.therapistId, name: p.name, castId: p.castId, slotIndex: slot.index, oldGirlId: slot.girlId, oldSokuikuId: slot.sokuikuId });
    } else {
      waiting.push({ therapistId: p.therapistId, name: p.name });
    }
    usedFree += 1;   // ★ 待っている人にも枠を数えておく（次の周で溢れないよう、no_free_slot を正しく出す）
  }

  // ★ 消す: 枠に居て・フクエスが押した子で・フクエスの今すぐが終わっている
  const dels: SokuhimeDel[] = [];
  const pushed = new Set(pushedByFukues);
  for (const b of boxes) {
    if (dels.length >= maxDel) break;
    if (!b.girlId || !pushed.has(b.girlId)) continue;
    if (b.expiresAtUnix !== null && b.expiresAtUnix <= nowUnix) continue;   // ★ もう切れている枠は消さなくてよい
    const p = people.find((x) => x.castId === b.girlId);
    const stillLive = p ? p.imasuguByFukues : false;
    if (stillLive) continue;
    dels.push({ castId: b.girlId, slotIndex: b.index, sokuikuId: b.sokuikuId, expiresAtUnix: b.expiresAtUnix });
  }

  return { sets, dels, blocked, waiting };
}

/** ★ 店舗様に出す1行。 */
export function sokuhimePlanSummary(plan: SokuhimePlan): string {
  const parts: string[] = [];
  if (plan.sets.length === 0) parts.push('送る人はいません');
  else if (plan.sets.length === 1) parts.push(`${plan.sets[0].name}さんを枠${plan.sets[0].slotIndex + 1}へ`);
  else parts.push(`${plan.sets.map((s) => s.name + 'さん').join('・')}の${plan.sets.length}名を枠へ`);
  if (plan.waiting.length > 0) parts.push(`次の周で ${plan.waiting.length}名`);
  if (plan.dels.length === 1) parts.push(`枠${plan.dels[0].slotIndex + 1}を消す`);
  else if (plan.dels.length > 1) parts.push(`${plan.dels.map((d) => '枠' + (d.slotIndex + 1)).join('・')}を消す`);
  if (plan.blocked.length > 0) parts.push(`送れない ${plan.blocked.length}名`);
  return parts.join(' ／ ');
}

/**
 * ★★★ 第1317便（2026-10-08・カッキーさんの決定）: 周が駅ちかへログインする【前】に、
 *   こちらの記録だけで「この周は用が無い」と言い切れるかを決める（純粋関数）。
 *
 * ★★ なぜ要るか（ラビリンス様の 10/6〜10/8 の記録で数えた）
 *   「今すぐ」の方が1人でも居れば、周は10分ごとにログインして即ヒメ設定画面を読んでいた。
 *   そのうち7〜9割は何も送らず、読んだだけ（10/6 59/67回・10/7 41/57回・10/8 26/37回）。
 *   10/8 は、読んだだけの26回すべてが「全員もう即ヒメ中」だった。
 *   → 押してから45分は駅ちか側で続くので、押した記録が新しいあいだは読みに行かない。
 *
 * ★★★ 「用が無い」と言うのは、次が【すべて】そろったときだけ。★ 1つでも欠けたら今までどおりログインする:
 *   ① 「今すぐ」の方が全員、フクエスが押してから (45 − 余裕) 分以内（こちらの記録 media_sokuhime_pushes）
 *   ② 外す枠が無い（フクエスが押して45分以内の方が、全員まだ「今すぐ」）
 *   ③ 連携していない方（castId なし）が居ない … 店舗様が直せる理由は、今までどおり記録に出す
 * ★ 駅ちかの画面の写し（media_sokuhime_snapshots）は使わない。枠の切れる時刻が実物では読めていない（第1282便）。
 *   店舗様（やベンリー）が入れた即ヒメは、いつまで続くか分からない → その方が「今すぐ」の周は今までどおり読む。
 * ★★ 分かっていて残す遅れ: 店舗様が駅ちかの画面で直接、フクエスの押した即ヒメを外した・入れ替えたとき、
 *   こちらは押してから (45 − 余裕) 分たつまで気づかない（今までは次の周＝最長10分）。カッキーさん了承（2026-10-08）。
 * ★ これは「絞り込み」であって「判定」ではない。誰を押す・外すかは planSokuhime のまま（2か所に置かない）。
 */

/**
 * 押した記録の時刻は「読み直して確かめた時刻」で、実際に押した時刻より少し遅い（最大6人を続けて送るため）。
 * ★ そのぶん駅ちか側は早く切れる。切れる間際の周は読みに行く（＝押し直しの間隔を今までと変えない）。
 */
export const SOKUHIME_IDLE_MARGIN_MIN = 3;

export type SokuhimeIdleReason =
  | 'all_on'       // 「今すぐ」の方は全員、フクエスが押した即ヒメがまだ続いている（外す枠も無い）
  | 'no_one'       // 送る方がいない（外す枠も無い）
  | 'needs_del'    // フクエスが押した方の「今すぐ」が終わっている → 外しに行く
  | 'unlinked'     // 連携していない方が「今すぐ」→ 理由を記録に出すため読みに行く
  | 'needs_push'   // 押した記録が無い・古い方が居る → 読みに行く
  | 'unknown';     // 記録の時刻を読めない → 読みに行く（「用が無い」と決めつけない）

export function sokuhimeIdleCheck(input: {
  people: ReadonlyArray<Pick<SokuhimePerson, 'castId' | 'imasuguByFukues'>>;
  /** フクエスが押した記録（removed_at が空のもの）。★ 古いものが混じっていてもよい（ここで45分に絞る） */
  pushes: ReadonlyArray<{ castId: string; pushedAtMs: number }>;
  nowMs: number;
}): { idle: boolean; reason: SokuhimeIdleReason } {
  const go = (reason: SokuhimeIdleReason) => ({ idle: false, reason });
  const { nowMs } = input;
  if (!Number.isFinite(nowMs)) return go('unknown');
  if (input.pushes.some((p) => !Number.isFinite(p.pushedAtMs))) return go('unknown');

  // ★ 「フクエスが押した枠」の範囲は中継の計画と同じ物差し（sokuhimeOwnedSinceISO）
  const ownedSinceMs = Date.parse(sokuhimeOwnedSinceISO(nowMs));
  const freshSinceMs = ownedSinceMs + SOKUHIME_IDLE_MARGIN_MIN * 60 * 1000;
  const owned = input.pushes.filter((p) => p.pushedAtMs >= ownedSinceMs);

  const live = input.people.filter((p) => p.imasuguByFukues);
  const liveCast = new Set(live.map((p) => p.castId).filter((c): c is string => typeof c === 'string' && c.length > 0));

  // ② 外す枠があるかもしれない（枠にまだ居るかは読まないと分からない → 読みに行く側へ）
  if (owned.some((p) => !liveCast.has(p.castId))) return go('needs_del');
  if (live.length === 0) return { idle: true, reason: 'no_one' };
  // ③ 連携していない方
  if (live.some((p) => !p.castId)) return go('unlinked');
  // ① 全員、押した記録がまだ新しい
  const fresh = new Set(owned.filter((p) => p.pushedAtMs >= freshSinceMs).map((p) => p.castId));
  if (live.some((p) => !fresh.has(String(p.castId)))) return go('needs_push');
  return { idle: true, reason: 'all_on' };
}
