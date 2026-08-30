'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { useToast } from '@/app/components/useToast';
import { MediaLinkPanel } from '../MediaLinkPanel';
import { getMediaLinkAlerts } from '@/app/actions/mediaCredentials';
import type { MediaLinkAlert } from '@/lib/mediaLinkStall';
import { ADMIN_UUID } from '@/app/lib/admin';
import { decideMediaPage, readUnlockIntent, MEDIA_UNLOCK_KEY } from '@/lib/mediaVisibility';

// 媒体連携の専用ページ（第55便・㉜）。
//
// ★★★ なぜタブから出したか
//   第54便では「媒体連携タブ」をタブ列から外す形で出し分けていた。
//   ★ タブ単位の出し分けは、同じページの中に【出す部分と出さない部分】が混ざる。
//     タブが1つ増えるたびに filter を足す必要があり、足し忘れが出る。
//   → ページごと分ければ、入口の判定は【この1か所】で済む（設計メモ §142）。
//
// ★★ 出さない相手には【黙って /mypage へ戻す】。
//   「ご利用いただけません」と書くと、媒体連携というページがあること自体が伝わる。
//   ★ 隠していることが伝わるのを避けるのが第54便からの一貫した方針（§135）。
//
// ★★★ 読み込み中に追い出さないこと。
//   userId も目隠しも、読み終わるまでは「出さない側」の値に見える。
//   ★ ここで canSeeMedia をそのまま使うと、正しい持ち主が毎回 /mypage へ弾かれる。
//     → decideMediaPage の 'wait' がその1手前を受け持つ（点検で対にして見張っている）。

const supabase = createClient();

type SalonLite = { id: number | string; name: string | null };

export default function MediaLinkPage() {
  const router = useRouter();
  const { toast, showToast } = useToast();

  const [salon, setSalon] = useState<SalonLite | null>(null);
  const [loadError, setLoadError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [mediaUnlocked, setMediaUnlocked] = useState(false);
  /** ★ 目隠しの読み取りが済んだか。★ 済む前の false を「出さない」と読まないため */
  const [unlockReady, setUnlockReady] = useState(false);
  /** ★ 店舗の読み込みが済んだか（見つからなかった場合も済んだ扱い） */
  const [salonReady, setSalonReady] = useState(false);
  const [mediaAlerts, setMediaAlerts] = useState<MediaLinkAlert[]>([]);

  // ★★ 目隠しの読み書き（第54便と同じ鍵）。/mypage?media=1 で外した状態がそのまま効く。
  //   ★ このページに直接 ?media=1 を付けても外せる（案内するURLを1本にできる）。
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

  // ログイン中の持ち主とその店舗（/mypage と同じ引き方）。
  // ★ .single() を使わない理由は /mypage 側のコメントと同じ（同じオーナーで2件ヒットしうる）。
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/owner/login?redirectTo=' + encodeURIComponent(window.location.pathname));
        return;
      }
      setUserId(user.id);

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

  // ★ 出さない相手は黙って /mypage へ。★ replace なので「戻る」で戻ってこない。
  useEffect(() => {
    if (decision === 'leave') router.replace('/mypage');
  }, [decision, router]);

  // ★ 見張り（第47便）。★ 出す相手にしか取りに行かない（取りに行くこと自体が存在を明かすため）。
  //   ★ 失敗しても画面は止めない。警告が出せないことを「異常なし」と見せないだけ。
  useEffect(() => {
    if (decision !== 'show' || !salon?.id) { setMediaAlerts([]); return; }
    let alive = true;
    (async () => {
      const res = await getMediaLinkAlerts({ salonId: Number(salon.id) });
      if (alive && res.ok) setMediaAlerts(res.data);
    })();
    return () => { alive = false; };
  }, [decision, salon?.id]);

  // ★★ 'show' 以外では【そもそも描かない】。hidden で隠すとページの中身から読めてしまう。
  if (decision === 'leave') return null;

  if (loadError) {
    return (
      <div className="min-h-screen bg-pink-50/30 flex items-center justify-center">
        <p className="text-slate-500 text-sm whitespace-pre-line text-center leading-relaxed px-6">{loadError}</p>
      </div>
    );
  }

  if (decision !== 'show') {
    return (
      <div className="min-h-screen bg-pink-50/30 flex items-center justify-center">
        <p className="text-slate-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pink-50/30">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-pink-200 shadow-lg rounded-2xl px-6 py-3 text-sm font-bold text-pink-600">
          {toast}
        </div>
      )}

      <div className="sticky top-0 z-40 bg-white shadow-sm">
        <header className="border-b border-slate-100">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <h1 className="text-base font-black text-slate-800 tracking-wide">媒体連携</h1>
            <Link href="/mypage" className="text-xs text-slate-400 hover:text-pink-600 font-medium transition-colors">
              マイページへ戻る
            </Link>
          </div>
        </header>

        {/* ★ 見張りはページの先頭に出す（第47便）。
            ★ /mypage からここへ来た人にも、直接ここを開いた人にも同じものが見えるようにする。 */}
        {mediaAlerts.length > 0 && (
          <div className="max-w-2xl mx-auto px-3 pt-2 pb-1">
            {mediaAlerts.map((a) => (
              <div
                key={a.watch + ':' + a.reason + ':' + a.provider + '#' + a.slot}
                className="mb-2 rounded-xl border-2 border-rose-300 bg-rose-50 px-3 py-2.5"
              >
                <p className="text-[12px] font-bold text-rose-700">
                  {a.watch === 'import' ? '駅ちかからの取り込みが止まっています' : '媒体連携が止まっています'}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-rose-900">{a.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <main className="max-w-2xl px-4 mx-auto py-6 space-y-6">
        {salon?.name && (
          <div className="max-w-2xl mx-auto w-full bg-white rounded-3xl border border-slate-100 shadow-sm p-5 text-center">
            <p className="text-[11px] font-bold text-slate-400">店舗</p>
            <p className="mt-1 text-base font-black text-slate-800">{salon.name}</p>
          </div>
        )}

        <MediaLinkPanel
          salonId={salon ? Number(salon.id) : null}
          active={true}
          onToast={showToast}
        />
      </main>
    </div>
  );
}
