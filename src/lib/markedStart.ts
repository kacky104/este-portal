// 5分ごとの周（api/admin/ekichika-bump）で、どの自動も同じ手順で始めるための1か所（第1958便・総点検の整理）。
//   「印を書く → 流れを始める → 始められなかったら印を戻す」
// ★ 前は 12 か所に同じ形を書いていて、「戻す」が抜けた所があった（第1816便・第1954便）。
// ★ ここは DB にも中継にも触らない（渡された関数を呼ぶだけ）＝ check:markedstart で試せる。

export type RoundResult = { salonId: number; provider: string; slot: number; reason: string; started?: boolean; note?: string };

/** 流れを始めた結果のうち、ここで見る所だけ（startRelayFlow の返す形に合う） */
export type StartOutcome = { ok: boolean; note: string; reason?: string };

/**
 *   mark   … 始める前に書く印（同じ回を二重に始めない）。書けなければ始めない（mark_failed）
 *   undo   … 印を元の値に戻す
 *   undoOn … 'any'＝始められなかったら必ず戻す／'busy'＝別の流れとぶつかったときだけ戻す
 *            （例外で始められなかったときは、どちらでも戻す）
 *   afterStart … 始めに行ったあとに1回（「この周でこの店はもう始めた」の印など）。例外のときは呼ばない
 */
export async function runMarked<F extends StartOutcome>(a: {
  tag: string;
  base: { salonId: number; provider: string; slot: number };
  mark: () => Promise<{ error: { message: string } | null }>;
  undo: () => Promise<void>;
  undoOn: 'any' | 'busy';
  start: () => Promise<F>;
  afterStart?: (f: F) => void;
  note?: (f: F) => string;
  failNote?: string;
}): Promise<RoundResult> {
  const m = await a.mark();
  if (m.error) return { ...a.base, reason: 'mark_failed', note: m.error.message };
  try {
    const f = await a.start();
    a.afterStart?.(f);
    if (!f.ok && (a.undoOn === 'any' || f.reason === 'busy')) await a.undo();
    return { ...a.base, reason: 'ok', started: f.ok, note: a.note ? a.note(f) : f.note };
  } catch (e) {
    console.error(`[${a.tag}] 流れを始められなかった`, a.base.salonId, a.base.slot, e instanceof Error ? e.message : 'unknown');
    await a.undo();
    return { ...a.base, reason: 'start_failed', ...(a.failNote ? { note: a.failNote } : {}) };
  }
}
