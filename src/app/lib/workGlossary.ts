import fs from 'node:fs';
import path from 'node:path';
import {
  parseGlossaryFile,
  stripMissingImages,
  resolveRelated,
  type GlossaryMeta,
} from '@/lib/glossaryParse';

// ★★★ フクエスワークの「セラピスト用語集」（/jobs/glossary・第970便・2026-09-29・カッキーさん）
//
// ★ /glossary（お客様目線）とは別の、【働く人の目線】の用語集。読み取りの決めごとは /glossary と同じ
//   （src/lib/glossaryParse.ts）。★ 違うのは: 置き場所（src/content/work-glossary）・カテゴリー・画像の置き場所
//   （public/work-glossary/<slug>/）・リンク先（/jobs/glossary/<slug>）だけ。
// ★ 1語でも壊れていれば throw ＝ next build が落ちる（/glossary と同じ）。★ `_` で始まるファイルは読まない。

const CONTENT_DIR = path.join(process.cwd(), 'src', 'content', 'work-glossary');
const PUBLIC_DIR = path.join(process.cwd(), 'public');

export const WORK_GLOSSARY_CATEGORY_ORDER = ['kyuyo', 'hatarakikata', 'shikumi', 'anshin'] as const;
export type WorkGlossaryCategory = (typeof WORK_GLOSSARY_CATEGORY_ORDER)[number];
export const WORK_GLOSSARY_CATEGORIES: Record<WorkGlossaryCategory, string> = {
  kyuyo: 'お給料・待遇',
  hatarakikata: '働き方',
  shikumi: 'お店のしくみ',
  anshin: '安心・マナー',
};

/** 各ページの末尾に1回だけ出す方針文（★ ここ1か所）。 */
export const WORK_GLOSSARY_POLICY_NOTE =
  'フクエスワークは、リラクゼーションを目的とした健全なメンズエステの求人のみを掲載しています。お給料や働き方の条件はお店ごとに異なりますので、応募の前や面接で各店舗へご確認ください。';

export type WorkGlossaryMeta = Omit<GlossaryMeta, 'category'> & { category: WorkGlossaryCategory };

export type WorkGlossaryEntry = {
  meta: WorkGlossaryMeta;
  body: string;
  related: WorkGlossaryMeta[];
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
  const parsed = parseGlossaryFile(raw, slug, WORK_GLOSSARY_CATEGORY_ORDER);
  return { meta: parsed.meta as unknown as WorkGlossaryMeta, body: parsed.body };
}

function publicExists(publicPath: string): boolean {
  if (publicPath.includes('..')) return false;
  return fs.existsSync(path.join(PUBLIC_DIR, publicPath.replace(/^\//, '')));
}

function withHeroChecked(meta: WorkGlossaryMeta): WorkGlossaryMeta {
  if (meta.heroImage && !publicExists(meta.heroImage)) return { ...meta, heroImage: null, heroAlt: null };
  return meta;
}

/** 全語の meta（カテゴリー順 → 読み順）。 */
export function getAllWorkGlossaryMeta(): WorkGlossaryMeta[] {
  const metas = listSlugs().map((slug) => withHeroChecked(readOne(slug).meta));
  const catIndex = (c: string) => (WORK_GLOSSARY_CATEGORY_ORDER as readonly string[]).indexOf(c);
  return metas.sort((a, b) => catIndex(a.category) - catIndex(b.category) || a.reading.localeCompare(b.reading, 'ja'));
}

/** 1語。無ければ null。 */
export function getWorkGlossaryEntry(slug: string): WorkGlossaryEntry | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  if (!fs.existsSync(path.join(CONTENT_DIR, `${slug}.md`)) || slug.startsWith('_')) return null;
  const parsed = readOne(slug);
  const all = getAllWorkGlossaryMeta();
  const bySlug = new Map(all.map((m) => [m.slug, m]));
  const relatedSlugs = resolveRelated(slug, parsed.meta.related, new Set(bySlug.keys()));
  return {
    meta: withHeroChecked(parsed.meta),
    body: stripMissingImages(parsed.body, publicExists),
    related: relatedSlugs.map((s) => bySlug.get(s)!).filter(Boolean),
  };
}
