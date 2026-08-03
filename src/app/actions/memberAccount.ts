'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';

// 会員（フクエス本体）アカウントの本人削除＝退会。
//
// ⚠ 不可逆操作。設計の要点（厳守）:
//  - service_role はこの 'use server' モジュール内に閉じ込め、クライアントへ出さない
//    （fukuX の deleteMyXAccount と同じ作法）。
//  - 本人性検証：auth.getUser() のログイン id を唯一の削除キーにする。
//    クライアントから uid は受け取らない（なりすまし防止）。加えて画面で入力された
//    メールアドレスがログイン中のものと一致することを二重チェックする。
//  - auth.users を親とする外部キーは pg_catalog で確認すること。information_schema の
//    constraint_column_usage は「実行ユーザーが所有しないテーブルの制約を隠す」ため、
//    auth スキーマ（所有者 supabase_auth_admin）宛のFKが見えず、実在するのに0件に見える。
//    2026-08-03 にこれで判断を誤り、退会テストで口コミが CASCADE 削除された。
//  - 会員データ（profiles / saved_items / view_history / notification_reads /
//    vip_letter_recipients）はすべて auth.users への ON DELETE CASCADE 付き。
//    ここでの明示 delete は保険（順序を固定し、auth 削除前に確実に消すため）。
//  - 口コミ（therapist_reviews）は消さない。user_id は ON DELETE SET NULL に張り替え済み
//    （20260803_therapist_reviews_user_id_set_null.sql）なので、退会すると NULL になり
//    lib/reviews.ts の nickname 解決が外れて表示が「ゲスト」に落ちる＝匿名化。
//    店舗の口コミ件数・★平均・ランキングを後から動かさないための方針（2026-08-03 決定）。
//  - fukuX アカウントを持っている会員は退会させない。ログイン（auth.users）が本体と共有のため、
//    本体を消すと fukuX に入れなくなる。先に /x/settings で fukuX を削除してもらう。

export type DeleteMemberAccountResult =
  | { ok: true }
  | { ok: false; error: string; hasXAccount?: boolean };

// 退会時に行ごと削除する会員データ。いずれも user_id = ログインユーザーの uid。
const MEMBER_TABLES = [
  'saved_items',           // 保存した店舗・セラピスト
  'view_history',          // 閲覧履歴
  'notification_reads',    // 通知の既読位置
  'vip_letter_recipients', // VIPレターの受信箱（本文 vip_letters は店舗側の資産なので消さない）
] as const;

export async function deleteMyMemberAccount(confirmEmail: string): Promise<DeleteMemberAccountResult> {
  // 1. 本人性検証：Cookie セッションの現在ユーザー。
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です。' };
  const uid = user.id;

  // 2. 画面入力のメールアドレス一致（誤操作防止の二段階目）。
  const typed = (confirmEmail ?? '').trim().toLowerCase();
  const actual = (user.email ?? '').trim().toLowerCase();
  if (!typed || !actual || typed !== actual) {
    return { ok: false, error: 'メールアドレスが一致しません。' };
  }

  const svc = createServiceClient();

  // 3. fukuX ガード。持っていれば何も消さずに中断する。
  const { data: xProf, error: xErr } = await svc
    .from('x_profiles')
    .select('id')
    .eq('auth_user_id', uid)
    .maybeSingle();
  if (xErr) {
    console.error('[deleteMyMemberAccount] x_profiles check failed:', xErr.message);
    return { ok: false, error: 'アカウント情報の確認に失敗しました。時間をおいて再度お試しください。' };
  }
  if (xProf) {
    return {
      ok: false,
      hasXAccount: true,
      error: 'fukuX のアカウントが残っています。先に fukuX の設定からアカウントを削除してください。',
    };
  }

  // 4. 会員データを削除。1テーブルでも失敗したら中断（auth.users はまだ残っているので再実行できる）。
  for (const table of MEMBER_TABLES) {
    const { error } = await svc.from(table).delete().eq('user_id', uid);
    if (error) {
      console.error(`[deleteMyMemberAccount] ${table} delete failed:`, error.message);
      return { ok: false, error: '退会処理に失敗しました。お手数ですがお問い合わせフォームよりご連絡ください。' };
    }
  }

  // 5. profiles（ニックネーム）を削除。これで既存の口コミの表示名が「ゲスト」に落ちる。
  const { error: profErr } = await svc.from('profiles').delete().eq('id', uid);
  if (profErr) {
    console.error('[deleteMyMemberAccount] profiles delete failed:', profErr.message);
    return { ok: false, error: '退会処理に失敗しました。お手数ですがお問い合わせフォームよりご連絡ください。' };
  }

  // 6. 最後に auth.users を削除。ここが失敗しても 4〜5 は再実行できる形にしてある。
  const { error: authErr } = await svc.auth.admin.deleteUser(uid);
  if (authErr) {
    console.error('[deleteMyMemberAccount] auth.admin.deleteUser failed:', authErr.message);
    return {
      ok: false,
      error: 'ログイン情報の削除に失敗しました。保存データは削除済みです。お問い合わせフォームよりご連絡ください。',
    };
  }

  return { ok: true };
}
