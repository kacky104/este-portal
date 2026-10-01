import type { User } from '@supabase/supabase-js';
import { createClient } from '@/app/lib/supabase/client';

// ★ 第1085便（2026-10-01）: ブラウザ側の「今ログインしている人」を1回だけ問い合わせて使い回す。
//   本番実測で TOP を開くと auth/v1/user が4回飛んでいた（NotificationBell・VipLetterIcon が
//   それぞれ部品の中と lib の中で getUser を呼ぶ＝2回×2）。
//   ★ 第1083便の ROLE_CACHE と同じ型: モジュール内の表に持ち、同時実行は1本にまとめ、
//     ログイン／ログアウト／ユーザー更新のイベントで空にする（ページ移動では引き直さない）。
//   ★ 答えの中身は supabase.auth.getUser() と同じ（サーバーで検証済みの user か null）。
//   ★ ブラウザ専用。サーバーでは使わない（createClient のシングルトンが前提）。

let cached: { user: User | null } | null = null;
let inflight: Promise<User | null> | null = null;
let subscribed = false;

function subscribeOnce() {
  if (subscribed || typeof window === 'undefined') return;
  subscribed = true;
  createClient().auth.onAuthStateChange((event) => {
    // ★ 人が変わりうるイベントで必ず捨てる。INITIAL_SESSION・TOKEN_REFRESHED は同じ人なので残す
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      cached = null;
      inflight = null;
    }
  });
}

/** 今ログインしている人（検証済み）。未ログインなら null。★ 読めなかったときも null（バッジを出さないだけ）。 */
export function getBrowserUser(): Promise<User | null> {
  subscribeOnce();
  if (cached) return Promise.resolve(cached.user);
  if (inflight) return inflight;
  const job: Promise<User | null> = (async () => {
    try {
      const { data: { user } } = await createClient().auth.getUser();
      cached = { user };
      return user;
    } catch {
      // ★ 読めなかったときは表に入れない＝次の機会にもう一度引く
      return null;
    }
  })();
  inflight = job;
  void job.finally(() => { if (inflight === job) inflight = null; });
  return job;
}
