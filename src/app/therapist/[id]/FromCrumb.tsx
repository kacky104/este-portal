'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// パンくずの中間項目（?from= 由来）。
// 旧来はサーバーで searchParams を読んでいたが、それだとページが動的化して ISR に乗らないため、
// クエリ依存部分だけをクライアント側に切り出した（<Suspense> でラップして使う）。表示・リンクは従来と同一。
export function FromCrumb({ salonId }: { salonId: number }) {
  const from = useSearchParams().get('from');
  const crumb =
    from === 'schedule'
      ? { label: '出勤情報', href: `/salon/${salonId}/schedule` }
      : from === 'therapists'
        ? { label: 'セラピスト一覧', href: `/salon/${salonId}/therapists` }
        : null;
  if (!crumb) return null;
  return (
    <>
      <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
      <Link
        href={crumb.href}
        className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap"
        style={{ color: '#ec4899' }}
      >
        {crumb.label}
      </Link>
    </>
  );
}
