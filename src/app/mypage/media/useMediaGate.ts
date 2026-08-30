'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { ADMIN_UUID } from '@/app/lib/admin';
import { decideMediaPage, readUnlockIntent, MEDIA_UNLOCK_KEY, type MediaPageDecision } from '@/lib/mediaVisibility';

// 媒体連携のページに共通の入口の判定（第56便で /mypage/media から切り出した）。
//
// ★★★ なぜ1か所にまとめたか
//   媒体連携のページが2枚以上になる（入口 /mypage/media と、既存の全部入り /mypage/media/all）。
//   ★ 出し分けの判定がページごとに書かれると、増やすたびに書き忘れが出る。
//     ★ それは第54便のタブ単位の出し分けで踏んだ穴そのもの（設計メモ §142）。
//   → ページが何枚に増えても、入口の判定は【このフック1つ】。
//
// ★ 判定そのものは src/lib/mediaVisibility.ts の decideMediaPage（純粋関数・3値）が持つ。
//   ★ 'wait'（まだ分からない）で追い出さないことが要（設計メモ §144）。

const supabase = createClient();

export type SalonLite = { id: number | string; name: string | null };

export function useMediaGate(): {
  decision: MediaPageDecision;
  salon: SalonLite | null;
  loadError: string;
} {
  const router = useRouter();

  const [salon, setSalon] = useState<SalonLite | null>(null);
  const [loadError, setLoadError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [mediaUnlocked, setMediaUnlocked] = useState(false);
  /** ★ 目隠しの読み取りが済んだか。★ 済む前の false を「出さない」と読まないため */
  const [unlockReady, setUnlockReady] = useState(false);
  /** ★ 店舗の読み込みが済んだか（見つからなかった場合も済んだ扱い） */
  const [salonReady, setSalonReady] = useState(false);

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

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/owner/login?redirectTo=' + encodeURIComponent(window.location.pathname));
        return;
      }
      setUserId(user.id);

      // ★ /mypage と同じ引き方。★ .single() を使わない理由も同じ（同じオーナーで2件ヒットしうる）
      const { data: salonData, error: salonError } = await supabase
        .from('salons')
        .select('id, name')
        .eq('owner_id', user.id)
        .order('is_hidden', { ascending: true })
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (salonError || !salonData) {
        setLoadError(`店舗情報が見つかりません\nログイン中: ${user.email ?? user.id}`);
        setSalonReady(true);
        return;
      }
      setSalon(salonData as SalonLite);
      setSalonReady(true);
    })();
  }, [router]);

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
