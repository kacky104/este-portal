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
 * ★★★ 画面に出さない種類（第1268便・2026-10-07・カッキーさんの決定）。
 *   'missing_row_as_rest'＝「出勤を入れていない日（◯件）は、駅ちかでは『お休み』として出しています」。
 *   ★ 出勤を入れていない日が休みになるのは当たり前で、店舗様にとって意味が無い。しかも件数（66件）が何かの異常に読めて混乱する
 *     （ラビリンス様）。言い換えても（第1267便）同じだったので、出さない。
 *   ★ 消すのは【表示】だけ。計画（media_work_plans.notes）には今までどおり残る＝運営が調べるときは読める。
 *
 * ★★★ 第1269便（2026-10-07・カッキーさんの決定＝案A）: 'target_off'（送り先サイトで「送らない」にしている方）も出さない。
 *   ★ 店舗様が自分で決めた設定で、出勤を出したかどうかに関係なく、設定がそのままなら更新のたびに出続ける
 *     （出勤が1件も無い方でも出る）。出し続けると「何か対応が要るのか」と読まれる。
 *   ★ 設定は、プロフィール編集の「送り先サイト」と「セラピスト登録状況一覧」で確かめられる。
 *     よくあるご質問「特定のセラピストさんだけ、出勤が反映されません」にも書いてある（lib/conecfGuide.ts）。
 */
//   ★ 第1271便: 'not_listed_idle'（連携していない／相手の出勤表に出ていないが、送る出勤が1件も無い方）も出さない。
//     非公開にして相手サイトからも外した方が、更新のたびに「送れていない方」に出続けていた（ラビリンス様・2026-10-07）。
const HIDDEN_KINDS: readonly string[] = ['missing_row_as_rest', 'target_off', 'not_listed_idle'];

/**
 * ★ 第1267便より前に保存された計画では、「送らない」にしている方のお知らせも 'unmapped_therapist' だった。
 *   計画は更新のたびに作り直されるので、古い行はすぐ無くなる。そのあいだだけ、文で見分ける
 *   （★ 「送れていない方」の黄色い枠に出さないため。第1269便からは、新しい種類 'target_off' と同じく出さない）。
 */
function isLegacyTargetOff(n: WorkNote): boolean {
  return n.kind === 'unmapped_therapist' && n.detail.includes('「送らない」にしている');
}

export function splitWorkNotes(notes: ReadonlyArray<WorkNote> | null | undefined): { unsent: WorkNote[]; info: WorkNote[] } {
  const unsent: WorkNote[] = [];
  const info: WorkNote[] = [];
  for (const n of notes ?? []) {
    if (!n || typeof n.detail !== 'string') continue;
    // ★ 第1269便: 古い計画の「送らない」の行（種類が unmapped_therapist のまま）も、同じく出さない
    if (HIDDEN_KINDS.includes(n.kind) || isLegacyTargetOff(n)) continue;
    if (UNSENT_KINDS.includes(n.kind)) unsent.push(n);
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

/**
 * ★★★ 画面に出す1行（第1268便・カッキーさん「1名のままで、誰かが分からない」）。
 *   名前が人数ぶんそろっているときは、文の頭の「◯名は」を【名前】に置き換える:
 *     「1名は、いま駅ちかの出勤表に出ていないため更新できません」
 *       → 「さくら さんは、いま駅ちかの出勤表に出ていないため更新できません」
 *   ★ 名前が足りない（人数と合わない）・多すぎる（上限超え）・文が「◯名は」で始まらないときは、
 *     文はそのままにして、名前を別の行（対象：…）で添える。★ 人数をごまかさない。
 * @returns text＝出す文／names＝別の行で添える名前（要らなければ null）
 */
export function workNoteLine(n: WorkNote): { text: string; names: string | null } {
  const names = (Array.isArray(n.names) ? n.names : [])
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((x) => x.length > 0);
  const m = /^(\d+)名は、?/.exec(n.detail);
  if (m && names.length > 0 && names.length === Number(m[1]) && names.length <= WORK_NOTE_NAMES_MAX) {
    return { text: names.join('・') + ' さんは、' + n.detail.slice(m[0].length), names: null };
  }
  return { text: n.detail, names: workNoteNames(n) };
}
