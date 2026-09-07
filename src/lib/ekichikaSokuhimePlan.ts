// フクエスの「今すぐ」→ 駅ちかの「即ヒメ」を、誰に・どの枠へ押すか（第214便・2026-09-08・純粋関数）。
//
// ★★★ 設計は `設計メモ_今すぐを駅ちかの即ヒメへ_2026-09-07.md` §2-1。★ このファイルは通信もDBも時計も持たない。
//
// ★★★ 決めごと
//   ・書く元は【オーナー枠＋キャスト枠】だけ。★ 取り込み枠（駅ちかから読んだ即ヒメ）は絶対に書き戻さない
//     （自分が読んだものを書き戻す輪＝エコーバック・第3弾メモ §9）。★ 第40便で3枠に分けたのはこのため。
//   ・1回の周で ON にするのは【1人だけ】（エステ魂の即セラ・第143便と同じ。相手のアカウントを触る操作）。
//   ・空いている枠が無ければ送らない。★ 誰かを勝手に外して入れ替えない（§14-2・相手の挙動に賭けない）。
//   ・出勤中でない人は送らない（駅ちかの一覧は「出勤中女の子一覧」。押しても相手が is_working=false で断る）。
//   ・駅ちかの即ヒメは押してから45分で消える。★ フクエスの「今すぐ」がまだ生きていて、駅ちか側が切れていれば押し直す（§12-2）。
//   ・フクエスで「今すぐ」が終わった人が駅ちかの枠に残っていれば消す（★ 消せると実物で確かめた・§1-3）。
//     ★★ ただし消すのは【フクエスが押した枠】だけ。★ 店舗様が駅ちかで直接押した子（フクエスの記録に無い）は触らない。
//   ・名簿の結び（castId）が無い人は送れない → blocked 'unlinked'（セラピスト一覧の「結びつける」へ）。

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
};

export type SokuhimeBlockReason =
  | 'not_imasugu' | 'unlinked' | 'not_working' | 'already_on' | 'no_free_slot' | 'no_remaining_count';

export type SokuhimePlan = {
  /** ★ 押すのは1人だけ。無ければ null */
  set: { therapistId: number; name: string; castId: string; slotIndex: number; oldGirlId: string | null; oldSokuikuId: string | null } | null;
  /** ★ 消す（フクエスの今すぐが終わった・フクエスが押した枠だけ）。★ 複数あってよい（消すのは相手のアカウントの「露出を減らす」側なので慎重さは set ほど要らないが、それでも1周1件にする） */
  del: { castId: string; slotIndex: number; sokuikuId: string | null; expiresAtUnix: number | null } | null;
  /** 送らなかった人と理由（店舗様に見せる） */
  blocked: Array<{ therapistId: number; name: string; reason: SokuhimeBlockReason; message: string }>;
  /** 待っている人（枠が無くて後回し・押す1人以外）。★ 次の周で拾う */
  waiting: Array<{ therapistId: number; name: string }>;
};

const MSG: Record<SokuhimeBlockReason, (name: string) => string> = {
  not_imasugu: (n) => `${n}さんはフクエスの「今すぐ」が入っていません`,
  unlinked: (n) => `${n}さんは駅ちかの登録と結びついていないため送れません（セラピスト一覧で結びつけてください）`,
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
 *   → 最初の1人だけ set。残りは waiting。
 * ★ del: 駅ちかの枠に居て、フクエスが押した子で、フクエスの今すぐが終わっている → 1件だけ。
 */
export function planSokuhime(input: SokuhimePlanInput): SokuhimePlan {
  const { people, boxes, workingCastIds, pushedByFukues, remainingCount, nowUnix } = input;
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

  let set: SokuhimePlan['set'] = null;
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
    if (set === null) {
      set = { therapistId: p.therapistId, name: p.name, castId: p.castId, slotIndex: slot.index, oldGirlId: slot.girlId, oldSokuikuId: slot.sokuikuId };
      usedFree += 1;
    } else {
      waiting.push({ therapistId: p.therapistId, name: p.name });
      usedFree += 1;   // ★ 待っている人にも枠を数えておく（次の周で溢れないよう、no_free_slot を正しく出す）
    }
  }

  // ★ 消す: 枠に居て・フクエスが押した子で・フクエスの今すぐが終わっている
  let del: SokuhimePlan['del'] = null;
  const pushed = new Set(pushedByFukues);
  for (const b of boxes) {
    if (!b.girlId || !pushed.has(b.girlId)) continue;
    if (b.expiresAtUnix !== null && b.expiresAtUnix <= nowUnix) continue;   // ★ もう切れている枠は消さなくてよい
    const p = people.find((x) => x.castId === b.girlId);
    const stillLive = p ? p.imasuguByFukues : false;
    if (stillLive) continue;
    del = { castId: b.girlId, slotIndex: b.index, sokuikuId: b.sokuikuId, expiresAtUnix: b.expiresAtUnix };
    break;
  }

  return { set, del, blocked, waiting };
}

/** ★ 店舗様に出す1行。 */
export function sokuhimePlanSummary(plan: SokuhimePlan): string {
  const parts: string[] = [];
  parts.push(plan.set ? `${plan.set.name}さんを枠${plan.set.slotIndex + 1}へ` : '送る人はいません');
  if (plan.waiting.length > 0) parts.push(`次の周で ${plan.waiting.length}名`);
  if (plan.del) parts.push(`枠${plan.del.slotIndex + 1}を消す`);
  if (plan.blocked.length > 0) parts.push(`送れない ${plan.blocked.length}名`);
  return parts.join(' ／ ');
}
