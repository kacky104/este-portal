import fs from 'node:fs';
import path from 'node:path';
import {
  parseGlossaryFile,
  stripMissingImages,
  resolveRelated,
  sortForHub,
  type GlossaryMeta,
} from '@/lib/glossaryParse';

// ★★★ メンズエステ用語集（/glossary）の読み込み（第349便・2026-09-13）
//
// ★ 用語集は DB を使わない。src/content/glossary/<slug>.md を【ビルド時に】読む。
//   ページ（/glossary・/glossary/[slug]）と sitemap がここを呼ぶ。
// ★ 読み取りの決めごと（frontmatter の形・検証・画像の間引き）は src/lib/glossaryParse.ts に
//   ある（★ 番人 scripts/glossary-selftest.js）。このファイルは fs で読んで渡すだけ。
// ★ 1語でも壊れていれば throw ＝ next build が落ちる。壊れた語を本番に出さない。
// ★ `_` で始まるファイルと .md 以外は読まない（下書きは _draft-xxx.md のように置ける）。

const CONTENT_DIR = path.join(process.cwd(), 'src', 'content', 'glossary');
const PUBLIC_DIR = path.join(process.cwd(), 'public');

/** 各ページの末尾に1回だけ出す方針文。★ ここ1か所。ハブと1語ページの両方が読む。 */
export const GLOSSARY_POLICY_NOTE =
  'フクエスは、リラクゼーションを目的とした健全なメンズエステのみを掲載しています。施術内容や施術範囲は店舗ごとに異なりますので、ご不明な点は予約時に各店舗へご確認ください。';

export type GlossaryEntry = {
  meta: GlossaryMeta;
  /** 画像の間引き済み Markdown */
  body: string;
  /** 関連する用語（存在する語だけ・frontmatter の順） */
  related: GlossaryMeta[];
};

function listSlugs(): string[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => f.slice(0, -3))
    .sort();
}

function readOne(slug: string) {
  const raw = fs.readFileSync(path.join(CONTENT_DIR, `${slug}.md`), 'utf8');
  return parseGlossaryFile(raw, slug);
}

function publicExists(publicPath: string): boolean {
  // '/glossary/x/y.webp' → public/glossary/x/y.webp。'..' を含むパスは無いものとして扱う。
  if (publicPath.includes('..')) return false;
  return fs.existsSync(path.join(PUBLIC_DIR, publicPath.replace(/^\//, '')));
}

/** heroImage が public に無ければ null に落とした meta を返す。 */
function withHeroChecked(meta: GlossaryMeta): GlossaryMeta {
  if (meta.heroImage && !publicExists(meta.heroImage)) return { ...meta, heroImage: null };
  return meta;
}

/** 全語の meta（ハブの並び順）。★ 壊れた語があれば throw。 */
export function getAllGlossaryMeta(): GlossaryMeta[] {
  const metas = listSlugs().map((slug) => withHeroChecked(readOne(slug).meta));
  return sortForHub(metas);
}

/** 1語。無ければ null。body は画像の間引き済み。related は存在する語の meta。 */
export function getGlossaryEntry(slug: string): GlossaryEntry | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  if (!fs.existsSync(path.join(CONTENT_DIR, `${slug}.md`)) || slug.startsWith('_')) return null;

  const parsed = readOne(slug);
  const all = getAllGlossaryMeta();
  const bySlug = new Map(all.map((m) => [m.slug, m]));
  const relatedSlugs = resolveRelated(slug, parsed.meta.related, new Set(bySlug.keys()));

  return {
    meta: withHeroChecked(parsed.meta),
    body: stripMissingImages(parsed.body, publicExists),
    related: relatedSlugs.map((s) => bySlug.get(s)!).filter(Boolean),
  };
}
