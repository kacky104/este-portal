// フクエスCRM（fukuescrm.com）の振り分け（第631便・2026-09-21・カッキーさん）。
// ★ 純粋関数だけ。★ proxy.ts と画面の両方から使う（★ 判断を1か所にする）。conecfHost.ts と同じ形。
//
// ★★ 形
//   https://fukuescrm.com/            → /mypage/crm            （rewrite・URL は変えない）
//   https://fukuescrm.com/customers   → /mypage/crm/customers
//   https://fukuescrm.com/login       → /crm/login             （CRM 専用ログイン）
//   https://fukuescrm.com/terms・/data → /crm/terms・/crm/data
//   https://fukues.com/mypage/crm/... → https://fukuescrm.com/...（308）★ CRM_REDIRECT_FROM_FUKUES が true のときだけ
//     ★ 入口を fukuescrm.com の1つにする（カッキーさんの決定）。★ ドメインがつながるまでは false のまま（先に true にすると CRM が開けなくなる）。
//   *.vercel.app / localhost の /mypage/crm/... → そのまま（★ プレビューでの確認用）
//
// ★ /_next /api /auth は rewrite しない（★ 認証のコールバックと Server Action を本体のまま動かす）。
// ★ 来店時の同意書（fukues.com/g/…）はお客様が開くページなので fukues.com のまま（ここでは扱わない）。

/** CRM として扱うホスト（www は normalizeCrmHost で落としてから比べる） */
export const CRM_HOSTS: readonly string[] = ['fukuescrm.com'];

/** アプリ内の置き場所 */
export const CRM_PATH_PREFIX = '/mypage/crm';

/** 正式なアドレス */
export const CRM_ORIGIN = 'https://fukuescrm.com';

/** フクエス本体（予約ボードなどへ戻るリンク用） */
export const FUKUES_ORIGIN = 'https://fukues.com';

/** ★★ fukues.com/mypage/crm を fukuescrm.com へ送るか。★ ドメインの接続を確かめてから true にする */
export const CRM_REDIRECT_FROM_FUKUES = false;

/** rewrite しない道 */
export const CRM_PASS_PREFIXES: readonly string[] = ['/_next', '/api', '/auth'];

/** CRM ドメインの短いパス → アプリ内の置き場所（/mypage/crm の外にあるもの） */
const CRM_SPECIAL: Readonly<Record<string, string>> = {
  '/login': '/crm/login',
  '/terms': '/crm/terms',
  '/data': '/crm/data',
};

/** フクエス本番のホスト。★ ここで /mypage/crm を開かれたら fukuescrm.com へ送る */
const FUKUES_PROD_HOSTS: readonly string[] = ['fukues.com'];

export function normalizeCrmHost(raw: string | null | undefined): string {
  const h = (raw ?? '').toLowerCase().split(':')[0].trim();
  return h.startsWith('www.') ? h.slice(4) : h;
}

export function isCrmHost(raw: string | null | undefined): boolean {
  const h = normalizeCrmHost(raw);
  return h !== '' && CRM_HOSTS.includes(h);
}

function startsWithSeg(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/');
}

export type CrmRoute =
  | { kind: 'none' }
  | { kind: 'rewrite'; pathname: string }
  | { kind: 'redirect'; url: string };

/**
 * ★ proxy が使う判定。
 * @param redirectFromFukues  既定は CRM_REDIRECT_FROM_FUKUES（自己点検で両方を試すために引数にしてある）
 */
export function decideCrmRoute(
  host: string | null | undefined,
  path: string,
  search = '',
  redirectFromFukues: boolean = CRM_REDIRECT_FROM_FUKUES,
): CrmRoute {
  const h = normalizeCrmHost(host);
  const p = path || '/';

  if (isCrmHost(h)) {
    if (CRM_PASS_PREFIXES.some((x) => startsWithSeg(p, x))) return { kind: 'none' };
    const special = CRM_SPECIAL[p.replace(/\/+$/, '') || '/'];
    if (special) return { kind: 'rewrite', pathname: special };
    // ★ すでに /mypage/crm や /crm が付いていたら二重に付けない
    if (startsWithSeg(p, CRM_PATH_PREFIX) || startsWithSeg(p, '/crm')) return { kind: 'rewrite', pathname: p };
    return { kind: 'rewrite', pathname: p === '/' ? CRM_PATH_PREFIX : CRM_PATH_PREFIX + p };
  }

  if (redirectFromFukues && FUKUES_PROD_HOSTS.includes(h) && startsWithSeg(p, CRM_PATH_PREFIX)) {
    const rest = p.slice(CRM_PATH_PREFIX.length) || '/';
    return { kind: 'redirect', url: CRM_ORIGIN + rest + (search || '') };
  }

  return { kind: 'none' };
}

/** 画面のリンクの頭。★ fukuescrm.com なら ''、それ以外（fukues.com・プレビュー）なら '/mypage/crm' */
export function crmBaseFor(host: string | null | undefined): string {
  return isCrmHost(host) ? '' : CRM_PATH_PREFIX;
}

/** base と画面内のパス（'/' '/customers' …）からリンク先を作る */
export function crmHref(base: string, path: string): string {
  const p = path.startsWith('/') ? path : '/' + path;
  if (base === '') return p;
  return p === '/' ? base : base + p;
}

/** ログイン画面・規約のリンク（CRM ドメインなら短いパス、それ以外は本体のパス） */
export function crmSpecialHref(base: string, key: 'login' | 'terms' | 'data'): string {
  if (base === '') return '/' + key;
  return key === 'login' ? '/owner/login?redirectTo=%2Fmypage%2Fcrm' : '/crm/' + key;
}

/** 予約ボードなどフクエス本体へのリンク（CRM ドメインでは fukues.com へ飛ぶ） */
export function fukuesHref(base: string, path: string): string {
  return base === '' ? FUKUES_ORIGIN + path : path;
}
