'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { VerifiedBadge } from '../VerifiedBadge';
import type { OfferTherapist } from '../xOffers';

const sb = createClient();

// オファー一覧（認証済みshop・official のみ閲覧）。お店タブのカードスタイルを踏襲し、CSS変数で紫/白テーマに追従。
// カード本体タップで /x/u/[handle]、下部の「オファーを送る」ボタンで会話開始（フォロー不要＝x_start_conversation のオファー免除）。
// プロフィール画面のメッセージボタンは従来どおりフォロー必須（オファー導線はこのボタンのみ）。
export function XOffers({ therapists }: { therapists: OfferTherapist[] }) {
  return (
    <div className="my-6 space-y-3">
      <div className="x-card p-5 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
        <h1 className="text-2xl font-black tracking-tight mb-1 text-[color:var(--x-text-primary)]">オファー</h1>
        <p className="text-sm text-[color:var(--x-text-secondary)] leading-relaxed">
          「オファーを送る」からフォローなしでメッセージを送れます。
        </p>
      </div>

      {therapists.length === 0 ? (
        <div className="x-card p-8 rounded-2xl bg-[color:var(--x-surface)] shadow-sm text-center">
          <p className="text-sm text-[color:var(--x-text-secondary)]">
            現在オファーを受け付けているセラピストはいません
          </p>
        </div>
      ) : (
        therapists.map((t) => (
          <div
            key={t.id}
            className="rounded-2xl bg-[color:var(--x-surface)] shadow-sm border border-[color:var(--x-border)] p-3.5 hover:shadow-md transition-shadow"
          >
            {/* ヘッダー行: 左=プロフィールへのリンク（アバター＋名前）／右上=オファーを送るボタン */}
            <div className="flex items-start gap-2.5">
              <Link
                href={`/x/u/${encodeURIComponent(t.handle)}`}
                className="flex items-center gap-2.5 min-w-0 flex-1"
              >
                <span className="w-11 h-11 rounded-full overflow-hidden border border-white shadow-sm bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                  {t.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white font-bold">{t.displayName.charAt(0) || '?'}</span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-[color:var(--x-text-primary)] truncate">{t.displayName}</span>
                    {t.isVerified && <VerifiedBadge kind="therapist" />}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[color:var(--x-text-muted)] mt-0.5">
                    <span>@{t.handle}</span>
                    {t.age != null && <span>{t.age}歳</span>}
                    {t.height != null && <span>T{t.height}</span>}
                  </div>
                </div>
              </Link>
              {/* DM受付オフのセラピストにはボタンを出さない（最終防御はDB側トリガ） */}
              {!t.dmDisabled && <OfferStartButton targetId={t.id} />}
            </div>

            {/* PR文・地域があるときだけ本文リンクを描画（空のリンク要素を作らない） */}
            {(t.offerComment || t.offerAreas.length > 0) && (
            <Link href={`/x/u/${encodeURIComponent(t.handle)}`} className="block">
              {/* PR文（あれば2〜3行clamp） */}
              {t.offerComment && (
                <p className="text-sm text-[color:var(--x-text-secondary)] mt-2.5 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                  {t.offerComment}
                </p>
              )}

              {/* 希望勤務地域（ラベル＋バッジ折り返し） */}
              {t.offerAreas.length > 0 && (
                <div className="mt-2.5">
                  <p className="text-[11px] font-bold text-[color:var(--x-text-muted)] mb-1">希望勤務地域</p>
                  <div className="flex flex-wrap gap-1.5">
                    {t.offerAreas.map((area) => (
                      <span
                        key={area}
                        className="text-[11px] font-bold rounded-full px-2 py-0.5 bg-[color:var(--x-inset)] text-[color:var(--x-text-secondary)]"
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Link>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// 「オファーを送る」ボタン。x_start_conversation（オファー免除つき）で会話を開始してスレッドへ遷移。
function OfferStartButton({ targetId }: { targetId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const start = async () => {
    if (busy) return;
    setBusy(true);
    const { data, error } = await sb.rpc('x_start_conversation', { p_other: targetId });
    setBusy(false);
    if (error || data == null) {
      setToast(error?.message ?? '会話を開始できませんでした');
      window.setTimeout(() => setToast(''), 2800);
      return;
    }
    router.push(`/x/messages/${data}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="whitespace-nowrap shrink-0 text-sm font-bold px-4 py-1.5 rounded-full bg-[color:var(--x-accent)] text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {busy ? '…' : 'オファーを送る'}
      </button>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
