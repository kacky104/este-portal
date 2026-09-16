'use client';

import Link from 'next/link';
import { ConecfShell } from './ConecfShell';
import { ConecfHome } from './ConecfHome';
import { useConecfHref } from './ConecfBase';
import { useToast } from '@/app/components/useToast';

// コネックエフのホーム（第395便 1a → 第396便 1b で連携の状態を足した）。

export default function ConecfHomePage() {
  const href = useConecfHref();
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="home" title="ホーム" toast={toast}>
      {(access) => (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-[17px] font-black text-slate-800 break-words">{access.salonName || access.email} 様</p>
            <Link href={href('/guide')} className="ml-auto text-[13.5px] font-bold text-indigo-600 underline underline-offset-4">はじめての方へ ›</Link>
          </div>
          <ConecfHome salonId={access.salonId} onToast={showToast} />
        </div>
      )}
    </ConecfShell>
  );
}
