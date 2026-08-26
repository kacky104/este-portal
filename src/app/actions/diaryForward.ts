'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';

// 写メ日記の転送先の登録（第36便・第2弾）。
//
// フクエスで書いた日記を、駅ちか／エスラブの「投稿用メールアドレス」へ送るための設定。
// ★ 向きに注意:
//     therapist_diary_mail    … フクエスが【受け取る】ためのアドレス（第27便）
//     therapist_diary_forward … フクエスから【送る】ための宛先（このファイル）
//
// ⚠ セキュリティ: 宛先を知っていれば誰でもその子として媒体に投稿できる。
//   therapist_diary_forward は anon/authenticated に GRANT していないため、
//   取得経路はこの server action だけ。呼び出しごとにオーナー検証を行う（diaryMail.ts と同型）。
//
// ★ 'use server' ファイルは async 関数以外を export できない（Next のビルド時チェック）。
//   定数や型を export しないこと（2026-08-21 のビルド失敗の原因）。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const PROVIDERS = ['ekichika', 'esulove'];

/** メールアドレスとして形が正しいかの簡易判定（notifyAdmin と同じ規則）。 */
function looksLikeEmail(v: string): boolean {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v);
}

/** そのセラピストを操作してよいか（本人・所属サロンのオーナー・運営）。salon_id を返す。 */
async function assertCanEdit(therapistId: number): Promise<Result<{ salonId: number }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };

  const svc = createServiceClient();
  const { data: t } = await svc.from('therapists').select('id, salon_id, user_id').eq('id', therapistId).maybeSingle();
  if (!t) return { ok: false, error: 'セラピストが見つかりません' };

  const { data: salon } = await svc.from('salons').select('owner_id').eq('id', Number(t.salon_id)).maybeSingle();
  if (!salon) return { ok: false, error: '店舗が見つかりません' };

  const isSelf = (t.user_id as string | null) === user.id;
  const isOwner = (salon.owner_id as string | null) === user.id;
  if (!isSelf && !isOwner && user.id !== ADMIN_UUID) return { ok: false, error: 'この店舗の操作権限がありません' };
  return { ok: true, data: { salonId: Number(t.salon_id) } };
}

/** そのセラピストの転送先を全部返す。未登録の媒体は address 空で返す（画面が2欄を必ず出せるように）。 */
export async function getDiaryForwards(input: { therapistId: string | number }):
  Promise<Result<Array<{ provider: string; address: string; isEnabled: boolean }>>> {
  const therapistId = Number(input.therapistId);
  if (!Number.isFinite(therapistId)) return { ok: false, error: '対象セラピストが不正です' };
  const guard = await assertCanEdit(therapistId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('therapist_diary_forward')
    .select('provider, address, is_enabled')
    .eq('therapist_id', therapistId);
  if (error) return { ok: false, error: error.message };

  const byProvider = new Map((data ?? []).map((r) => [r.provider as string, r]));
  return {
    ok: true,
    data: PROVIDERS.map((p) => {
      const row = byProvider.get(p);
      return { provider: p, address: (row?.address as string | undefined) ?? '', isEnabled: row ? row.is_enabled !== false : true };
    }),
  };
}

/** 転送先を保存する。address が空なら削除（＝その媒体へは送らない）。 */
export async function saveDiaryForward(input: { therapistId: string | number; provider: string; address: string }):
  Promise<Result<{ saved: boolean }>> {
  const therapistId = Number(input.therapistId);
  if (!Number.isFinite(therapistId)) return { ok: false, error: '対象セラピストが不正です' };
  if (!PROVIDERS.includes(input.provider)) return { ok: false, error: '媒体の指定が不正です' };
  const guard = await assertCanEdit(therapistId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const address = (input.address ?? '').trim();

  // ★ 空にしたら削除。「送らない」を明示的に表せるようにしておく。
  if (!address) {
    const { error } = await svc.from('therapist_diary_forward')
      .delete().eq('therapist_id', therapistId).eq('provider', input.provider);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { saved: false } };
  }

  // ★ 形が違うアドレスを入れると、送信そのものが Resend に拒否されて全部止まる。
  //   ここで弾いて、原因が分かる形で返す。
  if (!looksLikeEmail(address)) return { ok: false, error: 'メールアドレスの形式が正しくありません' };
  if (address.length > 200) return { ok: false, error: 'アドレスが長すぎます' };

  const { error } = await svc.from('therapist_diary_forward').upsert({
    therapist_id: therapistId,
    provider: input.provider,
    address,
    is_enabled: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'therapist_id,provider' });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { saved: true } };
}

/** 店舗の「写メ日記の正本」を読む。 */
export async function getSalonDiarySource(input: { therapistId: string | number }):
  Promise<Result<{ salonId: number; source: string }>> {
  const therapistId = Number(input.therapistId);
  if (!Number.isFinite(therapistId)) return { ok: false, error: '対象セラピストが不正です' };
  const guard = await assertCanEdit(therapistId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const { data } = await svc.from('salons').select('diary_source').eq('id', guard.data.salonId).maybeSingle();
  return { ok: true, data: { salonId: guard.data.salonId, source: (data?.diary_source as string | null) ?? 'benry' } };
}

/**
 * 店舗の「写メ日記の正本」を切り替える。
 * ★★★ これが二重投稿を防ぐ唯一の仕掛け。
 *   'fukues' にすると、その店舗宛に他媒体から届いたメールは受け取らなくなる
 *   （/api/webhooks/resend-inbound が捨てる）。
 *   ベンリー側の転送設定を外し忘れても日記が2つ並ばない。
 */
export async function setSalonDiarySource(input: { therapistId: string | number; source: string }):
  Promise<Result<{ source: string }>> {
  const therapistId = Number(input.therapistId);
  if (!Number.isFinite(therapistId)) return { ok: false, error: '対象セラピストが不正です' };
  if (input.source !== 'benry' && input.source !== 'fukues') return { ok: false, error: '指定が不正です' };
  const guard = await assertCanEdit(therapistId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const { error } = await svc.from('salons').update({ diary_source: input.source }).eq('id', guard.data.salonId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { source: input.source } };
}
