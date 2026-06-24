import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { createClient } from '@/app/lib/supabase/server';
import { ShuffledSalons } from '@/app/components/ShuffledSalons';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { fetchSalons } from '@/app/lib/salons';

// フィルタ判定／DB連動キー。画面表示はすべて areaLabel() を通す。
const AREAS = [
  '福岡全域',
  '博多・住吉',
  '中洲・天神・薬院',
  '北九州・小倉',
  '久留米',
  '福岡県その他',
  '出張',
] as const;

export default async function SalonsPage() {
  const supabase = await createClient();
  const salons = await fetchSalons(supabase);

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

        {/* 地域バッジ列を最上部に出し、その下に見出し＋説明文→カード（heading で順序制御） */}
        <ShuffledSalons
          salons={salons}
          areas={[...AREAS]}
          heading={
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-slate-900 mb-1">掲載サロン一覧</h1>
              <p className="text-xs text-slate-400">
                全{salons.length}件 ｜ 表示順はページ読み込みのたびにシャッフルされます
              </p>
            </div>
          }
        />
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
