'use client';

// TOPページのタイトルバー直下に置く検索バー。
// 「お店」「セラピスト」をタブで切り替えて、名前を部分一致（ilike）でリアルタイム検索し、
// 入力欄の下に候補ドロップダウンを出す。候補タップで各詳細ページ
// （/salon/[id] ／ /therapist/[id]）へ遷移する。
// 非表示サロン・非アクティブのセラピストは公開一覧と同じく除外する。

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/app/lib/supabase/client';
import { toKana, isRomaji } from 'wanakana';

const sb = createClient();
const LIMIT = 12; // 候補の最大数（お店・セラピスト各タブごと）

type Tab = 'salon' | 'therapist';

type SalonHit = { id: number; name: string; area: string; imageUrl: string | null };
type TherapistHit = { id: string; name: string; salonName: string; imageUrl: string | null };

// 入力の前処理：ローマ字はカナへ寄せる（"sara"→さら）。店名/セラピ名がカナ主体なら決定的に一致する。
// ひらがな⇄カタカナ・濁点・長音・半角カナ の揺れ吸収は DB 側の search_normalize に一本化したため、
// クライアントでの表記バリアント生成や like エスケープは不要になった。
function normalizeInput(raw: string): string {
  const s = raw.trim();
  return isRomaji(s) ? toKana(s) : s;
}

// 店名を部分一致で検索（RPC: search_salons）。非表示サロン除外・サムネイル/エリア付きはDB側で処理。
async function searchSalons(kw: string): Promise<SalonHit[]> {
  const { data, error } = await sb.rpc('search_salons', {
    q: normalizeInput(kw),
    max_results: LIMIT,
  });
  if (error) {
    console.error(error);
    return [];
  }
  return (
    (data ?? []) as { id: number; name: string | null; area: string | null; image_url: string | null }[]
  ).map((r) => ({
    id: r.id,
    name: r.name ?? '',
    area: r.area ?? '',
    imageUrl: r.image_url ?? null,
  }));
}

// セラピスト名を部分一致で検索（RPC: search_therapists）。非アクティブ・非表示店所属の除外・所属店名取得はDB側。
async function searchTherapists(kw: string): Promise<TherapistHit[]> {
  const { data, error } = await sb.rpc('search_therapists', {
    q: normalizeInput(kw),
    max_results: LIMIT,
  });
  if (error) {
    console.error(error);
    return [];
  }
  return (
    (data ?? []) as { id: string; name: string | null; profile_image_url: string | null; salon_name: string | null }[]
  ).map((r) => ({
    id: r.id,
    name: r.name ?? '',
    salonName: r.salon_name ?? '',
    imageUrl: r.profile_image_url ?? null,
  }));
}

export function HomeSearchBar() {
  const [tab, setTab] = useState<Tab>('salon');
  const [q, setQ] = useState('');
  const [salons, setSalons] = useState<SalonHit[]>([]);
  const [therapists, setTherapists] = useState<TherapistHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 入力 or タブ変更で、選択中タブのみ検索（デバウンス250ms）。空文字では検索しない。
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
      if (tab === 'salon') {
        const s = await searchSalons(kw);
        if (cancelled) return;
        setSalons(s);
      } else {
        const th = await searchTherapists(kw);
        if (cancelled) return;
        setTherapists(th);
      }
      if (!cancelled) {
        setLoading(false);
        setSearched(true);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, tab]);

  // 外側クリックでドロップダウンを閉じる。
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const showDropdown = open && q.trim().length > 0;
  const hits = tab === 'salon' ? salons.length : therapists.length;
  const noHits = searched && !loading && hits === 0;

  return (
    <div ref={wrapRef} className="relative max-w-5xl mx-auto px-4">
      {/* 種別トグル（左）＋検索入力（右）を横並び。トグルをタップでお店⇔セラピストを切替。
          切替に合わせて検索入力はその分だけ短くなる（flex-1）。 */}
      <div className="flex gap-2 items-stretch">
        {/* 種別トグルボタン：現在の種別を表示し、タップで切替（上下矢印アイコンで切替可能と示す） */}
        <button
          type="button"
          onClick={() => { setTab(tab === 'salon' ? 'therapist' : 'salon'); setOpen(true); }}
          aria-label="お店・セラピストを切替"
          className={`flex-shrink-0 w-[72px] flex items-center justify-center gap-0.5 px-1 py-[5px] font-bold text-white shadow-sm bg-gradient-to-r ${
            tab === 'salon'
              ? 'from-[#38BDF8] to-[#2563EB]'   /* お店＝青系グラデ（明→濃） */
              : 'from-[#F472B6] to-[#BE185D]'   /* セラピスト＝ピンク系グラデ（明→濃） */
          }`}
        >
          {/* セラピストは文字数が多いので小さめのフォントにして、固定幅(w-24)内に収める＝切替でボタン幅・アイコンが変わらない */}
          <span className="whitespace-nowrap leading-none text-sm">{tab === 'salon' ? 'お店' : 'セラピ'}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M7 4v13M7 4L3 8M7 4l4 4" /><path d="M17 20V7M17 20l4-4M17 20l-4-4" /></svg>
        </button>

        {/* 入力欄（虫眼鏡アイコン＋クリアボタン）。text-base=16pxでiOSの自動ズーム防止。 */}
        <div className="flex-1 min-w-0 flex items-center border border-pink-200 bg-white px-3 focus-within:ring-2 focus-within:ring-pink-300 focus-within:border-transparent shadow-sm">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-pink-400 flex-shrink-0">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={tab === 'salon' ? 'お店の名前で検索' : 'セラピストの名前で検索'}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 py-[5px] px-2 text-base bg-transparent focus:outline-none text-slate-800 placeholder:text-slate-400"
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
      </div>

      {/* 候補ドロップダウン（選択中タブのみ） */}
      {showDropdown && (
        <div className="absolute left-4 right-4 top-full mt-1 z-40 bg-white border border-slate-200 shadow-lg max-h-[70vh] overflow-y-auto">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-6">検索中...</p>
          ) : noHits ? (
            <p className="text-sm text-slate-400 text-center py-6">
              {tab === 'salon' ? '該当するお店が見つかりません' : '該当するセラピストが見つかりません'}
            </p>
          ) : tab === 'salon' ? (
            salons.map((s) => (
              <Link
                key={`salon-${s.id}`}
                href={`/salon/${s.id}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 border-t border-slate-100 first:border-t-0"
              >
                <span className="relative w-11 h-11 overflow-hidden bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center flex-shrink-0">
                  {s.imageUrl ? (
                    <Image src={s.imageUrl} alt={s.name} fill className="object-cover" sizes="44px" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-pink-400"><path d="M3 9l1-5h16l1 5" /><path d="M4 9v11h16V9" /><path d="M9 20v-6h6v6" /></svg>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block font-bold text-sm text-slate-800 truncate">{s.name}</span>
                  {s.area && <span className="block text-xs text-slate-400 truncate">{s.area}</span>}
                </span>
              </Link>
            ))
          ) : (
            therapists.map((t) => (
              <Link
                key={`th-${t.id}`}
                href={`/therapist/${t.id}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 border-t border-slate-100 first:border-t-0"
              >
                <span className="relative w-11 h-11 overflow-hidden bg-gradient-to-br from-pink-200 to-fuchsia-300 flex items-center justify-center flex-shrink-0">
                  {t.imageUrl ? (
                    <Image src={t.imageUrl} alt={t.name} fill className="object-cover" sizes="44px" />
                  ) : (
                    <span className="text-white font-bold text-sm">{t.name.charAt(0)}</span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block font-bold text-sm text-slate-800 truncate">{t.name}</span>
                  {t.salonName && <span className="block text-xs text-slate-400 truncate">{t.salonName}</span>}
                </span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
