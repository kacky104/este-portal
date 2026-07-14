'use client';

// TOPページのタイトルバー直下に置く検索バー。
// 店名・セラピスト名を部分一致（ilike）でリアルタイム検索し、入力欄の下に候補ドロップダウンを出す。
// 候補タップで各詳細ページ（/salon/[id] ／ /therapist/[id]）へ遷移する。
// 非表示サロン・非アクティブのセラピストは公開一覧と同じく除外する。

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/app/lib/supabase/client';

const sb = createClient();
const LIMIT = 8; // 種別ごとの最大候補数

// ilike のワイルドカード（% _ \）をエスケープし、入力を「部分一致の literal」として扱う。
function escapeLike(s: string): string {
  return s.replace(/([\\%_])/g, '\\$1');
}

type SalonHit = { id: number; name: string; area: string };
type TherapistHit = { id: string; name: string; salonName: string; imageUrl: string | null };

// 店名を部分一致で検索。非表示サロンは除外。
async function searchSalons(kw: string): Promise<SalonHit[]> {
  const pattern = `%${escapeLike(kw)}%`;
  const { data } = await sb
    .from('salons')
    .select('id, name, area')
    .ilike('name', pattern)
    .eq('is_hidden', false)
    .order('name', { ascending: true })
    .limit(LIMIT);
  return (data ?? []).map((r) => ({
    id: r.id as number,
    name: (r.name as string) ?? '',
    area: (r.area as string) ?? '',
  }));
}

// セラピスト名を部分一致で検索。非アクティブ・非表示サロン所属は除外。所属店名も取得。
async function searchTherapists(kw: string): Promise<TherapistHit[]> {
  const pattern = `%${escapeLike(kw)}%`;
  const { data } = await sb
    .from('therapists')
    .select('id, name, profile_image_url, is_active, salons!inner(name, is_hidden)')
    .ilike('name', pattern)
    .eq('is_active', true)
    .eq('salons.is_hidden', false)
    .order('name', { ascending: true })
    .limit(LIMIT);
  return (data ?? []).map((r) => {
    const salon = r.salons as unknown as { name?: string } | { name?: string }[] | null;
    const salonName = Array.isArray(salon) ? (salon[0]?.name ?? '') : (salon?.name ?? '');
    return {
      id: String(r.id),
      name: (r.name as string) ?? '',
      salonName,
      imageUrl: (r.profile_image_url as string | null) ?? null,
    };
  });
}

export function HomeSearchBar() {
  const [q, setQ] = useState('');
  const [salons, setSalons] = useState<SalonHit[]>([]);
  const [therapists, setTherapists] = useState<TherapistHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 入力をデバウンス（250ms）して検索。空文字では検索しない。
  useEffect(() => {
    const kw = q.trim();
    if (!kw) {
      setSalons([]);
      setTherapists([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      const [s, th] = await Promise.all([searchSalons(kw), searchTherapists(kw)]);
      if (cancelled) return;
      setSalons(s);
      setTherapists(th);
      setLoading(false);
      setSearched(true);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  // 外側クリックでドロップダウンを閉じる。
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const showDropdown = open && q.trim().length > 0;
  const noHits = searched && !loading && salons.length === 0 && therapists.length === 0;

  return (
    <div ref={wrapRef} className="relative max-w-5xl mx-auto px-4">
      {/* 入力欄（虫眼鏡アイコン＋クリアボタン）。text-base=16pxでiOSの自動ズーム防止。 */}
      <div className="flex items-center border border-pink-200 bg-white px-3 focus-within:ring-2 focus-within:ring-pink-300 focus-within:border-transparent shadow-sm">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-pink-400 flex-shrink-0">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="お店・セラピストの名前で検索"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 py-2.5 px-2 text-base bg-transparent focus:outline-none text-slate-800 placeholder:text-slate-400"
        />
        {q && (
          <button
            type="button"
            onClick={() => { setQ(''); setOpen(false); }}
            aria-label="クリア"
            className="text-slate-400 hover:text-slate-600 text-lg leading-none px-1"
          >
            ×
          </button>
        )}
      </div>

      {/* 候補ドロップダウン */}
      {showDropdown && (
        <div className="absolute left-4 right-4 top-full mt-1 z-40 bg-white border border-slate-200 shadow-lg max-h-[70vh] overflow-y-auto">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-6">検索中...</p>
          ) : noHits ? (
            <p className="text-sm text-slate-400 text-center py-6">該当するお店・セラピストが見つかりません</p>
          ) : (
            <>
              {salons.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-pink-500 bg-pink-50 px-3 py-1.5">お店</p>
                  {salons.map((s) => (
                    <Link
                      key={`salon-${s.id}`}
                      href={`/salon/${s.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 border-t border-slate-100"
                    >
                      <span className="w-9 h-9 flex items-center justify-center bg-gradient-to-br from-pink-100 to-rose-100 text-pink-500 flex-shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1-5h16l1 5" /><path d="M4 9v11h16V9" /><path d="M9 20v-6h6v6" /></svg>
                      </span>
                      <span className="min-w-0">
                        <span className="block font-bold text-sm text-slate-800 truncate">{s.name}</span>
                        {s.area && <span className="block text-xs text-slate-400 truncate">{s.area}</span>}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              {therapists.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-pink-500 bg-pink-50 px-3 py-1.5">セラピスト</p>
                  {therapists.map((t) => (
                    <Link
                      key={`th-${t.id}`}
                      href={`/therapist/${t.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 border-t border-slate-100"
                    >
                      <span className="relative w-9 h-9 overflow-hidden bg-gradient-to-br from-pink-200 to-fuchsia-300 flex items-center justify-center flex-shrink-0">
                        {t.imageUrl ? (
                          <Image src={t.imageUrl} alt={t.name} fill className="object-cover" sizes="36px" />
                        ) : (
                          <span className="text-white font-bold text-sm">{t.name.charAt(0)}</span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-bold text-sm text-slate-800 truncate">{t.name}</span>
                        {t.salonName && <span className="block text-xs text-slate-400 truncate">{t.salonName}</span>}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
