'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { fetchSalons, type Salon } from '@/app/lib/salons';
import { getSavedSalons, SAVED_SALONS_EVENT } from '@/lib/savedSalons';
import { getSavedTherapists, SAVED_THERAPISTS_EVENT } from '@/lib/savedTherapists';
import { SalonCard } from '@/app/components/ShuffledSalons';
import { useSalonTherapists } from '@/app/components/useSalonTherapists';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { GridCard, fetchTherapistsByIds, type Therapist } from '@/components/SalonTherapists';

export default function SavedPage() {
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
      const data = await fetchSalons(createClient(), missing);
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
  const bothEmpty = !loading && salons.length === 0 && therapists.length === 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center flex-shrink-0">
              <span className="text-pink-500 font-bold text-sm leading-none">◆</span>
            </div>
            <span className="font-bold text-[15px] tracking-wide text-pink-600">
              福岡メンズエステポータル
            </span>
          </Link>
          <SavedSalonsMenu />
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
        ) : bothEmpty ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E5E7EB" strokeWidth="1.5" className="mb-4">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm text-slate-400 mb-6">保存した店舗・セラピストはまだありません</p>
            <Link
              href="/salons"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-pink-300 text-pink-600 text-sm font-medium hover:bg-pink-50 hover:border-pink-400 transition-all"
            >
              サロン一覧を見る
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        ) : (
          <div className="space-y-12">

            {/* ─── 保存した店舗 ─────────────────────────────── */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-500 to-pink-700" />
                <h2 className="text-xl font-bold text-slate-900">保存した店舗</h2>
                {salons.length > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-pink-50 text-pink-500 border border-pink-200">
                    {salons.length}件
                  </span>
                )}
              </div>
              {salons.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center border border-dashed border-slate-200 rounded-2xl bg-white/40">
                  保存した店舗はまだありません
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {salons.map(salon => (
                    <SalonCard
                      key={salon.id}
                      salon={salon}
                      therapists={salonTherapists[salon.id] ?? []}
                      showAge
                      areaNextToDuty
                      ratingAtBottom
                      compactTherapists
                      showSaveButton
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ─── 保存したセラピスト ───────────────────────── */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
                <h2 className="text-xl font-bold text-slate-900">保存したセラピスト</h2>
                {therapists.length > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-pink-50 text-pink-500 border border-pink-200">
                    {therapists.length}件
                  </span>
                )}
              </div>
              {therapists.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center border border-dashed border-slate-200 rounded-2xl bg-white/40">
                  保存したセラピストはまだありません
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {therapists.map((t, i) => (
                    <GridCard key={t.id} therapist={t} index={i} showSaveButton />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* ─── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 福岡メンズエステポータル. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
