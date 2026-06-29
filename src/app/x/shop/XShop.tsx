'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import type { TherapistMini } from '../xAffiliation';

const supabase = createClient();

export type PendingRequest = {
  requestId: string;
  therapist: TherapistMini;
};

// 検索ヒットしたセラピストと、その現在の所属状態。
type SearchResult = {
  therapist: TherapistMini;
  // 'none'=未所属 / 'self'=自店所属済み / {shopName}=他店所属
  affiliation: 'none' | 'self' | { shopName: string };
};

// LIKE のワイルドカード（% _ \）をエスケープし、ilike で大文字小文字無視の「完全一致」にする。
function escapeLike(s: string): string {
  return s.replace(/([\\%_])/g, '\\$1');
}

export function XShop({
  shopProfileId,
  initialPending,
  initialAffiliated,
}: {
  shopProfileId: string;
  initialPending: PendingRequest[];
  initialAffiliated: TherapistMini[];
}) {
  const [pending, setPending] = useState<PendingRequest[]>(initialPending);
  const [affiliated, setAffiliated] = useState<TherapistMini[]>(initialAffiliated);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false); // 一度でも検索したか（未ヒット表示の出し分け）
  const [result, setResult] = useState<SearchResult | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2800);
  };

  const pendingIds = useMemo(() => new Set(pending.map((p) => p.therapist.id)), [pending]);
  const affiliatedIds = useMemo(() => new Set(affiliated.map((a) => a.id)), [affiliated]);

  // @handle 完全一致（lower）でセラピストを1件検索。ilike＋JS再検証で `_` などの誤マッチを防ぐ。
  const runSearch = async () => {
    const raw = query.trim().replace(/^@+/, '');
    if (!raw || searching) return;
    setSearching(true);
    setSearched(true);
    setResult(null);

    const { data, error } = await supabase
      .from('x_profiles')
      .select('id, handle, display_name, avatar_url, affiliated_shop_id, status')
      .ilike('handle', escapeLike(raw))
      .eq('kind', 'therapist')
      .neq('status', 'rejected')
      .limit(1);

    if (error) {
      setSearching(false);
      showToast(`検索に失敗しました：${error.message}`);
      return;
    }

    const row = (data ?? [])[0] as
      | { id: string; handle: string; display_name: string; avatar_url: string | null; affiliated_shop_id: string | null }
      | undefined;

    if (!row || row.handle.toLowerCase() !== raw.toLowerCase()) {
      setResult(null);
      setSearching(false);
      return;
    }

    const therapist: TherapistMini = {
      id: row.id,
      handle: row.handle,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    };

    // 所属状態の判定（他店所属なら店舗名を1件引いて表示）。
    let affiliation: SearchResult['affiliation'] = 'none';
    if (row.affiliated_shop_id === shopProfileId) {
      affiliation = 'self';
    } else if (row.affiliated_shop_id) {
      const { data: shop } = await supabase
        .from('x_profiles')
        .select('display_name')
        .eq('id', row.affiliated_shop_id)
        .maybeSingle();
      affiliation = { shopName: (shop?.display_name as string) ?? '他店' };
    }

    setResult({ therapist, affiliation });
    setSearching(false);
  };

  // 所属申請：RPC で作成（verified 店舗のみ通過）。既存pendingがあればそのidが返る。
  const requestAffiliation = async (therapist: TherapistMini) => {
    if (busy) return;
    setBusy(therapist.id);
    const { data, error } = await supabase.rpc('x_affiliation_request_create', {
      p_therapist_profile_id: therapist.id,
    });
    setBusy(null);
    if (error) {
      showToast(error.message);
      return;
    }
    // 既に一覧にあれば追加しない（RPC は既存pendingのidを返すため重複し得る）。
    setPending((list) =>
      list.some((p) => p.therapist.id === therapist.id)
        ? list
        : [{ requestId: String(data), therapist }, ...list]
    );
    showToast('申請を送信しました');
  };

  // 申請取消：自分の pending 申請を取消。
  const cancelRequest = async (requestId: string) => {
    if (busy) return;
    setBusy(requestId);
    const { error } = await supabase.rpc('x_affiliation_request_cancel', {
      p_request_id: Number(requestId),
    });
    setBusy(null);
    if (error) {
      showToast(error.message);
      return;
    }
    setPending((list) => list.filter((p) => p.requestId !== requestId));
    showToast('申請を取り消しました');
  };

  // 所属解除：店舗側から確定所属を解除。
  const removeAffiliation = async (therapist: TherapistMini) => {
    if (busy) return;
    if (!window.confirm(`「${therapist.displayName}」の所属を解除しますか？`)) return;
    setBusy(therapist.id);
    const { error } = await supabase.rpc('x_affiliation_remove', {
      p_therapist_profile_id: therapist.id,
    });
    setBusy(null);
    if (error) {
      showToast(error.message);
      return;
    }
    setAffiliated((list) => list.filter((a) => a.id !== therapist.id));
    showToast('所属を解除しました');
  };

  return (
    <div className="x-card my-6 p-5 rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
      <h1 className="text-xl font-black tracking-tight mb-1">店舗管理</h1>
      <p className="text-xs text-slate-400 mb-5">セラピストの所属申請・所属管理</p>

      {/* ── セラピスト検索（@ID 完全一致） ── */}
      <section className="mb-7">
        <h2 className="text-sm font-black text-slate-800 mb-2">セラピストを所属申請</h2>
        <p className="text-[12px] text-slate-400 mb-2 leading-relaxed">
          セラピスト本人から教わった <span className="font-bold">@ID</span> で検索し、所属申請を送ります。
          本人が承認すると所属が成立します。
        </p>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center rounded-xl border border-slate-200 focus-within:border-indigo-300 px-3">
            <span className="text-slate-400 text-sm font-bold">@</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch();
              }}
              placeholder="セラピストのID"
              className="flex-1 py-2.5 px-1 text-sm outline-none bg-transparent"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={runSearch}
            disabled={searching || !query.trim()}
            className="px-4 rounded-xl text-white font-bold text-sm shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
          >
            {searching ? '検索中…' : '検索'}
          </button>
        </div>

        {/* 検索結果 */}
        {searched && !searching && !result && (
          <p className="mt-3 text-sm text-slate-400">該当する @ID のセラピストが見つかりません</p>
        )}
        {result && (
          <div className="mt-3 border border-slate-200 rounded-2xl p-3">
            <div className="flex items-center gap-3">
              <Link
                href={`/x/u/${result.therapist.handle}`}
                className="relative w-11 h-11 rounded-full overflow-hidden border border-slate-100 bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0"
              >
                {result.therapist.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={result.therapist.avatarUrl} alt={result.therapist.displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold">{result.therapist.displayName.charAt(0) || '?'}</span>
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/x/u/${result.therapist.handle}`} className="font-bold text-sm text-slate-900 hover:underline truncate block">
                  {result.therapist.displayName}
                </Link>
                <p className="text-xs text-slate-400 truncate">@{result.therapist.handle}</p>
              </div>
              {/* アクション：所属済み / 申請中 / 申請ボタン */}
              {result.affiliation === 'self' || affiliatedIds.has(result.therapist.id) ? (
                <span className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
                  所属済み
                </span>
              ) : pendingIds.has(result.therapist.id) ? (
                <span className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-200">
                  申請中
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => requestAffiliation(result.therapist)}
                  disabled={busy === result.therapist.id}
                  className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg text-white shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
                  style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
                >
                  所属申請
                </button>
              )}
            </div>
            {/* 他店所属中の注意書き */}
            {typeof result.affiliation === 'object' && (
              <p className="mt-2 text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 leading-relaxed">
                現在「{result.affiliation.shopName}」に所属中です。申請は可能ですが、本人が承認すると現在の所属は自動的に解除され、こちらに切り替わります。
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── 申請中の一覧 ── */}
      <section className="mb-7">
        <h2 className="text-sm font-black text-slate-800 mb-2">
          申請中
          {pending.length > 0 && <span className="ml-1.5 text-xs font-bold text-slate-400 tabular-nums">{pending.length}</span>}
        </h2>
        {pending.length === 0 ? (
          <p className="text-xs text-slate-400 py-1">申請中のセラピストはいません</p>
        ) : (
          <div className="space-y-2">
            {pending.map((p) => (
              <Row key={p.requestId} therapist={p.therapist}>
                <button
                  type="button"
                  onClick={() => cancelRequest(p.requestId)}
                  disabled={busy === p.requestId}
                  className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:border-rose-200 hover:text-rose-500 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
              </Row>
            ))}
          </div>
        )}
      </section>

      {/* ── 所属セラピスト一覧 ── */}
      <section>
        <h2 className="text-sm font-black text-slate-800 mb-2">
          所属セラピスト
          {affiliated.length > 0 && <span className="ml-1.5 text-xs font-bold text-slate-400 tabular-nums">{affiliated.length}</span>}
        </h2>
        {affiliated.length === 0 ? (
          <p className="text-xs text-slate-400 py-1">所属セラピストはまだいません</p>
        ) : (
          <div className="space-y-2">
            {affiliated.map((th) => (
              <Row key={th.id} therapist={th}>
                <button
                  type="button"
                  onClick={() => removeAffiliation(th)}
                  disabled={busy === th.id}
                  className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:border-rose-200 hover:text-rose-500 transition-colors disabled:opacity-50"
                >
                  解除
                </button>
              </Row>
            ))}
          </div>
        )}
      </section>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// セラピスト1行（アバター＋名前＋@ID＋右側アクション）。一覧で共通利用。
function Row({ therapist, children }: { therapist: TherapistMini; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-2xl p-3 flex items-center gap-3">
      <Link
        href={`/x/u/${therapist.handle}`}
        className="relative w-11 h-11 rounded-full overflow-hidden border border-slate-100 bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0"
      >
        {therapist.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={therapist.avatarUrl} alt={therapist.displayName} className="w-full h-full object-cover" />
        ) : (
          <span className="text-white font-bold">{therapist.displayName.charAt(0) || '?'}</span>
        )}
      </Link>
      <div className="flex-1 min-w-0">
        <Link href={`/x/u/${therapist.handle}`} className="font-bold text-sm text-slate-900 hover:underline truncate block">
          {therapist.displayName}
        </Link>
        <p className="text-xs text-slate-400 truncate">@{therapist.handle}</p>
      </div>
      {children}
    </div>
  );
}
