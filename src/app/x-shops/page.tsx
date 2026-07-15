import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { VerifiedBadge } from '@/app/x/VerifiedBadge';
import { fetchShopShowcases } from '@/app/x/xShops';

const TITLE = '福岡メンズエステの承認店舗一覧｜フクエス';
const DESCRIPTION =
  '福岡メンズエステ専用SNS「fukuX」に参加する承認店舗の一覧です。各店のショーケース画像をまとめてチェックできます。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/x-shops' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/x-shops', siteName: 'フクエス', type: 'website' },
};

// ISR：10分ごとに再生成（並びは30分シードシャッフルなのでゆるめでOK）。
export const revalidate = 600;

export default async function XShopsPage() {
  const shops = await fetchShopShowcases();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Back */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-pink-600 transition-colors mb-6">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          トップへ戻る
        </Link>

        {/* Heading */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-pink-100 bg-gradient-to-br from-pink-50 via-rose-50 to-white shadow-sm">
          <div className="px-5 py-6 sm:px-8 sm:py-7">
            <h1 className="font-black tracking-tight">
              <span className="block text-xs sm:text-sm font-bold text-pink-500">福岡メンズエステ専用SNS</span>
              <span className="mt-0.5 flex items-center gap-2">
                <span className="text-base sm:text-2xl bg-gradient-to-r from-pink-600 to-rose-500 bg-clip-text text-transparent">
                  fukuX～フクエックス～承認店舗
                </span>
                {shops.length > 0 && (
                  <span className="shrink-0 inline-flex items-center rounded-full border border-pink-100 bg-white/80 px-2.5 py-0.5 text-xs font-bold text-pink-600">
                    全{shops.length}件
                  </span>
                )}
              </span>
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-slate-500 leading-relaxed">
              福岡メンズエステ専用SNS「fukuX」に参加する承認店舗の一覧。フォローして、お得な最新情報などを手に入れてください。
            </p>
          </div>
        </div>

        {/* Shop list */}
        {shops.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm border border-dashed border-pink-100 rounded-3xl bg-pink-50/10">
            表示できるお店がまだありません
          </div>
        ) : (
          <div className="space-y-4">
            {shops.map((s) => (
              <Link
                key={s.id}
                href={`/x/u/${encodeURIComponent(s.handle)}`}
                className="block rounded-2xl shadow-sm border p-3 hover:shadow-md hover:brightness-110 transition-all"
                style={{ background: '#3b2a6d', borderColor: '#55428f' }}
              >
                {/* 店名＋アバター＋認証バッジ（fukuX と同じ紫テーマ配色） */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-9 h-9 rounded-full overflow-hidden border border-white shadow-sm bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                    {s.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-bold text-sm">{s.displayName.charAt(0) || '?'}</span>
                    )}
                  </span>
                  <span className="font-bold text-white truncate">{s.displayName}</span>
                  {s.isVerified && <VerifiedBadge kind="shop" />}
                </div>

                {/* 地域（x_profiles.address）。空なら非表示。 */}
                {s.address && (
                  <p className="text-xs mb-3 flex items-center gap-1" style={{ color: '#cfc3f2' }}>📍{s.address}</p>
                )}

                {/* ショーケース画像（最大8枚・4列グリッド）。0枚ならグリッドごと非表示。 */}
                {s.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-0.5">
                    {s.images.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={url}
                        alt={`${s.displayName}-${i + 1}`}
                        className="aspect-square w-full object-cover rounded-sm"
                        loading="lazy"
                      />
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-3xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
