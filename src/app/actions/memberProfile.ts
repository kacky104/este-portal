'use server';

import { createClient } from '@/app/lib/supabase/server';

// ★★ 第980便（2026-09-29・カッキーさん）: 会員ニックネームの保存を【サーバー側】で行う。
// ★ 起きたこと: セラピストアカウントの方が /member/profile でニックネームを保存できず、
//   「保存に失敗しました。時間をおいて再度お試しください。」になった（LINE 等のアプリ内ブラウザ）。
//   ★ 第962便のパスワードと同じ形: 画面を開くとき（サーバー）はログインが読めているのに、
//     保存を押したとき（ブラウザの supabase-js）に「誰なのか」が伝わらず、DB に断られる。
// ★ ここではサーバーでログイン中の本人を確かめ、【本人のログインのまま】（service_role ではない）保存する。
//   ★ だから RLS（本人の行だけ）と DB トリガー prevent_nickname_change（一度決めたら変更不可）はそのまま効く。
// ★ id は getUser() の本人だけ（引数に取らない）。
const NICKNAME_MAX = 20;

export type SaveNicknameResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveMyNickname(nickname: string): Promise<SaveNicknameResult> {
  const name = typeof nickname === 'string' ? nickname.trim() : '';
  if (!name) return { ok: false, error: 'ニックネームを入力してください' };
  if ([...name].length > NICKNAME_MAX) return { ok: false, error: `ニックネームは${NICKNAME_MAX}文字以内で入力してください` };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'ログインが切れています。ページを開き直すか、ログインし直してください。' };
  }

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, nickname: name, updated_at: new Date().toISOString() }, { onConflict: 'id' });

  if (error) {
    const code = (error as { code?: string }).code ?? '';
    const msg = (error.message ?? '').toLowerCase();
    console.error('[member] ニックネームを保存できなかった', user.id, code, error.message);
    if (code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
      return { ok: false, error: 'このニックネームは使われています。別のニックネームにしてください。' };
    }
    if (code === 'P0001' || (msg.includes('nickname') && (msg.includes('change') || msg.includes('変更')))) {
      return { ok: false, error: 'ニックネームはすでに設定されているため、変更できません。' };
    }
    return { ok: false, error: 'ニックネームを保存できませんでした。お手数ですが、お問い合わせページからご連絡ください。' };
  }
  return { ok: true };
}
