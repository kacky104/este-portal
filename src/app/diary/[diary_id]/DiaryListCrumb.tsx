'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// パンくずの「写メ日記一覧」リンク。?from= に応じて遷移先を切り替える（searchParams 依存をクライアントへ隔離）。
//   from=salon → お店全体の一覧 /salon/[id]/diary
//   それ以外   → そのセラピストの一覧 /therapist/[id]/diary
export function DiaryListCrumb({ salonId, therapistId }: { salonId: string; therapistId: string }) {
  const fromSalon = useSearchParams().get('from') === 'salon';
  return (
    <Link
      href={fromSalon ? `/salon/${salonId}/diary` : `/therapist/${therapistId}/diary`}
      className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap"
      style={{ color: '#ec4899' }}
    >
      写メ日記一覧
    </Link>
  );
}
