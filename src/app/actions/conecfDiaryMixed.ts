'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { readDiaryMixedState, extendDiaryMixedPeriod, type DiaryMixedState } from '@/app/lib/conecf/diaryMixed';
import { maybeStartDiaryBackfill } from '@/app/lib/media/diarySourceSync';

// コネックエフ「写メ日記転送」の、移行期間の受け口（第1265便・2026-10-07・カッキーさんの決定）。
//   ・getConecfDiaryMixed    … 期限・残り日数・いま取り込んでいるか（読むだけ）
//   ・extendConecfDiaryMixed … 「14日間延長する」（店舗様が押す・何回でも・押すたびに連携の記録に残る）
// ★ 延長は「コネックエフに切り替え済み」で「止めている店（セットの契約なし・第1243便）でない」自店だけ。★ 画面だけで守らない。
// ★ 決めごとは src/lib/diaryMixedPeriod.ts、DB の読み書きは src/app/lib/conecf/diaryMixed.ts。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function resolve(write: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const { data: salon } = await svc
    .from('salons')
    .select('id, conecf_enabled_at, crm_until')
    .eq('owner_id', user.id)
    .order('is_hidden', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!salon) return { ok: false as const, error: '店舗情報が見つかりません' };
  if (write && !salon.conecf_enabled_at) {
    return { ok: false as const, error: '延長するには、ホームで「コネックエフに切り替える」を押してください' };
  }
  if (write && isConecfStopped({ conecfEnabledAt: salon.conecf_enabled_at as string | null, crmUntil: (salon.crm_until as string | null) ?? null }, getCalendarDateJST())) {
    return { ok: false as const, error: CONECF_STOPPED_MESSAGE };
  }
  return { ok: true as const, svc, salonId: Number(salon.id), userId: user.id };
}

export async function getConecfDiaryMixed(): Promise<Result<DiaryMixedState>> {
  const r = await resolve(false);
  if (!r.ok) return r;
  return { ok: true, data: await readDiaryMixedState(r.svc, r.salonId) };
}

export async function extendConecfDiaryMixed(): Promise<Result<DiaryMixedState>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const res = await extendDiaryMixedPeriod(r.svc, r.salonId, 'shop:' + r.userId);
  if (!res.ok) return { ok: false, error: res.error };
  // ★ 第1266便: 期限切れ・未設定から延長して、はじめて取り込みが回る状態になった店は、過去60日ぶんも遡る
  //   （まだ1件も取り込み記録が無い店だけ・中で条件を見る・失敗しても延長はそのまま）
  await maybeStartDiaryBackfill(r.svc, r.salonId, 'shop:' + r.userId);
  return { ok: true, data: res.state };
}
