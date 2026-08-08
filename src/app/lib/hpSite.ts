// 掲載店舗向け「公式ホームページ」機能の型・定数・サニタイズ（2026-08-08 段階1）。
//
// このファイルが blocks（jsonb）の形の「正」。DB 側は形を強制しないので、
// 読み込み時は必ず sanitizeHpBlocks() を通して欠損キー・不正値を既定値に丸める。
// 'use server' ファイル（actions/hpSite.ts）は async 関数しか export できないため、
// 型・定数・純関数はすべてここに置く（lib/jobs.ts と同じ役割分担）。

// ── ひな形 ───────────────────────────────────────────
// ひな形は「見た目（配色・フォント・ヒーローの組み方）」だけを変える。
// ブロックの種類・並び順・設定項目は全ひな形で共通（共通マニュアルの前提。設計メモ6章）。
export const HP_TEMPLATES = [
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
  therapists: { on: boolean };                 // セラピスト一覧
  schedule:   { on: boolean; days: number };   // 本日の出勤（表示日数 1〜7）
  diary:      { on: boolean; count: number };  // 写メ日記（埋め込み・表示件数 1〜12）
  reviews:    { on: boolean; count: number };  // 口コミ（埋め込み・表示件数 1〜10）
  coupon:     { on: boolean };                 // クーポン
  news:       { on: boolean };                 // お知らせ
  jobs:       { on: boolean };                 // 求人リンク（フクエスワーク）
  freePages:  { on: boolean };                 // フリーページ（最大3・salon_free_pages）
};

export const HP_SCHEDULE_DAYS_MIN = 1;
export const HP_SCHEDULE_DAYS_MAX = 7;
export const HP_DIARY_COUNT_MIN   = 1;
export const HP_DIARY_COUNT_MAX   = 12;
export const HP_REVIEWS_COUNT_MIN = 1;
export const HP_REVIEWS_COUNT_MAX = 10;

export const DEFAULT_HP_BLOCKS: HpBlocksConfig = {
  therapists: { on: true },
  schedule:   { on: true, days: 7 },
  diary:      { on: true, count: 6 },
  reviews:    { on: true, count: 5 },
  coupon:     { on: true },
  news:       { on: true },
  jobs:       { on: true },
  freePages:  { on: true },
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
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const d = DEFAULT_HP_BLOCKS;
  return {
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
  };
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

// ── サイト行（アプリ内での形） ────────────────────────
export type HpSite = {
  salon_id:          number;
  slug:              string;
  domain:            string | null;
  status:            HpSiteStatus;
  template_key:      HpTemplateKey;
  theme_key:         string;          // 妥当性は themes.ts の getTheme() が既定値へフォールバック
  hero_images:       string[];
  hero_catch:        string;
  concept_title:     string;
  concept_text:      string;
  concept_image_url: string | null;
  blocks:            HpBlocksConfig;
  banners:           HpBanner[];
  updated_at:        string;
};

/** 店舗が /mypage から保存できる項目（slug / domain / status は含めない）。 */
export type HpSiteFormInput = {
  template_key:      string;
  theme_key:         string;
  hero_images:       string[];
  hero_catch:        string;
  concept_title:     string;
  concept_text:      string;
  concept_image_url: string | null;
  blocks:            HpBlocksConfig;
  banners:           HpBanner[];
};

// ── ひな形別カラーバリエーション（2026-08-08 デザイン確定にともない追加） ──
// テーマは「ひな形ごとに用意された6色」から選ぶ（SALON_THEMES の10色とは別体系）。
// CSS変数の上書きだけで色が変わる設計（デザインモック thumbs.js の VARIANTS と同一の値）。
// ひな形と色は最初のギャラリー選択で確定し、以後は変更不可（変更は運営作業・有償）。
export type HpColorVariant = {
  key:   string;
  label: string;
  /** ひな形CSSに注入する CSS 変数（例 { '--hp-accent': '#c4a469' }） */
  css:   Record<string, string>;
};

export const HP_COLOR_VARIANTS: Record<HpTemplateKey, HpColorVariant[]> = {
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
