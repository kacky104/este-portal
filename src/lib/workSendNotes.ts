// 「出勤をサイトへ」のお知らせ（計画の notes）の出し分け（第1267便・2026-10-07・カッキーさん）。★ 純粋関数のみ。
//
// ★★★ なぜ要るか
//   ラビリンス様から「自動更新したら4行ぐらい出たが、意味が分からない」。
//   4行とも【止めた理由ではない】お知らせなのに、同じ並び・同じ見た目で出ていて、エラーに読めた。
//   → 「その方の出勤が送れていないもの」（店舗様が気づくべき・直せるもの）と、
//     「更新の内容についてのお知らせ」（読まなくても困らないもの）を分ける。前者は見える所に、後者は畳む。
// ★ 種類（kind）は src/lib/workPlan.ts の PlanIssue。★ 知らない種類は「お知らせ」の側（★ 勝手に警告にしない）。
//   ★ エステ魂の計画は、お知らせを全部 'time_snapped' で保存している（relayFlow の saveEsutamaPlan）＝全部「お知らせ」の側に出る。

export type WorkNote = { kind: string; detail: string; count?: number; names?: string[] };

/** その方の出勤が送れていない、という種類 */
const UNSENT_KINDS: readonly string[] = ['unmapped_therapist', 'time_not_selectable'];

/**
 * ★ 第1267便より前に保存された計画では、「送らない」にしている方のお知らせも 'unmapped_therapist' だった。
 *   計画は更新のたびに作り直されるので、古い行はすぐ無くなる。そのあいだだけ、文で見分けて「お知らせ」の側に出す。
 */
function isLegacyTargetOff(n: WorkNote): boolean {
  return n.kind === 'unmapped_therapist' && n.detail.includes('「送らない」にしている');
}

export function splitWorkNotes(notes: ReadonlyArray<WorkNote> | null | undefined): { unsent: WorkNote[]; info: WorkNote[] } {
  const unsent: WorkNote[] = [];
  const info: WorkNote[] = [];
  for (const n of notes ?? []) {
    if (!n || typeof n.detail !== 'string') continue;
    if (UNSENT_KINDS.includes(n.kind) && !isLegacyTargetOff(n)) unsent.push(n);
    else info.push(n);
  }
  return { unsent, info };
}

/** 名前を並べる上限（★ 人数の多い店で1行が伸びすぎないように） */
export const WORK_NOTE_NAMES_MAX = 8;

/** 「対象：A・B（ほか2名）」。名前が1つも無ければ null（★ 空の「対象：」を出さない） */
export function workNoteNames(n: WorkNote | null | undefined): string | null {
  const names = (Array.isArray(n?.names) ? n!.names! : [])
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((x) => x.length > 0);
  if (names.length === 0) return null;
  const shown = names.slice(0, WORK_NOTE_NAMES_MAX);
  const rest = names.length - shown.length;
  return '対象：' + shown.join('・') + (rest > 0 ? '（ほか' + rest + '名）' : '');
}
