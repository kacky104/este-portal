// セラピストの削除で、「各サイトから消えたことを確かめてから、コネックエフ側を消す」の決めごと（第1279便・2026-10-07）。
// ★ 純粋関数だけ。DB を触るのは app/lib/conecf/girlDeleteFinish.ts。
//
// ★★★ 何が起きていたか（コネックエフ全体の調査で見つかった）:
//   「サイトからも一緒に消す」は、駅ちか（削除）・エステ魂（非表示）への依頼を【積めた時点】で、
//   すぐにフクエス側の本人・出勤・写メ日記・写真を消していた。相手サイトでの実際の削除は、その数分後。
//   そこで失敗しても（ログインできない・相手サイトの不調・通信の打ち切り）、本人がもう居ないので削除の画面に戻れない。
//   → 退店した方が駅ちかに載ったまま残る。気づけるのは「更新結果」の1行だけ。
//
// ★ これから（カッキーさんの OK・10/7）: 順番を逆にする。
//   ① 押したら、その方をすぐ【非公開】にする（フクエスから消える・出勤も外れる）
//   ② 各サイトへ削除（非表示）を依頼する
//   ③ 各サイトで【消えたことを確かめてから】、フクエス側を消す
//   ・どこかのサイトで確かめられなかったら、フクエス側は消さない（非公開のまま残る＝もう一度「削除」を押せる）。

/** 消えるのを待つサイト（依頼を積めたサイトだけ。自動で消せないサイトは待たない） */
export type DeleteWaitSite = { provider: string; slot: number; castId: string };

/** 流れの文脈に入れて持ち回す */
export type DeleteAfter = {
  therapistId: number;
  /** 依頼した時刻（ISO）。これより前の記録は見ない（前に失敗した回の記録を、今回の結果と取り違えない） */
  requestedAt: string;
  waitFor: DeleteWaitSite[];
};

export type DeleteAuditRow = {
  provider: string;
  slot: number;
  event: string;
  outcome: string;
  detail?: unknown;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/**
 * この記録は、「そのサイトから、その方が居なくなった（または非表示になった）ことを確かめた」記録か。
 *   駅ちか（delete_girl）: 削除して、一覧を読み直したら居なかった（ok）／行ったらもう居なかった（stopped・not_listed）
 *   エステ魂（hide_cast）: 非表示にして、読み直したら非表示だった（ok）／もともと非表示（already_hidden）／
 *                          一覧に居ない（not_listed）／非表示にしたら一覧から消えていた（failed・gone）
 * ★ それ以外（ログインできない・削除リンクが読めない・まだ表示中 など）は「確かめられていない」。
 */
export function isSiteGoneAudit(row: DeleteAuditRow, site: DeleteWaitSite): boolean {
  if (row.provider !== site.provider || Number(row.slot) !== Number(site.slot)) return false;
  const d = obj(row.detail);
  if (String(d['castId'] ?? '') !== site.castId) return false;
  const reason = String(d['reason'] ?? '');
  if (row.event === 'delete_girl') {
    if (row.outcome === 'ok') return true;
    return row.outcome === 'stopped' && reason === 'not_listed';
  }
  if (row.event === 'hide_cast') {
    if (row.outcome === 'ok') return true;
    if (row.outcome === 'stopped') return reason === 'already_hidden' || reason === 'not_listed';
    return row.outcome === 'failed' && reason === 'gone';
  }
  return false;
}

/**
 * 待っているサイトが、すべて「居なくなったことを確かめた」になったか。
 * @param rows 依頼した時刻より後の、delete_girl / hide_cast の記録
 * @param alsoDone 記録に頼らず「確かめた」と分かっているサイト（いま終わった流れ自身。provider#slot）
 */
export function girlDeleteProgress(input: {
  waitFor: ReadonlyArray<DeleteWaitSite>;
  rows: ReadonlyArray<DeleteAuditRow>;
  alsoDone?: ReadonlyArray<string>;
}): { ready: boolean; pending: DeleteWaitSite[] } {
  const also = new Set(input.alsoDone ?? []);
  const pending = input.waitFor.filter((s) => {
    if (also.has(s.provider + '#' + s.slot)) return false;
    return !input.rows.some((r) => isSiteGoneAudit(r, s));
  });
  // ★ 待つサイトが1つも無い文脈は「準備できた」としない（＝何かの取り違え。消さない側に倒す）
  return { ready: input.waitFor.length > 0 && pending.length === 0, pending };
}

/** 文脈に入っていた値が、使える形か。★ 形が崩れていたら null（消さない側に倒す） */
export function parseDeleteAfter(v: unknown): DeleteAfter | null {
  const o = obj(v);
  const therapistId = Number(o['therapistId']);
  const requestedAt = String(o['requestedAt'] ?? '');
  const list = Array.isArray(o['waitFor']) ? (o['waitFor'] as unknown[]) : [];
  if (!Number.isFinite(therapistId) || therapistId <= 0) return null;
  if (!Number.isFinite(Date.parse(requestedAt))) return null;
  const waitFor: DeleteWaitSite[] = [];
  for (const x of list) {
    const s = obj(x);
    const provider = String(s['provider'] ?? '');
    const slot = Number(s['slot']);
    const castId = String(s['castId'] ?? '');
    if (!provider || !Number.isFinite(slot) || !/^\d{1,12}$/.test(castId)) return null;
    waitFor.push({ provider, slot, castId });
  }
  if (waitFor.length === 0) return null;
  return { therapistId, requestedAt, waitFor };
}
