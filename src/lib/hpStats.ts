// ★ 第1792便（カッキーさん・2026-11-08）: 公式HP（フクエスサイト）のアクセス解析の【決まり】。純粋関数だけ（画面・API・点検で使う）。
//   計測（公式HPの小さなスクリプト）→ /api/hp/track → 表 hp_stats（日 × 切り口 × 値 ごとの数）→ マイページ／コネックエフの解析画面。

export const HP_STAT_EVENTS = ['pv', 'tel', 'line', 'contact'] as const;
export type HpStatEvent = (typeof HP_STAT_EVENTS)[number];

/** 流入元の名前をそろえる（google.co.jp → google、www. を外す など）。★ 計測スクリプトと同じ決まり（点検で両方を確かめる） */
export function normalizeHpSource(raw: string): string {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '(direct)';
  let h = s.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  h = h.replace(/^(www|m|sp|s)\./, '');
  if (!h) return '(direct)';
  if (/(^|\.)google\./.test(h)) return 'google';
  if (/(^|\.)yahoo\./.test(h)) return 'yahoo';
  if (/(^|\.)bing\.com$/.test(h)) return 'bing';
  if (h === 't.co' || /(^|\.)(twitter|x)\.com$/.test(h)) return 'x';
  if (/(^|\.)instagram\.com$/.test(h)) return 'instagram';
  if (/(^|\.)(line\.me|lin\.ee)$/.test(h)) return 'line';
  if (/(^|\.)fukues\.com$/.test(h)) return 'fukues';
  return h.slice(0, 80);
}

/** 流入元の見出し（画面用） */
export function hpSourceLabel(src: string): string {
  const fixed: Record<string, string> = {
    '(direct)': '直接（ブックマーク・アドレス入力など）',
    google: 'Google 検索',
    yahoo: 'Yahoo! 検索',
    bing: 'Bing 検索',
    x: 'X（旧Twitter）',
    instagram: 'Instagram',
    line: 'LINE',
    fukues: 'フクエス',
    'esthe-ranking.jp': '全国エステランキング',
    'estama.jp': 'エステ魂',
    'ranking-deli.jp': '駅ちか',
  };
  return fixed[src] ?? src;
}

/** 検索エンジンか（「検索」「外部サイト」「直接」に分けるとき） */
export function hpSourceKind(src: string): 'search' | 'direct' | 'site' {
  if (src === '(direct)') return 'direct';
  if (['google', 'yahoo', 'bing'].includes(src)) return 'search';
  return 'site';
}

/**
 * ページの道をそろえる。★ /hp/{slug} の頭は外す。★ セラピストは /therapist/{番号} まで。それ以外は最初の1段まで。
 * 例: /hp/oil-quest/therapist/12?x=1 → /therapist/12 ・ /schedule/ → /schedule ・ '' → /
 */
export function normalizeHpPath(raw: string, basePath = ''): string {
  let p = String(raw ?? '').split('?')[0].split('#')[0];
  if (basePath && (p === basePath || p.startsWith(basePath + '/'))) p = p.slice(basePath.length);
  p = p.replace(/^\/hp\/[^/]+/, '');
  const seg = p.split('/').filter(Boolean);
  if (seg.length === 0) return '/';
  if (seg[0] === 'therapist' && seg[1] && /^\d{1,12}$/.test(seg[1])) return `/therapist/${seg[1]}`;
  const s0 = seg[0].replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
  return s0 ? `/${s0.toLowerCase()}` : '/';
}

/** ページの見出し（画面用）。セラピストは名前を別に引く */
export function hpPageLabel(path: string): string {
  const fixed: Record<string, string> = {
    '/': 'トップ',
    '/therapist': 'セラピスト一覧',
    '/schedule': '出勤情報',
    '/system': '料金システム',
    '/news': 'お知らせ',
    '/diary': '写メ日記',
    '/voice': '口コミ',
    '/info': '店舗情報・アクセス',
    '/contact': 'お問い合わせ',
    '/terms': '利用規約',
  };
  return fixed[path] ?? path;
}

/** 日本時間の日付と時（0〜23） */
export function jstDayHour(ms: number): { day: string; hour: number } {
  const d = new Date(ms + 9 * 3600_000);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

/** ボット（検索エンジンの巡回など）か。★ 計測は JavaScript から送るので大半は来ないが、念のため */
export function isBotUA(ua: string): boolean {
  return /bot|crawl|spider|slurp|lighthouse|headless|preview|facebookexternalhit|bingpreview|python|curl|wget|axios|node-fetch/i.test(ua ?? '');
}
