/**
 * 公式HP紹介ページ（/hp/templates）とデザイン一覧（/hp/templates/designs）の回帰チェック。
 * 2026-08-15 作成（第14〜15便）。
 *
 * この2ページは「見出しも本文も画像に焼き込み、文章は sr-only で HTML に残す」という
 * 特殊な作り方をしている。目で見ただけでは
 *   ・画像とテキストの数字がズレた（16パターン／165,000円 など）
 *   ・canonical が抜けて layout.tsx の { canonical: '/' } を継承した
 *   ・width/height を書き忘れて読み込み中にガタつく
 *   ・全部 eager になって初回転送量が膨らんだ
 * といった事故に気づけないので、実際にブラウザで描画して測る。
 *
 * ── 使い方 ──────────────────────────────────────────
 *   1) 別のターミナルで dev server を起動   npm run dev
 *   2) 初回だけ                              npm i -D playwright-core
 *      （ブラウザ本体は Windows なら既存の Chrome を使うので追加DL不要）
 *   3) 実行                                  node tools-verify-hp.mjs
 *
 *   環境変数（すべて任意）:
 *     BASE_URL     … 既定 http://localhost:3000。本番を見るなら https://fukues.com
 *     PW_CHROMIUM  … Chromium/Chrome の実行ファイルパスを直接指定したいとき
 *     PW_CHANNEL   … 'chrome' | 'msedge' など。既定は chrome →（無ければ）既定の Chromium
 *
 * ── 直し方 ──────────────────────────────────────────
 * 画像を差し替えたら EXPECT の寸法を直す。文言を変えたら SR_MUST を直す。
 * ★ここを直さずにテストだけ通す、は禁止。数字がズレていないことを見張るのがこのスクリプトの仕事。
 *
 * 終了コード: 0=全部PASS / 1=FAILあり / 2=準備不足（playwright-core が無い等）
 */

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const LP = `${BASE}/hp/templates`;
const DESIGNS = `${BASE}/hp/templates/designs`;

// ページ背景（globals ではなく page.tsx にベタ書きしてある色）。継ぎ目の判定に使う。
const PAGE_BG = [253, 245, 245]; // #fdf5f5

// 掲載パターン数。src/app/lib/hpSite.ts の定義から数えた値と一致していること。
// ★ カラーを増減したら、この数字とキービジュアル画像（strengths / design / flow）の両方を直す。
const PATTERN_COUNT = 16;

// 継ぎ目の許容値（画像の端の平均色とページ背景の差・チャンネル最大）。
// 2026-08-15 時点の実測は上端 5〜18・下端 4〜37。40 を超えると実機で線が見え始める。
const SEAM_LIMIT = 45;

/**
 * LP に並ぶ全幅画像。上から出てくる順。
 *   pc / sp        … <img src> と <source srcSet> のパス
 *   pcWH / spWH    … width/height 属性の期待値（<source> にも入れること。片方だけだと
 *                    PCとスマホで比率が違うぶんスマホ側の予約サイズがずれて結局ガタつく）
 *   eager          … 最初の画面に入る画像だけ true。それ以外は loading="lazy"
 *   alt            … 装飾扱いは ''。リンクになっている画像だけリンク名を入れる
 */
const BLOCKS = [
  { key: 'hero', pc: '/hp-lp/hero-pc.webp', sp: '/hp-lp/hero-sp.webp', pcWH: [1983, 793], spWH: [864, 1821], eager: true, alt: '' },
  { key: 'btn-hero', pc: '/hp-lp/btn-design-pc.webp', sp: '/hp-lp/btn-design-sp.webp', pcWH: [1564, 413], spWH: [900, 276], eager: true, alt: 'デザインを見る', fullWidth: false },
  { key: 'problem', pc: '/hp-lp/problem-pc.webp', sp: '/hp-lp/problem-sp.webp', pcWH: [1672, 941], spWH: [1024, 1536], eager: false, alt: '' },
  { key: 'solution', pc: '/hp-lp/solution-pc.webp', sp: '/hp-lp/solution-sp.webp', pcWH: [1672, 941], spWH: [864, 1821], eager: false, alt: '' },
  { key: 'strengths', pc: '/hp-lp/strengths-pc.webp', sp: '/hp-lp/strengths-sp.webp', pcWH: [1672, 941], spWH: [863, 1822], eager: false, alt: '' },
  { key: 'design', pc: '/hp-lp/design-pc.webp', sp: '/hp-lp/design-sp.webp', pcWH: [1717, 916], spWH: [862, 1935], eager: false, alt: '' },
  { key: 'price', pc: '/hp-lp/price-pc.webp', sp: '/hp-lp/price-sp.webp', pcWH: [1717, 916], spWH: [864, 1821], eager: false, alt: '' },
  { key: 'flow', pc: '/hp-lp/flow-pc.webp', sp: '/hp-lp/flow-sp.webp', pcWH: [1717, 916], spWH: [864, 1820], eager: false, alt: '' },
];

// ボタンは同じ画像を2か所で使う（ヒーロー直下・DESIGN LINEUP 直下）ので、出現回数の期待値だけ別で持つ。
const BTN_COUNT = 2;

/**
 * sr-only に必ず入っていてほしい文字列。画像に焼き込まれた文言と揃っていることの確認。
 * ★ 画像を作り直して文言が変わったら、ここも一緒に直す（危険地帯25）。
 */
const SR_MUST = [
  'メンズエステ専門の公式ホームページ制作',
  'こんなお悩みはありませんか？',
  'フクエスの掲載データが、そのまま公式ホームページに。',
  'フクエスの公式ホームページ制作の強み',
  `選べるデザイン${PATTERN_COUNT}種`,
  `選べるデザイン 全${PATTERN_COUNT}パターン`,
  '料金プラン',
  '表示はすべて税込です',
  '165,000円',
  '11,000円/月',
  '11,000円/年',
  'フクエス掲載店さま限定の特別優待',
  '年間 11,000円',
  '制作の流れ',
  'お申し込み',
  'デザインを決める',
  '運営が制作',
  'ご確認・公開',
  '公開後の更新',
];

// 可視テキストで残さなければいけない取引条件（画像にも sr-only にも入れていない部分）。
const VISIBLE_MUST = ['3,300円', '独自ドメインのメールアドレスは対象外'];

// LP の見出し。順番まで含めて固定（h1 は1本だけ・h2 から始まらないこと）。
const LP_HEADINGS = [
  'H1:メンズエステ専門の公式ホームページ制作',
  'H2:こんなお悩みはありませんか？',
  'H2:フクエスの掲載データが、そのまま公式ホームページに。',
  'H2:フクエスの公式ホームページ制作の強み',
  `H2:選べるデザイン 全${PATTERN_COUNT}パターン`,
  'H2:料金プラン',
  'H3:フクエス掲載店さま限定の特別優待',
  'H2:制作の流れ',
];

// ── ここから下は基本いじらない ─────────────────────────

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('playwright-core がありません。  npm i -D playwright-core  を実行してください。');
  process.exit(2);
}

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  if (!cond) console.log(`  FAIL  ${name}${detail ? '  → ' + detail : ''}`);
};
const note = (msg) => console.log(`  note  ${msg}`);

async function launch() {
  const opts = { args: ['--no-sandbox'] };
  if (process.env.PW_CHROMIUM) return chromium.launch({ ...opts, executablePath: process.env.PW_CHROMIUM });
  // クラウドのサンドボックスに置いてある Chromium（あれば優先）
  try {
    const { existsSync } = await import('node:fs');
    if (existsSync('/opt/pw-browsers/chromium')) return chromium.launch({ ...opts, executablePath: '/opt/pw-browsers/chromium' });
  } catch {
    /* node:fs が使えない環境は素通り */
  }
  // Windows / macOS は既存の Chrome を借りる（ブラウザの追加ダウンロードが要らない）
  for (const channel of [process.env.PW_CHANNEL, 'chrome', 'msedge'].filter(Boolean)) {
    try {
      return await chromium.launch({ ...opts, channel });
    } catch {
      /* 次の候補へ */
    }
  }
  return chromium.launch(opts);
}

/** lazy 画像を読み込ませるため、いちど下まで流してから上に戻る。
 *  ★ これをやらないと currentSrc が空のままで、要素を掴み損ねる（第14便で実際に踏んだ）。 */
async function scrollAll(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
  });
  await page.waitForTimeout(500);
}

async function open(browser, url, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const res = await page.goto(url, { waitUntil: 'networkidle' });
  ok(`${url} が 200`, res && res.status() === 200, res ? String(res.status()) : 'no response');
  await scrollAll(page);
  return { ctx, page };
}

/** ページ共通のSEO項目。 */
async function checkSeo(page, label, expect) {
  const m = await page.evaluate(() => ({
    canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href') ?? null,
    title: document.title,
    desc: document.querySelector('meta[name=description]')?.getAttribute('content') ?? null,
    robots: document.querySelector('meta[name=robots]')?.getAttribute('content') ?? null,
    jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)),
    h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
    headings: [...document.querySelectorAll('h1,h2,h3')].map((h) => h.tagName + ':' + h.textContent.trim()),
    imgs: [...document.querySelectorAll('img')].map((i) => ({
      src: i.getAttribute('src'),
      w: i.getAttribute('width'),
      h: i.getAttribute('height'),
      loading: i.getAttribute('loading'),
      alt: i.getAttribute('alt'),
    })),
    sources: [...document.querySelectorAll('picture source')].map((s) => ({
      srcset: s.getAttribute('srcset'),
      w: s.getAttribute('width'),
      h: s.getAttribute('height'),
    })),
    internal: [...document.querySelectorAll('a')].filter((a) => (a.getAttribute('href') || '').startsWith('/')).length,
    overflow: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
  }));

  // ★ canonical はこのサイトで一番踏みやすい地雷。省くと layout.tsx の '/' を継承する（危険地帯23）
  ok(`[${label}] canonical が ${expect.canonical}`, m.canonical === expect.canonical, String(m.canonical));
  ok(`[${label}] title が空でない`, !!m.title);
  ok(`[${label}] description がある`, !!m.desc);
  ok(`[${label}] description に「${PATTERN_COUNT}パターン」`, !expect.descHasCount || (m.desc ?? '').includes(`${PATTERN_COUNT}パターン`), m.desc ?? '');
  ok(`[${label}] noindex が付いていない`, !(m.robots ?? '').includes('noindex'), m.robots ?? '');
  ok(`[${label}] h1 がちょうど1本`, m.h1.length === 1, `${m.h1.length}本: ${m.h1.join(' / ')}`);
  ok(`[${label}] 構造化データ ${expect.jsonld.join('+')}`, JSON.stringify(m.jsonld.map((x) => x['@type'])) === JSON.stringify(expect.jsonld), m.jsonld.map((x) => x['@type']).join(','));
  ok(`[${label}] width/height 無しの <img> が0枚`, m.imgs.every((i) => i.w && i.h), m.imgs.filter((i) => !i.w || !i.h).map((i) => i.src).join(','));
  ok(`[${label}] width/height 無しの <source> が0枚`, m.sources.every((s) => s.w && s.h), m.sources.filter((s) => !s.w || !s.h).map((s) => s.srcset).join(','));
  ok(`[${label}] 内部リンク ${expect.internal}本`, m.internal === expect.internal, `${m.internal}本`);
  ok(`[${label}] 横スクロールが出ていない`, m.overflow.sw <= m.overflow.cw + 1, JSON.stringify(m.overflow));
  return m;
}

/** 画像の上下端の色とページ背景 #fdf5f5 の差。
 *  全幅で縦に積むので、端の色が違うと横一直線の線に見える（危険地帯26・27）。
 *  ★ PC とスマホでは別の画像が出るので、両方の幅で測ること。 */
async function checkSeams(page, label) {
  const seams = await page.evaluate(async (bgArg) => {
    const out = [];
    for (const el of document.querySelectorAll('img')) {
      const src = el.currentSrc || el.src;
      if (!/\/hp-lp\//.test(src) || /btn-design/.test(src) || !el.naturalWidth) continue;
      const c = document.createElement('canvas');
      c.width = el.naturalWidth;
      c.height = el.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(el, 0, 0);
      const avg = (y) => {
        const d = g.getImageData(0, y, c.width, 1).data;
        let r = 0, gg = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4;
        return [r / n, gg / n, b / n];
      };
      const diff = (a) => Math.max(...a.map((v, i) => Math.abs(v - bgArg[i])));
      out.push({ src: src.split('/').pop(), top: Math.round(diff(avg(0))), bottom: Math.round(diff(avg(c.height - 1))) });
    }
    return out;
  }, PAGE_BG);
  console.log(`  継ぎ目（ページ背景 #fdf5f5 との差・0に近いほど目立たない）`);
  for (const s of seams) console.log(`    ${s.src.padEnd(18)} 上端 ${String(s.top).padStart(3)}  下端 ${String(s.bottom).padStart(3)}`);
  const bad = seams.filter((s) => s.top > SEAM_LIMIT || s.bottom > SEAM_LIMIT);
  ok(`[${label}] 継ぎ目が許容内（各端の色差${SEAM_LIMIT}以下）`, bad.length === 0, bad.map((s) => `${s.src}:上${s.top}/下${s.bottom}`).join(', '));
}

const browser = await launch();

// ══ 1. LP（/hp/templates）══
console.log('\n■ /hp/templates（PC 1440x900）');
{
  const { ctx, page } = await open(browser, LP, { width: 1440, height: 900 });
  const m = await checkSeo(page, 'LP', {
    canonical: 'https://fukues.com/hp/templates',
    descHasCount: true,
    jsonld: ['BreadcrumbList', 'Service'],
    internal: 6,
  });

  ok('[LP] 見出しの並びが想定どおり', m.headings.join('|') === LP_HEADINGS.join('|'), m.headings.join(' | '));

  // 料金の数字は 画像 / sr-only / JSON-LD の3か所にある。JSON-LD と表示のズレは構造化データ違反。
  const svc = m.jsonld.find((x) => x['@type'] === 'Service');
  ok('[LP] JSON-LD の価格が 165000 / 11000 / 11000', JSON.stringify((svc?.offers ?? []).map((o) => o.price)) === JSON.stringify(['165000', '11000', '11000']), JSON.stringify(svc?.offers ?? []));

  // ブロック画像の属性
  for (const b of BLOCKS) {
    const found = m.imgs.filter((i) => i.src === b.pc);
    const want = b.key === 'btn-hero' ? BTN_COUNT : 1;
    ok(`[LP] ${b.key} の <img> が${want}個`, found.length === want, `${found.length}個`);
    for (const i of found) {
      ok(`[LP] ${b.key} の width/height が ${b.pcWH.join('x')}`, i.w === String(b.pcWH[0]) && i.h === String(b.pcWH[1]), `${i.w}x${i.h}`);
      ok(`[LP] ${b.key} の alt が ${JSON.stringify(b.alt)}`, i.alt === b.alt, JSON.stringify(i.alt));
    }
    const src = m.sources.find((s) => s.srcset === b.sp);
    ok(`[LP] ${b.key} の <source> が ${b.sp}`, !!src);
    if (src) ok(`[LP] ${b.key} の <source> の width/height が ${b.spWH.join('x')}`, src.w === String(b.spWH[0]) && src.h === String(b.spWH[1]), `${src.w}x${src.h}`);
  }

  // eager は「最初の画面に入る2枚」だけ。増えると初回転送量がそのまま増える。
  const eager = m.imgs.filter((i) => i.loading !== 'lazy').map((i) => i.src);
  ok('[LP] eager はヒーローと直下ボタンの2枚だけ', JSON.stringify([...new Set(eager)].sort()) === JSON.stringify(['/hp-lp/btn-design-pc.webp', '/hp-lp/hero-pc.webp']), eager.join(','));

  // sr-only / 可視テキスト
  const text = await page.evaluate(() => {
    const root = document.querySelector('div.min-h-screen.bg-\\[\\#fdf5f5\\]') ?? document.body;
    const sr = [...root.querySelectorAll('.sr-only')];
    return {
      // React は {変数} の境目に <!-- --> を挟むので、判定前に取り除く
      srHtml: sr.map((e) => e.innerHTML).join('').replace(/<!--.*?-->/g, ''),
      srLen: sr.map((e) => e.innerText.replace(/\s+/g, '')).join('').length,
      allLen: root.innerText.replace(/\s+/g, '').length,
      visible: root.innerText,
    };
  });
  for (const s of SR_MUST) ok(`[LP] sr-only に「${s}」`, text.srHtml.includes(s));
  for (const v of VISIBLE_MUST) {
    // 可視テキストにも残っていること（sr-only に落としてはいけない取引条件）
    const inVisible = await page.evaluate((needle) => {
      return [...document.querySelectorAll('p,li,span')].some((el) => {
        if (el.closest('.sr-only')) return false;
        if (!el.textContent.includes(needle)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      });
    }, v);
    ok(`[LP] 可視テキストに「${v}」`, inVisible);
  }
  note(`本文量: 可視 ${text.allLen - text.srLen}文字 / sr-only ${text.srLen}文字 / 合計 ${text.allLen}文字`);

  await checkSeams(page, 'LP');

  await ctx.close();
}

// ══ 2. LP（スマホ幅・出し分けの確認）══
console.log('\n■ /hp/templates（SP 390x844）');
{
  const { ctx, page } = await open(browser, LP, { width: 390, height: 844 });
  const cur = await page.evaluate(() => [...document.querySelectorAll('img')].map((i) => ({ src: i.getAttribute('src'), cur: (i.currentSrc || '').split('/').pop(), natural: `${i.naturalWidth}x${i.naturalHeight}`, w: Math.round(i.getBoundingClientRect().width) })));
  for (const b of BLOCKS) {
    const hit = cur.filter((c) => c.src === b.pc);
    const want = b.sp.split('/').pop();
    ok(`[SP] ${b.key} が ${want} に切り替わる`, hit.length > 0 && hit.every((h) => h.cur === want), hit.map((h) => h.cur).join(','));
    ok(`[SP] ${b.key} の原寸が ${b.spWH.join('x')}`, hit.every((h) => h.natural === b.spWH.join('x')), hit.map((h) => h.natural).join(','));
    if (b.fullWidth !== false) ok(`[SP] ${b.key} が全幅(390px)`, hit.every((h) => Math.abs(h.w - 390) < 2), hit.map((h) => h.w).join(','));
  }
  await checkSeams(page, 'SP');
  const of = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok('[SP] 横スクロールが出ていない', of.sw <= of.cw + 1, JSON.stringify(of));
  await ctx.close();
}

// ══ 3. デザイン一覧（/hp/templates/designs）══
console.log('\n■ /hp/templates/designs（PC 1440x900）');
{
  const { ctx, page } = await open(browser, DESIGNS, { width: 1440, height: 900 });
  const m = await checkSeo(page, 'designs', {
    canonical: 'https://fukues.com/hp/templates/designs',
    descHasCount: false,
    jsonld: ['BreadcrumbList'],
    internal: 21,
  });
  ok(`[designs] h1 が「選べるデザイン全${PATTERN_COUNT}パターン」`, m.h1[0] === `選べるデザイン全${PATTERN_COUNT}パターン`, m.h1[0] ?? '');
  ok(`[designs] サムネが${PATTERN_COUNT}枚`, m.imgs.length === PATTERN_COUNT, `${m.imgs.length}枚`);
  ok('[designs] サムネはすべて lazy', m.imgs.every((i) => i.loading === 'lazy'), m.imgs.filter((i) => i.loading !== 'lazy').map((i) => i.src).join(','));
  const demoLinks = await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => (a.getAttribute('href') || '').startsWith('/hp/demo/preview/')).length);
  ok(`[designs] デモへのリンクが${PATTERN_COUNT}本`, demoLinks === PATTERN_COUNT, `${demoLinks}本`);
  ok('[designs] LPへ戻るリンクがある', (await page.locator('a[href="/hp/templates"]').count()) > 0);
  await ctx.close();
}

// ══ 4. sitemap.xml ══
console.log('\n■ sitemap.xml');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const res = await page.goto(`${BASE}/sitemap.xml`, { waitUntil: 'domcontentloaded' });
  ok('sitemap.xml が 200', res && res.status() === 200, res ? String(res.status()) : 'no response');
  const xml = await page.evaluate(() => document.documentElement.textContent || '');
  ok('sitemap に /hp/templates', xml.includes('/hp/templates'));
  ok('sitemap に /hp/templates/designs', xml.includes('/hp/templates/designs'));
  await ctx.close();
}

// ══ 5. 初回転送量 ══
console.log('\n■ 転送量（PC・キャッシュなし）');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const seen = [];
  page.on('response', async (r) => {
    if (!/\/hp-lp\/.*\.webp/.test(r.url())) return;
    const h = await r.allHeaders().catch(() => ({}));
    seen.push({ name: r.url().split('/').pop(), size: Number(h['content-length'] || 0) });
  });
  await page.goto(LP, { waitUntil: 'networkidle' });
  const first = seen.length;
  const firstBytes = seen.reduce((s, x) => s + x.size, 0);
  await scrollAll(page);
  await page.waitForTimeout(800);
  const allBytes = seen.reduce((s, x) => s + x.size, 0);
  note(`初回 ${first}枚 / ${firstBytes.toLocaleString()}B  →  全部 ${seen.length}枚 / ${allBytes.toLocaleString()}B`);
  for (const s of seen) console.log(`    ${s.name.padEnd(20)} ${s.size.toLocaleString()}B`);
  // ※ PROBLEM / SOLUTION はブラウザの先読みでスクロール前に落ちてくる（実測どおり・仕様）。
  //   ここで見たいのは「ページ下部の重い画像まで初回に来ていないか」。
  const LAZY_ONLY = ['strengths-', 'design-pc', 'design-sp', 'price-', 'flow-'];
  const early = seen.slice(0, first).filter((s) => LAZY_ONLY.some((p) => s.name.startsWith(p)));
  ok('[転送] 下部の画像（強み・DESIGN・料金・FLOW）は初回に読まれない', early.length === 0, early.map((s) => s.name).join(','));
  ok('[転送] 初回が 500,000B 以下', firstBytes <= 500000, `${firstBytes.toLocaleString()}B`);
  await ctx.close();
}

await browser.close();

const pass = results.filter((r) => r.pass).length;
console.log(`\n===== ${pass}/${results.length} PASS =====`);
if (pass !== results.length) {
  console.log('FAIL 一覧:');
  for (const r of results.filter((x) => !x.pass)) console.log(`  ・${r.name}${r.detail ? '  → ' + r.detail : ''}`);
}
process.exit(pass === results.length ? 0 : 1);
