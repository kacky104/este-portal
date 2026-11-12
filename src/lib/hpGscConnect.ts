// ── 公式HP（独自ドメイン）を Search Console に自動で登録する（第1997便・2026-11-12・カッキーさん「最初からオンに」）──
//
// ★ 前（第1995便）は解析の画面の「検索ワードを使う」を押したときだけ登録していた。→ 押さなくても登録する:
//   ・運営が公式HP の設定（独自ドメイン・公開）を保存したあと（hpOperator.ts・after で裏で）
//   ・解析の「検索ワード」を開いたとき（まだなら・前の試しから 10 分たっていれば）
// ★ 流れは lib/gscSiteSetup.ts（確認用の文字 → トップに meta → 確認 → Search Console に足す）。表は hp_gsc_sites（追加SQL_第1995便）。
// ★ サーバー専用（service_role）。画面から直接は呼ばない。

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/app/lib/supabase/service';
import { normalizeHpSiteKey } from '@/app/lib/hpSite';
import { gscAddSite, gscGetMetaToken, gscVerify, hpGscSiteUrl } from './gscSiteSetup';

export type HpGscState = 'no_domain' | 'none' | 'pending' | 'verified' | 'not_ready' | 'not_live';
const RETRY_MS = 10 * 60_000;

const tableMissing = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /hp_gsc_sites/.test(e.message ?? ''));

/** 登録を進める。force=false のときは、もう登録済み・前の試しから 10 分たっていない、なら何もしない */
export async function hpGscConnect(salonId: number, opts: { force?: boolean } = {}): Promise<{ state: HpGscState; error: string }> {
  const svc = createServiceClient();
  const { data: site, error: sErr } = await svc.from('salon_sites').select('domain, status').eq('salon_id', salonId).maybeSingle();
  if (sErr) return { state: 'none', error: '読み込めませんでした' };
  if (!site?.domain) return { state: 'no_domain', error: '' };
  if (site.status !== 'live') return { state: 'not_live', error: '' };
  const domain = normalizeHpSiteKey(String(site.domain));
  const siteUrl = hpGscSiteUrl(domain);

  const { data: g, error: gErr } = await svc.from('hp_gsc_sites').select('domain, token, state, updated_at').eq('salon_id', salonId).maybeSingle();
  if (tableMissing(gErr)) return { state: 'not_ready', error: '' };
  if (gErr) return { state: 'none', error: '読み込めませんでした' };
  const same = !!g && String(g.domain) === domain;
  if (same && g.state === 'verified') return { state: 'verified', error: '' };
  if (!opts.force && same && Date.now() - new Date(String(g.updated_at)).getTime() < RETRY_MS) {
    return { state: g.state as HpGscState, error: '' };
  }

  const save = async (row: Record<string, unknown>) => {
    const { error } = await svc.from('hp_gsc_sites').upsert({ salon_id: salonId, domain, updated_at: new Date().toISOString(), ...row });
    if (error) throw new Error(error.message);
  };
  try {
    let token = same ? String(g.token ?? '') : '';
    if (!token) {
      const t = await gscGetMetaToken(siteUrl);
      if (!t.ok) { await save({ token: '', state: 'pending', last_error: t.error.slice(0, 500) }); return { state: 'pending', error: t.error }; }
      token = t.token;
      await save({ token, state: 'pending', last_error: '' });
      // ★ トップを作り直させる（次に Google が見に来たとき meta が出ているように）
      revalidatePath('/hp/[slug]', 'layout');
    }
    const v = await gscVerify(siteUrl);
    if (!v.ok) { await save({ token, state: 'pending', last_error: v.error.slice(0, 500) }); return { state: 'pending', error: v.error }; }
    const add = await gscAddSite(siteUrl);
    if (!add.ok) { await save({ token, state: 'pending', last_error: add.error.slice(0, 500) }); return { state: 'pending', error: add.error }; }
    await save({ token, state: 'verified', last_error: '', verified_at: new Date().toISOString() });
    return { state: 'verified', error: '' };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error('[hpGscConnect]', salonId, m);
    return { state: 'pending', error: m };
  }
}
