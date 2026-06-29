'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { fetchShopMiniByIds } from './xAffiliation';
import { VerifiedBadge } from './VerifiedBadge';

const sb = createClient();
const LIMIT = 50;

const KIND_LABEL: Record<string, string> = { user: 'ユーザー', therapist: 'セラピスト', shop: 'お店' };

// ilike のワイルドカード（% _ \）をエスケープし、入力を「部分一致の literal」として扱う。
// .or() は使わず handle / display_name を別々の .ilike() で引いてマージするため、
// カンマ・カッコ等で .or() フィルタ文字列が壊れる事故が起きない（パターンは値として渡る）。
function escapeLike(s: string): string {
  return s.replace(/([\\%_])/g, '\\$1');
}

type ProfRow = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  kind: 'user' | 'therapist' | 'shop';
  is_verified: boolean;
  status: string;
  affiliated_shop_id: string | null;
};

type Hit = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  kind: 'user' | 'therapist' | 'shop';
  isVerified: boolean;
  affiliatedShop: { handle: string; displayName: string } | null;
};

const SELECT = 'id, handle, display_name, avatar_url, kind, is_verified, status, affiliated_shop_id';

// handle / display_name を部分一致（ilike）で検索。BAN(status='rejected')は除外。
// 2クエリ（handle / 表示名）を投げて id でマージ・重複除去し、handle 昇順で返す。所属バッジも解決。
async function searchProfiles(raw: string): Promise<Hit[]> {
  const kw = raw.trim();
  if (!kw) return [];
  const pattern = `%${escapeLike(kw)}%`;

  const [byHandle, byName] = await Promise.all([
    sb.from('x_profiles').select(SELECT).ilike('handle', pattern).neq('status', 'rejected').limit(LIMIT),
    sb.from('x_profiles').select(SELECT).ilike('display_name', pattern).neq('status', 'rejected').limit(LIMIT),
  ]);

  const map = new Map<string, ProfRow>();
  [...((byHandle.data ?? []) as ProfRow[]), ...((byName.data ?? []) as ProfRow[])].forEach((r) => {
    if (!map.has(r.id)) map.set(r.id, r);
  });
  const rows = [...map.values()].sort((a, b) => a.handle.localeCompare(b.handle)).slice(0, LIMIT);

  // セラピストの所属先バッジを1クエリで解決（N+1回避）。
  const shopDict = await fetchShopMiniByIds(sb, rows.map((r) => r.affiliated_shop_id));

  return rows.map((r) => {
    const shop = r.affiliated_shop_id ? shopDict.get(r.affiliated_shop_id) : undefined;
    return {
      id: r.id,
      handle: r.handle,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      kind: r.kind,
      isVerified: Boolean(r.is_verified),
      affiliatedShop: shop ? { handle: shop.handle, displayName: shop.displayName } : null,
    };
  });
}

// ユーザー検索（公開・要ログインなし）。入力はデバウンス（300ms）で検索。空文字では検索しない。
export function XSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const kw = q.trim();
    if (!kw) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      const hits = await searchProfiles(kw);
      if (cancelled) return;
      setResults(hits);
      setLoading(false);
      setSearched(true);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="py-3">
      <h1 className="x-rescue-muted text-lg font-black text-white drop-shadow-sm mb-3 px-1">ユーザーを検索</h1>

      {/* 入力欄（白カード面＝両テーマで読める） */}
      <div className="x-card rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-3">
        <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50/50 px-3 focus-within:ring-2 focus-within:ring-indigo-300 focus-within:border-transparent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="名前や @ID で検索"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 py-2.5 px-2 text-sm bg-transparent focus:outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="クリア"
              className="text-slate-400 hover:text-slate-600 text-lg leading-none px-1"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* 結果 */}
      <div className="mt-3">
        {!q.trim() ? (
          <p className="x-rescue-muted text-sm text-white/90 text-center py-10 drop-shadow-sm">
            表示名や @ID（一部でOK）でユーザーを探せます
          </p>
        ) : loading ? (
          <p className="x-rescue-muted text-sm text-white/90 text-center py-10 drop-shadow-sm">検索中...</p>
        ) : results.length === 0 && searched ? (
          <p className="x-rescue-muted text-sm text-white/90 text-center py-10 drop-shadow-sm">
            該当するユーザーが見つかりません
          </p>
        ) : (
          <div className="space-y-2">
            {results.map((u) => (
              <Link
                key={u.id}
                href={`/x/u/${u.handle}`}
                className="x-card flex items-center gap-3 rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-3 hover:brightness-[0.98] transition"
              >
                <span className="relative w-11 h-11 rounded-full overflow-hidden border border-slate-100 bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                  {u.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.avatarUrl} alt={u.displayName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white font-bold">{u.displayName.charAt(0) || '?'}</span>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-sm text-slate-900 truncate max-w-[50%]">{u.displayName}</span>
                    {u.kind === 'shop' && u.isVerified && <VerifiedBadge />}
                    <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded-full px-1.5 py-0.5">
                      {KIND_LABEL[u.kind] ?? u.kind}
                    </span>
                    {u.affiliatedShop && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5 truncate max-w-[45%]">
                        {u.affiliatedShop.displayName}所属
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 truncate">@{u.handle}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
