import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchNewFaceTherapists } from '@/app/lib/newFaceTherapists';
import { NewFaceList } from './NewFaceList';

// 新人セラピスト一覧ページ（トップ「新人セラピスト一覧」の「一覧を見る →」先）。/working の構成に倣う。
// 新人リストは変動が遅い（30日ウィンドウ）ため ISR（10分）と相性が良い。全件を新しい順で表示。
// 静的セグメント "new" は動的 /therapist/[id] より優先されるため衝突しない（実IDは "new" と非衝突）。
export const revalidate = 600;

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
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-pink-600 transition-colors mb-8"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          トップへ戻る
        </Link>

        {/* Heading（中央寄せ・オレンジ→ピンクのグラデーション。/working と同系統） */}
        <div className="mb-8 text-center">
          <h1
            className="text-2xl font-bold inline-block"
            style={{
              background: 'linear-gradient(to right, #F59E0B, #EC4899)',
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
