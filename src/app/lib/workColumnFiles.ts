import fs from 'node:fs';
import path from 'node:path';
import { isValidArticleCategory } from '@/app/lib/articleCategories';
import type { WorkArticleDetail } from '@/app/lib/workArticles';

// ★★★ フクエスワークのコラムを「用語集型」（リポジトリの md）で持つ（第1033便・2026-10-01・カッキーさん）
//
// ★ 置き場所: src/content/work-column/<slug>.md。frontmatter ＋ Markdown 本文（ArticleBody の許可要素に準拠）。
// ★ 読み取りは src/app/lib/workArticles.ts の各 fetch が「md → DB」の順で合成する:
//   ・同じ slug が md と DB の両方にあれば【md が勝つ】（＝移行した記事は DB を消さなくてよい。URL・画像もそのまま）
//   ・md にしか無い slug は新しい記事として一覧・詳細・sitemap に出る
// ★ 壊れた frontmatter は throw ＝ next build が落ちる（用語集と同じ方針・本番に壊れた記事を出さない）。
// ★ `_` で始まるファイルは読まない（下書き）。
//
// frontmatter（すべて 1 行「key: value」。faq などの入れ子は無し）:
//   slug        必須・ファイル名と一致
//   title       必須
//   category    必須・articleCategories のキー（work-guide / money / interview / industry）
//   excerpt     必須（一覧カード・meta description。目安 120 字）
//   publishedAt 必須・YYYY-MM-DD
//   updatedAt   任意・YYYY-MM-DD（公開日より後なら「更新:」として表示される）
//   heroImage   任意・/ から始まるパス（public/ 配下）か https:// の URL（Supabase Storage の既存画像もそのまま使える）

const CONTENT_DIR = path.join(process.cwd(), 'src', 'content', 'work-column');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXCERPT_MAX = 200;

function fail(fileSlug: string, reason: string): never {
  throw new Error(`work-column ${fileSlug}: ${reason}`);
}

function parseFrontmatter(raw: string, fileSlug: string): { meta: Record<string, string>; body: string } {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== '---') fail(fileSlug, '先頭が --- で始まっていない（frontmatter が無い）');
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end < 0) fail(fileSlug, 'frontmatter が --- で閉じていない');
  const meta: Record<string, string> = {};
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*):(?:\s+(.*))?$/.exec(line);
    if (!m) fail(fileSlug, `frontmatter ${i + 1}行目を読めない: ${line}`);
    if (m[1] in meta) fail(fileSlug, `frontmatter の ${m[1]} が2回ある`);
    meta[m[1]] = (m[2] ?? '').trim();
  }
  return { meta, body: lines.slice(end + 1).join('\n').trim() };
}

// 'YYYY-MM-DD' → JST 0時の ISO 文字列（DB の timestamptz と同じ形で扱えるように）。
function toIsoJst(d: string): string {
  return `${d}T00:00:00+09:00`;
}

function readOne(slug: string): WorkArticleDetail {
  const raw = fs.readFileSync(path.join(CONTENT_DIR, `${slug}.md`), 'utf8');
  const { meta, body } = parseFrontmatter(raw, slug);
  const need = (k: string) => {
    const v = meta[k];
    if (!v) fail(slug, `frontmatter に ${k} が無い`);
    return v;
  };
  const fmSlug = need('slug');
  if (fmSlug !== slug) fail(slug, `slug（${fmSlug}）がファイル名（${slug}）と違う`);
  const title = need('title');
  const category = need('category');
  if (!isValidArticleCategory(category)) fail(slug, `category が未知: ${category}`);
  const excerpt = need('excerpt');
  if (excerpt.length > EXCERPT_MAX) fail(slug, `excerpt が ${EXCERPT_MAX} 字を超えている（${excerpt.length} 字）`);
  const publishedAt = need('publishedAt');
  if (!DATE_RE.test(publishedAt)) fail(slug, `publishedAt は YYYY-MM-DD で書く: ${publishedAt}`);
  const updatedAt = meta.updatedAt ?? '';
  if (updatedAt && !DATE_RE.test(updatedAt)) fail(slug, `updatedAt は YYYY-MM-DD で書く: ${updatedAt}`);
  const heroImage = meta.heroImage ?? '';
  if (heroImage && !heroImage.startsWith('/') && !heroImage.startsWith('https://')) {
    fail(slug, 'heroImage は / から始まるパスか https:// の URL で書く');
  }
  if (heroImage.startsWith('/') && !fs.existsSync(path.join(process.cwd(), 'public', heroImage.replace(/^\//, '')))) {
    fail(slug, `heroImage の画像が public に無い: ${heroImage}`);
  }
  if (!body) fail(slug, '本文が空');
  return {
    id: `file:${slug}`,
    slug,
    title,
    excerpt,
    heroImageUrl: heroImage || null,
    category,
    publishedAt: toIsoJst(publishedAt),
    updatedAt: updatedAt ? toIsoJst(updatedAt) : null,
    body,
  };
}

let cache: WorkArticleDetail[] | null = null;

/** md 記事の全件（ビルド／ISR 中はメモリにキャッシュ）。壊れた記事があれば throw。 */
export function getAllWorkColumnFiles(): WorkArticleDetail[] {
  if (cache) return cache;
  if (!fs.existsSync(CONTENT_DIR)) { cache = []; return cache; }
  const slugs = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => f.slice(0, -3))
    .sort();
  cache = slugs.map(readOne);
  return cache;
}

export function getWorkColumnFile(slug: string): WorkArticleDetail | null {
  return getAllWorkColumnFiles().find((a) => a.slug === slug) ?? null;
}
