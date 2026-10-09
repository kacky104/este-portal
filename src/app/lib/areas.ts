// エリアのDB値（フィルタ判定キー）↔ URLスラッグ ↔ リンク先URL の対応を一元管理する。
// 値（キー）は不変。スラッグ／リンクは表示・遷移のための付随情報。
//
// ★ 第1373便（2026-10-10・カッキーさん）: 「博多・住吉」と「中洲・天神・薬院」を1つのエリア「博多・天神・中洲」にまとめた。
//   掲載店がほぼ同じで、2つのエリアページの中身が重なっていたため（Search Console でエリアページが3か月 未登録のままだった）。
//   DB の値も書き換えた（修正SQL_第1373便）。古いURL（/area/hakata-eki・/area/nakasu-tenjin と、/jobs/area/・/working/ の同じ slug）は
//   next.config.ts の redirects で新しいURLへ送る。★ 古い値は LEGACY_AREA_KEYS で新しい値として読む（SQL と push の順番が前後しても店が消えないように）。
//
// 「福岡全域」は全件表示のセンチネルで、専用URLは作らずトップ（/）を全域ページとして扱う。
// （/ と中身が同じ全件一覧ページを別URLで増やさない＝SEOの重複コンテンツを避ける）

export const ALL_AREA = '福岡全域';

// 出張エリアのキー（DB値）。slug は 'dispatch'。dispatch_type が none 以外のサロンを OR で出す判定に使う。
export const DISPATCH_AREA = '出張';

// 表示順（全域を先頭に、トップ／一覧と同じ並び）。
export const AREA_ORDER = [
  ALL_AREA,
  '博多・天神・中洲',
  '北九州・小倉',
  '久留米',
  '福岡県その他',
  '出張',
] as const;

// 全域以外の5エリアの URL スラッグ（英字）。キー（DB値）は絶対に変えない。
const AREA_SLUGS: Record<string, string> = {
  '博多・天神・中洲': 'hakata-tenjin-nakasu',
  '北九州・小倉': 'kitakyushu',
  '久留米': 'kurume',
  '福岡県その他': 'other',
  '出張': 'dispatch',
};

/** ★ 第1373便: まとめる前のエリアの値 → 今の値。DB・URL のクエリ・保存済みの希望エリアなどに古い値が残っていても、今のエリアとして読む。 */
export const LEGACY_AREA_KEYS: Record<string, string> = {
  '博多・住吉': '博多・天神・中洲',
  '中洲・天神・薬院': '博多・天神・中洲',
};

/** ★ 第1373便: まとめる前の slug → 今の slug（next.config.ts の redirects と同じ対応。用語集・コラムの areas: に古い slug が残っていても読めるように）。 */
export const LEGACY_AREA_SLUGS: Record<string, string> = {
  'hakata-eki': 'hakata-tenjin-nakasu',
  'nakasu-tenjin': 'hakata-tenjin-nakasu',
};

/** エリアの値を今の値にそろえる（古い値は新しい値に・それ以外はそのまま）。 */
export function normalizeAreaKey<T extends string | null | undefined>(area: T): T | string {
  return area && LEGACY_AREA_KEYS[area] ? LEGACY_AREA_KEYS[area] : area;
}

/** ★ 第1373便: DB を絞り込むときに当てる値（今の値＋まとめる前の値）。修正SQL を流す前でも後でも、同じ店・同じ求人が出るように。 */
export function areaDbKeys(area: string): string[] {
  const key = normalizeAreaKey(area);
  return [key, ...Object.keys(LEGACY_AREA_KEYS).filter((k) => LEGACY_AREA_KEYS[k] === key)];
}

/** エリア値 → リンク先URL。全域はトップ（/）、その他は /area/<slug>。 */
export function areaHref(areaValue: string): string {
  if (areaValue === ALL_AREA) return '/';
  const slug = AREA_SLUGS[normalizeAreaKey(areaValue)];
  return slug ? `/area/${slug}` : '/';
}

/**
 * エリア値 → フクエスワークのエリア別求人ページURL（/jobs/area/<slug>）。
 * areaHref は本体フクエスのサロン地域ページ（/area/<slug>・全域は /）を返すため、求人側では流用不可。
 * 全域・出張・未知の値は求人一覧トップ（/jobs）にフォールバック（求人エリアページは通常4エリアのみ）。
 */
export function jobsAreaHref(areaValue: string): string {
  if (areaValue === ALL_AREA || areaValue === DISPATCH_AREA) return '/jobs';
  const slug = AREA_SLUGS[normalizeAreaKey(areaValue)];
  return slug ? `/jobs/area/${slug}` : '/jobs';
}

/**
 * サロンが指定エリアに属するか（ShuffledSalons の matchesArea と同一判定）。
 * 福岡全域は全件 true。出張エリアは dispatch_type が none 以外（available/only）も含める。
 * それ以外は area または area2 の一致。地域ページ／出勤一覧のセラピスト絞り込みで salon→area を判定するのに使う。
 */
export function salonInArea(
  salon: { area: string; area2?: string | null; dispatchType: string },
  area: string,
): boolean {
  if (area === ALL_AREA) return true;
  // ★ 第1373便: 古い値（博多・住吉／中洲・天神・薬院）が残っていても、今のエリアとして当てる
  const target = normalizeAreaKey(area);
  return (
    normalizeAreaKey(salon.area) === target ||
    (!!salon.area2 && normalizeAreaKey(salon.area2) === target) ||
    (area === DISPATCH_AREA && salon.dispatchType !== 'none')
  );
}

/** URLスラッグ → エリア値（不明なら null）。 */
export function areaFromSlug(slug: string): string | null {
  for (const [value, s] of Object.entries(AREA_SLUGS)) {
    if (s === slug) return value;
  }
  // ★ 古い slug（hakata-eki・nakasu-tenjin）は next.config.ts の redirects で新しい URL へ送る。ここでは当てない（同じ中身のページを2つのURLで出さない）。
  return null;
}

/** 事前生成・許可するスラッグ一覧（generateStaticParams 用）。 */
export const AREA_SLUGS_LIST = Object.values(AREA_SLUGS);
