// 掲載店舗向け「公式ホームページ」機能の型・定数・サニタイズ（2026-08-08 段階1 → 08-09 段階3）。
//
// このファイルが blocks（jsonb）の形の「正」。DB 側は形を強制しないので、
// 読み込み時は必ず sanitizeHpBlocks() を通して欠損キー・不正値を既定値に丸める。
// 'use server' ファイル（actions/hpAdmin.ts）は async 関数しか export できないため、
// 型・定数・純関数はすべてここに置く（lib/jobs.ts と同じ役割分担）。

// ── ひな形 ───────────────────────────────────────────
// ひな形は「見た目（配色・フォント・ヒーローの組み方）」だけを変える。
// ブロックの種類・並び順・設定項目は全ひな形で共通（共通マニュアルの前提。設計メモ6章）。
export const HP_TEMPLATES = [
  { key: 's', label: 'タイプS' }, // フラッグシップ（2026-08-09 追加・LPのKVに描かれたサイトの実物化）
  { key: 'a', label: 'タイプA' },
  { key: 'b', label: 'タイプB' },
  { key: 'c', label: 'タイプC' },
] as const;

export type HpTemplateKey = (typeof HP_TEMPLATES)[number]['key'];

export function isHpTemplateKey(v: unknown): v is HpTemplateKey {
  return HP_TEMPLATES.some((t) => t.key === v);
}

// ── 公開状態 ─────────────────────────────────────────
// draft=非公開（制作中） / live=公開 / suspended=運営による停止（料金滞納・規約違反・解約処理中）。
// 店舗が切り替えられるのは draft ⇔ live のみ。suspended の設定・解除は運営だけ。
export type HpSiteStatus = 'draft' | 'live' | 'suspended';

export function isHpSiteStatus(v: unknown): v is HpSiteStatus {
  return v === 'draft' || v === 'live' || v === 'suspended';
}

// ── 上限値 ───────────────────────────────────────────
export const MAX_HP_HERO_IMAGES   = 3;
export const MAX_HP_BANNERS       = 3;
export const MAX_HP_CATCH_LEN     = 40;
export const MAX_HP_TITLE_LEN     = 30;
export const MAX_HP_CONCEPT_LEN   = 2000;
export const MAX_HP_LINK_LEN      = 300;

// ── ブロック設定（jsonb: salon_sites.blocks） ─────────
// キーの追加はここ＋公開ページ側の描画だけで完結させる（マイグレーション不要が jsonb の利点）。
// ブロック自体の説明は設計メモ3章の表を正とする。
export type HpBlocksConfig = {
  concept:    { on: boolean };                 // コンセプト（本文か見出しがあるときだけ出る）
  courses:    { on: boolean };                 // コース料金（登録があるときだけ出る）
  therapists: { on: boolean };                 // セラピスト一覧
  schedule:   { on: boolean; days: number };   // 本日の出勤（days は週間表の削除でUIから隠した。下の注記参照）
  diary:      { on: boolean; count: number };  // 写メ日記（埋め込み・表示件数 1〜12）
  reviews:    { on: boolean; count: number };  // 口コミ（埋め込み・表示件数 1〜10）
  coupon:     { on: boolean };                 // クーポン
  news:       { on: boolean };                 // お知らせ
  jobs:       { on: boolean };                 // 求人リンク（フクエスワーク）
  freePages:  { on: boolean };                 // フリーページ（最大3・salon_free_pages）
  links:      { on: boolean };                 // リンク（相互リンクのバナー群・link_banners）
  /** セクションの表示順。null=ひな形の既定順（DEFAULT_HP_SECTION_ORDER_BY_TEMPLATE） */
  order:      HpSectionKey[] | null;
  /**
   * マルチページ構成にするか（2026-08-11）。false=従来の1ページ構成。
   *
   * true にすると「セラピスト一覧」と「コース料金」がそれぞれ独立したURL
   * （/therapist・/system）になり、トップにはその抜粋＋「もっと見る」が出る。
   * 分け方は運営が決めた固定（HP_SUBPAGE_SEGMENTS）で、店舗側からは切り替えられない
   * ＝ デザインと同じ扱い。切り替えは運営作業（hpOperator）。
   *
   * ★ 既存店を勝手に作り替えないための移行スイッチであって、料金プランの区別ではない。
   * ★ true→false に戻すと下層ページが 404 になる。一度検索に載ったURLが消えるので、
   *   戻す運用は想定していない。
   * ★ 列ではなく blocks(jsonb) に置いているので、追加にマイグレーションが要らない
   *   （sanitizeHpBlocks が既定値を入れるだけで既存行はそのまま使える）。
   */
  multipage:  boolean;
  /**
   * カラー別のトップ画像（2026-08-11）。キー=カラーキー / 値=hero_images と同じ並び（[0]=PC・[1]=スマホ）。
   *
   * 用途はデモ店（slug='demo'）のデザインプレビューだけ。デモ店は1行で全デザインを見せるため、
   * シャンパンゴールド用の写真しか持てず、ワインレッドのプレビューだけ色味が合わなかった。
   * ここに色ごとの写真を入れておくと、その配色で見るときだけ差し替わる。
   *
   * ★ 実店舗はデザインが1つに確定するので、この欄は空のまま＝従来どおり hero_images を使う。
   * ★ 空・未設定なら hero_images →（タイプSは）コード同梱の既定画像、の順にフォールバックする。
   */
  heroByColor: Record<string, string[]>;
  /**
   * カラー別のセラピスト写真（2026-08-11）。
   * キー=カラーキー / 値={ セラピストID: 画像URL }。heroByColor と同じくデモ店専用。
   *
   * 掲載データのセラピスト写真は1人1枚しか持てないので、デモ店をワインレッドで
   * プレビューすると写真だけシャンパンゴールドの色味のまま、という食い違いが出る。
   * ここに入れた写真は、その配色で見るときだけ profile_image_url の代わりに使う。
   *
   * ★ 入っていないセラピストは従来どおり掲載データの写真。実店舗は空のまま。
   */
  therapistImagesByColor: Record<string, Record<string, string>>;
};

// ── セクションの表示順（2026-08-10 追加） ──────────────
// 店舗オーナーが /hp/{key}/admin で上下に動かして決められるセクションの一覧。
// ここに無いもの（トップバー・ヒーロー・フッター・予約CTA・求人リンク）は常に位置固定。
//
// ★ 実装の要（2026-08-10 改）:
//   DOM の並びは全ひな形共通のまま（作業ルール1）で、実際の並びは flex の order で作る。
//   使う並びは hpSectionOrder() ただ1つ＝管理画面の一覧と公開ページが必ず一致する。
export const HP_SECTIONS = [
  { key: 'concept',    label: 'コンセプト' },
  { key: 'courses',    label: 'コース料金' },
  { key: 'therapists', label: 'セラピスト一覧' },
  { key: 'schedule',   label: '本日の出勤' },
  { key: 'diary',      label: '写メ日記' },
  { key: 'reviews',    label: '口コミ' },
  { key: 'coupon',     label: 'クーポン' },
  { key: 'news',       label: 'お知らせ' },
  { key: 'freePages',  label: 'フリーページ' },
  { key: 'info',       label: '店舗情報' },
  { key: 'links',      label: 'リンク' },
  { key: 'banners',    label: 'バナー' },
] as const;

export type HpSectionKey = (typeof HP_SECTIONS)[number]['key'];

/** 素の既定順（＝HpTemplate の DOM の並び）。ひな形ごとの既定は下の表を使うこと。 */
export const DEFAULT_HP_SECTION_ORDER: HpSectionKey[] = HP_SECTIONS.map((s) => s.key);

/**
 * ひな形ごとの既定の並び（2026-08-10）。
 * タイプSは「ヒーロー直下に本日の出勤」がデザインの肝なので、その順を既定にする。
 * ここを唯一の正にすることで、管理画面の一覧＝公開ページの並び が常に一致する
 * （以前はタイプSだけCSSで並べ替えていたため、管理画面の表示とずれていた）。
 */
export const DEFAULT_HP_SECTION_ORDER_BY_TEMPLATE: Record<HpTemplateKey, HpSectionKey[]> = {
  s: ['schedule', 'concept', 'courses', 'therapists', 'diary', 'reviews', 'coupon', 'news', 'freePages', 'info', 'links', 'banners'],
  a: DEFAULT_HP_SECTION_ORDER,
  b: DEFAULT_HP_SECTION_ORDER,
  c: DEFAULT_HP_SECTION_ORDER,
};

/** 実際に使う並び。保存された並びがあればそれ、無ければひな形の既定。 */
export function hpSectionOrder(templateKey: HpTemplateKey, saved: HpSectionKey[] | null): HpSectionKey[] {
  return saved ?? DEFAULT_HP_SECTION_ORDER_BY_TEMPLATE[templateKey];
}

/**
 * 保存された order を安全な形に丸める。
 * 未知キーは捨て、重複は先勝ち、足りないキーは既定順のまま末尾に足す
 * （＝あとからセクションを増やしても、既存店の並びを壊さず新セクションが末尾に出る）。
 */
export function normalizeHpSectionOrder(raw: unknown): HpSectionKey[] {
  const known = new Set<string>(DEFAULT_HP_SECTION_ORDER);
  const out: HpSectionKey[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v !== 'string' || !known.has(v) || seen.has(v)) continue;
      seen.add(v);
      out.push(v as HpSectionKey);
    }
  }
  for (const k of DEFAULT_HP_SECTION_ORDER) if (!seen.has(k)) out.push(k);
  return out;
}

export const HP_SCHEDULE_DAYS_MIN = 1;
export const HP_SCHEDULE_DAYS_MAX = 7;
export const HP_DIARY_COUNT_MIN   = 1;
export const HP_DIARY_COUNT_MAX   = 12;
export const HP_REVIEWS_COUNT_MIN = 1;
export const HP_REVIEWS_COUNT_MAX = 10;

export const DEFAULT_HP_BLOCKS: HpBlocksConfig = {
  concept:    { on: true },
  courses:    { on: true },
  therapists: { on: true },
  schedule:   { on: true, days: 7 },
  diary:      { on: true, count: 6 },
  reviews:    { on: true, count: 5 },
  coupon:     { on: true },
  news:       { on: true },
  jobs:       { on: true },
  freePages:  { on: true },
  links:      { on: true },
  order:      null,  // 未設定＝ひな形の既定順
  multipage:  false, // 既定は従来どおりの1ページ構成
  heroByColor: {},   // 既定は空＝全カラーで hero_images を使う（デモ店だけが使う欄）
  therapistImagesByColor: {}, // 同上（既定は空＝掲載データの写真をそのまま使う）
};

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function boolOr(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** DB から読んだ blocks(jsonb) を安全な形に丸める。欠損・型違いはすべて既定値。 */
export function sanitizeHpBlocks(raw: unknown): HpBlocksConfig {
  const rawObj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const r = rawObj as Record<string, Record<string, unknown> | undefined>;
  const d = DEFAULT_HP_BLOCKS;
  return {
    concept:    { on: boolOr(r.concept?.on, d.concept.on) },
    courses:    { on: boolOr(r.courses?.on, d.courses.on) },
    therapists: { on: boolOr(r.therapists?.on, d.therapists.on) },
    schedule: {
      on:   boolOr(r.schedule?.on, d.schedule.on),
      days: clampInt(r.schedule?.days, HP_SCHEDULE_DAYS_MIN, HP_SCHEDULE_DAYS_MAX, d.schedule.days),
    },
    diary: {
      on:    boolOr(r.diary?.on, d.diary.on),
      count: clampInt(r.diary?.count, HP_DIARY_COUNT_MIN, HP_DIARY_COUNT_MAX, d.diary.count),
    },
    reviews: {
      on:    boolOr(r.reviews?.on, d.reviews.on),
      count: clampInt(r.reviews?.count, HP_REVIEWS_COUNT_MIN, HP_REVIEWS_COUNT_MAX, d.reviews.count),
    },
    coupon:    { on: boolOr(r.coupon?.on, d.coupon.on) },
    news:      { on: boolOr(r.news?.on, d.news.on) },
    jobs:      { on: boolOr(r.jobs?.on, d.jobs.on) },
    freePages: { on: boolOr(r.freePages?.on, d.freePages.on) },
    links:     { on: boolOr(r.links?.on, d.links.on) },
    // 配列が入っていれば「オーナーが並び替え済み」。それ以外（未設定・型違い）は null＝既定順。
    order:     Array.isArray(rawObj.order) ? normalizeHpSectionOrder(rawObj.order) : null,
    // ★ order と同じく最上位のキー。ネストしている他のキーと違い r ではなく rawObj から取る。
    multipage: boolOr(rawObj.multipage, d.multipage),
    heroByColor: sanitizeHpHeroByColor(rawObj.heroByColor),
    therapistImagesByColor: sanitizeHpTherapistImagesByColor(rawObj.therapistImagesByColor),
  };
}

/** カラーキーとして通す文字列か（英小文字始まりの短い英数字）。 */
function isColorKeyLike(v: string): boolean {
  return /^[a-z][a-z0-9]{1,15}$/.test(v);
}

/**
 * カラー別セラピスト写真を安全な形に丸める。
 * 外側のキーはカラーキー、内側のキーはセラピストID（数字またはUUID）、値は https の画像URLだけ。
 * 空になった色は落とす（＝未設定と同じ扱い）。
 */
export function sanitizeHpTherapistImagesByColor(raw: unknown): Record<string, Record<string, string>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [colorKey, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isColorKeyLike(colorKey) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const inner: Record<string, string> = {};
    for (const [id, url] of Object.entries(value as Record<string, unknown>)) {
      if (!/^[A-Za-z0-9-]{1,40}$/.test(id)) continue;
      if (typeof url !== 'string' || !isSafeImageUrl(url)) continue;
      inner[id] = url;
    }
    if (Object.keys(inner).length > 0) out[colorKey] = inner;
  }
  return out;
}

/**
 * カラー別トップ画像を安全な形に丸める。
 * キーは英数字の短いカラーキーだけ、値は https の画像URLだけ、枚数は hero_images と同じ上限。
 * 空配列になった色は落とす（＝未設定と同じ扱いにして、判定を「あるか無いか」だけにする）。
 */
export function sanitizeHpHeroByColor(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isColorKeyLike(key) || !Array.isArray(value)) continue;
    const urls = value
      .filter((u): u is string => typeof u === 'string' && isSafeImageUrl(u))
      .slice(0, MAX_HP_HERO_IMAGES);
    if (urls.length > 0) out[key] = urls;
  }
  return out;
}

// ── バナー（jsonb: salon_sites.banners） ──────────────
export type HpBanner = {
  image_url: string; // salon-images バケットの公開URL
  link:      string; // 任意。空文字=リンクなし
};

/** http(s) の絶対URLだけ許可（javascript: 等の混入防止）。空文字はOK（リンクなし）。 */
export function isSafeHttpUrl(v: string): boolean {
  if (v === '') return true;
  if (v.length > MAX_HP_LINK_LEN) return false;
  return /^https?:\/\//.test(v);
}

/** 画像URL: https のみ（Supabase Storage の公開URL前提）。 */
export function isSafeImageUrl(v: string): boolean {
  return typeof v === 'string' && v.length <= MAX_HP_LINK_LEN && /^https:\/\//.test(v);
}

/**
 * 相互リンク用のバナーコードから「画像URL」と「リンク先」だけを取り出す（2026-08-10）。
 *
 * 例: <a href="https://fukues.com/"><img src="https://fukues.com/banner.png" alt="フクエス"></a>
 *
 * ★ HTML をそのまま表示するのではなく、2つのURLを抜き出して既存のバナー枠に入れるだけ。
 *   これなら script や onclick が混ざったコードを貼られても、URL以外は一切ページに出ない
 *   （店舗の独自ドメインは管理画面と同じオリジンなので、自由HTMLの許可は事故の元）。
 * 取り出せない・URLが安全でない場合は null を返す（呼び出し側でエラー表示）。
 */
export function parseHpBannerCode(code: string): HpBanner | null {
  if (typeof code !== 'string' || code.length > 4000) return null;
  const unescape = (v: string) =>
    v.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'").trim();
  const attr = (tag: string, name: string): string => {
    const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
    return m ? unescape(m[2] ?? m[3] ?? m[4] ?? '') : '';
  };
  const imgTag = /<img\b[^>]*>/i.exec(code)?.[0] ?? '';
  const aTag   = /<a\b[^>]*>/i.exec(code)?.[0] ?? '';
  const image  = attr(imgTag, 'src');
  const link   = attr(aTag, 'href');
  if (!isSafeImageUrl(image)) return null;
  return { image_url: image, link: isSafeHttpUrl(link) ? link : '' };
}

// ── リンク（jsonb: salon_sites.link_banners）──────────
// 相互リンクのバナー群。掲載サイト・求人サイトから配られるコードを店舗が貼って増やす。
export type HpLinkBanner = {
  image_url: string; // 画像バナーのURL（https のみ）。空文字＝文字だけのリンク
  link:      string; // リンク先（http(s) のみ）。空文字＝リンクなし
  label:     string; // 文字リンクの表示文字／画像バナーの alt
};

export const MAX_HP_LINK_BANNERS = 30;
export const MAX_HP_LINK_LABEL_LEN = 60;

/** DB から読んだ link_banners(jsonb) を安全な形に丸める。不正な要素は捨てる。 */
export function sanitizeHpLinkBanners(raw: unknown): HpLinkBanner[] {
  if (!Array.isArray(raw)) return [];
  const out: HpLinkBanner[] = [];
  for (const item of raw) {
    if (out.length >= MAX_HP_LINK_BANNERS) break;
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const image = typeof o.image_url === 'string' && isSafeImageUrl(o.image_url) ? o.image_url : '';
    const link  = typeof o.link === 'string' && isSafeHttpUrl(o.link) ? o.link : '';
    const label = typeof o.label === 'string' ? o.label.slice(0, MAX_HP_LINK_LABEL_LEN) : '';
    // 画像も文字も無いものは表示できないので捨てる
    if (image === '' && label === '') continue;
    out.push({ image_url: image, link, label });
  }
  return out;
}

/**
 * 相互リンク用に配られたコードから、リンクを何件でも取り出す（2026-08-10）。
 *
 * 対応する形:
 *   <a href="…"><img src="…" alt="…"></a>   → 画像バナー
 *   <a href="…">サイト名</a>                → 文字リンク
 * 複数まとめて貼られても全部拾う。
 *
 * ★ 貼られたHTMLは表示しない。href / src / 表示文字だけを取り出して保存する。
 *   script・onclick・javascript: が混ざっていても、この3つ以外は一切残らない。
 */
export function parseHpLinkBanners(code: string): HpLinkBanner[] {
  if (typeof code !== 'string' || code.length > 40000) return [];
  const unescape = (v: string) =>
    v.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'").replace(/&nbsp;/gi, ' ').trim();
  const attr = (tag: string, name: string): string => {
    const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
    return m ? unescape(m[2] ?? m[3] ?? m[4] ?? '') : '';
  };
  const out: HpLinkBanner[] = [];
  const push = (image: string, link: string, label: string) => {
    if (out.length >= MAX_HP_LINK_BANNERS) return;
    const img = isSafeImageUrl(image) ? image : '';
    const href = isSafeHttpUrl(link) ? link : '';
    const text = label.replace(/\s+/g, ' ').trim().slice(0, MAX_HP_LINK_LABEL_LEN);
    if (img === '' && text === '') return;
    out.push({ image_url: img, link: href, label: text });
  };

  // <a …>…</a> を順に拾う（入れ子は想定しない＝配布コードは単純な形のため）
  const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let m: RegExpExecArray | null;
  let matched = false;
  while ((m = anchor.exec(code)) !== null) {
    matched = true;
    const href = attr(`<a${m[1]}>`, 'href');
    const inner = m[2];
    const imgTag = /<img\b[^>]*>/i.exec(inner)?.[0] ?? '';
    const image = attr(imgTag, 'src');
    const label = imgTag !== '' ? attr(imgTag, 'alt') : inner.replace(/<[^>]*>/g, '');
    push(image, href, unescape(label));
  }
  // <a> が無く <img> だけのコード（リンクなしバナー）
  if (!matched) {
    const img = /<img\b[^>]*>/gi;
    while ((m = img.exec(code)) !== null) push(attr(m[0], 'src'), '', attr(m[0], 'alt'));
  }
  return out;
}

/** DB から読んだ banners(jsonb) を安全な形に丸める。不正な要素は捨てる。 */
export function sanitizeHpBanners(raw: unknown): HpBanner[] {
  if (!Array.isArray(raw)) return [];
  const out: HpBanner[] = [];
  for (const item of raw) {
    if (out.length >= MAX_HP_BANNERS) break;
    if (!item || typeof item !== 'object') continue;
    const url  = (item as Record<string, unknown>).image_url;
    const link = (item as Record<string, unknown>).link;
    if (typeof url !== 'string' || !isSafeImageUrl(url)) continue;
    const safeLink = typeof link === 'string' && isSafeHttpUrl(link) ? link : '';
    out.push({ image_url: url, link: safeLink });
  }
  return out;
}

/** DB から読んだ hero_images(jsonb) を安全な形に丸める。不正な要素は捨てる。 */
export function sanitizeHpHeroImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === 'string' && isSafeImageUrl(v))
    .slice(0, MAX_HP_HERO_IMAGES);
}

// ── URLキー（slug または独自ドメイン） ─────────────────
// 段階3から /hp/[slug] の [slug] には2種類が入る:
//   - 'test-shop'       … 暫定URL（fukues.com/hp/test-shop）。salon_sites.slug
//   - 'example-shop.com'… 独自ドメイン。proxy.ts がホスト名をそのまま入れて rewrite する
// slug は「半角英数とハイフン」で作る運用なのでドットを含まない＝ドットの有無で判別できる。

/** URLキーがドメイン（独自ドメイン経由のアクセス）か。 */
export function isHpDomainKey(key: string): boolean {
  return key.includes('.');
}

// ── 予約 slug ────────────────────────────────────────
// /hp/ 配下の静的ルートと衝突するため、店舗の slug として発行してはいけない値。
// （Next.js は静的セグメントが [slug] より優先されるので事故にはならないが、
//   その店のHPが永遠に開けなくなる。段階4の slug 発行UIで必ず弾くこと）
export const HP_RESERVED_SLUGS = ['welcome', 'templates', 'demo'] as const;

/**
 * デモ店舗の slug。デザイン一覧（/hp/templates）からの実物プレビューは
 * この slug に限りログイン不要で公開する（営業資料・契約前の店舗への提示用）。
 * 運営がダミー内容のサロン＋salon_sites 行（slug='demo'）を用意する。
 */
export const HP_DEMO_SLUG = 'demo';

/** URLキーの正規化（小文字・前後空白除去・www 除去）。proxy.ts の normalizeHost と対の関係。 */
export function normalizeHpSiteKey(key: string): string {
  const k = key.trim().toLowerCase();
  return k.startsWith('www.') ? k.slice(4) : k;
}

/** salon_sites を引くときの列名。ドメインなら domain、そうでなければ slug。 */
export function hpSiteKeyColumn(key: string): 'domain' | 'slug' {
  return isHpDomainKey(key) ? 'domain' : 'slug';
}

// ── ページ構成（2026-08-11 マルチページ化） ────────────
/**
 * トップから切り出す下層ページのURLセグメント。運営が決める固定の分け方。
 *
 * - therapist / system / news / info … サーバーが本文を描く＝検索にも載せる（indexable）
 * - diary / voice … 中身は iframe（/embed/… は noindex）＝検索エンジンからは本文ゼロに
 *   見えるため、人が見る一覧ページとしてだけ作り、常に noindex・sitemap にも載せない。
 */
export const HP_SUBPAGE_SEGMENTS = ['therapist', 'system', 'news', 'diary', 'voice', 'info'] as const;
export type HpSubpageSegment = (typeof HP_SUBPAGE_SEGMENTS)[number];

/**
 * この店の公開ページのパス一覧（ISRキャッシュを作り直す対象）。
 * 暫定URL（/hp/{slug}）と独自ドメイン（/hp/{domain}）の両系統ぶんを返す。
 *
 * ★★ 表示条件で絞り込まないこと。
 *   「今出しているページだけ」を返す作りにすると、multipage を false に戻した・
 *   セラピスト一覧を OFF にした・在籍が0人になった、といった場合に対象から外れ、
 *   200 を返していた頃のページが最大600秒キャッシュに残り続ける（消えなくなる）。
 *   sitemap に「出す／出さない」の判定は別（sitemap.xml 側が持つ）。
 */
export function hpSitePaths(site: { slug: string; domain: string | null }): string[] {
  const keys = [site.slug, site.domain ? normalizeHpSiteKey(site.domain) : ''].filter((k) => k !== '');
  const out: string[] = [];
  for (const k of keys) {
    out.push(`/hp/${k}`);
    for (const seg of HP_SUBPAGE_SEGMENTS) out.push(`/hp/${k}/${seg}`);
    out.push(`/hp/${k}/terms`);
  }
  return out;
}

// ── サイト行（アプリ内での形） ────────────────────────
export type HpSite = {
  salon_id:          number;
  slug:              string;
  domain:            string | null;
  status:            HpSiteStatus;
  template_key:      HpTemplateKey;
  theme_key:         string;          // 妥当性は themes.ts の getTheme() が既定値へフォールバック
  /** ヘッダーのロゴ画像。null=未設定（店名の文字を出す） */
  logo_url:          string | null;
  hero_images:       string[];
  hero_catch:        string;
  concept_title:     string;
  concept_text:      string;
  concept_image_url: string | null;
  blocks:            HpBlocksConfig;
  banners:           HpBanner[];
  /** 相互リンクのバナー群（LINK欄）。店舗が配布コードを貼って増やす */
  link_banners:      HpLinkBanner[];
  /** ファビコン（512×512 PNG の公開URL）。独自ドメインでのタブアイコン用。null=未設定 */
  favicon_url:       string | null;
  /** ひな形・カラーの確定ロック。true なら店舗側から変更できない（変更は運営の有償作業） */
  design_locked:     boolean;
  updated_at:        string;
};

/** salon_sites から公開ページ・管理画面が読む列（運営専用の契約メモ類は含めない）。 */
export const HP_SITE_COLUMNS =
  'salon_id, slug, domain, status, template_key, theme_key, logo_url, hero_images, hero_catch, concept_title, concept_text, concept_image_url, blocks, banners, link_banners, favicon_url, design_locked, updated_at';

/** DB の1行 → アプリ内の HpSite。公開ページ・管理画面の両方がこれ1本を使う。 */
export function mapHpSiteRow(row: Record<string, unknown>): HpSite {
  const status = row.status;
  const template = row.template_key;
  return {
    salon_id:          Number(row.salon_id),
    slug:              (row.slug as string) ?? '',
    domain:            (row.domain as string | null) ?? null,
    status:            isHpSiteStatus(status) ? status : 'draft',
    template_key:      isHpTemplateKey(template) ? template : 'a',
    theme_key:         (row.theme_key as string) ?? '',
    logo_url:          (row.logo_url as string | null) ?? null,
    hero_images:       sanitizeHpHeroImages(row.hero_images),
    hero_catch:        (row.hero_catch as string) ?? '',
    concept_title:     (row.concept_title as string) ?? '',
    concept_text:      (row.concept_text as string) ?? '',
    concept_image_url: (row.concept_image_url as string | null) ?? null,
    blocks:            sanitizeHpBlocks(row.blocks),
    banners:           sanitizeHpBanners(row.banners),
    link_banners:      sanitizeHpLinkBanners(row.link_banners),
    favicon_url:       (row.favicon_url as string | null) ?? null,
    design_locked:     row.design_locked === true,
    updated_at:        (row.updated_at as string) ?? '',
  };
}

/**
 * 店舗が管理画面（店舗ドメイン/admin）から保存できる項目。
 *
 * ひな形（template_key）とカラー（theme_key）は【含めない】。
 * デザインは最初のギャラリー選択で確定し、以後は変更不可（変更は運営の有償作業）。
 * → 確定は confirmHpDesign、以後の編集はこの型だけ、という型レベルの分離にしている。
 * slug / domain / status も含めない（status は setHpSiteLive・他は運営のみ）。
 */
export type HpContentInput = {
  logo_url:          string | null;
  hero_images:       string[];
  hero_catch:        string;
  concept_title:     string;
  concept_text:      string;
  concept_image_url: string | null;
  blocks:            HpBlocksConfig;
  banners:           HpBanner[];
  link_banners:      HpLinkBanner[];
  favicon_url:       string | null;
};

// ── ひな形別カラーバリエーション（2026-08-08 デザイン確定にともない追加） ──
// テーマは「ひな形ごとに用意された色」から選ぶ（SALON_THEMES の10色とは別体系）。
// A/B/C は CSS変数の上書きだけで色が変わる設計（デザインモック thumbs.js の VARIANTS と同一の値）。
// ひな形と色は最初のギャラリー選択で確定し、以後は変更不可（変更は運営作業・有償）。
//
// ★ 2026-08-11: タイプSだけ方針を変えた。
//   アクセント1色だけを差し替える6色は「文字の色が少し違うだけ」で見分けが付かなかったため、
//   タイプSは【シャンパンゴールド】【ワインレッド】の2つに絞り、
//   ワインレッドは地色・帯・フッター・写真の重ね色まで作り替えた別物の見た目にしている
//   （rootClass で付くクラスを styles.ts の上書きブロックが受ける）。
export type HpColorVariant = {
  key:   string;
  label: string;
  /** ひな形CSSに注入する CSS 変数（例 { '--hp-accent': '#c4a469' }） */
  css:   Record<string, string>;
  /**
   * CSS変数だけでは表せない配色（地色・帯・フッターまで変える配色）に付ける
   * ルート要素のクラス。styles.ts 側に同名の上書きブロックを置く。
   * 省略した配色は従来どおり CSS変数の差し替えだけ＝DOMは1バイトも変わらない。
   */
  rootClass?: string;
};

export const HP_COLOR_VARIANTS: Record<HpTemplateKey, HpColorVariant[]> = {
  // タイプS（フラッグシップ）。明るい地色なのでアクセントは濃いめの色を使う
  s: [
    // 白×シャンパンゴールド（従来の既定。ここを変えると既存店の見た目が変わる）
    { key: 'gold',     label: 'シャンパンゴールド', css: { '--hp-accent': '#b98d4f', '--hp-accent-soft': '#d5b98a' } },
    // 白×ワインレッド（2026-08-11 追加。地色・帯・フッターまで作り替える＝rootClass 付き）
    { key: 'wine',     label: 'ワインレッド',       css: { '--hp-accent': '#8e1f35', '--hp-accent-soft': '#b8566a' }, rootClass: 'hp-s-wine' },
  ],
  a: [
    { key: 'gold',     label: 'シャンパンゴールド', css: { '--hp-accent': '#c4a469', '--hp-accent-soft': '#a8905e' } },
    { key: 'platinum', label: 'プラチナ',           css: { '--hp-accent': '#c9ccd4', '--hp-accent-soft': '#a6aab4' } },
    { key: 'rose',     label: 'ローズ',             css: { '--hp-accent': '#d4a3ab', '--hp-accent-soft': '#b8878f' } },
    { key: 'wine',     label: 'ボルドー',           css: { '--hp-accent': '#c98a8a', '--hp-accent-soft': '#ad6f6f' } },
    { key: 'blue',     label: 'ミッドナイト',       css: { '--hp-accent': '#93a8cc', '--hp-accent-soft': '#7789ad' } },
    { key: 'forest',   label: 'フォレスト',         css: { '--hp-accent': '#9dbca5', '--hp-accent-soft': '#81a089' } },
  ],
  b: [
    { key: 'green',    label: 'リーフグリーン',     css: { '--hp-accent': '#8fae8b', '--hp-accent-deep': '#6b8f67' } },
    { key: 'terra',    label: 'テラコッタ',         css: { '--hp-accent': '#d99a7e', '--hp-accent-deep': '#bd7e62' } },
    { key: 'blue',     label: 'スモークブルー',     css: { '--hp-accent': '#8fa8c4', '--hp-accent-deep': '#6f88a8' } },
    { key: 'lavender', label: 'ラベンダー',         css: { '--hp-accent': '#a89ac4', '--hp-accent-deep': '#8c7eaa' } },
    { key: 'pink',     label: 'ロゼピンク',         css: { '--hp-accent': '#d49aac', '--hp-accent-deep': '#b87e90' } },
    { key: 'mustard',  label: 'マスタード',         css: { '--hp-accent': '#c4ae6b', '--hp-accent-deep': '#a8924f' } },
  ],
  c: [
    { key: 'red',      label: 'シグナルレッド',     css: { '--hp-accent': '#ff4658' } },
    { key: 'blue',     label: 'クラインブルー',     css: { '--hp-accent': '#2b5cff' } },
    { key: 'green',    label: 'グリーン',           css: { '--hp-accent': '#00a86b' } },
    { key: 'orange',   label: 'オレンジ',           css: { '--hp-accent': '#ff7a1a' } },
    { key: 'purple',   label: 'パープル',           css: { '--hp-accent': '#8a3ffc' } },
    { key: 'mono',     label: 'モノクローム',       css: { '--hp-accent': '#111114' } },
  ],
};

/** ひな形に対して有効な色キーか。 */
export function isValidHpColor(template: HpTemplateKey, colorKey: string): boolean {
  return HP_COLOR_VARIANTS[template].some((v) => v.key === colorKey);
}

/** ひな形＋色キー → CSS変数（不正キーは各ひな形の先頭色にフォールバック）。 */
export function hpColorCssVars(template: HpTemplateKey, colorKey: string): Record<string, string> {
  const list = HP_COLOR_VARIANTS[template];
  return (list.find((v) => v.key === colorKey) ?? list[0]).css;
}

/**
 * 実際に使うトップ画像（[0]=PC・[1]=スマホ）。
 * その配色専用の写真（blocks.heroByColor）があればそれ、無ければ従来どおり hero_images。
 * プレビュー（/preview/{template}/{color}）では theme_key が上書きされるので、
 * 何も足さなくても「その配色で見たときだけ差し替わる」が成立する。
 */
export function hpHeroImages(site: Pick<HpSite, 'hero_images' | 'theme_key' | 'blocks'>): string[] {
  return site.blocks.heroByColor[site.theme_key] ?? site.hero_images;
}

/**
 * ひな形＋色キー → ルート要素に足すクラス（無い配色は空文字）。
 * 地色まで変える配色（タイプSのワインレッド）だけが値を返す。
 * 空文字のときはクラスを足さないこと＝既存店のDOMを1バイトも変えないため。
 */
export function hpColorRootClass(template: HpTemplateKey, colorKey: string): string {
  const list = HP_COLOR_VARIANTS[template];
  return (list.find((v) => v.key === colorKey) ?? list[0]).rootClass ?? '';
}
