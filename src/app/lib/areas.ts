// エリアのDB値（フィルタ判定キー）↔ URLスラッグ ↔ リンク先URL の対応を一元管理する。
// 値（キー）は不変。スラッグ／リンクは表示・遷移のための付随情報。
//
// 「福岡全域」は全件表示のセンチネルで、専用URLは作らずトップ（/）を全域ページとして扱う。
// （/ と中身が同じ全件一覧ページを別URLで増やさない＝SEOの重複コンテンツを避ける）

export const ALL_AREA = '福岡全域';

// 出張エリアのキー（DB値）。slug は 'dispatch'。dispatch_type が none 以外のサロンを OR で出す判定に使う。
export const DISPATCH_AREA = '出張';

// 表示順（全域を先頭に、トップ／一覧と同じ並び）。
export const AREA_ORDER = [
  ALL_AREA,
  '博多・住吉',
  '中洲・天神・薬院',
  '北九州・小倉',
  '久留米',
  '福岡県その他',
  '出張',
] as const;

// 全域以外の6エリアの URL スラッグ（英字）。キー（DB値）は絶対に変えない。
const AREA_SLUGS: Record<string, string> = {
  '博多・住吉': 'hakata-eki',
  '中洲・天神・薬院': 'nakasu-tenjin',
  '北九州・小倉': 'kitakyushu',
  '久留米': 'kurume',
  '福岡県その他': 'other',
  '出張': 'dispatch',
};

/** エリア値 → リンク先URL。全域はトップ（/）、その他は /area/<slug>。 */
export function areaHref(areaValue: string): string {
  if (areaValue === ALL_AREA) return '/';
  const slug = AREA_SLUGS[areaValue];
  return slug ? `/area/${slug}` : '/';
}

/**
 * サロンが指定エリアに属するか（ShuffledSalons の matchesArea と同一判定）。
 * 福岡全域は全件 true。出張エリアは dispatch_type が none 以外（available/only）も含める。
 * それ以外は area 完全一致。地域ページ／出勤一覧のセラピスト絞り込みで salon→area を判定するのに使う。
 */
export function salonInArea(
  salon: { area: string; dispatchType: string },
  area: string,
): boolean {
  if (area === ALL_AREA) return true;
  return salon.area === area || (area === DISPATCH_AREA && salon.dispatchType !== 'none');
}

/** URLスラッグ → エリア値（不明なら null）。 */
export function areaFromSlug(slug: string): string | null {
  for (const [value, s] of Object.entries(AREA_SLUGS)) {
    if (s === slug) return value;
  }
  return null;
}

/** 事前生成・許可するスラッグ一覧（generateStaticParams 用）。 */
export const AREA_SLUGS_LIST = Object.values(AREA_SLUGS);
