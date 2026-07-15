'use client';

// エリア×こだわり条件でサロンを絞り込む検索クライアント。
// - サロン一覧はサーバー（/search）で fetchSalons 済みのものを props で受け取り、絞り込みはこの中で行う
//   （ShuffledSalons と同じ「全件ロード→クライアント絞り込み」方式。件数が多くないため十分軽い）。
// - こだわり候補は実データの tags から構成済み（buildKodawariGroups）。フィルタは AND（選択を全て満たす）。
// - エリア／こだわりは URL クエリ（?area=... &f=tagA,tagB）に同期し、共有・リロードで復元できる。
// - カード見た目は既存 SalonCard を流用してサイト全体と統一。

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { SalonCard } from './ShuffledSalons';
import { useSalonTherapists } from './useSalonTherapists';
import type { Salon } from '@/app/lib/salons';
import { AREA_ORDER, ALL_AREA, salonInArea } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';
import type { KodawariGroup } from '@/app/lib/kodawari';

// 店名の簡易正規化（ひら/カナ・濁点・長音・空白の揺れを吸収してキーワード一致に使う）。
// DB側の search_normalize と同じ思想（NFKD→結合文字/長音/記号除去→ひら→カナ）。
function normKey(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[゙゚ー・　\s]/g, '')
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .toLowerCase();
}

const CHIP_ACTIVE =
  'bg-pink-600 text-white shadow-md shadow-pink-500/25';
const CHIP_INACTIVE =
  'border border-slate-200 bg-white text-slate-600 hover:border-pink-300 hover:text-pink-600 shadow-sm';

export function SearchClient({
  salons,
  kodawariGroups,
}: {
  salons: Salon[];
  kodawariGroups: KodawariGroup[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL から現在の絞り込み状態を読む（エリア＝値そのもの、こだわり＝カンマ区切り）。
  const area = searchParams.get('area') || ALL_AREA;
  const selectedTags = useMemo(
    () => (searchParams.get('f') || '').split(',').map((s) => s.trim()).filter(Boolean),
    [searchParams],
  );

  // キーワード（店名）はURLに載せず手元の絞り込みとして扱う（打鍵ごとのURL書き換えを避ける）。
  const [keyword, setKeyword] = useState('');

  // セラピストサムネは全件ぶんを一度だけ取得（絞り込みで参照）。
  const salonTherapists = useSalonTherapists(salons);

  // URL 更新ヘルパ（scroll: false で位置を保つ）。
  const pushParams = (next: URLSearchParams) => {
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const setArea = (a: string) => {
    const p = new URLSearchParams(searchParams.toString());
    if (a === ALL_AREA) p.delete('area');
    else p.set('area', a);
    pushParams(p);
  };

  const toggleTag = (tag: string) => {
    const set = new Set(selectedTags);
    if (set.has(tag)) set.delete(tag);
    else set.add(tag);
    const p = new URLSearchParams(searchParams.toString());
    if (set.size) p.set('f', Array.from(set).join(','));
    else p.delete('f');
    pushParams(p);
  };

  const resetAll = () => {
    setKeyword('');
    pushParams(new URLSearchParams());
  };

  // 絞り込み本体。エリア → こだわり(AND) → キーワード（店名）。
  const kw = keyword.trim() ? normKey(keyword) : '';
  const results = useMemo(() => {
    return salons.filter((s) => {
      if (area !== ALL_AREA && !salonInArea(s, area)) return false;
      if (selectedTags.length && !selectedTags.every((t) => s.tags.includes(t))) return false;
      if (kw && !normKey(s.name).includes(kw)) return false;
      return true;
    });
  }, [salons, area, selectedTags, kw]);

  const hasFilter = area !== ALL_AREA || selectedTags.length > 0 || kw.length > 0;

  return (
    <div>
      {/* ── 絞り込みパネル ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 sm:p-5 mb-6">
        {/* エリア */}
        <div className="mb-4">
          <p className="text-xs font-bold text-slate-500 mb-2">エリア</p>
          <div className="flex flex-wrap gap-1.5">
            {AREA_ORDER.map((a) => {
              const active = area === a;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => setArea(a)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${active ? CHIP_ACTIVE : CHIP_INACTIVE}`}
                >
                  {areaLabel(a)}
                </button>
              );
            })}
          </div>
        </div>

        {/* こだわり（カテゴリ別・複数選択＝AND） */}
        {kodawariGroups.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold text-slate-500 mb-2">こだわり条件（すべてを満たすお店を表示）</p>
            <div className="space-y-2.5">
              {kodawariGroups.map((g) => (
                <div key={g.key}>
                  <p className="text-[11px] text-slate-400 mb-1">{g.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.tags.map((tag) => {
                      const active = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all ${active ? CHIP_ACTIVE : CHIP_INACTIVE}`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* キーワード（店名） */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center border border-slate-200 bg-white rounded-full px-3 focus-within:ring-2 focus-within:ring-pink-300 focus-within:border-transparent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-pink-400 flex-shrink-0">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="店名で絞り込む"
              autoComplete="off"
              className="flex-1 py-2 px-2 text-base bg-transparent focus:outline-none text-slate-800 placeholder:text-slate-400"
            />
            {keyword && (
              <button type="button" onClick={() => setKeyword('')} aria-label="クリア" className="text-slate-400 hover:text-slate-600 text-lg leading-none px-1">
                ×
              </button>
            )}
          </div>
          {hasFilter && (
            <button
              type="button"
              onClick={resetAll}
              className="flex-shrink-0 px-3 py-2 rounded-full text-xs font-medium text-slate-500 border border-slate-200 bg-white hover:text-pink-600 hover:border-pink-300"
            >
              条件をクリア
            </button>
          )}
        </div>
      </div>

      {/* ── 件数 ── */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-600">
          該当 <span className="font-bold text-pink-600">{results.length}</span> 件
        </p>
      </div>

      {/* ── 結果一覧 ── */}
      {results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 opacity-40">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <p className="text-sm mb-3">条件に合うお店が見つかりませんでした</p>
          {hasFilter && (
            <button type="button" onClick={resetAll} className="px-4 py-2 rounded-full text-sm font-medium text-pink-600 border border-pink-200 bg-white hover:bg-pink-50">
              条件をクリアして全件表示
            </button>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {results.map((salon) => (
            <SalonCard
              key={salon.id}
              salon={salon}
              therapists={salonTherapists[salon.id] ?? []}
              showAge
            />
          ))}
        </div>
      )}

      {/* トップへ戻る導線 */}
      <div className="mt-8 text-center">
        <Link href="/" className="text-sm text-slate-500 hover:text-pink-600">
          ← トップへ戻る
        </Link>
      </div>
    </div>
  );
}
