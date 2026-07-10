'use client';

import Link from 'next/link';
import { VerifiedBadge } from '../VerifiedBadge';
import type { OfferTherapist } from '../xOffers';

// オファー一覧（認証済みshop・official のみ閲覧）。お店タブのカードスタイルを踏襲し、CSS変数で紫/白テーマに追従。
// カードタップで /x/u/[handle] へ。オファー受付中のセラピストにはフォローなしでDMを開始できる。
export function XOffers({ therapists }: { therapists: OfferTherapist[] }) {
  return (
    <div className="my-6 space-y-3">
      <div className="x-card p-5 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
        <h1 className="text-2xl font-black tracking-tight mb-1 text-[color:var(--x-text-primary)]">オファー</h1>
        <p className="text-sm text-[color:var(--x-text-secondary)] leading-relaxed">
          オファー受付中のセラピストにはフォローなしでメッセージを送れます。
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
          <Link
            key={t.id}
            href={`/x/u/${encodeURIComponent(t.handle)}`}
            className="block rounded-2xl bg-[color:var(--x-surface)] shadow-sm border border-[color:var(--x-border)] p-3.5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-2.5">
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
            </div>

            {/* PR文（あれば2〜3行clamp） */}
            {t.offerComment && (
              <p className="text-sm text-[color:var(--x-text-secondary)] mt-2.5 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                {t.offerComment}
              </p>
            )}

            {/* 希望エリアバッジ（折り返し） */}
            {t.offerAreas.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {t.offerAreas.map((area) => (
                  <span
                    key={area}
                    className="text-[11px] font-bold rounded-full px-2 py-0.5 bg-[color:var(--x-inset)] text-[color:var(--x-text-secondary)]"
                  >
                    {area}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))
      )}
    </div>
  );
}
