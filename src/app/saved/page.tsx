'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { fetchSalons, type Salon } from '@/app/lib/salons';
import { getSavedSalons, SAVED_SALONS_EVENT } from '@/lib/savedSalons';
import { SalonCard } from '@/app/components/ShuffledSalons';
import { useSalonTherapists } from '@/app/components/useSalonTherapists';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';

export default function SavedPage() {
  // 保存ID（保存順の逆＝最近保存したものが先頭）。localStorage を購読してライブ更新。
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [synced, setSynced]     = useState(false);
  // 取得済みサロンデータのキャッシュ（解除時に再取得せず即フィルタするため）。
  const [salonsById, setSalonsById] = useState<Record<number, Salon>>({});
  const attemptedRef = useRef<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sync = () => {
      setSavedIds(getSavedSalons().map(s => s.id).reverse());
      setSynced(true);
    };
    sync();
    window.addEventListener(SAVED_SALONS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SAVED_SALONS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // 未取得の保存IDだけをまとめて取得（トップと同じ fetchSalons を共有）。
  useEffect(() => {
    if (!synced) return;
    const missing = savedIds.filter(id => !attemptedRef.current.has(id));
    if (missing.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const data = await fetchSalons(supabase, missing);
      if (cancelled) return;
      missing.forEach(id => attemptedRef.current.add(id));
      setSalonsById(prev => {
        const next = { ...prev };
        for (const s of data) next[s.id] = s;
        return next;
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [savedIds, synced]);

  // 保存順に並べ、取得できたサロンだけ表示（非公開・削除済みは除外）。
  // 解除されると savedIds が変わり、ここで即座に一覧から外れる。
  const salons = useMemo(
    () => savedIds.map(id => salonsById[id]).filter(Boolean) as Salon[],
    [savedIds, salonsById]
  );

  const salonTherapists = useSalonTherapists(salons);

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
          <span className="text-slate-600 font-medium">保存したお店</span>
        </nav>

        {/* 見出し */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-500 to-pink-700" />
          <h1 className="text-2xl font-bold text-slate-900">保存したお店</h1>
          {!loading && salons.length > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-pink-50 text-pink-500 border border-pink-200">
              {salons.length}件
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin mb-3 opacity-60">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <p className="text-sm">読み込み中...</p>
          </div>
        ) : salons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E5E7EB" strokeWidth="1.5" className="mb-4">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm text-slate-400 mb-6">保存したお店はまだありません</p>
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
