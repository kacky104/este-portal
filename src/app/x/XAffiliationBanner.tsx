'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { VerifiedBadge } from './VerifiedBadge';

const supabase = createClient();

// 自分（セラピスト）宛に届いている所属申請（申請元店舗の最小情報つき）。
export type IncomingRequest = {
  requestId: string;
  shop: {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    isVerified: boolean;
  };
};

export function XAffiliationBanner({
  requests: initial,
  alreadyAffiliated,
}: {
  requests: IncomingRequest[];
  alreadyAffiliated: boolean; // 既に他店所属中なら「承認で切替」の注意を出す
}) {
  const router = useRouter();
  const [requests, setRequests] = useState<IncomingRequest[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2800);
  };

  // 承認/却下。承認すると同セラピスト宛の他 pending は自動 reject される＝承認時は一覧を空にする。
  const respond = async (requestId: string, accept: boolean) => {
    if (busy) return;
    setBusy(requestId);
    const { error } = await supabase.rpc('x_affiliation_respond', {
      p_request_id: Number(requestId),
      p_accept: accept,
    });
    setBusy(null);
    if (error) {
      showToast(error.message);
      return;
    }
    if (accept) {
      setRequests([]); // 他申請は自動rejectされるため全消し
      showToast('所属が成立しました');
    } else {
      setRequests((list) => list.filter((r) => r.requestId !== requestId));
      showToast('申請を却下しました');
    }
    // 所属バッジ等を反映するため再取得。
    router.refresh();
  };

  if (requests.length === 0) return null;

  return (
    <div className="mt-4 mb-1 p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100">
      <p className="text-sm font-bold text-slate-800">
        所属申請が届いています
        {requests.length > 1 && <span className="ml-1 text-emerald-600 tabular-nums">（{requests.length}件）</span>}
      </p>
      <p className="text-[12px] text-slate-500 mt-0.5 mb-3 leading-relaxed">
        承認すると、その店舗のプロフィールや投稿に「所属」として表示されます。
        {requests.length > 1 && 'いずれか1つを承認すると、他の申請は自動的に却下されます。'}
        {alreadyAffiliated && '現在の所属先がある場合、承認すると新しい店舗へ切り替わります。'}
      </p>

      <div className="space-y-2">
        {requests.map((r) => (
          <div key={r.requestId} className="bg-white/70 border border-emerald-100 rounded-xl p-2.5 flex items-center gap-2.5">
            <Link
              href={`/x/u/${r.shop.handle}`}
              className="relative w-10 h-10 rounded-full overflow-hidden border border-slate-100 bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0"
            >
              {r.shop.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.shop.avatarUrl} alt={r.shop.displayName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-bold text-sm">{r.shop.displayName.charAt(0) || '?'}</span>
              )}
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <Link href={`/x/u/${r.shop.handle}`} className="font-bold text-sm text-slate-900 hover:underline truncate">
                  {r.shop.displayName}
                </Link>
                {r.shop.isVerified && <VerifiedBadge />}
              </div>
              <p className="text-xs text-slate-400 truncate">@{r.shop.handle}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => respond(r.requestId, true)}
                disabled={busy === r.requestId}
                className="text-xs font-bold px-3 py-1.5 rounded-lg text-white shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
                style={{ background: 'linear-gradient(100deg,#10B981,#14B8A6)' }}
              >
                承認
              </button>
              <button
                type="button"
                onClick={() => respond(r.requestId, false)}
                disabled={busy === r.requestId}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:border-rose-200 hover:text-rose-500 transition-colors disabled:opacity-50"
              >
                却下
              </button>
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
