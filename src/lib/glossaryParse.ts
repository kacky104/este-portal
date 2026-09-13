// ★★★ メンズエステ用語集（/glossary）の1語ファイルを読むための【純粋関数】（第349便・2026-09-13）
//
// ★ 用語集は DB を使わない。1語＝1ファイル（src/content/glossary/<slug>.md）。
//   先頭の frontmatter（--- で挟む）に見出し情報、その下に Markdown 本文。
// ★ このファイルは fs・Next・React を import しない（★ 番人 scripts/glossary-selftest.js が
//   tsc → node で直接呼ぶ）。ファイルを読むのは src/app/lib/glossary.ts の仕事。
//
// ★ frontmatter は YAML ライブラリを入れずに、使う4つの形だけを読む:
//     key: value            … 文字列（両端の空白を落とす。引用符は付けない）
//     key: [a, b, c]        … 文字列の配列（空 [] も可）
//     key: true / false     … 真偽
//     faq:                  … 次の行から「  - q: …」「    a: …」の組。インデントの無い行で終わる
//   ★ 値の中の「:」はそのまま残る（1つ目の「: 」で切る）。
//
// ★ 壊れた frontmatter は throw する（★ ビルドが落ちる＝本番に壊れた語を出さない）。

export const GLOSSARY_CATEGORY_ORDER = ['gyotai', 'sejutsu', 'ryokin', 'therapist', 'manner', 'fukues'] as const;
export type GlossaryCategory = (typeof GLOSSARY_CATEGORY_ORDER)[number];

/** カテゴリキー → 画面のラベル。★ キーはファイルに書くので不変。ラベルはここだけ。 */
export const GLOSSARY_CATEGORIES: Record<GlossaryCategory, string> = {
  gyotai: '業態・お店の種類',
  sejutsu: '施術・コース',
  ryokin: '料金・予約',
  therapist: 'セラピスト・出勤情報',
  manner: 'マナー・ルール',
  fukues: 'フクエスの機能',
};

/** meta description の上限（目安は 80〜120 字。超えたら throw）。 */
export const GLOSSARY_DESCRIPTION_MAX = 160;

export type GlossaryFaq = { q: string; a: string };

export type GlossaryMeta = {
  term: string;              // 健全店
  reading: string;           // けんぜんてん（ひらがな。五十音の行分けに使う）
  slug: string;              // kenzen-ten（ファイル名と一致）
  category: GlossaryCategory;
  major: boolean;            // 主要語（3,000字級）。省略時 false
  summary: string;           // ハブ一覧の一言
  description: string;       // meta description
  publishedAt: string;       // 'YYYY-MM-DD'
  heroImage: string | null;  // '/glossary/kenzen-ten/hero.webp' or null
  related: string[];         // 用語 slug の配列
  areas: string[];           // エリア slug の配列（末尾チップの並び順）
  faq: GlossaryFaq[];
};

export type ParsedGlossary = { meta: GlossaryMeta; body: string };

// ── frontmatter の読み取り ────────────────────────────────────────────────

type RawValue = string | string[] | boolean | GlossaryFaq[];

function fail(fileSlug: string, reason: string): never {
  throw new Error(`glossary ${fileSlug}: ${reason}`);
}

/** 「[a, b, c]」→ ['a','b','c']。「[]」→ []。 */
function parseArray(v: string): string[] {
  const inner = v.trim().slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

/** 「key: value」の1行を [key, value] に。key は英字・数字・_ だけ。該当しなければ null。 */
function splitKeyValue(line: string): [string, string] | null {
  const m = /^([A-Za-z_][A-Za-z0-9_]*):(?:\s+(.*))?$/.exec(line);
  if (!m) return null;
  return [m[1], (m[2] ?? '').trim()];
}

function parseFrontmatterLines(lines: string[], fileSlug: string): Record<string, RawValue> {
  const out: Record<string, RawValue> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i += 1; continue; }
    if (/^\s/.test(line)) fail(fileSlug, `frontmatter ${i + 1}行目がインデントで始まっている（faq の外に字下げ行）`);
    const kv = splitKeyValue(line);
    if (!kv) fail(fileSlug, `frontmatter ${i + 1}行目を読めない: ${line}`);
    const [key, value] = kv;
    if (key in out) fail(fileSlug, `frontmatter の ${key} が2回ある`);

    if (key === 'faq') {
      if (value !== '') fail(fileSlug, 'faq: の同じ行に値を書かない（次の行から - q: / a:）');
      const faq: GlossaryFaq[] = [];
      i += 1;
      while (i < lines.length && /^\s/.test(lines[i])) {
        const qm = /^\s*-\s+q:\s*(.*)$/.exec(lines[i]);
        if (!qm) fail(fileSlug, `faq ${faq.length + 1}件目は「  - q: 質問」で始める（${i + 1}行目）`);
        const q = qm[1].trim();
        i += 1;
        const am = i < lines.length ? /^\s+a:\s*(.*)$/.exec(lines[i]) : null;
        if (!am) fail(fileSlug, `faq ${faq.length + 1}件目に「    a: 答え」が無い`);
        const a = am[1].trim();
        if (!q) fail(fileSlug, `faq ${faq.length + 1}件目の q が空`);
        if (!a) fail(fileSlug, `faq ${faq.length + 1}件目の a が空`);
        faq.push({ q, a });
        i += 1;
      }
      out.faq = faq;
      continue;
    }

    if (value.startsWith('[')) {
      if (!value.endsWith(']')) fail(fileSlug, `${key} の配列が ] で閉じていない`);
      out[key] = parseArray(value);
    } else if (value === 'true' || value === 'false') {
      out[key] = value === 'true';
    } else {
      out[key] = value;
    }
    i += 1;
  }
  return out;
}

function str(raw: Record<string, RawValue>, key: string, fileSlug: string, required: boolean): string {
  const v = raw[key];
  if (v === undefined || v === '') {
    if (required) fail(fileSlug, `frontmatter に ${key} が無い`);
    return '';
  }
  if (typeof v !== 'string') fail(fileSlug, `${key} は文字列で書く`);
  return v;
}

function arr(raw: Record<string, RawValue>, key: string, fileSlug: string): string[] {
  const v = raw[key];
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) fail(fileSlug, `${key} は [a, b] の形で書く`);
  return v as string[];
}

function bool(raw: Record<string, RawValue>, key: string, fileSlug: string): boolean {
  const v = raw[key];
  if (v === undefined) return false;
  if (typeof v !== 'boolean') fail(fileSlug, `${key} は true か false`);
  return v;
}

const HIRAGANA_RE = /^[ぁ-ゖー]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 1語ファイルの全文を meta と body に分ける。
 * ★ 失敗は throw（理由は日本語で1行・先頭に「glossary <slug>:」）。
 */
export function parseGlossaryFile(raw: string, fileSlug: string): ParsedGlossary {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') fail(fileSlug, '先頭が --- で始まっていない（frontmatter が無い）');
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end < 0) fail(fileSlug, 'frontmatter が --- で閉じていない');

  const meta = parseFrontmatterLines(lines.slice(1, end), fileSlug);
  const body = lines.slice(end + 1).join('\n').replace(/^\n+/, '').replace(/\s+$/, '') + '\n';

  const term = str(meta, 'term', fileSlug, true);
  const reading = str(meta, 'reading', fileSlug, true);
  const slug = str(meta, 'slug', fileSlug, true);
  const category = str(meta, 'category', fileSlug, true);
  const summary = str(meta, 'summary', fileSlug, true);
  const description = str(meta, 'description', fileSlug, true);
  const publishedAt = str(meta, 'publishedAt', fileSlug, true);
  const heroImage = str(meta, 'heroImage', fileSlug, false);

  if (slug !== fileSlug) fail(fileSlug, `slug（${slug}）がファイル名（${fileSlug}）と違う`);
  if (!(GLOSSARY_CATEGORY_ORDER as readonly string[]).includes(category)) fail(fileSlug, `category が未知: ${category}`);
  if (!DATE_RE.test(publishedAt)) fail(fileSlug, `publishedAt は YYYY-MM-DD で書く: ${publishedAt}`);
  if (!HIRAGANA_RE.test(reading)) fail(fileSlug, `reading はひらがなだけで書く: ${reading}`);
  if (description.length > GLOSSARY_DESCRIPTION_MAX) fail(fileSlug, `description が ${GLOSSARY_DESCRIPTION_MAX} 字を超えている（${description.length} 字）`);
  if (heroImage && !heroImage.startsWith('/')) fail(fileSlug, 'heroImage は / から始まるパスで書く');

  const faqRaw = meta.faq;
  const faq: GlossaryFaq[] = faqRaw === undefined ? [] : (faqRaw as GlossaryFaq[]);

  return {
    meta: {
      term,
      reading,
      slug,
      category: category as GlossaryCategory,
      major: bool(meta, 'major', fileSlug),
      summary,
      description,
      publishedAt,
      heroImage: heroImage || null,
      related: arr(meta, 'related', fileSlug),
      areas: arr(meta, 'areas', fileSlug),
      faq,
    },
    body,
  };
}

// ── 本文の画像の間引き ────────────────────────────────────────────────────

// 行全体が1枚の画像（![alt](/path)）のときだけ対象にする。行内の文章に混ざった画像は触らない。
const IMAGE_LINE_RE = /^\s*!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/;

/**
 * 本文中の画像行のうち、exists(publicPath) が false のものを行ごと落とす。
 * ★ 画像は /public 配下のパス（/glossary/...）だけを確かめる。https:// などの外部URLは exists を呼ばず残す。
 * ★ 画像以外の行は1文字も変えない。★ 落とした跡の連続する空行は1つにまとめる。
 */
export function stripMissingImages(body: string, exists: (publicPath: string) => boolean): string {
  const out: string[] = [];
  let dropped = false;
  for (const line of body.split('\n')) {
    const m = IMAGE_LINE_RE.exec(line);
    if (m && m[1].startsWith('/') && !exists(m[1])) {
      dropped = true;
      continue;
    }
    if (dropped && line.trim() === '' && out.length > 0 && out[out.length - 1].trim() === '') {
      // 画像を落とした直後の空行は、前の空行とまとめる
      continue;
    }
    dropped = false;
    out.push(line);
  }
  return out.join('\n');
}

// ── 関連語 ────────────────────────────────────────────────────────────────

/** related のうち existingSlugs にある slug だけを元の順で返す。自分自身と重複は除く。 */
export function resolveRelated(self: string, related: string[], existingSlugs: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const s of related) {
    if (s === self) continue;
    if (!existingSlugs.has(s)) continue;
    if (out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

// ── 五十音 ────────────────────────────────────────────────────────────────

export const KANA_ROWS = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ'] as const;
export const KANA_ROW_OTHER = 'その他';

const KANA_ROW_OF: Record<string, string> = {};
(() => {
  const groups: [string, string][] = [
    ['あ', 'あいうえおぁぃぅぇぉ'],
    ['か', 'かきくけこがぎぐげごゕゖ'],
    ['さ', 'さしすせそざじずぜぞ'],
    ['た', 'たちつてとだぢづでどっ'],
    ['な', 'なにぬねの'],
    ['は', 'はひふへほばびぶべぼぱぴぷぺぽ'],
    ['ま', 'まみむめも'],
    ['や', 'やゆよゃゅょ'],
    ['ら', 'らりるれろ'],
    ['わ', 'わゐゑをんゎ'],
  ];
  for (const [row, chars] of groups) {
    for (const c of chars) KANA_ROW_OF[c] = row;
  }
})();

/** 読みの1文字目から五十音の行を返す。濁音・半濁音・拗音は清音の行。該当しなければ「その他」。 */
export function kanaRow(reading: string): string {
  const c = reading.trim().charAt(0);
  return KANA_ROW_OF[c] ?? KANA_ROW_OTHER;
}

/** ハブの並び: カテゴリ順 → 読みの順。元の配列は変えない。 */
export function sortForHub(entries: GlossaryMeta[]): GlossaryMeta[] {
  const catIndex = (c: string) => (GLOSSARY_CATEGORY_ORDER as readonly string[]).indexOf(c);
  return [...entries].sort((a, b) => {
    const d = catIndex(a.category) - catIndex(b.category);
    if (d !== 0) return d;
    return a.reading.localeCompare(b.reading, 'ja');
  });
}

/** 五十音順（読みの順）。元の配列は変えない。 */
export function sortByReading(entries: GlossaryMeta[]): GlossaryMeta[] {
  return [...entries].sort((a, b) => a.reading.localeCompare(b.reading, 'ja'));
}
