'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { CRM_TERMS_VERSION } from '@/app/lib/crm/terms';
import { isCrmActive } from '@/app/lib/crm/auth';
import { dbMessage } from '@/app/lib/crm/dbError';
import { readCrmGroupAccess } from '@/app/lib/crm/groupJoin';
import { type CrmAccess } from '@/app/lib/crm/types';
import { readMoneyOpts } from '@/app/lib/crm/server/core';

/**
 * ログイン中のオーナーの店と、CRM が使えるかを返す。
 * 運営（ADMIN_UUID）は salonId を渡せばその店を見られる（有料でなくても見られる＝確認用）。
 */
export async function getCrmAccess(salonIdForAdmin?: number): Promise<CrmAccess> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です', needLogin: true };
  const isAdmin = user.id === ADMIN_UUID;
  const svc = createServiceClient();

  let q = svc.from('salons').select('id, name, crm_until, owner_id');
  if (isAdmin && Number.isInteger(salonIdForAdmin) && (salonIdForAdmin as number) > 0) {
    q = q.eq('id', salonIdForAdmin as number);
  } else {
    // /mypage と同じ引き方（同じオーナーで2件ヒットしうるので .single() を使わない）
    q = q.eq('owner_id', user.id).order('is_hidden', { ascending: true }).order('id', { ascending: true });
  }
  const { data, error } = await q.limit(1).maybeSingle();
  if (error || !data) {
    // ★ 運営アカウントで店舗を選んでいない（運営自身の店が無い）ときは、店を選ぶ帯を出す
    if (isAdmin && !error) return { ok: false, error: '運営アカウントでログインしています。上の「店舗を選んで開く」から、開く店舗を選んでください。', operator: true };
    return { ok: false, error: '店舗情報が見つかりません' };
  }

  const crmUntil = (data.crm_until as string | null) ?? null;
  // 規約への同意（第569便）：版が決まっていて、まだその版に同意していなければ false（運営は見るだけなので true）
  let termsOk = true;
  if (CRM_TERMS_VERSION && !isAdmin) {
    const { data: ag } = await svc.from('crm_terms_agreements').select('id')
      .eq('salon_id', Number(data.id)).eq('version', CRM_TERMS_VERSION).maybeSingle();
    termsOk = !!ag;
  }
  // ★ 第1325便: グループ・提携店の共有に入っている店にだけ、タブと欄を出す（読めないときは出さない＝中身はサーバーが別に確かめる）
  const active = isAdmin || isCrmActive(crmUntil);
  // ★ 第1328便: 申込み・承認の途中の店にもタブを出す（groupPending）。返事を待っていることがあれば赤い印（groupTodo）
  const grp = active ? await readCrmGroupAccess(svc, Number(data.id)) : { inGroup: false, groupPending: false, groupTodo: 0 };
  const money = active ? await readMoneyOpts(svc, Number(data.id)) : { moneyEnabled: true, autoReceivedFrom: null };
  return {
    ok: true,
    salonId: Number(data.id),
    salonName: (data.name as string | null) ?? '',
    crmUntil,
    active,
    isAdmin,
    termsOk,
    inGroup: grp.inGroup,
    groupPending: grp.groupPending,
    groupTodo: grp.groupTodo,
    moneyEnabled: money.moneyEnabled,
    autoReceivedFrom: money.autoReceivedFrom,
  };
}

// ── 運営が店舗様の CRM を開く（第1438便・2026-10-13・カッキーさん）──
// ★ 店は URL の ?salon=店舗ID で決める（cookie を使わない＝タブごとに店がはっきりしていて、別のタブの選択に引きずられない）。
// ★ 保存の可否は今までどおり assertCrmOwner（運営アカウントならどの店でも通る）。ここは一覧を返すだけ。
export type CrmOperatorSalon = { id: number; name: string; hidden: boolean; contract: boolean };

/** 店を選ぶ一覧（運営だけ）。契約中の店を先に、そのあと id の若い順。非表示の店も出す */
export async function listCrmOperatorSalons(): Promise<{ ok: true; data: CrmOperatorSalon[] } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_UUID) return { ok: false, error: '運営アカウントでログインしてください' };
  const svc = createServiceClient();
  const { data, error } = await svc.from('salons').select('id, name, is_hidden, crm_until').order('id', { ascending: true }).limit(1000);
  if (error) return { ok: false, error: dbMessage(error, '読み込み') };
  const rows: CrmOperatorSalon[] = (data ?? []).map((r) => ({
    id: Number(r.id),
    name: (r.name as string | null) ?? '',
    hidden: r.is_hidden === true,
    contract: isCrmActive((r.crm_until as string | null) ?? null),
  }));
  rows.sort((a, b) => (a.contract === b.contract ? a.id - b.id : a.contract ? -1 : 1));
  return { ok: true, data: rows };
}
