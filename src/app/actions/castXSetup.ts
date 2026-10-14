'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { createMyXProfile } from '@/app/actions/xProfile';

// ★★ 第1475便（2026-10-14・カッキーさん）: セラピストページ（/cast）を開設したら、同時に fukuX のアカウントも開設する。
// ★ 決まり（カッキーさん）:
//   ・場所は招待の着地ページ（/cast/welcome）。パスワードと一緒に fukuX の @ID を本人が入れる（@ID はあとから変えられないため）。
//   ・表示名＝セラピストページの名前、アイコン＝フクエスの写真、自己紹介は空。所属は今までどおり自動（autoLinkMyAffiliation）。
//   ・対象は【有料のお店（listing_plan が 'free' でない）】のセラピストだけ。無料掲載枠は fukuX と連携しない決まり（第1190便）。
//   ・すでに開設済みのセラピストはこれまでどおり（/cast の案内から自分で開設）。まとめて開設はしない。
// ★ 開設そのものは fukuX の開設（createMyXProfile）をそのまま使う＝本人のログインのまま（RLS・ガードトリガーはそのまま効く）。
//   service_role は「対象かどうか」を読むだけに使う（書かない）。

type Eligibility =
  | { eligible: true; name: string; photo: string | null }
  | { eligible: false; reason: 'no_login' | 'not_linked' | 'free_plan' | 'already' | 'error' };

async function checkEligibility(): Promise<Eligibility> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { eligible: false, reason: 'no_login' };

  const svc = createServiceClient();
  const { data: t, error: tErr } = await svc
    .from('therapists')
    .select('id, name, salon_id, profile_image_url')
    .eq('user_id', user.id)
    .maybeSingle();
  if (tErr) return { eligible: false, reason: 'error' };
  if (!t) return { eligible: false, reason: 'not_linked' };

  if (t.salon_id != null) {
    const { data: s, error: sErr } = await svc.from('salons').select('listing_plan').eq('id', t.salon_id).maybeSingle();
    if (sErr) return { eligible: false, reason: 'error' };
    if ((s?.listing_plan as string | null) === 'free') return { eligible: false, reason: 'free_plan' };
  }

  const { data: x, error: xErr } = await svc.from('x_profiles').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (xErr) return { eligible: false, reason: 'error' };
  if (x) return { eligible: false, reason: 'already' };

  const name = String(t.name ?? '').trim().slice(0, 30) || 'セラピスト';
  return { eligible: true, name, photo: (t.profile_image_url as string | null) || null };
}

/** /cast/welcome 用: この人に fukuX の @ID 欄を出すか（読むだけ） */
export async function getCastXSetup(): Promise<{ eligible: boolean }> {
  const e = await checkEligibility();
  return { eligible: e.eligible };
}

/** /cast/welcome 用: パスワードを決めたあとに fukuX を開設する */
export async function createCastXAccount(handle: string): Promise<
  { ok: true; handle: string } | { ok: false; error: string; reason?: 'handle_taken' | 'skip' }
> {
  const e = await checkEligibility();
  if (!e.eligible) {
    // ★ すでに開設済み・無料枠・未連携は「何もしない」（エラーにしない）
    return { ok: false, reason: 'skip', error: '' };
  }
  const h = String(handle ?? '').trim().replace(/^@/, '');
  const res = await createMyXProfile({ kind: 'therapist', handle: h, displayName: e.name, bio: '', avatarUrl: e.photo });
  if (!res.ok) {
    if (res.reason === 'already') return { ok: false, reason: 'skip', error: '' };
    return { ok: false, reason: res.reason === 'handle_taken' ? 'handle_taken' : undefined, error: res.error };
  }
  return { ok: true, handle: h };
}
