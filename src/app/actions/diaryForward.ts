'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { isDiarySource } from '@/lib/diarySource';
import { isConsentState } from '@/lib/therapistMediaConsent';

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

/** そのセラピストの転送先を全部返す（媒体×枠）。行がそのまま並ぶ＝画面は枠を動的に描ける。 */
export async function getDiaryForwards(input: { therapistId: string | number }):
  Promise<Result<Array<{ provider: string; slot: number; address: string; isEnabled: boolean }>>> {
  const therapistId = Number(input.therapistId);
  if (!Number.isFinite(therapistId)) return { ok: false, error: '対象セラピストが不正です' };
  const guard = await assertCanEdit(therapistId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('therapist_diary_forward')
    .select('provider, slot, address, is_enabled')
    .eq('therapist_id', therapistId);
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? [])
    .map((r) => ({
      provider: r.provider as string,
      slot: Number((r as { slot?: number }).slot ?? 1),
      address: (r.address as string | undefined) ?? '',
      isEnabled: r.is_enabled !== false,
    }))
    // 媒体順（PROVIDERS の並び）→ 枠順。画面が安定して並ぶように。
    .sort((a, b) => {
      const pi = PROVIDERS.indexOf(a.provider) - PROVIDERS.indexOf(b.provider);
      return pi !== 0 ? pi : a.slot - b.slot;
    });
  return { ok: true, data: rows };
}

/** 転送先を保存する（媒体×枠）。address が空なら その枠を削除（＝送らない）。 */
export async function saveDiaryForward(input: { therapistId: string | number; provider: string; slot?: number; address: string }):
  Promise<Result<{ saved: boolean }>> {
  const therapistId = Number(input.therapistId);
  if (!Number.isFinite(therapistId)) return { ok: false, error: '対象セラピストが不正です' };
  if (!PROVIDERS.includes(input.provider)) return { ok: false, error: '媒体の指定が不正です' };
  const slot = Math.trunc(Number(input.slot ?? 1));
  if (!Number.isFinite(slot) || slot < 1 || slot > 20) return { ok: false, error: '枠の指定が不正です' };
  const guard = await assertCanEdit(therapistId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const address = (input.address ?? '').trim();

  // ★ 空にしたら削除。「送らない」を明示的に表せるようにしておく。
  if (!address) {
    const { error } = await svc.from('therapist_diary_forward')
      .delete().eq('therapist_id', therapistId).eq('provider', input.provider).eq('slot', slot);
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
    slot,
    address,
    is_enabled: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'therapist_id,provider,slot' });
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
 * 店舗の「写メ日記の入口」を切り替える。
 * ★★★ これが二重投稿を防ぐ唯一の仕掛け。★ 入口は常に1つだけ（第99便で3値化）。
 *   'benry'    … メールで受け取る（駅ちかの取り込みは回さない）
 *   'ekichika' … 駅ちかの管理画面から取り込む（メールは受け取らない）
 *   'fukues'   … フクエスで書いて各媒体へ送る（どちらも受け取らない）
 * ★ 判定は src/lib/diarySource.ts。★ ここに値を直書きしない。
 */
export async function setSalonDiarySource(input: { therapistId: string | number; source: string }):
  Promise<Result<{ source: string }>> {
  const therapistId = Number(input.therapistId);
  if (!Number.isFinite(therapistId)) return { ok: false, error: '対象セラピストが不正です' };
  if (!isDiarySource(input.source)) return { ok: false, error: '指定が不正です' };
  const guard = await assertCanEdit(therapistId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();

  // ★★★ 'ekichika' は【鍵を預けていただいた店】でしか動かない（第99便）。
  //   ★ 鍵が無いまま切り替えると、メールも受け取らず取り込みも回らない＝
  //     **日記が1件も入らない状態**になる。★ しかも誰も気づかない。
  //   ★ 「保存したのに何も起きない」を作らないため、ここで止めて理由を返す。
  if (input.source === 'ekichika') {
    const { data: cred } = await svc
      .from('salon_media_credentials')
      .select('salon_id, is_enabled, consent_version')
      .eq('salon_id', guard.data.salonId)
      .eq('provider', 'ekichika')
      .eq('is_enabled', true);
    const ready = (cred ?? []).some((c) => typeof (c as { consent_version?: string | null }).consent_version === 'string');
    if (!ready) {
      return { ok: false, error: '駅ちかのログイン情報がまだご登録されていないため、この設定にはできません。先に「媒体連携」で駅ちかのログイン情報とご同意をご登録ください。' };
    }
  }

  const { error } = await svc.from('salons').update({ diary_source: input.source }).eq('id', guard.data.salonId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { source: input.source } };
}

// ── セラピスト本人の了承（第118便・2026-09-03）────────────────────────
//
// ★★★ なぜ要るか
//   エステ魂の写メ日記は【本人のアカウント】から投稿する（店舗の管理画面からは投稿できない・9/3 実測）。
//   ★ 店舗が繋いだからといって全員ぶん送ると、了承していない人の日記が本人のアカウントから出る。
//   → 送る相手は1人ずつ決める（カッキーさん・2026-09-03）。★ 既定は送らない。
//
// ★★ ここに入るのは【店舗様の申告】。★ 本人の署名ではない。★ 画面にもそう書く。
// ★ 判断（送ってよいか）は src/lib/therapistMediaConsent.ts の canSendDiary 1か所。

/** その店舗の在籍と、了承の記録をまとめて返す（★ 読むだけ）。 */
export async function getSalonDiaryConsents(input: { salonId: string | number; provider: string }): Promise<
  Result<{
    therapists: Array<{ id: string; name: string; isActive: boolean }>;
    consents: Array<{ therapistId: string; state: string; decidedAt: string | null }>;
  }>
> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  if (!PROVIDERS.includes(input.provider)) return { ok: false, error: '媒体の指定が不正です' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };

  const svc = createServiceClient();
  const { data: salon } = await svc.from('salons').select('owner_id').eq('id', salonId).maybeSingle();
  if (!salon) return { ok: false, error: '店舗が見つかりません' };
  if ((salon.owner_id as string | null) !== user.id && user.id !== ADMIN_UUID) {
    return { ok: false, error: 'この店舗の操作権限がありません' };
  }

  const { data: ths, error: thErr } = await svc
    .from('therapists')
    .select('id, name, is_active')
    .eq('salon_id', salonId)
    .order('id', { ascending: true });
  if (thErr) return { ok: false, error: 'セラピストを読み込めませんでした' };

  const ids = (ths ?? []).map((t) => Number(t.id));
  let consents: Array<{ therapistId: string; state: string; decidedAt: string | null }> = [];
  if (ids.length > 0) {
    const { data: cs, error: csErr } = await svc
      .from('therapist_media_consent')
      .select('therapist_id, state, decided_at')
      .eq('provider', input.provider)
      .eq('kind', 'diary')
      .in('therapist_id', ids);
    // ★★ 読めなかったことを「0件（＝全員未確認）」と見せない。★ 混ぜると、聞いた記録が消えたように見える
    if (csErr) return { ok: false, error: '了承の記録を読み込めませんでした' };
    consents = (cs ?? []).map((r) => ({
      therapistId: String(r.therapist_id),
      state: String(r.state ?? 'unknown'),
      decidedAt: (r.decided_at as string | null) ?? null,
    }));
  }

  return {
    ok: true,
    data: {
      therapists: (ths ?? []).map((t) => ({
        id: String(t.id),
        name: (t.name as string | null) ?? '',
        isActive: t.is_active === true,
      })),
      consents,
    },
  };
}

/**
 * 1人ぶんの了承を記録する。
 * ★★ 'unknown' に戻せる（取り消せる）。★ 「戻せます」と書いた画面には戻すボタンがあること。
 * ★ 記録するのは state と、いつ・誰が入れたか。★ 本人の同意そのものではない。
 */
export async function setDiaryConsent(input: {
  therapistId: string | number;
  provider: string;
  state: string;
}): Promise<Result<{ state: string }>> {
  const therapistId = Number(input.therapistId);
  if (!Number.isFinite(therapistId)) return { ok: false, error: '対象セラピストが不正です' };
  if (!PROVIDERS.includes(input.provider)) return { ok: false, error: '媒体の指定が不正です' };
  if (!isConsentState(input.state)) return { ok: false, error: '了承の指定が不正です' };

  // ★ 本人・店舗オーナー・運営（既存の判定をそのまま使う）
  const guard = await assertCanEdit(therapistId);
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const svc = createServiceClient();
  const nowISO = new Date().toISOString();

  const { error } = await svc.from('therapist_media_consent').upsert({
    therapist_id: therapistId,
    provider: input.provider,
    kind: 'diary',
    state: input.state,
    // ★ 「まだ確認していません」に戻したときは、いつ誰が、を消す（残すと決めたように見える）
    decided_at: input.state === 'unknown' ? null : nowISO,
    decided_by: input.state === 'unknown' ? null : (user?.id ?? null),
    updated_at: nowISO,
  }, { onConflict: 'therapist_id,provider,kind' });
  if (error) return { ok: false, error: '了承を保存できませんでした' };

  return { ok: true, data: { state: input.state } };
}
