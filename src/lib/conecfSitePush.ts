// コネックエフ「保存して更新」: どの枠へ送るか・結果を1つのお知らせにまとめる（第1289便・2026-10-07）。★ 純粋関数。
//
// ★★★ 直したこと
//   ① 編集画面の「保存して更新」・一覧の「まとめて更新」は【枠1固定】だった。
//      2枠ある店（駅ちか・エステ魂は2枠まで登録できる）で、枠2の内容を保存して押しても、枠2へは送られなかった。
//      → ログイン情報が有効で「反映しない」でない枠すべてへ送る（★ 枠ごとに連携・送り先サイトの設定を見る）。
//   ② 「保存してフクエス・駅ちか・エステ魂へ更新」は、駅ちか → エステ魂の順にお知らせを出していた。
//      駅ちかの結果（失敗の理由も）が、直後のエステ魂のお知らせで上書きされて見えなかった。
//      駅ちかだけの店では、毎回最後に「エステ魂と連携していません」が残り、失敗に見えた。
//      → 結果を1つにまとめる。その店が送っていないサイトのことは言わない。
//
// ★ 2026-10-07 の時点で枠2を登録している店は無い（＝①で今日の動きは変わらない）。

import { waitToastNote } from './relayWait';

/** ★ いま更新を送る枠（小さい順）。★ startRelayFlow と同じ条件: ログイン情報が有効・向きが「反映しない」でない（向きの行が無い枠は通す） */
export function conecfPushSlots(
  creds: ReadonlyArray<{ slot?: number | null; is_enabled?: boolean | null }>,
  sources: ReadonlyArray<{ slot?: number | null; link_mode?: string | null }>,
): number[] {
  const modeOf = new Map<number, string>();
  for (const s of sources) modeOf.set(Number(s.slot ?? 1), String(s.link_mode ?? ''));
  const out: number[] = [];
  for (const c of creds) {
    const slot = Number(c.slot ?? 1);
    if (!Number.isInteger(slot) || slot < 1) continue;
    if (c.is_enabled !== true) continue;
    if (modeOf.get(slot) === 'none') continue;
    if (!out.includes(slot)) out.push(slot);
  }
  return out.sort((a, b) => a - b);
}

/** ★ 枠の呼び名。枠1はサイト名だけ（★ 1枠の店に「枠1」と言わない）。画面のほかの場所（送り先サイト）と同じ形 */
export function pushSlotLabel(siteName: string, slot: number): string {
  return siteName + (slot > 1 ? `（枠${slot}）` : '');
}

/** ★ その店が、そのサイトへ更新を送っていないときの文 */
export function sitePushNotReadyMessage(siteName: string): string {
  return `${siteName}へは、いま更新を送る設定になっていません（コネックエフのホームでご確認ください）`;
}

/**
 * 1枠ぶんの結果。off＝「送り先サイト」で送らない設定（わざと）
 *   ★ 第1296便: waiting … 受け付けたが、前の更新が動いているので順番待ち（state は 'queued' のまま＝受け付けている）
 */
export type SlotPush = { slot: number; state: 'queued' | 'off' | 'failed'; note?: string; waiting?: boolean };

export type SitePushSummary =
  // ★ 第1296便: waiting … 受け付けた枠のうち、順番待ちの枠の呼び名（★ 1つも無ければ項目ごと無い）
  | { ok: true; queued: string[]; notes: string[]; waiting?: string[] }
  | { ok: false; error: string; off: boolean };

/**
 * ★ 1サイトぶん（枠ごとの結果）をまとめる。
 *   ・1枠でも受け付けたら ok。受け付けなかった枠は notes（★ わざと送らない枠は言わない）
 *   ・1枠も受け付けていない: 失敗があればその理由／全部「わざと送らない」か、送る枠が無ければ off: true
 */
export function summarizeSlotPushes(siteName: string, slots: readonly SlotPush[]): SitePushSummary {
  if (slots.length === 0) return { ok: false, error: sitePushNotReadyMessage(siteName), off: true };
  const many = slots.length > 1;
  const queued = slots.filter((s) => s.state === 'queued').map((s) => pushSlotLabel(siteName, s.slot));
  const failed = slots.filter((s) => s.state === 'failed')
    .map((s) => (many ? pushSlotLabel(siteName, s.slot) + '：' : '') + (s.note || '送れませんでした'));
  const waiting = slots.filter((s) => s.state === 'queued' && s.waiting === true).map((s) => pushSlotLabel(siteName, s.slot));
  if (queued.length > 0) return { ok: true, queued, notes: failed, ...(waiting.length > 0 ? { waiting } : {}) };
  if (failed.length > 0) return { ok: false, error: failed.join('　／　'), off: false };
  return { ok: false, error: slots[0].note || sitePushNotReadyMessage(siteName), off: true };
}

/**
 * 画面が受け取る、1サイトぶんの結果。
 *   sent    … 受け付けた（labels＝受け付けた枠の呼び名。notes＝受け付けなかった枠）
 *   confirm … 写真が消える確認を出して止まっている（まだ送っていない）
 *   off     … その店はそのサイトへ送っていない／この方は送らない設定
 *   failed  … 送れなかった（note に理由）
 */
export type SitePushOutcome = {
  site: string;
  state: 'sent' | 'confirm' | 'off' | 'failed';
  labels?: string[];
  notes?: string[];
  note?: string;
  /** ★ 第1296便: 受け付けた枠のうち、順番待ちの枠の呼び名 */
  waiting?: string[];
};

/**
 * ★★★ 結果を1つのお知らせにする。★ 出すものが無ければ null（＝直前の「保存しました」を残す）。
 *   explicit … そのサイトだけを名指しで押したとき（「保存して駅ちかへ更新」）。off も理由を言う。
 */
export function sitePushToast(results: readonly SitePushOutcome[], opts: { explicit?: boolean } = {}): string | null {
  const rs = results
    .map((r) => (opts.explicit && r.state === 'off' ? { ...r, state: 'failed' as const } : r))
    .filter((r) => r.state !== 'off');
  if (rs.length === 0) return null;
  const parts: string[] = [];
  const sent = rs.filter((r) => r.state === 'sent');
  if (sent.length > 0) {
    const labels = sent.flatMap((r) => (r.labels && r.labels.length > 0 ? r.labels : [r.site]));
    parts.push(`${labels.join('・')}への更新を受け付けました。結果は「更新結果」に出ます`);
    const notes = sent.flatMap((r) => r.notes ?? []);
    if (notes.length > 0) parts.push(`送っていない枠があります（${notes.join('　／　')}）`);
    // ★ 第1296便: 順番待ちで受け付けたサイトがあれば、そう言う（「受け付けました」だけだと、始まるのが遅い理由が分からない）
    const waitNote = waitToastNote(sent.flatMap((r) => r.waiting ?? []));
    if (waitNote) parts.push(waitNote);
  }
  for (const r of rs.filter((x) => x.state === 'confirm')) parts.push(`${r.site}は、写真の確認のあとに更新します`);
  for (const r of rs.filter((x) => x.state === 'failed')) parts.push(`${r.site}へは更新を送っていません：${r.note || '送れませんでした'}`);
  return parts.join('　／　');
}
