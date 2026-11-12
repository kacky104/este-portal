'use server';

// ★ 第1996便（2026-11-12・カッキーさん）: 公式HP の「性別・年齢」（Google アナリティクス・GA4 プロパティ「フクエス公式HP」）。
//   ・数は Google シグナル（Google にログインして広告のカスタマイズを ON にしている人）から。分からない人は「不明」。
//   ・人数が少ないと Google が行を出さない（しきい値）。そのときは subjectToThresholding が true。
//   ・店ごとの絞り込み: 独自ドメイン（ホスト名）か、fukues.com の /hp/〇〇 のページ。
//   ・読むのはサービスアカウント（gsc-reader@…）。GA4 のプロパティに「閲覧者」で入っている。
//   ★ 見られるのは、その店のオーナー様と運営だけ。

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { normalizeHpSiteKey } from '@/app/lib/hpSite';
import { getGoogleAccessToken } from '@/lib/gsc';
import { HP_GA_PROPERTY_ID } from '@/app/hp/_lib/gaHp';

type Fail = { ok: false; error: string };
export type HpDemoRow = { key: string; label: string; users: number };
export type HpDemographics = {
  gender: HpDemoRow[];
  age: HpDemoRow[];
  /** 期間の人数（GA4 の数・性別が分からない人も入る） */
  users: number;
  /** Google が少ない行を伏せたか */
  thresholded: boolean;
};

async function assertOwner(salonId: number): Promise<{ ok: true } | Fail> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインしてください' };
  if (user.id === ADMIN_UUID) return { ok: true };
  const svc = createServiceClient();
  const { data: s } = await svc.from('salons').select('owner_id').eq('id', salonId).maybeSingle();
  if (!s || (s.owner_id as string | null) !== user.id) return { ok: false, error: 'このお店の解析は見られません' };
  return { ok: true };
}

const GENDER_LABEL: Record<string, string> = { male: '男性', female: '女性', unknown: '不明' };
const AGE_ORDER = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'unknown'];
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type GaReport = {
  rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  metadata?: { subjectToThresholding?: boolean };
};

async function runReport(body: Record<string, unknown>): Promise<GaReport> {
  const token = await getGoogleAccessToken('https://www.googleapis.com/auth/analytics.readonly');
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(HP_GA_PROPERTY_ID)}:runReport`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GA4 Data API に失敗: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as GaReport;
}

export async function getHpDemographics(input: { salonId: number; from: string; to: string }): Promise<{ ok: true; data: HpDemographics } | Fail> {
  const salonId = Number(input.salonId);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!Number.isFinite(salonId) || !re.test(input.from) || !re.test(input.to) || input.from > input.to) return { ok: false, error: '期間が正しくありません' };
  if (!/^\d{5,15}$/.test(HP_GA_PROPERTY_ID)) return { ok: false, error: 'この機能は準備中です（運営が設定すると使えます）' };
  const auth = await assertOwner(salonId);
  if (!auth.ok) return auth;
  const svc = createServiceClient();
  const { data: site, error } = await svc.from('salon_sites').select('slug, domain').eq('salon_id', salonId).maybeSingle();
  if (error) return { ok: false, error: '読み込めませんでした。もう一度お試しください' };
  if (!site) return { ok: false, error: '公式HP がまだありません' };
  const slug = String(site.slug ?? '');
  const domain = site.domain ? normalizeHpSiteKey(String(site.domain)) : '';

  // ★ 店の分だけ: 独自ドメインのホスト名、または fukues.com の /hp/〇〇
  const orFilters: Array<Record<string, unknown>> = [];
  if (domain) orFilters.push({ filter: { fieldName: 'hostName', inListFilter: { values: [domain, `www.${domain}`] } } });
  if (slug) orFilters.push({ andGroup: { expressions: [
    { filter: { fieldName: 'hostName', inListFilter: { values: ['fukues.com', 'www.fukues.com'] } } },
    { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'FULL_REGEXP', value: `/hp/${reEsc(slug)}(/.*)?` } } },
  ] } });
  if (orFilters.length === 0) return { ok: false, error: '公式HP がまだありません' };
  const base = {
    dateRanges: [{ startDate: input.from, endDate: input.to }],
    metrics: [{ name: 'activeUsers' }],
    dimensionFilter: { orGroup: { expressions: orFilters } },
  };
  try {
    const [g, a, t] = await Promise.all([
      runReport({ ...base, dimensions: [{ name: 'userGender' }] }),
      runReport({ ...base, dimensions: [{ name: 'userAgeBracket' }] }),
      runReport({ ...base }),
    ]);
    const rowsOf = (r: GaReport) => (r.rows ?? []).map((x) => ({ key: String(x.dimensionValues?.[0]?.value ?? ''), users: Number(x.metricValues?.[0]?.value ?? 0) || 0 }));
    const gender = rowsOf(g)
      .map((x) => ({ ...x, label: GENDER_LABEL[x.key] ?? x.key }))
      .sort((p, q) => (p.key === 'unknown' ? 1 : q.key === 'unknown' ? -1 : q.users - p.users));
    const age = rowsOf(a)
      .map((x) => ({ ...x, label: x.key === 'unknown' ? '不明' : `${x.key}歳` }))
      .sort((p, q) => AGE_ORDER.indexOf(p.key) - AGE_ORDER.indexOf(q.key));
    const users = Number(t.rows?.[0]?.metricValues?.[0]?.value ?? 0) || 0;
    return { ok: true, data: { gender, age, users, thresholded: Boolean(g.metadata?.subjectToThresholding || a.metadata?.subjectToThresholding) } };
  } catch (e) {
    console.error('[hpDemographics]', salonId, e instanceof Error ? e.message : String(e));
    return { ok: false, error: 'Google アナリティクスから読み込めませんでした。しばらくしてから開き直してください' };
  }
}
