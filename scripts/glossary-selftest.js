// メンズエステ用語集の1語ファイル読み取り（src/lib/glossaryParse.ts）の自己点検（第349便）。
//
// ★★★ なぜ要るか
//   用語集は DB を使わず、1語＝1ファイル（src/content/glossary/<slug>.md）をビルド時に読む。
//   frontmatter の読み取りが1つ緩むと「壊れた語が本番に出る」「画像が無いのに壊れた画像が並ぶ」
//   「未公開の関連語へ 404 リンクが出る」が【静かに】起きる。★ ここで全部止める。
//
//   使い方:  npm run check:glossary

const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'glossaryParse.js'));

let fail = 0;
let count = 0;
const eq = (name, got, want) => {
  count += 1;
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};
const throws = (name, fn, includes) => {
  count += 1;
  try {
    fn();
    console.log('NG ' + name + '\n   got  （throw しなかった）'); fail++;
  } catch (e) {
    const msg = String(e && e.message);
    if (includes && !msg.includes(includes)) { console.log('NG ' + name + '\n   got  ' + msg + '\n   want 含む: ' + includes); fail++; }
    else console.log('ok ' + name + '  … ' + msg);
  }
};

const FM = (extra) => [
  '---',
  'term: 健全店',
  'reading: けんぜんてん',
  'slug: kenzen-ten',
  'category: gyotai',
  'summary: 法令とお店のルールを守るメンズエステのこと。',
  'description: 健全店とは、法令と自店のルールを守るメンズエステのこと。',
  'publishedAt: 2026-09-14',
  ...(extra || []),
  '---',
  '',
  'リード文。',
  '',
  '## 健全店の意味',
  '',
  '本文。',
].join('\n');

// ── 1 正常系 ──
{
  const r = m.parseGlossaryFile(FM(), 'kenzen-ten');
  eq('1 正常な frontmatter → 必須項目が取れる',
    [r.meta.term, r.meta.reading, r.meta.slug, r.meta.category, r.meta.summary, r.meta.publishedAt],
    ['健全店', 'けんぜんてん', 'kenzen-ten', 'gyotai', '法令とお店のルールを守るメンズエステのこと。', '2026-09-14']);
  eq('1b heroImage 省略 → null', r.meta.heroImage, null);
}

// ── 2 major ──
eq('2 major 省略 → false', m.parseGlossaryFile(FM(), 'kenzen-ten').meta.major, false);
eq('2b major: true → true', m.parseGlossaryFile(FM(['major: true']), 'kenzen-ten').meta.major, true);

// ── 3 配列 ──
eq('3 related: [a, b, c]', m.parseGlossaryFile(FM(['related: [mens-esthe, sejutsu-hani, kuchikomi]']), 'kenzen-ten').meta.related, ['mens-esthe', 'sejutsu-hani', 'kuchikomi']);
eq('3b related: [] → []', m.parseGlossaryFile(FM(['related: []']), 'kenzen-ten').meta.related, []);
eq('3c related 省略 → []', m.parseGlossaryFile(FM(), 'kenzen-ten').meta.related, []);

// ── 4 faq ──
{
  const r = m.parseGlossaryFile(FM([
    'faq:',
    '  - q: 初めてでも大丈夫ですか？',
    '    a: はい。事前に公開されています。',
    '  - q: 二つ目の質問',
    '    a: 二つ目の答え: コロン入り',
    'areas: [nakasu-tenjin]',
  ]), 'kenzen-ten');
  eq('4 faq 2件 → q/a が2組', r.meta.faq, [
    { q: '初めてでも大丈夫ですか？', a: 'はい。事前に公開されています。' },
    { q: '二つ目の質問', a: '二つ目の答え: コロン入り' },
  ]);
  eq('4b faq の後ろの key も読める', r.meta.areas, ['nakasu-tenjin']);
}
eq('4c faq 省略 → []', m.parseGlossaryFile(FM(), 'kenzen-ten').meta.faq, []);

// ── 5 本文 ──
eq('5 本文は閉じ --- の次から。先頭の空行は落ちる', m.parseGlossaryFile(FM(), 'kenzen-ten').body, 'リード文。\n\n## 健全店の意味\n\n本文。\n');

// ── 6 値の中の「: 」 ──
eq('6 description に「: 」→ 1つ目で切れて残りは値',
  m.parseGlossaryFile(FM(['heroImage: /glossary/kenzen-ten/hero.webp']).replace('description: 健全店とは、法令と自店のルールを守るメンズエステのこと。', 'description: 健全店とは: 法令を守る店: のこと'), 'kenzen-ten').meta.description,
  '健全店とは: 法令を守る店: のこと');

// ── 7〜13 throw ──
throws('7 slug がファイル名と違う → throw', () => m.parseGlossaryFile(FM(), 'other-slug'), 'kenzen-ten');
throws('8 category が未知 → throw', () => m.parseGlossaryFile(FM().replace('category: gyotai', 'category: unknown'), 'kenzen-ten'), 'category');
throws('9 publishedAt が 2026/09/14 → throw', () => m.parseGlossaryFile(FM().replace('publishedAt: 2026-09-14', 'publishedAt: 2026/09/14'), 'kenzen-ten'), 'publishedAt');
throws('10 reading に漢字 → throw', () => m.parseGlossaryFile(FM().replace('reading: けんぜんてん', 'reading: 健全てん'), 'kenzen-ten'), 'reading');
eq('10b reading に長音 → ok', m.parseGlossaryFile(FM().replace('reading: けんぜんてん', 'reading: あろまおいるとりーとめんと'), 'kenzen-ten').meta.reading, 'あろまおいるとりーとめんと');
throws('11 faq の a が空 → throw', () => m.parseGlossaryFile(FM(['faq:', '  - q: 質問', '    a: ']), 'kenzen-ten'), 'a が空');
throws('12 description 161字 → throw', () => m.parseGlossaryFile(FM().replace('description: 健全店とは、法令と自店のルールを守るメンズエステのこと。', 'description: ' + 'あ'.repeat(161)), 'kenzen-ten'), 'description');
eq('12b description 120字 → ok', m.parseGlossaryFile(FM().replace('description: 健全店とは、法令と自店のルールを守るメンズエステのこと。', 'description: ' + 'あ'.repeat(120)), 'kenzen-ten').meta.description.length, 120);
throws('13 frontmatter が閉じていない → throw', () => m.parseGlossaryFile(FM().replace('\n---\n\nリード文。', '\n\nリード文。'), 'kenzen-ten'), '閉じていない');
throws('13b 必須の term が無い → throw', () => m.parseGlossaryFile(FM().replace('term: 健全店\n', ''), 'kenzen-ten'), 'term');
throws('13c 同じ key が2回 → throw', () => m.parseGlossaryFile(FM(['major: true', 'major: false']), 'kenzen-ten'), '2回');

// ── 14〜17 stripMissingImages ──
const BODY = [
  '段落1。',
  '',
  '![図1](/glossary/kenzen-ten/01-a.webp)',
  '',
  '段落2。',
  '',
  '![図2](/glossary/kenzen-ten/02-b.webp)',
  '',
  '段落3。',
].join('\n');
eq('14 全部ある → 1文字も変わらない', m.stripMissingImages(BODY, () => true), BODY);
eq('15 1枚無い → その行だけ消え、空行が1つにまとまる',
  m.stripMissingImages(BODY, (p) => p !== '/glossary/kenzen-ten/02-b.webp'),
  ['段落1。', '', '![図1](/glossary/kenzen-ten/01-a.webp)', '', '段落2。', '', '段落3。'].join('\n'));
eq('15b 全部無い → 画像行が全部消える', m.stripMissingImages(BODY, () => false), ['段落1。', '', '段落2。', '', '段落3。'].join('\n'));
eq('16 画像の無い本文 → そのまま', m.stripMissingImages('段落。\n\n## 見出し\n\n本文。', () => false), '段落。\n\n## 見出し\n\n本文。');
{
  const calls = [];
  const out = m.stripMissingImages('![外部](https://example.com/x.png)\n\n文。', (p) => { calls.push(p); return false; });
  eq('17 外部URLの画像 → exists を呼ばず残す', [out, calls], ['![外部](https://example.com/x.png)\n\n文。', []]);
}

// ── 18 resolveRelated ──
eq('18 存在する slug だけ・元の順・自分自身は除く・重複は1つ',
  m.resolveRelated('kenzen-ten', ['mens-esthe', 'kenzen-ten', 'sejutsu-hani', 'nai', 'mens-esthe'], new Set(['kenzen-ten', 'mens-esthe', 'sejutsu-hani'])),
  ['mens-esthe', 'sejutsu-hani']);
eq('18b 何も無ければ []', m.resolveRelated('kenzen-ten', ['a', 'b'], new Set(['kenzen-ten'])), []);

// ── 19 kanaRow ──
eq('19 け→か', m.kanaRow('けんぜんてん'), 'か');
eq('19b ぱ→は', m.kanaRow('ぱんつ'), 'は');
eq('19c ゃ→や', m.kanaRow('ゃ'), 'や');
eq('19d ー始まり→その他', m.kanaRow('ーあ'), 'その他');
eq('19e 空→その他', m.kanaRow(''), 'その他');
eq('19f あ→あ', m.kanaRow('あろま'), 'あ');
eq('19g を→わ', m.kanaRow('を'), 'わ');
eq('19h ん→わ', m.kanaRow('ん'), 'わ');

// ── 20 sortForHub ──
{
  const e = (slug, category, reading) => ({ term: slug, reading, slug, category, major: false, summary: '', description: '', publishedAt: '2026-09-14', heroImage: null, related: [], areas: [], faq: [] });
  const list = [e('c', 'ryokin', 'しめい'), e('a', 'gyotai', 'めんずえすて'), e('b', 'gyotai', 'けんぜんてん'), e('d', 'sejutsu', 'あろま')];
  eq('20 カテゴリ順 → 読みの順', m.sortForHub(list).map((x) => x.slug), ['b', 'a', 'd', 'c']);
  eq('20b 元の配列は変わらない', list.map((x) => x.slug), ['c', 'a', 'b', 'd']);
  eq('20c sortByReading は読みだけ', m.sortByReading(list).map((x) => x.slug), ['d', 'b', 'c', 'a']);
}

// ── 定数 ──
eq('カテゴリは6つ・順番固定', m.GLOSSARY_CATEGORY_ORDER, ['gyotai', 'sejutsu', 'ryokin', 'therapist', 'manner', 'fukues']);
eq('カテゴリのラベルが全部ある', Object.keys(m.GLOSSARY_CATEGORIES).length, 6);

if (fail) { console.log('\n★ ' + fail + ' 件 NG'); process.exit(1); }
console.log('\n★ すべて通った（' + count + ' 本）');
