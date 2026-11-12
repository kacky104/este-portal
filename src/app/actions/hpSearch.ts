'use server';

// ★ 第1995便（2026-11-12・カッキーさん）: 公式HP の「検索ワード」（Google Search Console）。
//   ・fukues.com/hp/〇〇 の公式HP … フクエスの Search Console（sc-domain:fukues.com）を、その店のページだけに絞って読む（準備は要らない）
//   ・独自ドメインの公式HP … 「検索ワードを使う」を押すと、フクエスのサービスアカウントで持ち主の確認 → Search Console に登録（lib/gscSiteSetup.ts）
//     登録が済むと、そのドメインの検索ワードも合わせて出す
//   ★ 見られるのは、その店のオーナー様と運営だけ（hpAnalytics と同じ）。
//   ★ Google のデータは 2〜3 日遅れる。数の少ない検索ワードは Google が出さない（個人が分からないように）。

import { revalidatePath } from 'next/cache';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { normalizeHpSiteKey } from '@/app/lib/hpSite';
import { gscQuery, type GscRow } from '@/lib/gsc';
import { gscAddSite, gscGetMetaToken, gscVerify, hpGscSiteUrl } from '@/lib/gscSiteSetup';

type Fail = { ok: false; error: string };
export type HpSearchState = 'no_domain' | 'none' | 'pending' | 'verified' | 'not_ready';
export type HpSearchRow = { query: string; clicks: number; impressions: number; ctr: number; position: number };
export type HpSearchTotals = { clicks: number; impressions: number; ctr: number; position: number };
export type HpSearchData = {
  from: string; to: string;
  rows: HpSearchRow[];
  totals: HpSearchTotals;
  prev: HpSearchTotals;
  /** 独自ドメインの登録の状態（独自ドメインが無ければ no_domain・表がまだなら not_ready） */
  domain: string | null;
  domainState: HpSearchState;
  lastError: string;
  /** 読めなかった所（例: 独自ドメインの分だけ読めなかった） */
  partial: string;
};

async function assertOwner(salonId: number): Promise<{ ok: true; admin: boolean } | Fail> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインしてください' };
  if (user.id === ADMIN_UUID) return { ok: true, admin: true };
  const svc = createServiceClient();
  const { data: s } = await svc.from('salons').select('owner_id').eq('id', salonId).maybeSingle();
  if (!s || (s.owner_id as string | null) !== user.id) return { ok: false, error: 'このお店の解析は見られません' };
  return { ok: true, admin: false };
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tableMissing = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /hp_gsc_sites/.test(e.message ?? ''));

function totalsOf(rows: GscRow[]): HpSearchTotals {
  let clicks = 0, impressions = 0, posW = 0;
  for (const r of rows) { clicks += r.clicks; impressions += r.impressions; posW += r.position * r.impressions; }
  return { clicks, impressions, ctr: impressions > 0 ? clicks / impressions : 0, position: impressions > 0 ? posW / impressions : 0 };
}
/** 2つのサイト（fukues.com/hp と独自ドメイン）の同じ検索ワードを足す。順位は表示回数で重みを付けた平均 */
function mergeByQuery(lists: GscRow[][]): HpSearchRow[] {
  const m = new Map<string, { clicks: number; impressions: number; posW: number }>();
  for (const rows of lists) for (const r of rows) {
    const q = r.keys[0] ?? '';
    const cur = m.get(q) ?? { clicks: 0, impressions: 0, posW: 0 };
    cur.clicks += r.clicks; cur.impressions += r.impressions; cur.posW += r.position * r.impressions;
    m.set(q, cur);
  }
  return [...m.entries()]
    .map(([query, v]) => ({ query, clicks: v.clicks, impressions: v.impressions, ctr: v.impressions > 0 ? v.clicks / v.impressions : 0, position: v.impressions > 0 ? v.posW / v.impressions : 0 }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

export async function getHpSearch(input: { salonId: number; from: string; to: string }): Promise<{ ok: true; data: HpSearchData } | Fail> {
  const salonId = Number(input.salonId);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!Number.isFinite(salonId) || !re.test(input.from) || !re.test(input.to) || input.from > input.to) return { ok: false, error: '期間が正しくありません' };
  const auth = await assertOwner(salonId);
  if (!auth.ok) return auth;
  const svc = createServiceClient();
  const { data: site, error: sErr } = await svc.from('salon_sites').select('slug, domain').eq('salon_id', salonId).maybeSingle();
  if (sErr) return { ok: false, error: '読み込めませんでした。もう一度お試しください' };
  if (!site) return { ok: false, error: '公式HP がまだありません' };
  const slug = String(site.slug ?? '');
  const domain = site.domain ? normalizeHpSiteKey(String(site.domain)) : null;

  let domainState: HpSearchState = domain ? 'none' : 'no_domain';
  let lastError = '';
  if (domain) {
    const { data: g, error: gErr } = await svc.from('hp_gsc_sites').select('domain, state, last_error').eq('salon_id', salonId).maybeSingle();
    if (tableMissing(gErr)) domainState = 'not_ready';
    else if (gErr) return { ok: false, error: '読み込めませんでした。もう一度お試しください' };
    else if (g && String(g.domain) === domain) { domainState = g.state as HpSearchState; lastError = String(g.last_error ?? ''); }
  }

  const len = Math.round((new Date(`${input.to}T00:00:00Z`).getTime() - new Date(`${input.from}T00:00:00Z`).getTime()) / 86400_000) + 1;
  const prevTo = addDays(input.from, -1);
  const prevFrom = addDays(prevTo, -(len - 1));
  const hpFilter = slug ? [{ dimension: 'page' as const, operator: 'includingRegex' as const, expression: `^https://(www\\.)?fukues\\.com/hp/${reEsc(slug)}(/|\\?|$)` }] : [];
  const domainSite = domain && domainState === 'verified' ? hpGscSiteUrl(domain) : null;

  try {
    // ★ 合計は「検索ワードで分けない」問い合わせで取る（数の少ない言葉は行に出ないが、合計には入る）
    const q = (siteUrl: string | undefined, startDate: string, endDate: string, byQuery: boolean, filters = siteUrl ? [] : hpFilter) =>
      gscQuery({ ...(siteUrl ? { siteUrl } : {}), startDate, endDate, dimensions: byQuery ? ['query'] : [], rowLimit: byQuery ? 1000 : 1, filters });
    const none = Promise.resolve([] as GscRow[]);
    const soft = (p: Promise<GscRow[]>) => p.catch(() => null);
    const [fRows, fTot, fPrev, oRows, oTot, oPrev] = await Promise.all([
      slug ? q(undefined, input.from, input.to, true) : none,
      slug ? q(undefined, input.from, input.to, false) : none,
      slug ? q(undefined, prevFrom, prevTo, false) : none,
      domainSite ? soft(q(domainSite, input.from, input.to, true)) : none,
      domainSite ? soft(q(domainSite, input.from, input.to, false)) : none,
      domainSite ? soft(q(domainSite, prevFrom, prevTo, false)) : none,
    ]);
    const partial = oRows === null || oTot === null || oPrev === null ? '独自ドメインの分を読めませんでした（fukues.com の分だけ出しています）' : '';
    const rows = mergeByQuery([fRows, oRows ?? []]);
    return {
      ok: true,
      data: {
        from: input.from, to: input.to,
        rows: rows.slice(0, 200),
        totals: totalsOf([...fTot, ...(oTot ?? [])]),
        prev: totalsOf([...fPrev, ...(oPrev ?? [])]),
        domain, domainState, lastError, partial,
      },
    };
  } catch (e) {
    console.error('[hpSearch]', salonId, e instanceof Error ? e.message : String(e));
    return { ok: false, error: 'Google から検索ワードを読み込めませんでした。しばらくしてから開き直してください' };
  }
}

/**
 * 独自ドメインを Search Console に登録する（「検索ワードを使う」「もう一度確かめる」）。
 * ★ 1回目: 確認用の文字をもらって保存 → 公式HP のトップを作り直させる → 確認 → 登録。
 * ★ 確認が通らなかったら pending（もう一度押せる）。公式HP が公開中（live）で、ドメインがつながっている必要がある。
 */
export async function connectHpSearch(salonId: number): Promise<{ ok: true; state: HpSearchState; error: string } | Fail> {
  const auth = await assertOwner(Number(salonId));
  if (!auth.ok) return auth;
  const svc = createServiceClient();
  const { data: site, error: sErr } = await svc.from('salon_sites').select('domain, status').eq('salon_id', salonId).maybeSingle();
  if (sErr) return { ok: false, error: '読み込めませんでした。もう一度お試しください' };
  if (!site?.domain) return { ok: false, error: '独自ドメインがまだつながっていません' };
  if (site.status !== 'live') return { ok: false, error: '公式HP が公開中のときだけ登録できます' };
  const domain = normalizeHpSiteKey(String(site.domain));
  const siteUrl = hpGscSiteUrl(domain);

  const { data: g, error: gErr } = await svc.from('hp_gsc_sites').select('domain, token, state').eq('salon_id', salonId).maybeSingle();
  if (tableMissing(gErr)) return { ok: false, error: 'この機能は準備中です（運営が設定すると使えます）' };
  if (gErr) return { ok: false, error: '読み込めませんでした。もう一度お試しください' };
  if (g && String(g.domain) === domain && g.state === 'verified') return { ok: true, state: 'verified', error: '' };

  const save = async (row: Record<string, unknown>) => {
    const { error } = await svc.from('hp_gsc_sites').upsert({ salon_id: salonId, domain, updated_at: new Date().toISOString(), ...row });
    if (error) throw new Error(error.message);
  };
  try {
    let token = g && String(g.domain) === domain ? String(g.token ?? '') : '';
    if (!token) {
      const t = await gscGetMetaToken(siteUrl);
      if (!t.ok) { await save({ token: '', state: 'pending', last_error: t.error.slice(0, 500) }); return { ok: true, state: 'pending', error: t.error }; }
      token = t.token;
      await save({ token, state: 'pending', last_error: '' });
      // ★ トップのページを作り直させる（次に Google が見に来たとき meta が出ているように）
      revalidatePath('/hp/[slug]', 'layout');
    }
    const v = await gscVerify(siteUrl);
    if (!v.ok) {
      await save({ token, state: 'pending', last_error: v.error.slice(0, 500) });
      return { ok: true, state: 'pending', error: '確認がまだ通りませんでした。1〜2分おいて「もう一度確かめる」を押してください' };
    }
    const add = await gscAddSite(siteUrl);
    if (!add.ok) {
      await save({ token, state: 'pending', last_error: add.error.slice(0, 500) });
      return { ok: true, state: 'pending', error: 'Search Console への登録でつまずきました。運営にご連絡ください' };
    }
    await save({ token, state: 'verified', last_error: '', verified_at: new Date().toISOString() });
    return { ok: true, state: 'verified', error: '' };
  } catch (e) {
    console.error('[hpSearch] connect', salonId, e instanceof Error ? e.message : String(e));
    return { ok: false, error: '登録できませんでした。しばらくしてからもう一度お試しください' };
  }
}
