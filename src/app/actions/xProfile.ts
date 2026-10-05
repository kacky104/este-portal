'use server';

import { createClient } from '@/app/lib/supabase/server';

// ★★ 第983便（2026-09-29・カッキーさん）: fukuX の「アカウント開設」「プロフィール設定」「所属解除」と、
//   fukuX 画像のアップロード先づくりを【サーバー側】で行う（第980〜982便と同じ、アプリ内ブラウザ対策）。
// ★ すべて【本人のログインのまま】（service_role ではない）＝x_profiles の RLS・ガードトリガー、
//   x-images の Storage RLS（先頭フォルダ＝本人UID）はそのまま効く。
// ★ auth_user_id はクライアントから受け取らない（サーバーの getUser() の本人だけ）。

type Fail = { ok: false; error: string };
const NO_LOGIN: Fail = { ok: false, error: 'ログインが切れています。ページを開き直すか、ログインし直してください。' };
const HANDLE_RE = /^[A-Za-z0-9_]{3,20}$/;
const EXT_OK = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// ── 画像: x-images/{本人UID}/ への一回限りのアップロード先 ──
export async function createMyXImageUploadUrl(
  ext: string, prefix?: 'header',
): Promise<{ ok: true; signedUrl: string; publicUrl: string } | Fail> {
  const e = String(ext || 'jpg').toLowerCase();
  if (!EXT_OK.has(e)) return { ok: false, error: 'この形式の画像には対応していません' };
  const { supabase, user } = await me();
  if (!user) return NO_LOGIN;
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${user.id}/${prefix === 'header' ? 'header-' : ''}${Date.now()}-${rand}.${e}`;
  const { data, error } = await supabase.storage.from('x-images').createSignedUploadUrl(path);
  if (error || !data?.signedUrl) {
    console.error('[x] 画像のアップロード先を作れなかった', user.id, error?.message);
    return { ok: false, error: '画像を送る準備ができませんでした。ページを開き直してから、もう一度選んでください。' };
  }
  const { data: { publicUrl } } = supabase.storage.from('x-images').getPublicUrl(path);
  return { ok: true, signedUrl: data.signedUrl, publicUrl };
}

// ── @ID が空いているか ──
export async function isXHandleTaken(handle: string): Promise<{ ok: true; taken: boolean } | Fail> {
  if (!HANDLE_RE.test(String(handle ?? ''))) return { ok: false, error: 'IDの形式が正しくありません' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('x_profiles').select('handle').eq('handle', handle).maybeSingle();
  if (error) return { ok: false, error: 'IDを確かめられませんでした' };
  return { ok: true, taken: !!data };
}

// ── アカウント開設 ──
export async function createMyXProfile(input: {
  kind: string; handle: string; displayName: string; bio: string; avatarUrl: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; reason?: 'handle_taken' | 'already' }> {
  const { supabase, user } = await me();
  if (!user) return NO_LOGIN;
  const handle = String(input.handle ?? '').trim();
  const displayName = String(input.displayName ?? '').trim();
  if (!HANDLE_RE.test(handle)) return { ok: false, error: 'IDは英数字と _ の3〜20文字で入力してください' };
  if (displayName.length < 1 || displayName.length > 30) return { ok: false, error: '表示名は1〜30文字で入力してください' };
  // status はトリガが自動設定するため送らない。kind の妥当性は DB の制約が見る。
  const { error } = await supabase.from('x_profiles').insert({
    auth_user_id: user.id,
    kind: input.kind,
    handle,
    display_name: displayName,
    bio: String(input.bio ?? '').trim() || null,
    avatar_url: input.avatarUrl || null,
  });
  if (error) {
    const msg = error.message ?? '';
    const isUnique = error.code === '23505' || /duplicate|unique/i.test(msg);
    if (isUnique && /handle/i.test(msg)) return { ok: false, reason: 'handle_taken', error: 'このIDは使われています。別のIDをお試しください。' };
    if (isUnique) return { ok: false, reason: 'already', error: 'すでにアカウントがあります。' };
    console.error('[x] アカウントを開設できなかった', user.id, error.code, msg, error.details, error.hint);
    // ★★ 第1192便（2026-10-05・カッキーさん）: 開設できない原因が画面から分からなかった（理由はサーバーの記録にしか出ない）。
    //   ・DB（トリガー・ポリシー）が日本語で理由を返したときは、それをそのまま出す（投稿の jpOr と同じ作法）。
    //   ・そうでないときは、今までの文に【エラー番号と、引っかかった制約・列の名前】だけを添える。
    //     ★ 英語の生エラーの文は出さない。番号と名前だけなら、画面の写真1枚で原因を追える。
    if (/[ぁ-んァ-ン一-龥]/.test(msg)) return { ok: false, error: msg };
    const where = /constraint "([^"]+)"/.exec(msg)?.[1] ?? /column "([^"]+)"/.exec(msg)?.[1] ?? '';
    const tail = error.code ? `（エラー番号: ${error.code}${where ? ` / ${where}` : ''}）` : '';
    return { ok: false, error: `アカウントを開設できませんでした。ページを開き直してから、もう一度お試しください。${tail}` };
  }
  // ★ 第994便: セラピストなら、セラピストページ連携＋認証済みのお店に自動で所属（条件に合わなければ何もしない）
  if (input.kind === 'therapist') {
    const { autoLinkMyAffiliation } = await import('@/app/x/xAffiliation');
    await autoLinkMyAffiliation(supabase);
  }
  // ★ 第1000便: お店なら、フクエスに掲載中の店舗オーナーは自動で認証バッジ（条件に合わなければ何もしない）
  if (input.kind === 'shop') {
    const { autoVerifyMyShop } = await import('@/app/x/xAffiliation');
    await autoVerifyMyShop(supabase);
  }
  return { ok: true };
}

// ── プロフィール保存（送ってよい項目だけ通す。handle/kind/status/is_verified/affiliated_shop_id は通さない） ──
const UPDATABLE = new Set([
  'display_name', 'bio', 'avatar_url', 'header_url', 'link_url', 'dm_disabled',
  'age', 'height', 'bust', 'cup', 'waist', 'hip',
  'address', 'showcase_images',
  'offer_enabled', 'offer_comment', 'offer_areas',
]);

export async function updateMyXProfile(profileId: string, patch: Record<string, unknown>): Promise<{ ok: true } | Fail> {
  const { supabase, user } = await me();
  if (!user) return NO_LOGIN;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch ?? {})) if (UPDATABLE.has(k)) clean[k] = v;
  if (Object.keys(clean).length === 0) return { ok: true };
  // ★ 第996便: フクエスに在籍（セラピストページ連携・公開中）のセラピストは、リンク先をフクエスの個別ページに固定
  if ('link_url' in clean) {
    const { data: meRow } = await supabase.from('x_profiles').select('kind').eq('id', profileId).eq('auth_user_id', user.id).maybeSingle();
    if (meRow?.kind === 'therapist') {
      const { getLinkedTherapistForXProfile, fukuesTherapistPageUrl } = await import('@/app/lib/xLink');
      const linked = await getLinkedTherapistForXProfile(user.id);
      if (linked) clean.link_url = fukuesTherapistPageUrl(linked.id);
    }
  }
  const { data, error } = await supabase
    .from('x_profiles')
    .update(clean)
    .eq('id', profileId)
    .eq('auth_user_id', user.id)
    .select('id');
  if (error) {
    console.error('[x] プロフィールを保存できなかった', user.id, error.code, error.message);
    // ★ ガードトリガー（お店カード画像の枚数など）が日本語で理由を返す場合はそれを出す
    const jp = /[ぁ-んァ-ン一-龥]/.test(error.message ?? '') ? error.message : '';
    return { ok: false, error: jp || '保存できませんでした。ページを開き直してから、もう一度お試しください。' };
  }
  if (!data || data.length === 0) return { ok: false, error: '保存できませんでした。ページを開き直してから、もう一度お試しください。' };
  return { ok: true };
}

// ── セラピストの所属解除（自分から） ──
export async function leaveMyXShop(profileId: string): Promise<{ ok: true } | Fail> {
  const { supabase, user } = await me();
  if (!user) return NO_LOGIN;
  const { error } = await supabase.rpc('x_affiliation_remove', { p_therapist_profile_id: profileId });
  if (error) {
    console.error('[x] 所属を解除できなかった', user.id, error.message);
    const jp = /[ぁ-んァ-ン一-龥]/.test(error.message ?? '') ? error.message : '';
    return { ok: false, error: jp || '所属を解除できませんでした。ページを開き直してから、もう一度お試しください。' };
  }
  return { ok: true };
}
