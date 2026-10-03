'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_UUID } from '@/app/lib/admin';
import { decideMediaPage, readUnlockIntent, MEDIA_UNLOCK_KEY, type MediaPageDecision } from '@/lib/mediaVisibility';
import { useMediaSession } from './MediaSession';

// 媒体連携のページに共通の入口の判定（第56便で /mypage/media から切り出した）。
//
// ★★★ なぜ1か所にまとめたか
//   媒体連携のページが2枚以上になる（第65便の時点で6枚）。
//   ★ 出し分けの判定がページごとに書かれると、増やすたびに書き忘れが出る。
//     ★ それは第54便のタブ単位の出し分けで踏んだ穴そのもの（設計メモ §142）。
//   → ページが何枚に増えても、入口の判定は【このフック1つ】。
//
// ★ 判定そのものは src/lib/mediaVisibility.ts の decideMediaPage（純粋関数・3値）が持つ。
//   ★ 'wait'（まだ分からない）で追い出さないことが要（設計メモ §144）。
// ★ 第1120便: ログインと店の読みは MediaSession（layout の下・1回だけ）から受け取る。
//   ★ 以前はページごとに auth.getUser ＋ salons を読んでいた（/mypage/layout のログイン確認と合わせて3重）。

export type SalonLite = { id: number | string; name: string | null };

export function useMediaGate(): {
  decision: MediaPageDecision;
  salon: SalonLite | null;
  loadError: string;
} {
  const router = useRouter();
  const session = useMediaSession();

  const [mediaUnlocked, setMediaUnlocked] = useState(false);
  /** ★ 目隠しの読み取りが済んだか。★ 済む前の false を「出さない」と読まないため */
  const [unlockReady, setUnlockReady] = useState(false);

  // ★★ 目隠しの読み書き（第54便と同じ鍵）。どのページに ?media=1 を付けても外せる。
  useEffect(() => {
    try {
      const intent = readUnlockIntent(window.location.search);
      if (intent === 'on') window.localStorage.setItem(MEDIA_UNLOCK_KEY, '1');
      else if (intent === 'off') window.localStorage.removeItem(MEDIA_UNLOCK_KEY);
      setMediaUnlocked(window.localStorage.getItem(MEDIA_UNLOCK_KEY) === '1');
    } catch {
      // ★ localStorage が使えない環境では出さない側に倒す
      setMediaUnlocked(false);
    }
    setUnlockReady(true);
  }, []);

  // ★ 画面を開いたとき、外枠の状態が5分より古ければ読み直す（★ 新しければ何も読まない）
  const { ensureFresh } = session;
  useEffect(() => { ensureFresh(); }, [ensureFresh]);

  const st = session.state;

  // ★ ログインしていなければログイン画面へ（★ 戻り先は今のページ）
  const needLogin = st != null && !st.ok;
  useEffect(() => {
    if (needLogin) router.push('/owner/login?redirectTo=' + encodeURIComponent(window.location.pathname));
  }, [needLogin, router]);

  const userId = st && st.ok ? st.userId : null;
  const salon: SalonLite | null = st && st.ok && st.salon ? { id: st.salon.id, name: st.salon.name } : null;
  // ★ 店が見つからなかった場合も「読み込み済み」扱い（★ 'wait' のまま止めない）
  const salonReady = st != null && st.ok;
  const loadError = st && st.ok && !st.salon
    ? `店舗情報が見つかりません\nログイン中: ${st.email || st.userId}`
    : session.error && !st ? '読み込めませんでした。しばらくしてから開き直してください。' : '';

  const decision = decideMediaPage({
    ownerId: userId,
    adminUuid: ADMIN_UUID,
    unlocked: mediaUnlocked,
    ready: unlockReady && salonReady,
  });

  // ★ 出さない相手は黙って /mypage へ。★ replace なので「戻る」で戻ってこない
  useEffect(() => {
    if (decision === 'leave') router.replace('/mypage');
  }, [decision, router]);

  return { decision, salon, loadError };
}
