// 公式サイト（/hp/[slug]・独自ドメイン）のトップの title / description の作り方（第1143便・2026-10-04・カッキーさん）。★ 純粋関数のみ。
//
// ★★★ 型（カッキーさんの決定「全店の型を変える」）
//   title … 「店名｜（地域）のメンズエステ【公式】」
//   ★ それまでは「店名｜公式サイト」。地域も業種も入っておらず、店名を知らない人の検索（「博多 メンズエステ」など）に
//     引っかかる手がかりがタイトルに無かった。
//   ★ 地域は【検索で打たれる言葉】にする（「福岡市博多区」ではなく「博多」）。フクエスに登録してある地域（salons.area）から決める。
//   ★ 店名は先頭（店名で探す人がいちばん多い）。店名は切らない。

/** 地域（salons.area の値）→ タイトルに入れる言葉。★ 値は src/app/lib/areas.ts の AREA_ORDER と同じ */
const AREA_WORDS: Record<string, string> = {
  '博多・住吉': '博多',
  '中洲・天神・薬院': '中洲・天神',
  '北九州・小倉': '北九州・小倉',
  '久留米': '久留米',
  '福岡県その他': '福岡',
  '出張': '福岡',
};

/** ★ 地域が空・知らない値のときの言葉（サイト全体が福岡なので、嘘にならない） */
export const HP_AREA_FALLBACK = '福岡';

/** 出張の店の地域の値（areas.ts の DISPATCH_AREA と同じ） */
const DISPATCH = '出張';

/** タイトルに入れる地域の言葉 */
export function hpAreaWord(area: unknown): string {
  const a = typeof area === 'string' ? area.trim() : '';
  return AREA_WORDS[a] ?? HP_AREA_FALLBACK;
}

/** 「（地域）のメンズエステ」。出張の店は「福岡の出張メンズエステ」 */
export function hpGenrePhrase(area: unknown): string {
  const a = typeof area === 'string' ? area.trim() : '';
  return a === DISPATCH ? `${HP_AREA_FALLBACK}の出張メンズエステ` : `${hpAreaWord(a)}のメンズエステ`;
}

/** トップの title。「店名｜（地域）のメンズエステ【公式】」 */
export function hpTopTitle(salonName: unknown, area: unknown): string {
  const name = typeof salonName === 'string' ? salonName.trim() : '';
  const tail = `${hpGenrePhrase(area)}【公式】`;
  return name ? `${name}｜${tail}` : tail;
}

/** description の上限（字）。★ 検索結果に出るのはこのくらいまで */
export const HP_DESC_MAX = 120;
/** アクセスの文を入れてよい長さ（字）。★ 長い文（道順など）は入れない */
export const HP_ACCESS_MAX = 30;

const oneLine = (v: unknown) => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim();
/** 文の終わりに「。」が無ければ足す（！や。で終わっていればそのまま） */
const sentence = (s: string) => (s === '' || /[。！？!?♪]$/.test(s) ? s : s + '。');

/**
 * トップの description。
 *   「（地域）のメンズエステ「店名」の公式サイト。（アクセス）。（お店の一言 or コンセプトの頭）」
 * ★ それまではお店の一言だけ（20字ほど）で、短すぎると検索エンジンが別の文に差し替えやすかった。
 * ★ アクセスは短いときだけ入れる（HP_ACCESS_MAX 字まで）。★ 全体は HP_DESC_MAX 字で切る。
 */
export function hpTopDescription(input: { salonName: unknown; area: unknown; access?: unknown; heroCatch?: unknown; concept?: unknown }): string {
  const name = oneLine(input.salonName);
  const head = name ? `${hpGenrePhrase(input.area)}「${name}」の公式サイト。` : `${hpGenrePhrase(input.area)}の公式サイト。`;
  const access = oneLine(input.access);
  const lead = oneLine(input.heroCatch) || oneLine(input.concept);
  const body = head + (access && access.length <= HP_ACCESS_MAX ? sentence(access) : '') + sentence(lead);
  return body.length > HP_DESC_MAX ? body.slice(0, HP_DESC_MAX - 1) + '…' : body;
}
