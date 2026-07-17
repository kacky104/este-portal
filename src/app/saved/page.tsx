'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { createClient } from '@/app/lib/supabase/client';
import { fetchSalons, type Salon } from '@/app/lib/salons';
import { getSavedSalons, SAVED_SALONS_EVENT } from '@/lib/savedSalons';
import { getSavedTherapists, SAVED_THERAPISTS_EVENT } from '@/lib/savedTherapists';
import { SalonCard } from '@/app/components/ShuffledSalons';
import { useSalonTherapists } from '@/app/components/useSalonTherapists';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { GridCard, fetchTherapistsByIds, type Therapist } from '@/components/SalonTherapists';
import { TherapistPickupBanner } from '@/app/components/TherapistPickupBanner';
import { fetchActiveTherapistPickupBanners, type TherapistPickupBanner as PickupBanner } from '@/app/lib/therapistPickupBanners';
import { RecommendedSalonBannerSlider } from '@/app/components/RecommendedSalonBannerSlider';
import { fetchActiveRecommendedSalonBanners, type RecommendedSalonBanner } from '@/app/lib/recommendedSalonBanners';
import { createPublicClient } from '@/app/lib/supabase/public';

export default function SavedPage() {
  // 表示中タブ（既定: 保存した店舗）
  const [tab, setTab] = useState<'salons' | 'therapists'>('salons');

  // ── 保存した店舗 ──────────────────────────────────────────
  const [salonIds, setSalonIds]       = useState<number[]>([]);
  const [salonsSynced, setSalonsSynced] = useState(false);
  const [salonsById, setSalonsById]   = useState<Record<number, Salon>>({});
  const salonAttempted = useRef<Set<number>>(new Set());
  const [loadingSalons, setLoadingSalons] = useState(true);

  // ── 保存したセラピスト ────────────────────────────────────
  const [therapistIds, setTherapistIds]       = useState<number[]>([]);
  const [therapistsSynced, setTherapistsSynced] = useState(false);
  const [therapistsById, setTherapistsById]   = useState<Record<number, Therapist>>({});
  const therapistAttempted = useRef<Set<number>>(new Set());
  const [loadingTherapists, setLoadingTherapists] = useState(true);
  // セラピストピックアップ枠（保存したセラピスト一覧の最後に表示）。公開データを匿名クライアントで取得。
  const [pickupBanners, setPickupBanners] = useState<PickupBanner[]>([]);
  useEffect(() => {
    let alive = true;
    fetchActiveTherapistPickupBanners().then(b => { if (alive) setPickupBanners(b); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // 保存した店舗一覧の5枚目の下に出す「サロンバナー」（ランダム1店舗）。
  // 候補＝TOPピックアップ＋地域ピックアップ（featured_salons 全行・画像あり）＋TOPおすすめサロンバナー
  // （recommended_salon_banners）。同一サロンの重複のみ除外（保存済み店舗の除外は 2026-07-17 に廃止＝
  // 候補が少ない環境でもバナーが必ず出るようにする。保存済みの店のバナーが並ぶことは許容）。
  // 表示はおすすめサロンバナーと同一カード（RecommendedSalonBannerSlider を単発で流用）。
  const [pickupBanner, setPickupBanner] = useState<RecommendedSalonBanner | null>(null);
  useEffect(() => {
    let alive = true;
    // 公開データのみ読むため匿名クライアントを使う。保存リストは localStorage 同期読み＝マウント時に即取得できる。
    // 取得に失敗した場合は1.2秒後に1回だけ再試行（ページ内遷移直後の一時的な失敗の自己回復）。
    // 候補0件やエラー時は console に診断を残す（「初回だけバナーが出ない」報告の切り分け用・2026-07-17）。
    const load = async (attempt: number) => {
      try {
        const supabase = createPublicClient();
        const [recommended, { data: featuredRows }] = await Promise.all([
          fetchActiveRecommendedSalonBanners(),
          supabase.from('featured_salons').select('salon_id, image_url'),
        ]);
        if (!alive) return;
        // おすすめバナー側＝完成済みバナー（画像・サロン名・地域・丸アイコン込み）。
        const recCandidates = recommended;
        const recIds = new Set(recCandidates.map(b => b.salonId));
        // ピックアップ側＝featured_salons の画像付き行のみ。おすすめ側と同一サロンは除外（重複防止）。
        const featCandidates = [...new Map(
          (featuredRows ?? [])
            .map(r => ({ salonId: Number(r.salon_id), imageUrl: ((r.image_url as string | null) ?? '').trim() }))
            .filter(c => c.imageUrl !== '' && !recIds.has(c.salonId))
            .map(c => [c.salonId, c] as const),
        ).values()];
        const total = recCandidates.length + featCandidates.length;
        if (total === 0) {
          console.info('[saved] サロンバナー: 表示候補0件（バナー未登録の可能性）', {
            recommended: recommended.length, featuredRows: (featuredRows ?? []).length,
          });
          return;
        }
        const idx = Math.floor(Math.random() * total);
        if (idx < recCandidates.length) {
          setPickupBanner(recCandidates[idx]);
          return;
        }
        // featured 行はバナー型に組み立て（サロン名・地域・セラピスト丸アイコンを追加取得）。
        // 非公開サロンは salons が返らず salonName='' → バナー側で画像のみ・非リンクにフォールバック。
        const picked = featCandidates[idx - recCandidates.length];
        const [{ data: salonData }, { data: therapistData }] = await Promise.all([
          supabase.from('salons').select('id, name, area').eq('id', picked.salonId).maybeSingle(),
          supabase.from('therapists').select('profile_image_url').eq('salon_id', picked.salonId).not('profile_image_url', 'is', null).limit(4),
        ]);
        if (!alive) return;
        setPickupBanner({
          id: `featured-${picked.salonId}`,
          imageUrl: picked.imageUrl,
          altText: (salonData?.name as string | undefined) ?? '',
          salonId: picked.salonId,
          salonName: (salonData?.name as string | undefined) ?? '',
          area: (salonData?.area as string | undefined) ?? '',
          therapistImages: (therapistData ?? [])
            .map(t => t.profile_image_url as string | null)
            .filter((u): u is string => Boolean(u)),
        });
      } catch (e) {
        console.error('[saved] サロンバナーの取得に失敗:', e);
        if (alive && attempt < 1) {
          window.setTimeout(() => { if (alive) load(attempt + 1); }, 1200);
        }
      }
    };
    load(0);
    return () => { alive = false; };
  }, []);

  // ヘッダーのバッジ等からの #therapists / #salons でタブを切替（ハッシュ連動）。
  useEffect(() => {
    const applyHash = () => {
      const h = window.location.hash;
      if (h === '#therapists') setTab('therapists');
      else if (h === '#salons') setTab('salons');
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  // localStorage の保存ID購読（保存順の逆＝最近が先頭）。解除に即応。
  useEffect(() => {
    const sync = () => {
      setSalonIds(getSavedSalons().map(s => s.id).reverse());
      setSalonsSynced(true);
    };
    sync();
    window.addEventListener(SAVED_SALONS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SAVED_SALONS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      setTherapistIds(getSavedTherapists().map(t => t.id).reverse());
      setTherapistsSynced(true);
    };
    sync();
    window.addEventListener(SAVED_THERAPISTS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SAVED_THERAPISTS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // 未取得の店舗だけまとめて取得（トップと同じ fetchSalons を共有）。
  useEffect(() => {
    if (!salonsSynced) return;
    const missing = salonIds.filter(id => !salonAttempted.current.has(id));
    if (missing.length === 0) { setLoadingSalons(false); return; }
    let cancelled = false;
    (async () => {
      const data = await fetchSalons(createClient(), { ids: missing });
      if (cancelled) return;
      missing.forEach(id => salonAttempted.current.add(id));
      setSalonsById(prev => {
        const next = { ...prev };
        for (const s of data) next[s.id] = s;
        return next;
      });
      setLoadingSalons(false);
    })();
    return () => { cancelled = true; };
  }, [salonIds, salonsSynced]);

  // 未取得のセラピストだけまとめて取得（既存の取得ロジックを共有）。
  useEffect(() => {
    if (!therapistsSynced) return;
    const missing = therapistIds.filter(id => !therapistAttempted.current.has(id));
    if (missing.length === 0) { setLoadingTherapists(false); return; }
    let cancelled = false;
    (async () => {
      const data = await fetchTherapistsByIds(missing);
      if (cancelled) return;
      missing.forEach(id => therapistAttempted.current.add(id));
      setTherapistsById(prev => {
        const next = { ...prev };
        for (const t of data) next[Number(t.id)] = t;
        return next;
      });
      setLoadingTherapists(false);
    })();
    return () => { cancelled = true; };
  }, [therapistIds, therapistsSynced]);

  // 保存順に並べ、取得できたものだけ表示（非公開・削除/退店は除外）。
  // 解除されると ID 配列が変わり、ここで即座に一覧から外れる。
  const salons = useMemo(
    () => salonIds.map(id => salonsById[id]).filter(Boolean) as Salon[],
    [salonIds, salonsById]
  );
  const therapists = useMemo(
    () => therapistIds.map(id => therapistsById[id]).filter(Boolean) as Therapist[],
    [therapistIds, therapistsById]
  );

  const salonTherapists = useSalonTherapists(salons);

  const loading = loadingSalons || loadingTherapists;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">

        {/* パンくず */}
        <nav className="flex items-center gap-1.5 text-[13px] text-slate-400 mb-6" aria-label="パンくずリスト">
          <Link href="/" className="hover:text-pink-600 transition-colors">トップ</Link>
          <span className="text-slate-300">›</span>
          <span className="text-slate-600 font-medium">保存した一覧</span>
        </nav>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin mb-3 opacity-60">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <p className="text-sm">読み込み中...</p>
          </div>
        ) : (
          <>
            {/* ─── タブ（保存した店舗／保存したセラピスト） ─── */}
            <div
              className="flex gap-2 mb-8 overflow-x-auto"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
            >
              {([
                ['salons', '保存した店舗', salons.length],
                ['therapists', '保存したセラピスト', therapists.length],
              ] as const).map(([key, label, count]) => {
                const active = tab === key;
                return (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-medium transition-all ${
                      active
                        ? 'bg-pink-600 text-white shadow-md shadow-pink-500/25'
                        : 'border border-slate-200 bg-white text-slate-500 hover:border-pink-300 hover:text-pink-600 shadow-sm'
                    }`}
                  >
                    {label}
                    <span className={`text-[11px] rounded-full px-1.5 py-px font-bold ${active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ─── タブ内容（アクティブな一覧のみ表示） ─── */}
            {tab === 'salons' ? (
              salons.length === 0 ? (
                <p className="text-sm text-slate-400 py-12 text-center border border-dashed border-slate-200 rounded-2xl bg-white/40">
                  保存した店舗はまだありません
                </p>
              ) : (
                <>
                  {/* 先頭5枚 → ピックアップ店舗（ランダム1店舗・PICKUPバッジ付き） → 残り。5枚未満なら最後のカードの下。 */}
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {salons.slice(0, 5).map(salon => (
                      <SalonCard
                        key={salon.id}
                        salon={salon}
                        therapists={salonTherapists[salon.id] ?? []}
                        showAge
                        areaNextToDuty
                        ratingAtBottom
                        compactTherapists
                        showSaveButton
                        nameBanner
                      />
                    ))}
                  </div>
                  {pickupBanner && (
                    <div className="mt-5">
                      <RecommendedSalonBannerSlider banners={[pickupBanner]} hideTitle />
                    </div>
                  )}
                  {salons.length > 5 && (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
                      {salons.slice(5).map(salon => (
                        <SalonCard
                          key={salon.id}
                          salon={salon}
                          therapists={salonTherapists[salon.id] ?? []}
                          showAge
                          areaNextToDuty
                          ratingAtBottom
                          compactTherapists
                          showSaveButton
                          nameBanner
                        />
                      ))}
                    </div>
                  )}
                </>
              )
            ) : (
              therapists.length === 0 ? (
                <p className="text-sm text-slate-400 py-12 text-center border border-dashed border-slate-200 rounded-2xl bg-white/40">
                  保存したセラピストはまだありません
                </p>
              ) : (
                <>
                  {/* 先頭5枚 → ピックアップ枠 → 残り。5枚未満なら全カードの下にピックアップ枠。 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {therapists.slice(0, 5).map((t, i) => (
                      <GridCard key={t.id} therapist={t} index={i} showSaveButton saveButtonPos="card-right" largeImage />
                    ))}
                  </div>
                  {pickupBanners.length > 0 && (
                    <div className="mt-4">
                      <TherapistPickupBanner banners={pickupBanners} />
                    </div>
                  )}
                  {therapists.length > 5 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      {therapists.slice(5).map((t, i) => (
                        <GridCard key={t.id} therapist={t} index={i + 5} showSaveButton saveButtonPos="card-right" largeImage />
                      ))}
                    </div>
                  )}
                </>
              )
            )}
          </>
        )}
      </main>

      {/* ─── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
