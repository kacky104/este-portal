import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { Breadcrumb } from '@/app/components/Breadcrumb';
import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchNewFaceTherapists } from '@/app/lib/newFaceTherapists';
import { NewFaceList } from './NewFaceList';
import type { Metadata } from 'next';

// 新人セラピスト一覧ページ（トップ「新人セラピスト一覧」の「一覧を見る →」先）。/working の構成に倣う。
// 新人リストは変動が遅い（30日ウィンドウ）ため ISR（10分）と相性が良い。全件を新しい順で表示。
// 静的セグメント "new" は動的 /therapist/[id] より優先されるため衝突しない（実IDは "new" と非衝突）。
export const revalidate = 600;

// 自己参照 canonical＋固有 title（root の canonical '/' 継承による重複扱いを防ぐ）。
const NEWFACE_TITLE = '新人セラピスト一覧｜福岡メンズエステ【フクエス】';
const NEWFACE_DESCRIPTION =
  '福岡のメンズエステに新しく入店した新人セラピスト一覧。博多・天神・北九州・久留米など福岡全域の新人情報をフクエスでチェックできます。';

export const metadata: Metadata = {
  title: NEWFACE_TITLE,
  description: NEWFACE_DESCRIPTION,
  alternates: { canonical: '/therapist/new' },
  openGraph: {
    title: NEWFACE_TITLE,
    description: NEWFACE_DESCRIPTION,
    url: '/therapist/new',
    siteName: 'フクエス',
    type: 'website',
    images: [{ url: '/ogp.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: NEWFACE_TITLE,
    description: NEWFACE_DESCRIPTION,
    images: ['/ogp.png'],
  },
};

export default async function NewFacePage() {
  const supabase = createPublicClient();
  const therapists = await fetchNewFaceTherapists(supabase); // limit 無指定＝全件

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">

        {/* Back link */}
        <Breadcrumb current="新人セラピスト一覧" />

        {/* Heading（中央寄せ）。トップの「新人セラピスト一覧」見出しと同じ emerald→lime のグラデに揃える（#10B981→#84CC16）。 */}
        <div className="mb-8 text-center">
          <h1
            className="text-2xl font-bold inline-block"
            style={{
              background: 'linear-gradient(to right, #10B981, #84CC16)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
            }}
          >
            新人セラピスト一覧
          </h1>
        </div>

        <NewFaceList therapists={therapists} />
      </main>

      {/* ─── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
