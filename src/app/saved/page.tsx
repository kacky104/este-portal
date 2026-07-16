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
  // ピックアップサロン枠（TOP＝area null＋地域＝area 値あり）の全店舗からランダム1店舗を、
  // 保存した店舗一覧の5枚目の下に表示する。保存済みの店舗は候補から除外（重複カード防止）。
  const [pickupSalon, setPickupSalon] = useState<Salon | null>(null);
  useEffect(() => {
    if (!salonsSynced) return;
    let alive = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from('featured_salons').select('salon_id');
      if (!alive || !data) return;
      const savedSet = new Set(getSavedSalons().map(x => x.id));
      const candidateIds = [...new Set(data.map(r => Number(r.salon_id)))].filter(id => !savedSet.has(id));
      if (candidateIds.length === 0) return;
      // 非表示サロンは fetchSalons 側で除外されるため、取得後の結果から抽選する。
      const list = await fetchSalons(supabase, { ids: candidateIds });
      if (!alive || list.length === 0) return;
      setPickupSalon(list[Math.floor(Math.random() * list.length)]);
    })().catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonsSynced]);

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
  const pickupSalonArr = useMemo(() => (pickupSalon ? [pickupSalon] : []), [pickupSalon]);
  const pickupSalonTherapists = useSalonTherapists(pickupSalonArr);

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
                  {pickupSalon && (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
                      <div className="relative">
                        <span className="absolute -top-2.5 left-3 z-10 text-[11px] font-black text-white bg-pink-500 px-3 py-1 rounded-full shadow-lg tracking-wide pointer-events-none">
                          ✦ PICKUP
                        </span>
                        <SalonCard
                          salon={pickupSalon}
                          therapists={pickupSalonTherapists[pickupSalon.id] ?? []}
                          showAge
                          areaNextToDuty
                          ratingAtBottom
                          compactTherapists
                          nameBanner
                        />
                      </div>
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
